const crypto = require('crypto');
const { notifyOrderPaid } = require('./_notify.js');
const { recalculateOrderTotal } = require('./_pricing.js');
const { KNOWN_STORES, getStoreRow, storeIsAcceptingOrders } = require('./_storeSettings.js');
const { getTableCount } = require('./_tableSettings.js');

async function deductInventoryAndAlert(order) {
    try {
        const { deductInventoryForOrder } = require('./_inventory.js');
        const { notifyLowStock } = require('./_notify.js');
        const result = await deductInventoryForOrder(order);
        const low = (result && result.low_stock) || [];
        if (Array.isArray(low) && low.length) {
            await notifyLowStock(order && order.store_name, low).catch((err) => {
                console.error('notifyLowStock failed:', err);
            });
        }
        return result;
    } catch (err) {
        console.error('inventory deduct failed:', err.message || err);
        return null;
    }
}

/** Prefer service role — RLS trigger blocks anon from changing payment_status. */
function getSupabaseConfig() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Supabase configuration error: Missing SUPABASE_URL or SUPABASE_KEY/SERVICE_ROLE_KEY');
    }
    return { SUPABASE_URL, SUPABASE_KEY };
}

async function getOrderByNo(orderNo) {
    const { SUPABASE_URL, SUPABASE_KEY } = getSupabaseConfig();
    if (!orderNo) throw new Error('Missing orderNo');
    const no = String(orderNo).trim();

    // 唔 select status：舊 DB 可能未加呢欄；通知唔需要
    const baseSelect = [
        'order_no',
        'display_id',
        'total_amount',
        'payment_status',
        'store_name',
        'customer_name',
        'customer_phone',
        'pickup_time',
        'items_json',
        'created_at',
    ];

    async function fetchBy(field, select) {
        const url = `${SUPABASE_URL}/rest/v1/orders?${field}=eq.${encodeURIComponent(no)}&select=${select}&limit=1`;
        const resp = await fetch(url, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        });
        const text = await resp.text();
        if (!resp.ok) {
            const err = new Error(`Supabase fetch failed (${resp.status}): ${text}`);
            err.status = resp.status;
            err.body = text;
            throw err;
        }
        const rows = text ? JSON.parse(text) : [];
        return Array.isArray(rows) ? rows[0] || null : null;
    }

    async function fetchWithSelect(select) {
        const byNo = await fetchBy('order_no', select);
        if (byNo) return byNo;
        try {
            return await fetchBy('display_id', select);
        } catch (err) {
            if (/display_id|schema cache|column/i.test(String(err.body || err.message || ''))) return null;
            throw err;
        }
    }

    try {
        return await fetchWithSelect([...baseSelect, 'kpay_managed_no'].join(','));
    } catch (err) {
        const body = String(err.body || err.message || '');
        if (/display_id|schema cache|column/i.test(body)) {
            const withoutDisplay = baseSelect.filter((c) => c !== 'display_id');
            try {
                return await fetchWithSelect([...withoutDisplay, 'kpay_managed_no'].join(','));
            } catch (err2) {
                if (!/kpay_managed_no|schema cache|column/i.test(String(err2.body || err2.message || ''))) throw err2;
                return fetchWithSelect(withoutDisplay.join(','));
            }
        }
        if (/kpay_managed_no|schema cache|column/i.test(body)) {
            return fetchWithSelect(baseSelect.join(','));
        }
        throw err;
    }
}

async function markOrderPaid(orderNo) {
    if (!orderNo) return { updated: false };

    const { SUPABASE_URL, SUPABASE_KEY } = getSupabaseConfig();
    const existingLookup = await getOrderByNo(orderNo).catch(() => null);
    const key = (existingLookup && existingLookup.order_no) || String(orderNo).trim();

    // payment_status = 收款；status = 廚房「新單」欄（有呢欄就一齊寫）
    const url = `${SUPABASE_URL}/rest/v1/orders?order_no=eq.${encodeURIComponent(key)}&payment_status=eq.PENDING`;
    const patchBodies = [
        { payment_status: 'PAID', status: 'PAID' },
        { payment_status: 'PAID' },
    ];

    let rows = [];
    let lastErrorText = '';
    for (const body of patchBodies) {
        const resp = await fetch(url, {
            method: 'PATCH',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify(body),
        });
        if (resp.ok) {
            rows = await resp.json();
            lastErrorText = '';
            break;
        }
        lastErrorText = await resp.text();
        // 舊 DB 可能未加 status 欄 → 試净改 payment_status
        if (body.status && /status/i.test(lastErrorText)) continue;
        throw new Error(`Supabase update failed (${resp.status}): ${lastErrorText}`);
    }
    if (lastErrorText) {
        throw new Error(`Supabase update failed: ${lastErrorText}`);
    }

    const updated = Array.isArray(rows) && rows.length > 0;
    if (!updated) {
        // 可能已係 PAID（重試 webhook）→ 唔重複發通知
        const existing = await getOrderByNo(orderNo);
        const stillPending = String((existing && existing.payment_status) || '').toUpperCase() === 'PENDING';
        if (stillPending) {
            throw new Error(`Order ${orderNo} is still PENDING after paid update (0 rows). Check SUPABASE_SERVICE_ROLE_KEY / RLS.`);
        }
        return { updated: false, order: existing || null };
    }

    // 再拉齊欄位（items 等）再通知
    const order = (await getOrderByNo(orderNo)) || rows[0];
    // 庫存扣減失敗唔好令 webhook 失敗
    await deductInventoryAndAlert(order).catch((err) => {
        console.error('deductInventoryAndAlert failed:', err);
    });
    // 通知失敗唔好令 webhook 失敗
    await notifyOrderPaid(order).catch((err) => {
        console.error('notifyOrderPaid failed:', err);
    });

    return { updated: true, order };
}

async function updateOrderTotalAmount(orderNo, totalAmount) {
    if (!orderNo || !Number.isFinite(Number(totalAmount))) {
        throw new Error('Invalid updateOrderTotalAmount args');
    }
    const { SUPABASE_URL, SUPABASE_KEY } = getSupabaseConfig();

    const url = `${SUPABASE_URL}/rest/v1/orders?order_no=eq.${encodeURIComponent(orderNo)}&payment_status=eq.PENDING`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify({ total_amount: Number(totalAmount) }),
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Supabase total update failed (${resp.status}): ${text}`);
    }
    const rows = await resp.json();
    return Array.isArray(rows) ? rows[0] || null : null;
}

/**
 * Kitchen board status only. Prefer `status` column; legacy DBs without it
 * fall back to writing kitchen states onto payment_status (service role).
 */
async function updateKitchenOrderStatus(orderNo, nextStatus) {
    const status = String(nextStatus || '').toUpperCase();
    const allowed = new Set(['PREPARING', 'READY', 'COMPLETED']);
    if (!orderNo || !allowed.has(status)) {
        throw new Error('Invalid kitchen status update');
    }

    const { SUPABASE_URL, SUPABASE_KEY } = getSupabaseConfig();
    const url = `${SUPABASE_URL}/rest/v1/orders?order_no=eq.${encodeURIComponent(orderNo)}`;

    async function patch(body) {
        const resp = await fetch(url, {
            method: 'PATCH',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify(body),
        });
        const text = await resp.text();
        let rows = [];
        try {
            rows = text ? JSON.parse(text) : [];
        } catch {
            rows = [];
        }
        return { ok: resp.ok, status: resp.status, text, rows };
    }

    // Preferred: kitchen `status` column only (payment_status stays PAID)
    let result = await patch({ status });
    if (result.ok) {
        return {
            updated: Array.isArray(result.rows) && result.rows.length > 0,
            via: 'status',
            order: Array.isArray(result.rows) ? result.rows[0] || null : null,
        };
    }

    // Missing status column → legacy write to payment_status
    if (/status/i.test(result.text) || result.status === 400) {
        result = await patch({ payment_status: status });
        if (!result.ok) {
            throw new Error(`Kitchen status update failed (${result.status}): ${result.text}`);
        }
        return {
            updated: Array.isArray(result.rows) && result.rows.length > 0,
            via: 'payment_status',
            order: Array.isArray(result.rows) ? result.rows[0] || null : null,
        };
    }

    throw new Error(`Kitchen status update failed (${result.status}): ${result.text}`);
}

function clip(value, max) {
    return String(value || '').trim().slice(0, max);
}

function generateOrderNo() {
    // Dead — never use MB… tickets. Kept only so accidental callers fail loudly.
    throw new Error('generateOrderNo is retired; use allocateOrderId()');
}

/** Golden ticket: SYP-260919-Q-001 */
const GOLDEN_ORDER_RE = /^[A-Z]{2,4}-\d{6}-[A-Z]-\d{3,}$/i;
const LEGACY_MB_RE = /^(MB|UAT)[A-Z0-9]{6,}$/i;

function isGoldenOrderId(value) {
    return GOLDEN_ORDER_RE.test(String(value || '').trim());
}

function isLegacyMbOrderId(value) {
    return LEGACY_MB_RE.test(String(value || '').trim());
}

/** District initials for display_id e.g. TW-260919-Q-001 */
const STORE_CODE_BY_NAME = {
    'Sai Ying Pun': 'SYP',
    'Fortress Hill': 'TH',
    'Tsuen Wan (Takeaway Only)': 'TW',
};
const STORE_CODE_BY_SLUG = {
    'sai-ying-pun': 'SYP',
    'tin-hau': 'TH',
    'fortress-hill': 'TH',
    'tsuen-wan': 'TW',
};

function storeCodeFor(storeNameOrSlug) {
    const raw = String(storeNameOrSlug || '').trim();
    if (STORE_CODE_BY_NAME[raw]) return STORE_CODE_BY_NAME[raw];
    const slug = raw.toLowerCase().replace(/\s+/g, '-');
    if (STORE_CODE_BY_SLUG[slug]) return STORE_CODE_BY_SLUG[slug];
    // Already a short code?
    if (/^[A-Z]{2,4}$/i.test(raw)) return raw.toUpperCase();
    return '';
}

/** Channel letter for display_id: P=POS, Q=QR/Web/table, D=Delivery */
function channelCodeFor(channel) {
    const ch = String(channel || '').toLowerCase().trim();
    if (ch === 'pos' || ch === 'p') return 'P';
    if (ch === 'delivery' || ch === 'd' || ch === 'platform') return 'D';
    // online / table / qr / web / default
    return 'Q';
}

async function generateDisplayId(storeName, channel) {
    const storeCode = storeCodeFor(storeName);
    if (!storeCode) {
        const err = new Error(`Unknown store for display_id: ${storeName}`);
        err.status = 400;
        throw err;
    }
    const channelCode = channelCodeFor(channel);
    const { SUPABASE_URL, SUPABASE_KEY } = getSupabaseConfig();
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/generate_order_id`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            p_store_code: storeCode,
            p_channel: channelCode,
        }),
    });
    const text = await resp.text();
    if (!resp.ok) {
        const err = new Error(`generate_order_id failed (${resp.status}): ${text}`);
        err.status = resp.status;
        throw err;
    }
    // PostgREST returns a JSON string, e.g. "TW-260919-Q-001"
    let id = text;
    try {
        id = JSON.parse(text);
    } catch {
        id = String(text || '').replace(/^"|"$/g, '');
    }
    id = String(id || '').trim();
    if (!id) throw new Error('generate_order_id returned empty');
    return id;
}

/** Golden ticket ID = order_no = display_id (e.g. TW-260919-Q-001). */
async function allocateOrderId(storeName, channel) {
    const id = await generateDisplayId(storeName, channel);
    if (!isGoldenOrderId(id)) {
        throw new Error(`allocateOrderId returned non-golden id: ${id}`);
    }
    return id;
}

function ticketIdOf(order) {
    if (!order) return '';
    const display = String(order.display_id || order.displayId || '').trim();
    const orderNo = String(order.order_no || order.orderNo || '').trim();
    if (isGoldenOrderId(display)) return display;
    if (isGoldenOrderId(orderNo)) return orderNo;
    return display || orderNo;
}

/** Promote legacy MB… rows so order_no becomes the golden ticket when safe. */
async function ensureGoldenOrderNo(order, storeName, channel) {
    if (!order || !order.order_no) return order;
    const current = String(order.order_no).trim();
    if (isGoldenOrderId(current)) {
        const display = String(order.display_id || '').trim();
        if (display !== current) {
            try {
                await sbRest(`orders?order_no=eq.${encodeURIComponent(current)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ display_id: current }),
                });
            } catch (err) {
                console.warn('sync display_id skipped:', err.message || err);
            }
        }
        return { ...order, display_id: current };
    }

    // KPay already opened with MB outTradeNo — keep order_no, ensure display_id for UI.
    if (kpayManagedNoOf(order)) {
        let golden = String(order.display_id || '').trim();
        if (!isGoldenOrderId(golden)) {
            golden = await allocateOrderId(storeName, channel);
            try {
                await sbRest(`orders?order_no=eq.${encodeURIComponent(current)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ display_id: golden }),
                });
            } catch (err) {
                console.warn('attach display_id on KPay pending skipped:', err.message || err);
            }
        }
        return { ...order, display_id: golden || order.display_id };
    }

    let golden = String(order.display_id || '').trim();
    if (!isGoldenOrderId(golden)) {
        golden = await allocateOrderId(storeName, channel);
    }
    try {
        await sbRest(`orders?order_no=eq.${encodeURIComponent(current)}`, {
            method: 'PATCH',
            body: JSON.stringify({ order_no: golden, display_id: golden }),
        });
        return { ...order, order_no: golden, display_id: golden };
    } catch (err) {
        console.error('ensureGoldenOrderNo failed:', current, '→', golden, err.message || err);
        throw err;
    }
}

function startOfTodayHkIso() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    return new Date(`${y}-${m}-${d}T00:00:00+08:00`).toISOString();
}

async function sbRest(path, options = {}) {
    const { SUPABASE_URL, SUPABASE_KEY } = getSupabaseConfig();
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: options.prefer || 'return=representation',
            ...(options.headers || {}),
        },
    });
    const text = await resp.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    if (!resp.ok) {
        const err = new Error(typeof data === 'string' ? data : JSON.stringify(data));
        err.status = resp.status;
        throw err;
    }
    return data;
}

async function createPendingOrder(input) {
    const storeName = clip(input && input.store_name, 80);
    if (!KNOWN_STORES.includes(storeName)) {
        const err = new Error('Invalid store');
        err.status = 400;
        throw err;
    }
    const customerName = clip(input && input.customer_name, 80);
    const customerPhone = clip(input && input.customer_phone, 40);
    const pickupTimeRaw = clip(input && input.pickup_time, 40);
    const fulfillRaw = String((input && (input.fulfill || input.delivery_mode)) || '').toLowerCase();
    const dineIn = fulfillRaw === 'dine_in' || fulfillRaw === 'dine' || fulfillRaw === 'dine-in' || fulfillRaw === '堂食';
    const pickupTime = dineIn && pickupTimeRaw && !pickupTimeRaw.startsWith('堂食')
        ? clip(`堂食 · ${pickupTimeRaw}`, 40)
        : pickupTimeRaw;
    const items = Array.isArray(input && input.items) ? input.items.slice(0, 40) : [];
    if (!customerName || !customerPhone || !pickupTime) {
        const err = new Error('Missing customer details');
        err.status = 400;
        throw err;
    }
    if (pickupTime === 'CLOSED' || pickupTimeRaw === 'CLOSED') {
        const err = new Error('Store is closed');
        err.status = 400;
        throw err;
    }
    try {
        const settings = await getStoreRow(storeName);
        if (!storeIsAcceptingOrders(storeName, settings || {})) {
            const err = new Error('Store is closed');
            err.status = 400;
            throw err;
        }
    } catch (err) {
        if (err.status === 400) throw err;
        console.warn('store hours row read failed, using published hours:', err.message);
        if (!storeIsAcceptingOrders(storeName, {})) {
            const closed = new Error('Store is closed');
            closed.status = 400;
            throw closed;
        }
    }

    await assertItemsAvailable(storeName, items);

    const priced = await recalculateOrderTotal({
        store_name: storeName,
        items_json: items,
        fulfill: dineIn ? 'dine_in' : 'takeaway',
        pickup_time: pickupTime,
    });

    const reused = await findReusablePendingOrder({
        storeName,
        customerPhone,
        items,
    });
    if (reused && reused.order_no) {
        let row = reused;
        try {
            row = await ensureGoldenOrderNo(reused, storeName, 'online');
        } catch (err) {
            console.warn('reuse pending golden upgrade failed; creating new ticket:', err.message || err);
            row = null;
        }
        if (row && row.order_no) {
            try {
                await sbRest(
                    `orders?order_no=eq.${encodeURIComponent(row.order_no)}&payment_status=eq.PENDING`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify({
                            customer_name: customerName,
                            pickup_time: pickupTime,
                            items_json: items,
                            total_amount: priced.total,
                            display_id: row.order_no,
                        }),
                    }
                );
            } catch (err) {
                console.warn('reuse pending update skipped:', row.order_no, err.message || err);
            }
            return {
                orderNo: ticketIdOf(row) || row.order_no,
                displayId: ticketIdOf(row) || row.display_id || row.order_no,
                total: priced.total,
                reused: true,
            };
        }
    }

    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        let orderNo;
        try {
            orderNo = await allocateOrderId(storeName, 'online');
        } catch (err) {
            lastError = err;
            console.error('allocateOrderId failed (online):', err.message || err);
            if (attempt === 5) throw err;
            continue;
        }
        try {
            const rowBody = {
                order_no: orderNo,
                display_id: orderNo,
                store_name: storeName,
                customer_name: customerName,
                customer_phone: customerPhone,
                pickup_time: pickupTime,
                items_json: items,
                total_amount: priced.total,
                payment_status: 'PENDING',
                channel: 'online',
            };
            const saved = await insertOrderWithFallback(rowBody);
            const row = Array.isArray(saved) ? saved[0] : saved;
            const savedNo = (row && row.order_no) || orderNo;
            if (!isGoldenOrderId(savedNo)) {
                throw new Error(`Created non-golden order_no: ${savedNo}`);
            }
            return {
                orderNo: savedNo,
                displayId: (row && row.display_id) || savedNo,
                total: priced.total,
                reused: false,
            };
        } catch (err) {
            lastError = err;
            const msg = String(err.message || '');
            if (!/duplicate|unique|order_no|display_id|23505/i.test(msg)) throw err;
        }
    }
    throw lastError || new Error('Failed to create order');
}

const POS_PAY_METHODS = new Set(['cash', 'fps', 'payme', 'card']);

async function assertStoreAccepting(storeName) {
    try {
        const settings = await getStoreRow(storeName);
        if (!storeIsAcceptingOrders(storeName, settings || {})) {
            const err = new Error('Store is closed');
            err.status = 400;
            throw err;
        }
    } catch (err) {
        if (err.status === 400) throw err;
        console.warn('store hours row read failed, using published hours:', err.message);
        if (!storeIsAcceptingOrders(storeName, {})) {
            const closed = new Error('Store is closed');
            closed.status = 400;
            throw closed;
        }
    }
}

async function insertOrderWithFallback(row) {
    try {
        return await sbRest('orders', { method: 'POST', body: JSON.stringify(row) });
    } catch (err) {
        const msg = String(err.message || '');
        let next = { ...row };
        if (/display_id/i.test(msg) && next.display_id != null) {
            delete next.display_id;
            return insertOrderWithFallback(next);
        }
        if (/channel|pay_method/i.test(msg)) {
            delete next.channel;
            delete next.pay_method;
            try {
                return await sbRest('orders', { method: 'POST', body: JSON.stringify(next) });
            } catch (err2) {
                const msg2 = String(err2.message || '');
                if (/status/i.test(msg2) && next.status) {
                    delete next.status;
                    return await sbRest('orders', { method: 'POST', body: JSON.stringify(next) });
                }
                throw err2;
            }
        }
        if (/status/i.test(msg) && row.status) {
            delete next.status;
            return await sbRest('orders', { method: 'POST', body: JSON.stringify(next) });
        }
        throw err;
    }
}

function posClientIdOf(itemsJson) {
    for (const it of parseItemsJson(itemsJson)) {
        const v = it && (it.posClientId || it.pos_client_id);
        if (v) return String(v).trim();
    }
    return '';
}

function stampPosClientId(items, clientId) {
    const id = clip(clientId, 80);
    if (!id || !Array.isArray(items) || !items.length) return items;
    const next = items.map((it) => (it && typeof it === 'object' ? { ...it } : it));
    next[0] = { ...(next[0] || {}), posClientId: id };
    return next;
}

function mapPosOrderResult(row, fallbackItems) {
    const items = parseItemsJson((row && row.items_json) || fallbackItems);
    return {
        orderNo: (row && row.order_no) || '',
        displayId: (row && row.display_id) || null,
        total: Number(row && row.total_amount) || 0,
        pay_method: (row && row.pay_method) || '',
        pickup_time: (row && row.pickup_time) || '',
        items,
    };
}

async function findPosOrderByClientId(storeName, clientId) {
    const id = clip(clientId, 80);
    if (!id || !storeName) return null;
    const since = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const select = 'order_no,display_id,items_json,total_amount,pay_method,pickup_time,customer_name,created_at';
    let rows;
    try {
        rows = await sbRest(
            `orders?store_name=eq.${encodeURIComponent(storeName)}&channel=eq.pos&created_at=gte.${encodeURIComponent(since)}&select=${select}&order=created_at.desc&limit=120`
        );
    } catch (err) {
        const msg = String(err.message || '');
        if (/display_id/i.test(msg)) {
            const sel = select.replace('display_id,', '');
            try {
                rows = await sbRest(
                    `orders?store_name=eq.${encodeURIComponent(storeName)}&channel=eq.pos&created_at=gte.${encodeURIComponent(since)}&select=${sel}&order=created_at.desc&limit=120`
                );
            } catch (err2) {
                if (!/channel/i.test(String(err2.message || ''))) throw err2;
                rows = await sbRest(
                    `orders?store_name=eq.${encodeURIComponent(storeName)}&customer_phone=eq.POS&created_at=gte.${encodeURIComponent(since)}&select=${sel}&order=created_at.desc&limit=120`
                );
            }
        } else if (/channel/i.test(msg)) {
            rows = await sbRest(
                `orders?store_name=eq.${encodeURIComponent(storeName)}&customer_phone=eq.POS&created_at=gte.${encodeURIComponent(since)}&select=${select.replace('display_id,','')}&order=created_at.desc&limit=120`
            );
        } else {
            throw err;
        }
    }
    return (Array.isArray(rows) ? rows : []).find((row) => posClientIdOf(row.items_json) === id) || null;
}

async function assertItemsAvailable(storeName, items) {
    const { listMenuItems, listSoldOutIds } = require('./_menuDb.js');
    const soldIds = await listSoldOutIds(storeName);
    const catalog = await listMenuItems({ includeInactive: false });
    const byId = new Map((catalog || []).map((row) => [row.id, row]));
    for (const item of items || []) {
        if (!item || !item.menuId) continue;
        const row = byId.get(item.menuId);
        const name = (item && (item.nameZh || item.nameEn)) || item.menuId;
        if (!row || soldIds.has(item.menuId) || row.is_sold_out) {
            const err = new Error(`已沽清：${name}`);
            err.status = 400;
            throw err;
        }
    }
}

async function createPosOrder(input) {
    const storeName = clip(input && input.store_name, 80);
    if (!KNOWN_STORES.includes(storeName)) {
        const err = new Error('Invalid store');
        err.status = 400;
        throw err;
    }
    const payMethod = clip(input && input.pay_method, 20).toLowerCase();
    if (!POS_PAY_METHODS.has(payMethod)) {
        const err = new Error('Invalid pay_method (cash / fps / payme / card)');
        err.status = 400;
        throw err;
    }
    const clientId = clip((input && (input.client_id || input.pos_client_id)) || '', 80);
    if (clientId) {
        const existing = await findPosOrderByClientId(storeName, clientId);
        if (existing) {
            const replayed = mapPosOrderResult(existing);
            const priced = await recalculateOrderTotal({
                store_name: storeName,
                items_json: replayed.items,
                fulfill: clip(input && input.fulfill, 20) === 'dine_in' ? 'dine_in' : 'takeaway',
                pickup_time: replayed.pickup_time,
            }).catch(() => null);
            return {
                ...replayed,
                total: (priced && priced.total) || replayed.total,
                subtotal: priced && priced.subtotal,
                discount: priced && priced.discount,
                replayed: true,
            };
        }
    }
    let items = Array.isArray(input && input.items) ? input.items.slice(0, 40) : [];
    if (!items.length) {
        const err = new Error('No items');
        err.status = 400;
        throw err;
    }
    items = items.map((it) => (
        it && Array.isArray(it.addonIds) && it.addonIds.length > 3
            ? { ...it, addonIds: it.addonIds.slice(0, 3) }
            : it
    ));
    if (clientId) items = stampPosClientId(items, clientId);
    const customerName = clip(input && input.customer_name, 80) || '店取客人';
    const note = clip(input && input.note, 80);
    const fulfill = clip(input && input.fulfill, 20) === 'dine_in' ? '堂食' : '即取';
    const tableRaw = String(input && input.table_no || '').replace(/[^\d]/g, '').slice(0, 4);
    const pickupBits = [fulfill];
    if (tableRaw) pickupBits.push(tableRaw + '號枱');
    if (note) pickupBits.push(note);
    const pickupTime = pickupBits.join(' · ');

    if (!input.allow_sold_out) {
        await assertItemsAvailable(storeName, items);
    }

    const priced = await recalculateOrderTotal({
        store_name: storeName,
        items_json: items,
        fulfill: clip(input && input.fulfill, 20) === 'dine_in' ? 'dine_in' : 'takeaway',
        pickup_time: pickupTime,
    });

    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        let orderNo;
        try {
            orderNo = await allocateOrderId(storeName, 'pos');
        } catch (err) {
            lastError = err;
            console.error('allocateOrderId failed (pos):', err.message || err);
            if (attempt === 5) throw err;
            continue;
        }
        try {
            const rowBody = {
                order_no: orderNo,
                display_id: orderNo,
                store_name: storeName,
                customer_name: customerName,
                customer_phone: 'POS',
                pickup_time: pickupTime,
                items_json: items,
                total_amount: priced.total,
                payment_status: 'PAID',
                status: 'PAID',
                channel: 'pos',
                pay_method: payMethod,
            };
            const saved = await insertOrderWithFallback(rowBody);
            const row = Array.isArray(saved) ? saved[0] : saved;
            const savedNo = (row && row.order_no) || orderNo;
            if (!isGoldenOrderId(savedNo)) {
                throw new Error(`Created non-golden POS order_no: ${savedNo}`);
            }
            const order = (await getOrderByNo(savedNo)) || {
                ...row,
                order_no: savedNo,
                display_id: savedNo,
                store_name: storeName,
                items_json: items,
            };
            await deductInventoryAndAlert(order);
            await notifyOrderPaid(order).catch((err) => {
                console.error('POS notifyOrderPaid failed:', err);
            });
            return {
                orderNo: savedNo,
                displayId: (row && row.display_id) || savedNo,
                total: priced.total,
                subtotal: priced.subtotal,
                discount: priced.discount,
                pay_method: payMethod,
                pickup_time: pickupTime,
                items,
            };
        } catch (err) {
            lastError = err;
            const msg = String(err.message || '');
            if (!/duplicate|unique|order_no|display_id|23505/i.test(msg)) throw err;
        }
    }
    throw lastError || new Error('Failed to create POS order');
}

async function cancelPosOrder(orderNo) {
    const looked = await getOrderByNo(orderNo).catch(() => null);
    const no = clip((looked && looked.order_no) || orderNo, 48);
    if (!no) {
        const err = new Error('Missing orderNo');
        err.status = 400;
        throw err;
    }
    let rows;
    try {
        rows = await sbRest(
            `orders?order_no=eq.${encodeURIComponent(no)}&select=order_no,channel,status,payment_status,store_name`
        );
    } catch (err) {
        if (!/channel/i.test(String(err.message || ''))) throw err;
        rows = await sbRest(
            `orders?order_no=eq.${encodeURIComponent(no)}&select=order_no,status,payment_status,store_name`
        );
    }
    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order) {
        const err = new Error('Order not found');
        err.status = 404;
        throw err;
    }
    if (order.channel && String(order.channel) !== 'pos') {
        const err = new Error('Not a POS order');
        err.status = 400;
        throw err;
    }
    const st = String(order.status || order.payment_status || '').toUpperCase();
    if (st !== 'PAID') {
        const err = new Error('廚房已開始整，唔可以喺 POS 作廢');
        err.status = 400;
        throw err;
    }
    try {
        await sbRest(`orders?order_no=eq.${encodeURIComponent(no)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'CANCELLED', payment_status: 'CANCELLED' }),
        });
    } catch (err) {
        if (!/status/i.test(String(err.message || ''))) throw err;
        await sbRest(`orders?order_no=eq.${encodeURIComponent(no)}`, {
            method: 'PATCH',
            body: JSON.stringify({ payment_status: 'CANCELLED' }),
        });
    }
    return { ok: true, orderNo: no };
}

async function createTableOrder(input) {
    const tableNo = Number(input && input.table);
    const storeName = clip(input && input.store_name, 80);
    if (!KNOWN_STORES.includes(storeName)) {
        const err = new Error('Invalid store');
        err.status = 400;
        throw err;
    }
    const tableMax = await getTableCount(storeName);
    if (!Number.isInteger(tableNo) || tableNo < 1 || tableNo > tableMax) {
        const err = new Error('Invalid table');
        err.status = 400;
        throw err;
    }
    await assertStoreAccepting(storeName);

    const customerName = clip(input && input.customer_name, 80);
    if (!customerName) {
        const err = new Error('Missing customer name');
        err.status = 400;
        throw err;
    }
    const customerPhone = clip(input && input.customer_phone, 40) || 'TABLE';
    const pickupTime = `堂食 · ${tableNo}號枱`;
    const items = Array.isArray(input && input.items) ? input.items.slice(0, 40) : [];
    if (!items.length) {
        const err = new Error('No items');
        err.status = 400;
        throw err;
    }

    await assertItemsAvailable(storeName, items);

    const priced = await recalculateOrderTotal({
        store_name: storeName,
        items_json: items,
        fulfill: 'dine_in',
        pickup_time: pickupTime,
    });

    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        let orderNo;
        try {
            orderNo = await allocateOrderId(storeName, 'table');
        } catch (err) {
            lastError = err;
            console.error('allocateOrderId failed (table):', err.message || err);
            if (attempt === 5) throw err;
            continue;
        }
        try {
            const rowBody = {
                order_no: orderNo,
                display_id: orderNo,
                store_name: storeName,
                customer_name: customerName,
                customer_phone: customerPhone,
                pickup_time: pickupTime,
                items_json: items,
                total_amount: priced.total,
                payment_status: 'UNPAID',
                status: 'PAID',
                channel: 'table',
            };
            const saved = await insertOrderWithFallback(rowBody);
            const row = Array.isArray(saved) ? saved[0] : saved;
            const savedNo = (row && row.order_no) || orderNo;
            if (!isGoldenOrderId(savedNo)) {
                throw new Error(`Created non-golden table order_no: ${savedNo}`);
            }
            const order = (await getOrderByNo(savedNo)) || {
                ...row,
                order_no: savedNo,
                display_id: savedNo,
                store_name: storeName,
                items_json: items,
            };
            await deductInventoryAndAlert(order);
            await notifyOrderPaid(order).catch((err) => {
                console.error('table notifyOrderPaid failed:', err);
            });
            return {
                orderNo: savedNo,
                displayId: (row && row.display_id) || savedNo,
                total: priced.total,
                subtotal: priced.subtotal,
                discount: priced.discount,
                pickup_time: pickupTime,
                table: tableNo,
                store_name: storeName,
            };
        } catch (err) {
            lastError = err;
            const msg = String(err.message || '');
            if (!/duplicate|unique|order_no|display_id|23505/i.test(msg)) throw err;
        }
    }
    throw lastError || new Error('Failed to create table order');
}

async function markTableOrderPaid(orderNo, payMethod) {
    const looked = await getOrderByNo(orderNo).catch(() => null);
    const no = clip((looked && looked.order_no) || orderNo, 48);
    const method = clip(payMethod, 20).toLowerCase();
    if (!no) {
        const err = new Error('Missing orderNo');
        err.status = 400;
        throw err;
    }
    if (!POS_PAY_METHODS.has(method)) {
        const err = new Error('Invalid pay_method (cash / fps / payme / card)');
        err.status = 400;
        throw err;
    }
    const existing = await getOrderByNo(no);
    if (!existing) {
        const err = new Error('Order not found');
        err.status = 404;
        throw err;
    }
    const pay = String(existing.payment_status || '').toUpperCase();
    if (pay === 'PAID' || pay === 'COMPLETED' || pay === 'PREPARING' || pay === 'READY') {
        return { ok: true, alreadyPaid: true, order: existing };
    }
    if (pay !== 'UNPAID') {
        const err = new Error(`Cannot collect ${pay}`);
        err.status = 400;
        throw err;
    }

    let rows;
    try {
        rows = await sbRest(
            `orders?order_no=eq.${encodeURIComponent(no)}`,
            { method: 'PATCH', body: JSON.stringify({ payment_status: 'PAID', pay_method: method }) }
        );
    } catch (err) {
        if (!/pay_method/i.test(String(err.message || ''))) throw err;
        rows = await sbRest(
            `orders?order_no=eq.${encodeURIComponent(no)}`,
            { method: 'PATCH', body: JSON.stringify({ payment_status: 'PAID' }) }
        );
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
        ok: true,
        orderNo: no,
        total: Number((row && row.total_amount) || existing.total_amount) || 0,
        pay_method: method,
        pickup_time: (row && row.pickup_time) || existing.pickup_time,
        customer_name: (row && row.customer_name) || existing.customer_name,
        items: existing.items_json,
        order: row || existing,
    };
}

async function getPublicOrderStatus(orderNo) {
    const no = clip(orderNo, 48);
    if (!no) return null;
    try {
        const rows = await sbRest(
            `orders?order_no=eq.${encodeURIComponent(no)}&select=order_no,display_id,store_name,pickup_time,payment_status,total_amount`
        );
        return Array.isArray(rows) ? rows[0] || null : null;
    } catch (err) {
        if (!/display_id/i.test(String(err.message || ''))) throw err;
        const rows = await sbRest(
            `orders?order_no=eq.${encodeURIComponent(no)}&select=order_no,store_name,pickup_time,payment_status,total_amount`
        );
        return Array.isArray(rows) ? rows[0] || null : null;
    }
}

async function listKitchenOrdersAllStores({ since, limit = 200 } = {}) {
    const perStoreLimit = Math.max(20, Math.ceil(Number(limit) / KNOWN_STORES.length));
    const batches = await Promise.all(
        KNOWN_STORES.map((store) => listKitchenOrders(store, { since, limit: perStoreLimit }))
    );
    const merged = batches.flat();
    merged.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return merged.slice(0, Number(limit) || 200);
}

function kitchenOrdersPath(store, select, { since, until, limit, offset } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 200, 1), 1000);
    const off = Math.max(Number(offset) || 0, 0);
    let path = `orders?store_name=eq.${encodeURIComponent(store)}&select=${select}&order=created_at.desc&limit=${lim}`;
    if (off) path += `&offset=${off}`;
    if (since) path += `&created_at=gte.${encodeURIComponent(since)}`;
    if (until) path += `&created_at=lt.${encodeURIComponent(until)}`;
    return path;
}

async function listKitchenOrders(storeName, { since, until, limit = 200, offset = 0, lite = false } = {}) {
    const store = clip(storeName, 80);
    if (!KNOWN_STORES.includes(store)) {
        const err = new Error('Invalid store');
        err.status = 400;
        throw err;
    }
    const fullSelect = [
        'order_no',
        'display_id',
        'customer_name',
        'customer_phone',
        'pickup_time',
        'items_json',
        'total_amount',
        'payment_status',
        'status',
        'store_name',
        'channel',
        'pay_method',
        'kpay_managed_no',
        'created_at',
    ].join(',');
    const liteSelect = [
        'order_no',
        'display_id',
        'total_amount',
        'payment_status',
        'status',
        'store_name',
        'channel',
        'pickup_time',
        'pay_method',
        'created_at',
    ].join(',');
    const select = lite ? liteSelect : fullSelect;
    const opts = { since, until, limit, offset };
    try {
        return await sbRest(kitchenOrdersPath(store, select, opts));
    } catch (err) {
        const msg = String(err.message || '');
        let nextSelect = select;
        if (/display_id|schema cache|column/i.test(msg)) {
            nextSelect = nextSelect.replace(/,?display_id/, '').replace(/^,/, '');
        }
        if (/kpay_managed_no|schema cache|column/i.test(msg)) {
            nextSelect = nextSelect.replace(',kpay_managed_no', '');
        }
        if (/channel|pay_method/i.test(msg)) {
            nextSelect = nextSelect.replace(',channel,pay_method', '').replace(',kpay_managed_no', '');
        }
        if (nextSelect === select) throw err;
        return sbRest(kitchenOrdersPath(store, nextSelect, opts));
    }
}

function parseItemsJson(itemsJson) {
    let items = itemsJson;
    if (typeof items === 'string') {
        try { items = JSON.parse(items || '[]'); } catch { items = []; }
    }
    return Array.isArray(items) ? items : [];
}

function normalizePhoneDigits(raw) {
    return String(raw || '').replace(/\D/g, '');
}

function itemsFingerprint(itemsJson) {
    return parseItemsJson(itemsJson).map((it) => {
        const id = it && (it.menuId || it.id || it.nameZh || it.nameEn || it.name) || '';
        const qty = Number((it && (it.qty || it.quantity)) || 1) || 1;
        const notes = [
            it && it.detailsZh,
            it && it.detailsEn,
            it && it.notes,
            it && it.note,
            it && it.size,
            it && it.temp,
        ].map((s) => String(s || '').trim()).filter(Boolean).join('|');
        return `${String(id).trim()}x${qty}:${notes}`;
    }).filter(Boolean).sort().join(';;');
}

const REUSE_PENDING_MS = 20 * 60 * 1000;

async function findReusablePendingOrder({ storeName, customerPhone, items }) {
    const store = clip(storeName, 80);
    const phone = normalizePhoneDigits(customerPhone);
    const want = itemsFingerprint(items);
    if (!store || !phone || !want) return null;
    const since = new Date(Date.now() - REUSE_PENDING_MS).toISOString();
    let rows = [];
    try {
        rows = await listKitchenOrders(store, { since, limit: 40 });
    } catch (err) {
        console.warn('findReusablePendingOrder list failed:', err.message || err);
        return null;
    }
    return (rows || []).find((o) => {
        if (String(o.payment_status || '').toUpperCase() !== 'PENDING') return false;
        const ch = String(o.channel || '').toLowerCase();
        if (ch === 'pos' || ch === 'table') return false;
        return normalizePhoneDigits(o.customer_phone) === phone
            && itemsFingerprint(o.items_json) === want;
    }) || null;
}

function kpayManagedNoOf(order) {
    const fromCol = String((order && order.kpay_managed_no) || '').trim();
    if (fromCol) return fromCol;
    const items = parseItemsJson(order && order.items_json);
    for (const it of items) {
        const v = it && (it.kpayManagedNo || it.kpay_managed_no);
        if (v) return String(v).trim();
    }
    return '';
}

async function saveKpayManagedNo(orderNo, managedOrderNo) {
    const looked = await getOrderByNo(orderNo).catch(() => null);
    const no = clip((looked && looked.order_no) || orderNo, 48);
    const kpayNo = clip(managedOrderNo, 64);
    if (!no || !kpayNo) return null;
    try {
        await sbRest(`orders?order_no=eq.${encodeURIComponent(no)}`, {
            method: 'PATCH',
            body: JSON.stringify({ kpay_managed_no: kpayNo }),
        });
    } catch (err) {
        if (!/kpay_managed_no|schema cache|column/i.test(String(err.message || ''))) throw err;
        console.warn('kpay_managed_no column missing; storing on items_json', no);
    }
    try {
        const existing = await getOrderByNo(no);
        const items = parseItemsJson(existing && existing.items_json);
        if (items.length) {
            items[0] = { ...items[0], kpayManagedNo: kpayNo };
            await sbRest(`orders?order_no=eq.${encodeURIComponent(no)}`, {
                method: 'PATCH',
                body: JSON.stringify({ items_json: items }),
            });
        }
    } catch (err) {
        console.warn('save kpayManagedNo on items skipped:', err.message || err);
    }
    return kpayNo;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function inspectPendingKpay(orderNo) {
    const no = clip(orderNo, 48);
    if (!no) return { order: null, kpay: 'missing' };
    const existing = await getOrderByNo(no);
    if (!existing) return { order: null, kpay: 'missing' };
    const pay = String(existing.payment_status || '').toUpperCase();
    if (pay !== 'PENDING') {
        return { order: existing, kpay: 'not_pending', pay };
    }

    const kpay = require('./_kpay.js');
    let queried = null;
    try {
        queried = await kpay.queryManagedOrder(no, kpayManagedNoOf(existing));
    } catch (err) {
        console.warn('inspectPendingKpay query failed:', no, err.message || err);
        return { order: existing, kpay: 'query_failed', pay };
    }

    if (queried && kpay.isKpayPaymentSuccess(queried) && kpay.queryBelongsToOrder(queried, no)) {
        try {
            const result = await markOrderPaid(no);
            const order = (result && result.order) || (await getOrderByNo(no)) || existing;
            return {
                order,
                kpay: 'paid',
                pay: String((order && order.payment_status) || '').toUpperCase(),
                queried,
            };
        } catch (err) {
            console.warn('inspectPendingKpay mark failed:', no, err.message || err);
            return { order: existing, kpay: 'paid', pay: 'PENDING', queried, markFailed: true };
        }
    }
    if (!queried) return { order: existing, kpay: 'query_failed', pay };
    if (kpay.isKpayFailed(queried) || kpay.isKpayWaitingOrFailed(queried)) {
        return { order: existing, kpay: 'unpaid', pay, queried };
    }
    return { order: existing, kpay: 'query_failed', pay, queried };
}

async function reconcilePendingIfPaid(orderNo, { retries = 1, delayMs = 0 } = {}) {
    const no = clip(orderNo, 48);
    if (!no) return null;
    let existing = await getOrderByNo(no);
    if (!existing) return null;
    const pay = String(existing.payment_status || '').toUpperCase();
    if (pay !== 'PENDING') return existing;

    const { queryManagedOrder, isKpayPaymentSuccess, queryBelongsToOrder } = require('./_kpay.js');
    const tries = Math.max(1, Number(retries) || 1);
    for (let i = 0; i < tries; i++) {
        existing = await getOrderByNo(no);
        if (!existing) return null;
        if (String(existing.payment_status || '').toUpperCase() !== 'PENDING') return existing;
        const queried = await queryManagedOrder(no, kpayManagedNoOf(existing));
        if (queried && isKpayPaymentSuccess(queried) && queryBelongsToOrder(queried, no)) {
            const result = await markOrderPaid(no);
            return (result && result.order) || (await getOrderByNo(no)) || existing;
        }
        if (i + 1 < tries && delayMs) await sleep(delayMs);
    }
    return existing;
}

async function reconcileRecentPending(storeName, { limit = 4, budgetMs = 7000 } = {}) {
    const store = clip(storeName, 80);
    if (!store) return { checked: 0, updated: 0 };
    const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const rows = await listKitchenOrders(store, { since, limit: 40 });
    const pending = (rows || [])
        .filter((o) => String(o.payment_status || '').toUpperCase() === 'PENDING')
        .slice(0, limit);
    const deadline = Date.now() + budgetMs;
    let updated = 0;
    for (const row of pending) {
        if (Date.now() > deadline) break;
        try {
            const next = await reconcilePendingIfPaid(row.order_no);
            if (next && String(next.payment_status || '').toUpperCase() === 'PAID') updated += 1;
        } catch (err) {
            console.warn('reconcile pending failed:', row.order_no, err.message || err);
        }
    }
    return { checked: pending.length, updated };
}

module.exports = {
    getOrderByNo,
    markOrderPaid,
    updateOrderTotalAmount,
    updateKitchenOrderStatus,
    createPendingOrder,
    createPosOrder,
    cancelPosOrder,
    createTableOrder,
    markTableOrderPaid,
    getPublicOrderStatus,
    listKitchenOrders,
    listKitchenOrdersAllStores,
    saveKpayManagedNo,
    kpayManagedNoOf,
    inspectPendingKpay,
    reconcilePendingIfPaid,
    reconcileRecentPending,
    startOfTodayHkIso,
    storeCodeFor,
    channelCodeFor,
    generateDisplayId,
    allocateOrderId,
    ticketIdOf,
    KNOWN_STORES,
};
