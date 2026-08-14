const { notifyOrderPaid } = require('./_notify.js');

async function getOrderByNo(orderNo) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Supabase configuration error: Missing SUPABASE_URL or SUPABASE_KEY');
    }
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

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Supabase configuration error: Missing SUPABASE_URL or SUPABASE_KEY');
    }

    // 只改 payment_status；廚房流程用 status 欄位
    const url = `${SUPABASE_URL}/rest/v1/orders?order_no=eq.${encodeURIComponent(orderNo)}&payment_status=eq.PENDING`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify({ payment_status: 'PAID' }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Supabase update failed (${resp.status}): ${text}`);
    }

    const rows = await resp.json();
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

module.exports = { getOrderByNo, markOrderPaid };
