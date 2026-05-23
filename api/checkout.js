const crypto = require('crypto');

const MERCHANT_CODE = '852124272000001';
const RAW_KEY = `MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDgEWuo8x9rdKJD
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
5DUMHT9kClrFNl2f0l9hcrXg`;

const PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----\n${RAW_KEY.replace(/\s+/g, '\n')}\n-----END RSA PRIVATE KEY-----`;

exports.handler = async (event) => {
    const headers = { 
        "Access-Control-Allow-Origin": "*", 
        "Access-Control-Allow-Headers": "Content-Type", 
        "Access-Control-Allow-Methods": "POST, OPTIONS" 
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    try {
        const { amount, orderNo } = JSON.parse(event.body || "{}");
        const nonceStr = Math.random().toString(36).substring(2, 15);
        const timestamp = Date.now().toString();

        const signParams = { "K-Merchant-Code": MERCHANT_CODE, "K-Nonce-Str": nonceStr, "K-Timestamp": timestamp };
        const sortedKeys = Object.keys(signParams).sort();
        const signStr = sortedKeys.map(k => `${k}=${signParams[k]}`).join('\n') + '\n';

        const signature = crypto.createSign('RSA-SHA256').update(signStr).sign({ 
            key: PRIVATE_KEY, 
            padding: crypto.constants.RSA_PKCS1_PADDING 
        }, 'base64');

        const res = await fetch('https://payment.uat.kpay-group.com/v1/order/add', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'K-Merchant-Code': MERCHANT_CODE, 
                'K-Nonce-Str': nonceStr, 
                'K-Timestamp': timestamp, 
                'K-Signature': signature, 
                'K-Language': 'zh_HK' 
            },
            body: JSON.stringify({ 
                outTradeNo: orderNo, 
                orderType: "CNP_SALES_GATEWAY", 
                payAmount: parseFloat(amount), 
                payCurrency: "HKD", 
                returnUrl: "https://mirrorburger.com", 
                itemList: [{ itemNo: "1", itemName: "Burger", price: parseFloat(amount), priceCurrency: "HKD", quantity: 1 }] 
            })
        });

        const result = await res.json();
        if (result.code === 10000) {
            const payUrl = `https://payment.uat.kpay-group.com/v1/web?orderNo=${result.data.orderNo}&K-Merchant-Code=${MERCHANT_CODE}&K-Nonce-Str=${nonceStr}&K-Timestamp=${timestamp}`;
            return { statusCode: 200, headers, body: JSON.stringify({ paymentUrl: payUrl }) };
        }
        return { statusCode: 400, headers, body: JSON.stringify({ error: result.message }) };
    } catch (err) { 
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }; 
    }
};
