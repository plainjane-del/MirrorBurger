const { requireKitchen } = require('./_kitchenAuth.js');
const { updateKitchenOrderStatus } = require('./_orders.js');

const ALLOWED = new Set(['PREPARING', 'READY', 'COMPLETED']);

/**
 * Kitchen status updates — service role only (anon UPDATE policy removed).
 * POST /api/kitchen-order-status
 * Authorization: Bearer <kitchen token>
 * Body: { orderNo, status }
 */
module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        requireKitchen(req);
        const orderNo = String((req.body && req.body.orderNo) || '').trim();
        const status = String((req.body && req.body.status) || '').trim().toUpperCase();
        if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });
        if (!ALLOWED.has(status)) {
            return res.status(400).json({ error: `Invalid status (allowed: ${[...ALLOWED].join(', ')})` });
        }

        const result = await updateKitchenOrderStatus(orderNo, status);
        return res.status(200).json({ ok: true, ...result });
    } catch (err) {
        console.error('kitchen-order-status error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
};
