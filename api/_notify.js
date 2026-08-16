const STORE_EMAILS = {
    'Fortress Hill': ['pakyeelimited@gmail.com'],
    'Sai Ying Pun': ['mirrorshk@gmail.com'],
    'Tsuen Wan (Takeaway Only)': ['mirrorshk@gmail.com'],
};

function emailRecipientsForStore(storeName) {
    return STORE_EMAILS[storeName] || STORE_EMAILS['Sai Ying Pun'] || [];
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatItems(order) {
    let items = order.items_json;
    try {
        if (typeof items === 'string') items = JSON.parse(items || '[]');
    } catch {
        items = [];
    }
    if (!Array.isArray(items) || !items.length) return '（無餐點詳情）';
    return items.map((item) => {
        const qty = item.qty || item.quantity || 1;
        const name = item.nameZh || item.nameEn || item.name || '項目';
        const details = item.detailsZh || item.detailsEn || item.notes || '';
        return `• ${qty}× ${name}${details ? ` — ${details}` : ''}`;
    }).join('<br>');
}

function buildEmailHtml(order) {
    const orderNo = escapeHtml(order.order_no);
    const store = escapeHtml(order.store_name || '—');
    const name = escapeHtml(order.customer_name || '—');
    const phone = escapeHtml(order.customer_phone || '—');
    const pickup = escapeHtml(order.pickup_time || '—');
    const amount = Number(order.total_amount);
    const amountText = Number.isFinite(amount) ? `HK$${Math.round(amount)}` : '—';
    const itemsHtml = formatItems(order);

    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px">🍔 Mirror Burger 新單 #${orderNo}</h2>
        <p style="margin:0 0 8px"><b>分店：</b>${store}</p>
        <p style="margin:0 0 8px"><b>取餐時間：</b>${pickup}</p>
        <p style="margin:0 0 8px"><b>客人：</b>${name} · ${phone}</p>
        <p style="margin:0 0 8px"><b>金額：</b>${amountText}</p>
        <p style="margin:16px 0 8px"><b>餐點：</b></p>
        <p style="margin:0 0 16px">${itemsHtml}</p>
        <p style="margin:0;color:#666;font-size:13px">已付款（PAID）。請到廚房系統處理：https://mirrorburger.com/kitchen.html</p>
      </div>
    `;
}

async function sendOrderEmail(order) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || 'Mirror Burger <onboarding@resend.dev>';
    if (!apiKey) {
        console.warn('📧 Skip email: RESEND_API_KEY not set');
        return { skipped: true, reason: 'missing_resend_key' };
    }

    const to = emailRecipientsForStore(order.store_name);
    if (!to.length) {
        console.warn('📧 Skip email: no recipients for store', order.store_name);
        return { skipped: true, reason: 'no_recipients' };
    }

    const orderNo = order.order_no || '';
    const store = order.store_name || '';
    const subject = `【新單】#${orderNo} · ${store} · ${order.pickup_time || ''}`.trim();

    const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to,
            subject,
            html: buildEmailHtml(order),
        }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Resend failed (${resp.status}): ${text}`);
    }
    const data = await resp.json();
    console.log(`📧 Email sent for #${orderNo} → ${to.join(', ')}`);
    return { ok: true, id: data.id, to };
}

async function listPushSubscriptions(storeName) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) return [];

    // 同舖 + 訂閱「全部分店」嘅裝置
    const url =
        `${SUPABASE_URL}/rest/v1/push_subscriptions` +
        `?or=(store_name.eq.${encodeURIComponent(storeName)},store_name.eq.all)` +
        `&select=id,endpoint,p256dh,auth,store_name`;

    const resp = await fetch(url, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
    if (!resp.ok) {
        const text = await resp.text();
        console.warn('Push list failed:', text);
        return [];
    }
    return await resp.json();
}

async function deletePushSubscription(endpoint) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY || !endpoint) return;
    const url = `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`;
    await fetch(url, {
        method: 'DELETE',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
}

async function sendOrderPush(order) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:mirrorshk@gmail.com';
    if (!publicKey || !privateKey) {
        console.warn('🔔 Skip push: VAPID keys not set');
        return { skipped: true, reason: 'missing_vapid' };
    }

    let webpush;
    try {
        webpush = require('web-push');
    } catch (err) {
        console.warn('🔔 Skip push: web-push package missing', err.message);
        return { skipped: true, reason: 'missing_package' };
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const rows = await listPushSubscriptions(order.store_name || '');
    if (!rows.length) {
        console.log('🔔 No push subscribers for', order.store_name);
        return { ok: true, sent: 0 };
    }

    const payload = JSON.stringify({
        title: `新單 #${order.order_no}`,
        body: `${order.store_name || ''} · ${order.pickup_time || ''} · HK$${Math.round(Number(order.total_amount) || 0)}`,
        url: '/kitchen.html',
        orderNo: order.order_no,
    });

    let sent = 0;
    for (const row of rows) {
        try {
            await webpush.sendNotification(
                {
                    endpoint: row.endpoint,
                    keys: { p256dh: row.p256dh, auth: row.auth },
                },
                payload
            );
            sent += 1;
        } catch (err) {
            console.warn('Push send failed:', err.statusCode || err.message);
            if (err.statusCode === 404 || err.statusCode === 410) {
                await deletePushSubscription(row.endpoint);
            }
        }
    }
    console.log(`🔔 Push sent ${sent}/${rows.length} for #${order.order_no}`);
    return { ok: true, sent, total: rows.length };
}

/** 付款成功後通知：email + push；失敗只記 log，唔影響收款 webhook */
async function notifyOrderPaid(order) {
    if (!order || !order.order_no) return;
    const results = {};
    try {
        results.email = await sendOrderEmail(order);
    } catch (err) {
        console.error('notify email error:', err.message || err);
        results.email = { error: String(err.message || err) };
    }
    try {
        results.push = await sendOrderPush(order);
    } catch (err) {
        console.error('notify push error:', err.message || err);
        results.push = { error: String(err.message || err) };
    }
    return results;
}

module.exports = {
    STORE_EMAILS,
    emailRecipientsForStore,
    sendOrderEmail,
    sendOrderPush,
    notifyOrderPaid,
};
