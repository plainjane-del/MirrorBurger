const { requireKitchen } = require('./_kitchenAuth.js');
const { setStoreOpen } = require('./_storeSettings.js');

/**
 * Kitchen open/closed toggle — service role only (anon cannot UPDATE store_settings).
 * POST /api/kitchen-store-status
 * Authorization: Bearer <kitchen token>
 * Body: { store_name, is_open }
 */
module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        requireKitchen(req);
        const body = req.body || {};
        const storeName = String(body.store_name || '').trim();
        if (!storeName) return res.status(400).json({ error: 'Missing store_name' });
        if (typeof body.is_open !== 'boolean') {
            return res.status(400).json({ error: 'Missing is_open (boolean)' });
        }

        const row = await setStoreOpen(storeName, body.is_open);
        return res.status(200).json({
            ok: true,
            store_name: row.store_name,
            is_open: !!row.is_open,
        });
    } catch (err) {
        console.error('kitchen-store-status error:', err);
        const status = err.message === 'Invalid store' ? 400 : (err.status || 500);
        return res.status(status).json({ error: err.message || 'Server error' });
    }
};
