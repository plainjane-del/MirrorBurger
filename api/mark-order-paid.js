const { requireKitchen } = require('./_kitchenAuth.js');
const { getOrderByNo, markOrderPaid } = require('./_orders.js');

/**
 * Manual recovery: kitchen staff can mark a stuck PENDING order as PAID
 * after confirming payment in the KPay dashboard. Sends email/push too.
 *
 * POST /api/mark-order-paid
 * Authorization: Bearer <kitchen token>
 * Body: { orderNo: "MB123456" }
 */
module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        requireKitchen(req);
        const orderNo = String((req.body && req.body.orderNo) || '').trim();
        if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });

        const existing = await getOrderByNo(orderNo);
        if (!existing) return res.status(404).json({ error: 'Order not found' });

        const pay = String(existing.payment_status || '').toUpperCase();
        if (pay === 'PAID' || pay === 'COMPLETED' || pay === 'PREPARING' || pay === 'READY') {
            return res.status(200).json({ ok: true, alreadyPaid: true, order: existing });
        }
        if (pay !== 'PENDING') {
            return res.status(400).json({ error: `Cannot mark ${pay} as paid` });
        }

        const result = await markOrderPaid(orderNo);
        return res.status(200).json({
            ok: true,
            updated: Boolean(result && result.updated),
            order: (result && result.order) || existing,
        });
    } catch (err) {
        console.error('mark-order-paid error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
};
