const crypto = require('crypto');
const { notifyOrderPaid } = require('./_notify.js');
const { recalculateOrderTotal } = require('./_pricing.js');
const { KNOWN_STORES } = require('./_storeSettings.js');

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

    // 唔 select status：舊 DB 可能未加呢欄；通知唔需要
    const select = [
        'order_no',
        'total_amount',
        'payment_status',
        'store_name',
        'customer_name',
        'customer_phone',
        'pickup_time',
        'items_json',
        'created_at',
    ].join(',');

    const url = `${SUPABASE_URL}/rest/v1/orders?order_no=eq.${encodeURIComponent(orderNo)}&select=${select}`;
    const resp = await fetch(url, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Supabase fetch failed (${resp.status}): ${text}`);
    }
    const rows = await resp.json();
    return Array.isArray(rows) ? rows[0] || null : null;
}

async function markOrderPaid(orderNo) {
    if (!orderNo) return { updated: false };

    const { SUPABASE_URL, SUPABASE_KEY } = getSupabaseConfig();

    // payment_status = 收款；status = 廚房「新單」欄（有呢欄就一齊寫）
    const url = `${SUPABASE_URL}/rest/v1/orders?order_no=eq.${encodeURIComponent(orderNo)}&payment_status=eq.PENDING`;
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
        return { updated: false };
    }

    // 再拉齊欄位（items 等）再通知
    const order = (await getOrderByNo(orderNo)) || rows[0];
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
    const timePart = Date.now().toString().slice(-6);
    const randPart = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    return `MB${timePart}${randPart}`;
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

    const priced = await recalculateOrderTotal({
        store_name: storeName,
        items_json: items,
        fulfill: dineIn ? 'dine_in' : 'takeaway',
        pickup_time: pickupTime,
    });

    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        const orderNo = generateOrderNo();
        try {
            const saved = await sbRest('orders', {
                method: 'POST',
                body: JSON.stringify({
                    order_no: orderNo,
                    store_name: storeName,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    pickup_time: pickupTime,
                    items_json: items,
                    total_amount: priced.total,
                    payment_status: 'PENDING',
                }),
            });
            const row = Array.isArray(saved) ? saved[0] : saved;
            return {
                orderNo: (row && row.order_no) || orderNo,
                total: priced.total,
            };
        } catch (err) {
            lastError = err;
            const msg = String(err.message || '');
            if (!/duplicate|unique|order_no|23505/i.test(msg)) throw err;
        }
    }
    throw lastError || new Error('Failed to create order');
}

const POS_PAY_METHODS = new Set(['cash', 'fps', 'payme']);

async function insertOrderWithFallback(row) {
    try {
        return await sbRest('orders', { method: 'POST', body: JSON.stringify(row) });
    } catch (err) {
        const msg = String(err.message || '');
        let next = { ...row };
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

async function createPosOrder(input) {
    const storeName = clip(input && input.store_name, 80);
    if (!KNOWN_STORES.includes(storeName)) {
        const err = new Error('Invalid store');
        err.status = 400;
        throw err;
    }
    const payMethod = clip(input && input.pay_method, 20).toLowerCase();
    if (!POS_PAY_METHODS.has(payMethod)) {
        const err = new Error('Invalid pay_method (cash / fps / payme)');
        err.status = 400;
        throw err;
    }
    const items = Array.isArray(input && input.items) ? input.items.slice(0, 40) : [];
    if (!items.length) {
        const err = new Error('No items');
        err.status = 400;
        throw err;
    }
    const customerName = clip(input && input.customer_name, 80) || '店取客人';
    const note = clip(input && input.note, 80);
    const fulfill = clip(input && input.fulfill, 20) === 'dine_in' ? '堂食' : '即取';
    const pickupTime = note ? `${fulfill} · ${note}` : fulfill;

    const { listMenuItems, listSoldOutIds } = require('./_menuDb.js');
    const soldIds = await listSoldOutIds(storeName);
    const catalog = await listMenuItems({ includeInactive: false });
    const byId = new Map((catalog || []).map((row) => [row.id, row]));
    for (const item of items) {
        const row = byId.get(item.menuId);
        const name = (item && (item.nameZh || item.nameEn)) || item.menuId;
        if (!row || row.is_sold_out || soldIds.has(item.menuId)) {
            const err = new Error(`已沽清：${name}`);
            err.status = 400;
            throw err;
        }
    }

    const priced = await recalculateOrderTotal({
        store_name: storeName,
        items_json: items,
        fulfill: clip(input && input.fulfill, 20) === 'dine_in' ? 'dine_in' : 'takeaway',
        pickup_time: pickupTime,
    });

    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        const orderNo = generateOrderNo();
        try {
            const saved = await insertOrderWithFallback({
                order_no: orderNo,
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
            });
            const row = Array.isArray(saved) ? saved[0] : saved;
            const order = (await getOrderByNo(orderNo)) || row;
            await notifyOrderPaid(order).catch((err) => {
                console.error('POS notifyOrderPaid failed:', err);
            });
            return {
                orderNo: (row && row.order_no) || orderNo,
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
            if (!/duplicate|unique|order_no|23505/i.test(msg)) throw err;
        }
    }
    throw lastError || new Error('Failed to create POS order');
}

async function cancelPosOrder(orderNo) {
    const no = clip(orderNo, 32);
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

async function getPublicOrderStatus(orderNo) {
    const no = clip(orderNo, 32);
    if (!no) return null;
    const rows = await sbRest(
        `orders?order_no=eq.${encodeURIComponent(no)}&select=order_no,store_name,pickup_time,payment_status,total_amount`
    );
    return Array.isArray(rows) ? rows[0] || null : null;
}

async function listKitchenOrders(storeName, { since, limit = 200 } = {}) {
    const store = clip(storeName, 80);
    if (!KNOWN_STORES.includes(store)) {
        const err = new Error('Invalid store');
        err.status = 400;
        throw err;
    }
    const select = [
        'order_no',
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
        'created_at',
    ].join(',');
    let path = `orders?store_name=eq.${encodeURIComponent(store)}&select=${select}&order=created_at.desc&limit=${Number(limit) || 200}`;
    if (since) path += `&created_at=gte.${encodeURIComponent(since)}`;
    try {
        return await sbRest(path);
    } catch (err) {
        if (!/channel|pay_method/i.test(String(err.message || ''))) throw err;
        const legacy = select.replace(',channel,pay_method', '');
        let fallback = `orders?store_name=eq.${encodeURIComponent(store)}&select=${legacy}&order=created_at.desc&limit=${Number(limit) || 200}`;
        if (since) fallback += `&created_at=gte.${encodeURIComponent(since)}`;
        return sbRest(fallback);
    }
}

module.exports = {
    getOrderByNo,
    markOrderPaid,
    updateOrderTotalAmount,
    updateKitchenOrderStatus,
    createPendingOrder,
    createPosOrder,
    cancelPosOrder,
    getPublicOrderStatus,
    listKitchenOrders,
    startOfTodayHkIso,
    KNOWN_STORES,
};
