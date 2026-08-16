const kpay = require('./_kpay.js');
const { getOrderByNo, updateOrderTotalAmount } = require('./_orders.js');
const { recalculateOrderTotal } = require('./_pricing.js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { orderNo } = req.body || {};
        if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });

        // 金額唔信前端 body，亦唔信客戶端寫入 DB 嘅 total —— 用菜單價重計
        const order = await getOrderByNo(orderNo);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const payStatus = String(order.payment_status || '').toUpperCase();
        if (payStatus !== 'PENDING') {
            return res.status(400).json({ error: 'Order is not awaiting payment' });
        }

        let priced;
        try {
            priced = await recalculateOrderTotal(order);
        } catch (priceErr) {
            console.error('Price recalculation failed:', priceErr);
            return res.status(400).json({ error: priceErr.message || 'Unable to price order' });
        }

        const payAmount = priced.total;
        const stored = Number(order.total_amount);
        if (stored !== payAmount) {
            console.warn(
                `Order ${orderNo}: client total ${stored} → server ${payAmount} (sub ${priced.subtotal}, disc ${priced.discount})`
            );
            await updateOrderTotalAmount(orderNo, payAmount);
        }

        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const hostUrl = `${protocol}://${host}`;
        // Webhook 必須打去正網；preview / 錯 host 會令廚房同電郵永遠收唔到
        const siteUrl = (process.env.PUBLIC_SITE_URL || 'https://mirrorburger.com').replace(/\/$/, '');
        const returnBase = process.env.PUBLIC_SITE_URL ? siteUrl : hostUrl;

        const payload = {
            merchantIcon: '',
            managedOutTradeNo: orderNo,
            payAmount,
            payCurrency: 'HKD',
            notifyUrl: `${siteUrl}/api/kpay-notify`,
            // returnUrl = 離開付款頁後返回網站；唔代表已付款（取消都會返嚟）
            returnUrl: `${returnBase}/?order_return=${orderNo}`,
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
