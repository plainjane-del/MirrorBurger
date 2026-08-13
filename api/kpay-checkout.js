const kpay = require('./_kpay.js');
const { getOrderByNo } = require('./_orders.js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { orderNo } = req.body || {};
        if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });

        // 金額只信資料庫，唔信前端传来嘅 amount（防改成 $1）
        const order = await getOrderByNo(orderNo);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const payStatus = String(order.payment_status || '').toUpperCase();
        if (payStatus !== 'PENDING') {
            return res.status(400).json({ error: 'Order is not awaiting payment' });
        }

        const payAmount = Number(order.total_amount);
        if (!Number.isFinite(payAmount) || payAmount <= 0) {
            return res.status(400).json({ error: 'Invalid order amount in database' });
        }

        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const hostUrl = `${protocol}://${host}`;

        const payload = {
            merchantIcon: '',
            managedOutTradeNo: orderNo,
            payAmount,
            payCurrency: 'HKD',
            notifyUrl: `${hostUrl}/api/kpay-notify`,
            // returnUrl = 離開付款頁後返回網站；唔代表已付款（取消都會返嚟）
            returnUrl: `${hostUrl}/?order_return=${orderNo}`,
            orderRemark: `Mirror Burger Order #${orderNo}`,
            itemList: [{
                itemNo: 'MB_ORDER',
                itemName: `Order #${orderNo}`,
                price: payAmount,
                priceCurrency: 'HKD',
                quantity: 1
            }]
        };

        const kpayRes = await kpay.createManagedOrder(payload);
        const managedOrderNo = kpayRes.data.managedOrderNo;
        const checkoutUrl = kpay.buildCheckoutUrl(managedOrderNo, 'web');

        return res.status(200).json({ paymentUrl: checkoutUrl });
    } catch (error) {
        console.error('KPay Checkout Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
