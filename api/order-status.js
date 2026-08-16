const { getPublicOrderStatus } = require('./_orders.js');

/**
 * Payment confirmation — limited fields, no customer PII / items dump.
 * POST /api/order-status  { orderNo }
 */
module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const orderNo = String((req.body && req.body.orderNo) || '').trim();
        if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });
        const order = await getPublicOrderStatus(orderNo);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        return res.status(200).json({ order });
    } catch (err) {
        console.error('order-status error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Failed' });
    }
};
