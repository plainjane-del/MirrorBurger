// api/checkout.js
// 🔑 由 Vercel 環境變數讀取 Stripe Secret Key
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY; 
const stripe = require('stripe')(STRIPE_KEY);

module.exports = async (req, res) => {
    // 處理跨域問題 (CORS 防禦)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { amount, orderNo } = req.body;

        if (!amount || !orderNo) {
            return res.status(400).json({ error: 'Missing amount or orderNo' });
        }

        // 建立 Stripe Checkout Session 支付連結
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'hkd',
                    product_data: {
                        name: `Mirror Burger Order #${orderNo}`,
                    },
                    unit_amount: Math.round(amount * 100), // Stripe 單位係「仙」，必須乘 100
                },
                quantity: 1,
            }],
            mode: 'payment',
            metadata: { orderNo: orderNo },
            client_reference_id: orderNo,
            success_url: `https://mirrorburger.com/?paid=${orderNo}`,
            cancel_url: `https://mirrorburger.com`,
        });

        return res.status(200).json({ paymentUrl: session.url });

    } catch (err) {
        console.error('Stripe Server Error:', err);
        return res.status(500).json({ error: err.message });
    }
};