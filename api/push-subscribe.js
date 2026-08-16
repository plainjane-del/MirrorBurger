module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Missing Supabase env' });
    }

    try {
        const { subscription, store_name: storeName } = req.body || {};
        const endpoint = subscription?.endpoint;
        const p256dh = subscription?.keys?.p256dh;
        const auth = subscription?.keys?.auth;
        const store = String(storeName || 'all').trim() || 'all';

        if (!endpoint || !p256dh || !auth) {
            return res.status(400).json({ error: 'Invalid subscription' });
        }

        const resp = await fetch(
            `${SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`,
            {
                method: 'POST',
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    Prefer: 'resolution=merge-duplicates,return=minimal',
                },
                body: JSON.stringify({
                    endpoint,
                    p256dh,
                    auth,
                    store_name: store,
                }),
            }
        );

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Supabase upsert failed (${resp.status}): ${text}`);
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('push-subscribe error:', err);
        return res.status(500).json({ error: err.message || 'Subscribe failed' });
    }
};
