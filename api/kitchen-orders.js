const { requireKitchen } = require('./_kitchenAuth.js');
const { listKitchenOrders, startOfTodayHkIso } = require('./_orders.js');

/**
 * Kitchen order reads — service role only (anon cannot SELECT orders).
 * POST /api/kitchen-orders
 * Body: { action: 'board' | 'completed' | 'stats', store_name }
 */
module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        requireKitchen(req);
        const body = req.body || {};
        const action = body.action || 'board';
        const storeName = String(body.store_name || '').trim();
        if (!storeName) return res.status(400).json({ error: 'Missing store_name' });

        if (action === 'board') {
            const orders = await listKitchenOrders(storeName, { limit: 200 });
            return res.status(200).json({ orders: orders || [] });
        }

        if (action === 'completed') {
            const rows = await listKitchenOrders(storeName, {
                since: startOfTodayHkIso(),
                limit: 200,
            });
            const orders = (rows || []).filter((o) => {
                const pay = String(o.payment_status || '').toUpperCase();
                const st = String(o.status || '').toUpperCase();
                return st === 'COMPLETED' || pay === 'COMPLETED';
            }).slice(0, 80);
            return res.status(200).json({ orders });
        }

        if (action === 'stats') {
            const orders = await listKitchenOrders(storeName, {
                since: startOfTodayHkIso(),
                limit: 500,
            });
            return res.status(200).json({ orders: orders || [] });
        }

        return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
        console.error('kitchen-orders error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Failed' });
    }
};
