const { createPendingOrder } = require('./_orders.js');

/**
 * Public checkout insert — service role only (anon cannot INSERT/SELECT orders).
 * POST /api/create-order
 * Body: { store_name, customer_name, customer_phone, pickup_time, items }
 */
module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const body = req.body || {};
        const result = await createPendingOrder({
            store_name: body.store_name,
            customer_name: body.customer_name,
            customer_phone: body.customer_phone,
            pickup_time: body.pickup_time,
            items: body.items,
        });
        return res.status(200).json({ ok: true, ...result });
    } catch (err) {
        console.error('create-order error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Failed to create order' });
    }
};
