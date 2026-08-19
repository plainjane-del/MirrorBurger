const { requireAdmin } = require('./_adminAuth.js');
const {
    listMenuItems,
    listModifiers,
    upsertMenuItem,
    deleteMenuItem,
    upsertModifier,
    deleteModifier,
} = require('./_menuDb.js');
const { listKitchenOrders, getOrderByNo } = require('./_orders.js');
const { KNOWN_STORES } = require('./_storeSettings.js');
const { getTableCounts, setTableCount, STORE_LABEL_ZH, slugForStore } = require('./_tableSettings.js');

function isPaidSale(order) {
    const pay = String((order && order.payment_status) || '').toUpperCase();
    const st = String((order && order.status) || '').toUpperCase();
    if (pay === 'PENDING' || pay === 'CANCELLED' || pay === 'UNPAID') return false;
    if (st === 'CANCELLED') return false;
    return ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(pay)
        || ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(st);
}

function startOfHkDayIso(daysAgo = 0) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const y = Number(parts.find((p) => p.type === 'year')?.value);
    const m = Number(parts.find((p) => p.type === 'month')?.value);
    const d = Number(parts.find((p) => p.type === 'day')?.value);
    const civil = new Date(Date.UTC(y, m - 1, d));
    civil.setUTCDate(civil.getUTCDate() - daysAgo);
    const yy = civil.getUTCFullYear();
    const mm = String(civil.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(civil.getUTCDate()).padStart(2, '0');
    return new Date(`${yy}-${mm}-${dd}T00:00:00+08:00`).toISOString();
}

function isDineInOrder(order) {
    const channel = String((order && order.channel) || '').toLowerCase();
    if (channel === 'table') return true;
    const pickup = String((order && order.pickup_time) || '');
    return /堂食/.test(pickup) || /(\d+)\s*號枱/.test(pickup);
}

function emptyTotals() {
    return {
        orders: 0,
        revenue: 0,
        aov: 0,
        dine_in: { orders: 0, revenue: 0 },
        takeaway: { orders: 0, revenue: 0 },
    };
}

function summarizeSales(sales) {
    const out = emptyTotals();
    for (const order of sales || []) {
        const amount = Number(order.total_amount) || 0;
        out.orders += 1;
        out.revenue += amount;
        if (isDineInOrder(order)) {
            out.dine_in.orders += 1;
            out.dine_in.revenue += amount;
        } else {
            out.takeaway.orders += 1;
            out.takeaway.revenue += amount;
        }
    }
    out.revenue = Math.round(out.revenue);
    out.dine_in.revenue = Math.round(out.dine_in.revenue);
    out.takeaway.revenue = Math.round(out.takeaway.revenue);
    out.aov = out.orders ? Math.round(out.revenue / out.orders) : 0;
    return out;
}

function inRange(order, fromIso, toIso) {
    const created = Date.parse((order && order.created_at) || '');
    if (!Number.isFinite(created)) return false;
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    return created >= from && created < to;
}

async function buildSalesOverview() {
    const todayStart = startOfHkDayIso(0);
    const yesterdayStart = startOfHkDayIso(1);
    const stores = [];
    const todayRows = [];
    const yesterdayRows = [];

    for (const store_name of KNOWN_STORES) {
        const rows = await listKitchenOrders(store_name, { since: yesterdayStart, limit: 800 });
        const paid = (rows || []).filter(isPaidSale);
        const todaySales = paid.filter((o) => inRange(o, todayStart, '9999-12-31T00:00:00.000Z'));
        const yesterdaySales = paid.filter((o) => inRange(o, yesterdayStart, todayStart));
        todayRows.push(...todaySales);
        yesterdayRows.push(...yesterdaySales);
        const today = summarizeSales(todaySales);
        stores.push({
            store_name,
            label: STORE_LABEL_ZH[store_name] || store_name,
            ...today,
            yesterday: summarizeSales(yesterdaySales),
        });
    }

    todayRows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const today = summarizeSales(todayRows);
    const yesterday = summarizeSales(yesterdayRows);
    const recent = todayRows.slice(0, 50).map((o) => ({
        order_no: o.order_no,
        store_name: o.store_name,
        label: STORE_LABEL_ZH[o.store_name] || o.store_name,
        created_at: o.created_at,
        total_amount: Math.round(Number(o.total_amount) || 0),
        pickup_time: o.pickup_time || '',
        channel: o.channel || '',
        kind: isDineInOrder(o) ? 'dine_in' : 'takeaway',
        pay_method: o.pay_method || '',
    }));

    return {
        ok: true,
        orders: today.orders,
        revenue: today.revenue,
        aov: today.aov,
        today,
        yesterday,
        stores,
        recent,
    };
}

function parseItemsJson(itemsJson) {
    let items = itemsJson;
    if (typeof items === 'string') {
        try { items = JSON.parse(items || '[]'); } catch { items = []; }
    }
    return Array.isArray(items) ? items : [];
}

function ticketItems(order) {
    return parseItemsJson(order && order.items_json).map((it) => ({
        name: it.nameZh || it.nameEn || it.name || '項目',
        qty: Number(it.qty || it.quantity || 1) || 1,
        notes: [it.detailsZh || it.detailsEn, it.size, it.temp, it.notes || it.note]
            .map((s) => String(s || '').trim())
            .filter(Boolean)
            .join(' · '),
    }));
}

function ticketStatus(order) {
    if (!isPaidSale(order)) {
        const pay = String((order && order.payment_status) || '').toUpperCase();
        const st = String((order && order.status) || '').toUpperCase();
        if (pay === 'CANCELLED' || st === 'CANCELLED') return 'cancelled';
        if (pay === 'UNPAID') return 'unpaid';
        if (pay === 'PENDING') return 'pending';
        return 'other';
    }
    return 'paid';
}

function toTicket(order) {
    const items = ticketItems(order);
    return {
        order_no: order.order_no,
        store_name: order.store_name,
        label: STORE_LABEL_ZH[order.store_name] || order.store_name,
        created_at: order.created_at,
        total_amount: Math.round(Number(order.total_amount) || 0),
        pickup_time: order.pickup_time || '',
        channel: order.channel || '',
        kind: isDineInOrder(order) ? 'dine_in' : 'takeaway',
        pay_method: order.pay_method || '',
        customer_name: order.customer_name || '',
        payment_status: order.payment_status || '',
        status: ticketStatus(order),
        item_count: items.reduce((n, it) => n + it.qty, 0),
        items,
    };
}

function rangeBounds(range) {
    const todayStart = startOfHkDayIso(0);
    const yesterdayStart = startOfHkDayIso(1);
    const weekStart = startOfHkDayIso(6);
    if (range === 'yesterday') return { from: yesterdayStart, to: todayStart };
    if (range === 'week') return { from: weekStart, to: '9999-12-31T00:00:00.000Z' };
    return { from: todayStart, to: '9999-12-31T00:00:00.000Z' };
}

function normalizeTicketQuery(raw) {
    return String(raw || '').trim().replace(/^#/, '').toUpperCase();
}

async function fetchPaidSince(sinceIso) {
    const all = [];
    for (const store_name of KNOWN_STORES) {
        const rows = await listKitchenOrders(store_name, { since: sinceIso, limit: 1000 });
        all.push(...(rows || []).filter(isPaidSale));
    }
    all.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return all;
}

async function buildSalesTickets({ range = 'today', store_name = '', q = '' } = {}) {
    const query = normalizeTicketQuery(q);
    const store = KNOWN_STORES.includes(store_name) ? store_name : '';
    const bounds = rangeBounds(range);
    const lookback = query ? startOfHkDayIso(13) : bounds.from;
    let rows = await fetchPaidSince(lookback);

    if (store) rows = rows.filter((o) => o.store_name === store);
    if (!query) rows = rows.filter((o) => inRange(o, bounds.from, bounds.to));
    else rows = rows.filter((o) => String(o.order_no || '').toUpperCase().includes(query));

    if (query && !rows.length) {
        const exact = await getOrderByNo(query).catch(() => null);
        if (exact && (!store || exact.store_name === store)) rows = [exact];
    }

    const tickets = rows.slice(0, 200).map(toTicket);
    const counted = tickets.filter((t) => t.status === 'paid');
    return {
        ok: true,
        range,
        store_name: store,
        q: query,
        orders: counted.length,
        revenue: counted.reduce((sum, t) => sum + t.total_amount, 0),
        tickets,
        stores: KNOWN_STORES.map((name) => ({
            store_name: name,
            label: STORE_LABEL_ZH[name] || name,
        })),
    };
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

        if (action === 'sales_today' || action === 'sales_overview') {
            return res.status(200).json(await buildSalesOverview());
        }

        if (action === 'sales_tickets') {
            return res.status(200).json(await buildSalesTickets({
                range: body.range,
                store_name: body.store_name,
                q: body.q,
            }));
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
