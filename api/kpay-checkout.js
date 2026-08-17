const kpay = require('./_kpay.js');
const { getOrderByNo, updateOrderTotalAmount, createPendingOrder, getPublicOrderStatus } = require('./_orders.js');
const { recalculateOrderTotal } = require('./_pricing.js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const body = req.body || {};
        const action = body.action || 'pay';

        if (action === 'create') {
            const result = await createPendingOrder({
                store_name: body.store_name,
                customer_name: body.customer_name,
                customer_phone: body.customer_phone,
                pickup_time: body.pickup_time,
                items: body.items,
                fulfill: body.fulfill || body.delivery_mode,
            });
            return res.status(200).json({ ok: true, ...result });
        }

        if (action === 'status') {
            const orderNo = String(body.orderNo || '').trim();
            if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });
            const order = await getPublicOrderStatus(orderNo);
            if (!order) return res.status(404).json({ error: 'Order not found' });
            return res.status(200).json({ order });
        }

        const orderNo = String(body.orderNo || '').trim();
        if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });

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
        const siteUrl = (process.env.PUBLIC_SITE_URL || 'https://mirrorburger.com').replace(/\/$/, '');
        const returnBase = process.env.PUBLIC_SITE_URL ? siteUrl : hostUrl;

        const payload = {
            merchantIcon: '',
            managedOutTradeNo: orderNo,
            payAmount,
            payCurrency: 'HKD',
            notifyUrl: `${siteUrl}/api/kpay-notify`,
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
        return res.status(error.status || 500).json({ error: error.message });
    }
};
