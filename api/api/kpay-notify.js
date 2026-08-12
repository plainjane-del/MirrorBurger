const kpay = require('./_kpay.js');

// 必須設定 bodyParser: false 以獲取 KPay 驗簽用的 raw body
export const config = { api: { bodyParser: false } };

function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const signatureB64 = req.headers['k-signature'] || '';
        const nonceStr = req.headers['k-nonce-str'] || '';
        const timestamp = req.headers['k-timestamp'] || '';
        
        const rawBody = await getRawBody(req);
        const bodyText = rawBody.toString('utf8');
        const payload = JSON.parse(bodyText);
        const merchantCode = payload.merchantCode;

        // Vercel 嘅 req.url 已經包含 path 同 query string
        const uri = req.url; 
        const signatureText = `POST\n${uri}\n${timestamp}\n${nonceStr}\n${merchantCode}\n${bodyText}\n`;
        const pubKey = kpay.getKeyContent('KPAY_PUBLIC_KEY');

        const isValid = kpay.verifyKpaySignature(signatureB64, signatureText, pubKey);
        if (!isValid) {
            console.error('🚨 KPay Webhook Signature Verification Failed');
            return res.status(401).send('Unauthorized');
        }

        // 確認交易成功
        if (payload.transactionState === 'SUCCESS') {
            const orderNo = payload.outTradeNo || payload.managedOutTradeNo; 
            
            // 安全讀取 Supabase 並將訂單標記為 PAID
            const SUPABASE_URL = process.env.SUPABASE_URL;
            const SUPABASE_KEY = process.env.SUPABASE_KEY;
            
            await fetch(`${SUPABASE_URL}/rest/v1/orders?order_no=eq.${encodeURIComponent(orderNo)}&payment_status=eq.PENDING`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify({ payment_status: 'PAID' }),
            });
            console.log(`✅ KPay Payment Success & Updated DB for order: ${orderNo}`);
        }

        // KPay 要求回傳 HTTP 200 即代表成功接收
        return res.status(200).send('OK');
    } catch (error) {
        console.error('KPay Notify Error:', error);
        return res.status(500).send('Internal Server Error');
    }
}
