const crypto = require('crypto');

const MERCHANT_CODE = '852124272000001';
const RSA_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
(同樣貼入你那段 Private Key)
-----END RSA PRIVATE KEY-----`;

exports.handler = async (event) => {
    try {
        const { orderNo, amount } = JSON.parse(event.body);
        const nonceStr = Math.random().toString(36).substring(2, 12);
        const timestamp = Date.now().toString();

        const bodyData = {
            outTradeNo: "REF" + Date.now(), // 退款需獨立單號 [cite: 62]
            oriOrderNo: orderNo,            // KPay 返回的原始訂單號
            refundAmount: parseFloat(amount)
        };

        const signParams = {
            "K-Merchant-Code": MERCHANT_CODE,
            "K-Nonce-Str": nonceStr,
            "K-Timestamp": timestamp
        };
        const sortedKeys = Object.keys(signParams).sort();
        const signStr = sortedKeys.map(k => `${k}=${signParams[k]}`).join('\n') + '\n';
        const signature = crypto.createSign('RSA-SHA256').update(signStr).sign(RSA_PRIVATE_KEY, 'base64');

        const res = await fetch('https://payment.uat.kpay-group.com/v1/refund', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'K-Merchant-Code': MERCHANT_CODE,
                'K-Nonce-Str': nonceStr,
                'K-Timestamp': timestamp,
                'K-Signature': signature
            },
            body: JSON.stringify(bodyData)
        });

        const result = await res.json();
        if (result.code === 10000) return { statusCode: 200, body: JSON.stringify({ success: true }) };
        return { statusCode: 400, body: JSON.stringify({ success: false, error: result.message }) };
    } catch (err) { return { statusCode: 500, body: JSON.stringify({ error: err.message }) }; }
};
