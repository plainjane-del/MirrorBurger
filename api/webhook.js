// api/webhook.js
// =============================================================
//  Mirror Burger — Stripe 付款成功通知 (Webhook)
//
//  🎯 作用：客人喺 Stripe 真係俾完錢嗰一刻，Stripe 個伺服器會主動打嚟呢度，
//          我哋就即刻將 Supabase 嗰張單由 PENDING 改做 PAID，
//          廚房 KDS (kitchen.html) 先至會見到張單。
//
//  ✅ 呢個係最可靠嘅做法：就算客人俾完錢即刻熄咗個 browser，單一樣會入廚房。
//
//  🔧 一次性設定（喺 Stripe Dashboard 做一次就得）：
//    1. Developers → Webhooks → Add endpoint
//    2. Endpoint URL 填： https://mirrorburger.com/api/webhook
//    3. 揀事件： checkout.session.completed
//    4. 撳 Add endpoint 之後，會見到「Signing secret」(whsec_...)
//    5. 將個 whsec_... 貼入 Vercel 環境變數 STRIPE_WEBHOOK_SECRET
//       (Vercel → Project → Settings → Environment Variables)
// =============================================================

const STRIPE_KEY = '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';
const stripe = require('stripe')(STRIPE_KEY);

// 🔑 由 Vercel 環境變數讀取 Stripe Webhook 簽名密鑰（防止有人偽造假付款通知）
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Supabase 大腦：用返同 kitchen.html / index.html 一樣嘅 anon key（RLS 已容許更新訂單）
const SUPABASE_URL = 'https://olmoingcxkgdrqezweuf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbW9pbmdjeGtnZHJxZXp3ZXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwOTA4MTMsImV4cCI6MjA5NDY2NjgxM30.FHH8doicN8j1OKtt10BL9LS5Ta5dhLn5mSCF_cQ_pNw';

// Stripe 簽名驗證一定要用「原始 raw body」，所以要關閉 Vercel 預設嘅 body parser
const config = { api: { bodyParser: false } };

// 將 request stream 讀返做原始 Buffer（俾 Stripe 驗簽名用）
function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

// 將指定單號嘅訂單狀態改做 PAID（透過 Supabase REST API）
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
            // 只有真係付咗款先當 PAID（payment_status === 'paid'）
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

    // 一定要回 200，否則 Stripe 會不斷重試
    return res.status(200).json({ received: true });
};

module.exports = handler;
module.exports.config = config;
