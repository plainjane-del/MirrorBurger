// api/webhook.js
const { markOrderPaid } = require('./_orders.js');
const config = { api: { bodyParser: false } };

function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

const handler = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 🛡️ 由環境變數安全讀取 Stripe 密鑰
    const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

    if (!STRIPE_KEY || !STRIPE_WEBHOOK_SECRET) {
        console.error('🚨 Webhook Error: Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const stripe = require('stripe')(STRIPE_KEY);

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
                console.log(`✅ 訂單 ${orderNo} 已成功標記為 PAID`);
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