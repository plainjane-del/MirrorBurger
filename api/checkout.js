// =============================================================
//  Mirror Burger — 正式 Stripe 付款 (Vercel Serverless Function)
//  路徑：POST /api/checkout
//  前端 (js/order-handler.js) 會傳 { amount, orderNo }，
//  本函式建立 Stripe Checkout Session，回傳 { paymentUrl }，
//  前端再 redirect 客人去 Stripe 結帳頁面。
//
//  ⚠️ 必須喺 Vercel → Project → Settings → Environment Variables
//     設定 STRIPE_SECRET_KEY（千祈唔好寫死喺代碼度）。
// =============================================================

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
    // 同源呼叫，順手開返 CORS，方便日後測試
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    try {
        if (!process.env.STRIPE_SECRET_KEY) {
            res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY env var' });
            return;
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const { amount, orderNo } = body;

        const payAmount = Number(amount);
        if (!orderNo || !payAmount || payAmount <= 0) {
            res.status(400).json({ error: 'Missing or invalid amount / orderNo', received: body });
            return;
        }

        // 用 request 嘅 host 砌返成功 / 取消網址，preview 同 production 都啱用
        const proto = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        const baseUrl = host ? `${proto}://${host}` : 'https://mirrorburger.com';

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'hkd',
                    product_data: { name: `Mirror Burger Order ${orderNo}` },
                    // Stripe 以「分」為單位：HKD $120 → 12000
                    unit_amount: Math.round(payAmount * 100),
                },
                quantity: 1,
            }],
            client_reference_id: orderNo,
            metadata: { orderNo },
            success_url: `${baseUrl}/?paid=1&order=${encodeURIComponent(orderNo)}`,
            cancel_url: `${baseUrl}/?canceled=1&order=${encodeURIComponent(orderNo)}`,
        });

        res.status(200).json({ paymentUrl: session.url });
    } catch (err) {
        console.error('Stripe checkout error:', err);
        res.status(500).json({ error: err.message });
    }
};
