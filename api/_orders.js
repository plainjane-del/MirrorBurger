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
    const pickupTime = clip(input && input.pickup_time, 40);
    const items = Array.isArray(input && input.items) ? input.items.slice(0, 40) : [];
    if (!customerName || !customerPhone || !pickupTime) {
        const err = new Error('Missing customer details');
        err.status = 400;
        throw err;
    }
    if (pickupTime === 'CLOSED') {
        const err = new Error('Store is closed');
        err.status = 400;
        throw err;
    }

    const priced = await recalculateOrderTotal({
        store_name: storeName,
        items_json: items,
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
        'created_at',
    ].join(',');
    let path = `orders?store_name=eq.${encodeURIComponent(store)}&select=${select}&order=created_at.desc&limit=${Number(limit) || 200}`;
    if (since) path += `&created_at=gte.${encodeURIComponent(since)}`;
    return sbRest(path);
}

module.exports = {
    getOrderByNo,
    markOrderPaid,
    updateOrderTotalAmount,
    updateKitchenOrderStatus,
    createPendingOrder,
    getPublicOrderStatus,
    listKitchenOrders,
    startOfTodayHkIso,
    KNOWN_STORES,
};
