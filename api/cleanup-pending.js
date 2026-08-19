// 將超過 N 分鐘仍未付款嘅 PENDING 單標為 CANCELLED
// 注意：Vercel Hobby 只准一日跑一次 cron（見 vercel.json），所以 TTL 用長啲更穩
const { reconcilePendingIfPaid } = require('./_orders.js');

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
        const listUrl =
            `${SUPABASE_URL}/rest/v1/orders` +
            `?payment_status=eq.PENDING` +
            `&created_at=lt.${encodeURIComponent(cutoff)}` +
            `&select=order_no,payment_status,created_at` +
            `&limit=40`;
        const listResp = await fetch(listUrl, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        });
        if (!listResp.ok) {
            const text = await listResp.text();
            throw new Error(`Supabase list failed (${listResp.status}): ${text}`);
        }
        const stale = await listResp.json();
        const rows = Array.isArray(stale) ? stale : [];

        let paid = 0;
        const stillPending = [];
        for (const row of rows) {
            try {
                const next = await reconcilePendingIfPaid(row.order_no);
                if (next && String(next.payment_status || '').toUpperCase() === 'PAID') {
                    paid += 1;
                    continue;
                }
            } catch (err) {
                console.warn('cleanup reconcile skipped:', row.order_no, err.message || err);
            }
            stillPending.push(row.order_no);
        }

        let cancelled = 0;
        if (stillPending.length) {
            const quoted = stillPending.map((n) => `"${String(n).replace(/"/g, '')}"`).join(',');
            const url =
                `${SUPABASE_URL}/rest/v1/orders` +
                `?payment_status=eq.PENDING` +
                `&order_no=in.(${quoted})`;
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
            cancelled = Array.isArray(data) ? data.length : 0;
        }

        console.log(`🧹 Cancelled ${cancelled} stale PENDING; recovered ${paid} already paid`);
        return res.status(200).json({
            ok: true,
            cancelled,
            recoveredPaid: paid,
            olderThanMinutes: PENDING_TTL_MINUTES,
            orderNos: stillPending,
        });
    } catch (err) {
        console.error('cleanup-pending error:', err);
        return res.status(500).json({ error: err.message || 'Cleanup failed' });
    }
};
