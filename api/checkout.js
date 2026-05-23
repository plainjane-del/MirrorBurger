const crypto = require('crypto');

const MERCHANT_CODE = '852124272000001';
const RSA_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDgEWuo8x9rdKJDpszdRYC+Gqb9fx+0dBVrdC9iEVo1zPp/OI7WDHsdT8rWV7S1yT+IWWSc/XMeyr6kmFXSv4EeC+o1GG0W7RMG4vU+sCZbzhM3NZef+OoZp1sruUbEQG1szFANoBoiu8Zzc/tt1K0S020K+7Zp3iNUbg/UBDW1AFhjlEZBi0xBsqoP0RDXDnXBMCEup2kZP8tilCaGzW71C+UuP9XnwbP9EEZAKLjPyZLeoFNWmu/oLWHUXT3M+XhogoAIDKaRNlYnFgeb2lhz3738bVVl8uDThHK6DDiHOHpEkuRC2IfvDLAN58NDT2ifnsm6tYo6EdCcBKchZOmnAgMBAAECggEBAKyQnhKjE3qle+aQSszLH2jJi/xFcHyAvpJgC7ICXTB8Khvayh7Nw++CKVxEdddfI7/14MgLZiK70HFhJQ/HD0C9umWj5zg142Z1Wp0p+pDPt/rYGmtIv7p8KnoVGgxA9kVJYQntWNORPDhkhapDlfueuycvToBgZWM71JLbnyVCqmcXTbki50lpxU76qvr7cDVqlz/qY7rCKWQAlye8QFZtOpsjm7/rnRe9dpQeZTFPMAVPTGDH4vWbrS9IwH9e/pdaBVOG60dlzPvEYHhKrxAiTpftmsHTZzpHMlpsa/aez6K9A8/RxEsoVTW26qBYt4avv7lpucTBDphqGfc/KRkCgYEA/FGa3+T3EoNS5M2U1eoGVzJvN0Qe4Li269AxCNOy75Q6LKIg2pg6KpAGtPQC5Gp9god1uLVgpeDkQ2D9AUrJZdmJpQ+c0YRWPNDxZJ2KHFJMSFppSoCifRkq63r1vmC+hG4M30wS6fqV/iSC5dcLTyCnahknCOQYnZyu1VQAWG0CgYEA41ZNBe4gpwN8Mg9T2cxr7PLumV6zGVHFQ912mhbXuqld0zlrsQNXPv4EqUuYVYAXNjNZ7XNMmbj7BrBAKC3ktm8D6K6y1vNgwP073tMapvv69y+ubGSbDKXm+ofALL76WiJlyft3N97suA8JsuCi/NEUtUGOaG4GnOiuGJnR5eMCgYEApTRRMVNbKjXt6n1oe/80k5ckFo11ojGPIys3T848lHz68gpddILDYubWXVh/JEtNTk+fFoc7dqCfFDbGsTfkUdlzNC3awZviUwODaht0OELyS1VXJz6+JSZ7YZ8qk7IIS/E6YGIQ6D34Q2RoiFCayP5aXy+EzV97docGOgs8BqkCgYBQoEvi3YhxEzhZ3LvFU823FJVwiXiFc029+u5USeOqzOR8xDGgbunjal2m2Sumry4MR/wNzcWOA1/sCFhIp7YkyYyeWk8NEvXunCE+rqoWLOnd/ugigy/GNZSMp9aNSBIsI2TsVKX8h7B2usaazTag6Vopyp1CBjuMLK2KBgu+NwKBgE9tx0maUcHW/re3ZixUPegrha/UYdtBdC3F1kJPC65z8scDpdlpU4Y2uw5nrlTmsPcBWW+4Ebya6a2ijy8Ig8qYZTQA1kMgLPsRSqWVZGz4VkPFfQHJVofzx/3AUvVB7rhDkCJ2UxFr/zorXZx85DUMHT9kClrFNl2f0l9hcrXg
-----END RSA PRIVATE KEY-----`;

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    try {
        const { amount, orderNo } = JSON.parse(event.body);
        const nonceStr = Math.random().toString(36).substring(2, 12);
        const timestamp = Date.now().toString();

        const bodyData = {
            outTradeNo: orderNo,
            orderType: "CNP_SALES_GATEWAY", // 根據 v4.0 文檔 [cite: 7]
            payAmount: parseFloat(amount),
            payCurrency: "HKD",
            returnUrl: "https://mirrorburger.com",
            orderRemark: "Mirror Burger Order",
            itemList: [{
                itemNo: "ITEM001",
                itemName: "Burger Set",
                price: parseFloat(amount),
                priceCurrency: "HKD",
                quantity: 1
            }] // itemList 係必填嘅 [cite: 4]
        };

        const signParams = {
            "K-Merchant-Code": MERCHANT_CODE,
            "K-Nonce-Str": nonceStr,
            "K-Timestamp": timestamp
        };
        const sortedKeys = Object.keys(signParams).sort();
        const signStr = sortedKeys.map(k => `${k}=${signParams[k]}`).join('\n') + '\n';
        const signature = crypto.createSign('RSA-SHA256').update(signStr).sign(RSA_PRIVATE_KEY, 'base64');

        const res = await fetch('https://payment.uat.kpay-group.com/v1/order/add', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'K-Merchant-Code': MERCHANT_CODE,
                'K-Nonce-Str': nonceStr,
                'K-Timestamp': timestamp,
                'K-Signature': signature,
                'K-Language': 'zh_HK'
            },
            body: JSON.stringify(bodyData)
        });

        const result = await res.json();
        if (result.code === 10000) {
            // v4.0 收銀台跳轉邏輯 [cite: 8]
            const redirectUrl = `https://payment.uat.kpay-group.com/v1/web?orderNo=${result.data.orderNo}&K-Merchant-Code=${MERCHANT_CODE}&K-Nonce-Str=${nonceStr}&K-Timestamp=${timestamp}`;
            return { statusCode: 200, body: JSON.stringify({ paymentUrl: redirectUrl }) };
        }
        return { statusCode: 400, body: JSON.stringify({ error: result.message }) };
    } catch (err) { return { statusCode: 500, body: JSON.stringify({ error: err.message }) }; }
};
