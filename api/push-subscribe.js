module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { upsertPushSubscription } = require('./_pushStore.js');
        const { requireKitchen } = require('./_kitchenAuth.js');
        const authz = requireKitchen(req);
        const { subscription, store_name: storeName } = req.body || {};
        const endpoint = subscription?.endpoint;
        const p256dh = subscription?.keys?.p256dh;
        const auth = subscription?.keys?.auth;
        const requestedStore = String(storeName || '').trim();
        const store = authz.scope === 'all_stores'
            ? (requestedStore || 'all')
            : (authz.store_name || requestedStore || 'all');

        if (!endpoint || !p256dh || !auth) {
            return res.status(400).json({ error: 'Invalid subscription' });
        }

        const result = await upsertPushSubscription({
            endpoint,
            p256dh,
            auth,
            store_name: store,
        });

        return res.status(200).json({ ok: true, via: result.via });
    } catch (err) {
        console.error('push-subscribe error:', err);
        return res.status(500).json({ error: err.message || 'Subscribe failed' });
    }
};
