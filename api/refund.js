const crypto = require('crypto');

const MERCHANT_CODE = '852124272000001';

// 💡 原始私鑰數據：移除所有空格與換行，確保數據純淨
const RAW_KEY_CONTENT = `MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDgEWuo8x9rdKJD
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
5DUMHT9kClrFNl2f0l9hcrXg`.replace(/\s+/g, ''); // 移除所有空格/換行

// 重新構建標準格式，解決 DECODERUnsupported 問題
const PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----\n${RAW_KEY_CONTENT.match(/.{1,64}/g).join('\n')}\n-----END RSA PRIVATE KEY-----`;

exports.handler = async (event) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, K-Merchant-Code, K-Nonce-Str, K-Timestamp, K-Signature",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    // 1. 解決 405: 處理瀏覽器 OPTIONS 預檢請求
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers: corsHeaders, body: "" };
    }

    try {
        const { orderNo, amount } = JSON.parse(event.body || "{}");
        const nonceStr = Math.random().toString(36).substring(2, 15);
        const timestamp = Date.now().toString();

        // 2. KPay v4.0 簽名邏輯 
        const signParams = {
            "K-Merchant-Code": MERCHANT_CODE,
            "K-Nonce-Str": nonceStr,
            "K-Timestamp": timestamp
        };
        const sortedKeys = Object.keys(signParams).sort();
        // 嚴格按照 key=value\n 格式，且最後多一行 \n [cite: 93]
        const signStr = sortedKeys.map(k => `${k}=${signParams[k]}`).join('\n') + '\n';

        const signature = crypto.createSign('RSA-SHA256').update(signStr).sign({
            key: PRIVATE_KEY,
            padding: crypto.constants.RSA_PKCS1_PADDING // 確保使用 PKCS1 填充
        }, 'base64');

        // 3. 呼叫 KPay UAT 退款 API [cite: 93]
        const bodyData = {
            outTradeNo: "REF" + Date.now(),
            oriOrderNo: orderNo,
            refundAmount: parseFloat(amount)
        };

        const response = await fetch('https://payment.uat.kpay-group.com/v1/refund', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'K-Merchant-Code': MERCHANT_CODE,
                'K-Nonce-Str': nonceStr,
                'K-Timestamp': timestamp,
                'K-Signature': signature
            },
            body: JSON.stringify(bodyData)
        });

        const result = await response.json();
        return { 
            statusCode: 200, 
            headers: corsHeaders, 
            body: JSON.stringify(result) 
        };

    } catch (err) {
        return { 
            statusCode: 500, 
            headers: corsHeaders, 
            body: JSON.stringify({ error: "系統內部錯誤", message: err.message }) 
        };
    }
};
