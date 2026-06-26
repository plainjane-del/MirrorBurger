// api/checkout.js
// 🚨 終極暴風修復：直接將你頭先喺 Stripe 複製出嚟串 sk_live_... 貼喺下面單引號入面！
const STRIPE_KEY = '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'; 
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
            success_url: `https://mirrorburger.com`, 
            cancel_url: `https://mirrorburger.com`,
        });

        // 完美回傳支付網址
        return res.status(200).json({ paymentUrl: session.url });

    } catch (err) {
        console.error('Stripe Server Error:', err);
        return res.status(500).json({ error: err.message });
    }
};