const { requireAdmin } = require('./_adminAuth.js');
const {
    listMenuItems,
    listModifiers,
    upsertMenuItem,
    deleteMenuItem,
    upsertModifier,
    deleteModifier,
} = require('./_menuDb.js');
const { listKitchenOrders, startOfTodayHkIso } = require('./_orders.js');
const { KNOWN_STORES } = require('./_storeSettings.js');
const { getTableCounts, setTableCount, STORE_LABEL_ZH, slugForStore } = require('./_tableSettings.js');

function isTodaySale(order) {
    const pay = String((order && order.payment_status) || '').toUpperCase();
    const st = String((order && order.status) || '').toUpperCase();
    if (pay === 'PENDING' || pay === 'CANCELLED' || pay === 'UNPAID') return false;
    if (st === 'CANCELLED') return false;
    return ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(pay)
        || ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(st);
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        requireAdmin(req);
        const body = req.body || {};
        const action = body.action || 'list';

        if (action === 'list') {
            const [items, modifiers] = await Promise.all([
                listMenuItems({ includeInactive: true }),
                listModifiers({ includeInactive: true }),
            ]);
            return res.status(200).json({ items: items || [], modifiers: modifiers || [] });
        }

        if (action === 'sales_today') {
            const since = startOfTodayHkIso();
            const stores = [];
            let ordersTotal = 0;
            let revenueTotal = 0;
            for (const store_name of KNOWN_STORES) {
                const rows = await listKitchenOrders(store_name, { since, limit: 500 });
                const sales = (rows || []).filter(isTodaySale);
                const revenue = sales.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
                ordersTotal += sales.length;
                revenueTotal += revenue;
                stores.push({
                    store_name,
                    label: STORE_LABEL_ZH[store_name] || store_name,
                    orders: sales.length,
                    revenue: Math.round(revenue),
                });
            }
            return res.status(200).json({
                ok: true,
                orders: ordersTotal,
                revenue: Math.round(revenueTotal),
                stores,
            });
        }

        if (action === 'table_counts') {
            const counts = await getTableCounts();
            return res.status(200).json({
                ok: true,
                counts,
                stores: KNOWN_STORES.map((store_name) => ({
                    store_name,
                    label: STORE_LABEL_ZH[store_name] || store_name,
                    count: Number(counts[store_name] || 0),
                    slug: slugForStore(store_name),
                })),
            });
        }

        if (action === 'set_table_count') {
            const storeName = String(body.store_name || '').trim();
            const count = Number(body.count);
            const counts = await setTableCount(storeName, count);
            return res.status(200).json({ ok: true, counts });
        }

        if (action === 'upsert_item') {
            const saved = await upsertMenuItem(body.item);
            return res.status(200).json({ ok: true, item: Array.isArray(saved) ? saved[0] : saved });
        }

        if (action === 'delete_item') {
            if (!body.id) return res.status(400).json({ error: 'Missing id' });
            await deleteMenuItem(body.id);
            return res.status(200).json({ ok: true });
        }

        if (action === 'upsert_modifier') {
            const saved = await upsertModifier(body.modifier);
            return res.status(200).json({ ok: true, modifier: Array.isArray(saved) ? saved[0] : saved });
        }

        if (action === 'delete_modifier') {
            if (!body.id) return res.status(400).json({ error: 'Missing id' });
            await deleteModifier(body.id);
            return res.status(200).json({ ok: true });
        }

        return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
        console.error('admin-menu error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Failed' });
    }
};
