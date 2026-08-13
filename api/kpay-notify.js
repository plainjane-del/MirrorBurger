const kpay = require('./_kpay.js');
const { markOrderPaid } = require('./_orders.js');

// 必須關閉 bodyParser 以獲取 KPay 驗簽用的 raw body
module.exports.config = { api: { bodyParser: false } };

function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

module.exports = async function handler(req, res) {
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

        if (payload.transactionState === 'SUCCESS') {
            const orderNo = payload.outTradeNo || payload.managedOutTradeNo;
            if (!orderNo) {
                console.error('KPay SUCCESS but missing orderNo', payload);
                return res.status(400).send('Missing orderNo');
            }

            // DB 失敗要回 5xx，等 KPay 重試；唔好假裝 OK
            await markOrderPaid(orderNo);
            console.log(`✅ KPay Payment Success & Updated DB for order: ${orderNo}`);
        }

        return res.status(200).send('OK');
    } catch (error) {
        console.error('KPay Notify Error:', error);
        return res.status(500).send('Internal Server Error');
    }
};
