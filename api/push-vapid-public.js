const { getVapidConfig } = require('./_vapid.js');

module.exports = async (req, res) => {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
    const vapid = getVapidConfig();
    if (!vapid?.publicKey) {
        return res.status(503).json({ error: 'Push not configured (missing VAPID_PUBLIC_KEY)' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ publicKey: vapid.publicKey });
};
