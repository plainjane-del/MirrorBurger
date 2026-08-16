// 將超過 N 分鐘仍未付款嘅 PENDING 單標為 CANCELLED
// 注意：Vercel Hobby 只准一日跑一次 cron（見 vercel.json），所以 TTL 用長啲更穩
const PENDING_TTL_MINUTES = 45;

module.exports = async (req, res) => {
    // Vercel Cron 會帶 Authorization: Bearer <CRON_SECRET>
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.authorization || '';
    const okCron = cronSecret && auth === `Bearer ${cronSecret}`;
    const okManual = cronSecret && req.headers['x-cron-secret'] === cronSecret;

    if (!okCron && !okManual) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Missing Supabase env' });
    }

    try {
        const cutoff = new Date(Date.now() - PENDING_TTL_MINUTES * 60 * 1000).toISOString();
        const url =
            `${SUPABASE_URL}/rest/v1/orders` +
            `?payment_status=eq.PENDING` +
            `&created_at=lt.${encodeURIComponent(cutoff)}`;

        const resp = await fetch(url, {
            method: 'PATCH',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify({ payment_status: 'CANCELLED' }),
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Supabase update failed (${resp.status}): ${text}`);
        }

        const data = await resp.json();
        const count = Array.isArray(data) ? data.length : 0;
        console.log(`🧹 Cancelled ${count} stale PENDING orders older than ${PENDING_TTL_MINUTES}m`);
        return res.status(200).json({
            ok: true,
            cancelled: count,
            olderThanMinutes: PENDING_TTL_MINUTES,
            orderNos: Array.isArray(data) ? data.map(r => r.order_no) : []
        });
    } catch (err) {
        console.error('cleanup-pending error:', err);
        return res.status(500).json({ error: err.message || 'Cleanup failed' });
    }
};
