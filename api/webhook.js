// api/webhook.js
// 🔑 由 Vercel 環境變數讀取 Stripe Secret Key 同 Webhook Secret
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = require('stripe')(STRIPE_KEY);

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const SUPABASE_URL = 'https://olmoingcxkgdrqezweuf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbW9pbmdjeGtnZHJxZXp3ZXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwOTA4MTMsImV4cCI6MjA5NDY2NjgxM30.FHH8doicN8j1OKtt10BL9LS5Ta5dhLn5mSCF_cQ_pNw';

const config = { api: { bodyParser: false } };

function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function markOrderPaid(orderNo) {
    if (!orderNo) return;
    const url = `${SUPABASE_URL}/rest/v1/orders?order_no=eq.${encodeURIComponent(orderNo)}&payment_status=eq.PENDING`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ payment_status: 'PAID' }),
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Supabase update failed (${resp.status}): ${text}`);
    }
}

const handler = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!STRIPE_WEBHOOK_SECRET) {
        console.error('Webhook 未設定：環境變數 STRIPE_WEBHOOK_SECRET 係空嘅。');
        return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event;
    try {
        const rawBody = await getRawBody(req);
        const signature = req.headers['stripe-signature'];
        event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook 簽名驗證失敗:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            if (session.payment_status === 'paid') {
                const orderNo = (session.metadata && session.metadata.orderNo) || session.client_reference_id;
                await markOrderPaid(orderNo);
                console.log(`✅ 訂單 ${orderNo} 已標記為 PAID`);
            }
        }
    } catch (err) {
        console.error('處理 webhook 時出錯:', err.message);
        return res.status(500).json({ error: err.message });
    }

    return res.status(200).json({ received: true });
};

module.exports = handler;
module.exports.config = config;