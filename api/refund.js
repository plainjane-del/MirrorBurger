const crypto = require('crypto');

const MERCHANT_CODE = '852124272000001';

// 💡 修正點：用 trim() 確保無多餘空格，並確保格式 100% 被 Node.js 接受
const PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDgEWuo8x9rdKJD
pszdRYC+Gqb9fx+0dBVrdC9iEVo1zPp/OI7WDHsdT8rWV7S1yT+IWWSc/XMeyr6k
mFXSv4EeC+o1GG0W7RMG4vU+sCZbzhM3NZef+OoZp1sruUbEQG1szFANoBoiu8Zz
c/tt1K0S020K+7Zp3iNUbg/UBDW1AFhjlEZBi0xBsqoP0RDXDnXBMCEup2kZP8ti
lCaGzW71C+UuP9XnwbP9EEZAKLjPyZLeoFNWmu/oLWHUXT3M+XhogoAIDKaRNlYn
Fgeb2lhz3738bVVl8uDThHK6DDiHOHpEkuRC2IfvDLAN58NDT2ifnsm6tYo6EdCc
BKchZOmnAgMBAAECggEBAKyQnhKjE3qle+aQSszLH2jJi/xFcHyAvpJgC7ICXTB8
Khvayh7Nw++CKVxEdddfI7/14MgLZiK70HFhJQ/HD0C9umWj5zg142Z1Wp0p+pDP
t/rYGmtIv7p8KnoVGgxA9kVJYQntWNORPDhkhapDlfueuycvToBgZWM71JLbnyVC
qmcXTbki50lpxU76qvr7cDVqlz/qY7rCKWQAlye8QFZtOpsjm7/rnRe9dpQeZTFP
MAVPTGDH4vWbrS9IwH9e/pdaBVOG60dlzPvEYHhKrxAiTpftmsHTZzpHMlpsa/ae
z6K9A8/RxEsoVTW26qBYt4avv7lpucTBDphqGfc/KRkCgYEA/FGa3+T3EoNS5M2U
1eoGVzJvN0Qe4Li269AxCNOy75Q6LKIg2pg6KpAGtPQC5Gp9god1uLVgpeDkQ2D9
AUrJZdmJpQ+c0YRWPNDxZJ2KHFJMSFppSoCifRkq63r1vmC+hG4M30wS6fqV/iSC
5dcLTyCnahknCOQYnZyu1VQAWG0CgYEA41ZNBe4gpwN8Mg9T2cxr7PLumV6zGVHF
Q912mhbXuqld0zlrsQNXPv4EqUuYVYAXNjNZ7XNMmbj7BrBAKC3ktm8D6K6y1vNg
wP073tMapvv69y+ubGSbDKXm+ofALL76WiJlyft3N97suA8JsuCi/NEUtUGOaG4G
nOiuGJnR5eMCgYEApTRRMVNbKjXt6n1oe/80k5ckFo11ojGPIys3T848lHz68gpv
ddILDYubWXVh/JEtNTk+fFoc7dqCfFDbGsTfkUdlzNC3awZviUwODaht0OELyS1V
XJz6+JSZ7YZ8qk7IIS/E6YGIQ6D34Q2RoiFCayP5aXy+EzV97docGOgs8BqkCgYBQ
oEvi3YhxEzhZ3LvFU823FJVwiXiFc029+u5USeOqzOR8xDGgbunjal2m2Sumry4M
R/wNzcWOA1/sCFhIp7YkyYyeWk8NEvXunCE+rqoWLOnd/ugigy/GNZSMp9aNSBIs
I2TsVKX8h7B2usaazTag6Vopyp1CBjuMLK2KBgu+NwKBgE9tx0maUcHW/re3ZixU
Pegrha/UYdtBdC3F1kJPC65z8scDpdlpU4Y2uw5nrlTmsPcBWW+4Ebya6a2ijy8I
g8qYZTQA1kMgLPsRSqWVZGz4VkPFfQHJVofzx/3AUvVB7rhDkCJ2UxFr/zorXZx5
5DUMHT9kClrFNl2f0l9hcrXg
-----END RSA PRIVATE KEY-----`.trim();

exports.handler = async (event) => {
    // 1. 確保係 POST
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Only POST allowed" }) };
    }

    try {
        // 2. 解析手機傳過嚟嘅單號同金額
        const { orderNo, amount } = JSON.parse(event.body || "{}");
        if (!orderNo || !amount) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing orderNo or amount" }) };
        }

        const nonceStr = Math.random().toString(36).substring(2, 15);
        const timestamp = Date.now().toString();

        // 3. KPay v4.0 簽名邏輯
        const signParams = {
            "K-Merchant-Code": MERCHANT_CODE,
            "K-Nonce-Str": nonceStr,
            "K-Timestamp": timestamp
        };
        const sortedKeys = Object.keys(signParams).sort();
        const signStr = sortedKeys.map(k => `${k}=${signParams[k]}`).join('\n') + '\n';
        
        // 🔐 簽名修正：加入 padding 確保解碼唔會出錯
        const signature = crypto.createSign('RSA-SHA256')
            .update(signStr)
            .sign({
                key: PRIVATE_KEY,
                padding: crypto.constants.RSA_PKCS1_PADDING
            }, 'base64');

        // 4. 打去 KPay UAT
        const bodyData = {
            outTradeNo: "REF" + Date.now(), // 隨機生成一個退款單號
            oriOrderNo: orderNo,            // 手機傳過嚟嘅原始單號
            refundAmount: parseFloat(amount)
        };

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
        
        // 返回結果畀手機
        return {
            statusCode: res.status,
            body: JSON.stringify(result)
        };

    } catch (err) {
        // 🆘 如果崩潰，喺呢度捉住個真實原因
        console.error("Function Error:", err.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: "Internal Server Error", 
                message: err.message,
                hint: "Check Netlify function logs for details" 
            })
        };
    }
};
