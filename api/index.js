const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// ==========================================
// 🔐 1. KPay 資料 (UAT 測試環境)
// ==========================================
const MERCHANT_CODE = '852124272000001'; 
const CHECKOUT_API_URL = 'https://payment.uat.kpay-group.com/gateway/api/v1/online/order/create';
const REFUND_API_URL = 'https://payment.uat.kpay-group.com/gateway/api/v1/online/order/refund';

// 你的 RSA 私鑰 (保持原樣)
const RSA_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
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
-----END RSA PRIVATE KEY-----`;

// ==========================================
// 🛠️ 2. 簽名工具函數
// ==========================================
function generateSignature(params, privateKey) {
    const sortedKeys = Object.keys(params).sort();
    let signStr = sortedKeys.map(key => `${key}=${params[key]}`).join('\n') + '\n';
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signStr);
    return sign.sign(privateKey, 'base64');
}

// ==========================================
// 🚀 3. 支付下單接口 (用於 index.html 的立即落單)
// ==========================================
app.post('/checkout', async (req, res) => {
    try {
        const { amount, orderNo } = req.body;
        
        const params = {
            merchantCode: MERCHANT_CODE,
            managedOrderNo: orderNo,
            payAmount: parseFloat(amount).toFixed(2),
            payCurrency: 'HKD',
            returnUrl: 'https://mirrorburger.com',
            orderRemark: 'Mirror Burger Order',
            timestamp: Math.floor(Date.now() / 1000).toString()
        };

        const signature = generateSignature(params, RSA_PRIVATE_KEY);

        const response = await fetch(CHECKOUT_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-KPay-Signature': signature
            },
            body: JSON.stringify(params)
        });

        const result = await response.json();
        
        if (result.code === 'SUCCESS' && result.data && result.data.payUrl) {
            res.json({ paymentUrl: result.data.payUrl });
        } else {
            res.status(400).json({ error: result.msg || 'KPay API Error' });
        }
    } catch (error) {
        console.error('Checkout Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==========================================
// 🔙 4. 退款處理接口 (用於 UAT 測試退款)
// ==========================================
app.post('/refund', async (req, res) => {
    try {
        const { orderNo, amount } = req.body;

        const params = {
            merchantCode: MERCHANT_CODE,
            managedOrderNo: orderNo,
            refundAmount: parseFloat(amount).toFixed(2),
            refundCurrency: 'HKD',
            refundReason: 'UAT Test Refund',
            timestamp: Math.floor(Date.now() / 1000).toString()
        };

        const signature = generateSignature(params, RSA_PRIVATE_KEY);

        const response = await fetch(REFUND_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-KPay-Signature': signature
            },
            body: JSON.stringify(params)
        });

        const result = await response.json();

        if (result.code === 'SUCCESS') {
            res.json({ success: true, msg: '退款成功', data: result.data });
        } else {
            // 這裡失敗時會回傳 KPay 的錯誤訊息（例如：餘額不足）
            res.status(400).json({ success: false, error: result.msg || '退款失敗' });
        }
    } catch (error) {
        console.error('Refund Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = app;
