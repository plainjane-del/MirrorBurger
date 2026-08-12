const kpay = require('../_kpay.js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { amount, orderNo } = req.body;
        if (!amount || !orderNo) return res.status(400).json({ error: 'Missing amount or orderNo' });

        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const hostUrl = `${protocol}://${host}`;

        // 嚴格跟隨 KPay 參數要求
        const payload = {
            merchantIcon: '',
            managedOutTradeNo: orderNo,
            payAmount: Number(amount),
            payCurrency: 'HKD',
            notifyUrl: `${hostUrl}/api/kpay-notify`,
            returnUrl: `${hostUrl}/?paid=${orderNo}`,
            orderRemark: `Mirror Burger Order #${orderNo}`,
            itemList: [{
                itemNo: 'MB_ORDER',
                itemName: `Order #${orderNo}`,
                price: Number(amount),
                priceCurrency: 'HKD',
                quantity: 1
            }]
        };

        const kpayRes = await kpay.createManagedOrder(payload);
        const managedOrderNo = kpayRes.data.managedOrderNo;
        
        // 產生付費連結 (支援 web / h5)
        const checkoutUrl = kpay.buildCheckoutUrl(managedOrderNo, 'web');

        return res.status(200).json({ paymentUrl: checkoutUrl });
    } catch (error) {
        console.error('KPay Checkout Error:', error);
        return res.status(500).json({ error: error.message });
    }
};