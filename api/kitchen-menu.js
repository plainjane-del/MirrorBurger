const { requireKitchen } = require('./_kitchenAuth.js');
const { listMenuItems, setMenuItemSoldOut } = require('./_menuDb.js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        requireKitchen(req);
        const body = req.body || {};
        const action = body.action || 'list';

        if (action === 'list') {
            const items = await listMenuItems({ includeInactive: false });
            return res.status(200).json({ items: items || [] });
        }

        if (action === 'set_sold_out') {
            if (!body.id) return res.status(400).json({ error: 'Missing id' });
            const saved = await setMenuItemSoldOut(body.id, !!body.is_sold_out);
            return res.status(200).json({
                ok: true,
                item: Array.isArray(saved) ? saved[0] : saved,
            });
        }

        return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
        console.error('kitchen-menu error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Failed' });
    }
};
