const { requireAdmin } = require('../../api/_adminAuth.js');
const {
    listMenuItems,
    listModifiers,
    upsertMenuItem,
    deleteMenuItem,
    upsertModifier,
    deleteModifier,
    setMenuItemSoldOut,
} = require('../../api/_menuDb.js');
const { listKitchenOrders, getOrderByNo, ticketIdOf } = require('../../api/_orders.js');
const { KNOWN_STORES } = require('../../api/_storeSettings.js');
const { getTableCounts, setTableCount, STORE_LABEL_ZH, slugForStore } = require('../../api/_tableSettings.js');
const {
    rulesPayload,
    getPayrollRules,
    generateAndSavePayrollRules,
    listEmployees,
    upsertEmployee,
    deleteEmployee,
    listTimecardsInRange,
} = require('../../api/_payroll.js');
const {
    listInventoryItems,
    upsertInventoryItem,
    deleteInventoryItem,
    listRecipesForMenu,
    setMenuCosting,
    upsertRecipeLine,
    deleteRecipeLine,
    storeCodeFor,
} = require('../../api/_inventory.js');

const STORE_CODE_OPTIONS = KNOWN_STORES.map((store_name) => ({
    store_name,
    store_code: storeCodeFor(store_name),
    label: STORE_LABEL_ZH[store_name] || store_name,
}));

function isPaidSale(order) {
    const pay = String((order && order.payment_status) || '').toUpperCase();
    const st = String((order && order.status) || '').toUpperCase();
    if (pay === 'PENDING' || pay === 'CANCELLED' || pay === 'UNPAID') return false;
    if (st === 'CANCELLED') return false;
    return ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(pay)
        || ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(st);
}

function startOfHkYearIso() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const y = Number(parts.find((p) => p.type === 'year')?.value);
    return new Date(`${y}-01-01T00:00:00+08:00`).toISOString();
}

function hkDateParts(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    return {
        y: Number(parts.find((p) => p.type === 'year')?.value),
        m: Number(parts.find((p) => p.type === 'month')?.value),
        d: Number(parts.find((p) => p.type === 'day')?.value),
    };
}

function isoFromHkYmd(y, m, d) {
    return new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00+08:00`).toISOString();
}

function parseHkDateInput(raw) {
    const match = String(raw || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const iso = isoFromHkYmd(y, m, d);
    return Number.isFinite(Date.parse(iso)) ? iso : null;
}

function addHkDaysIso(fromIso, days) {
    const { y, m, d } = hkDateParts(new Date(fromIso));
    const civil = new Date(Date.UTC(y, m - 1, d + days));
    return isoFromHkYmd(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate());
}

function formatHkYmd(iso) {
    const { y, m, d } = hkDateParts(new Date(iso));
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function startOfHkMonthIso(monthsAgo = 0) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    let y = Number(parts.find((p) => p.type === 'year')?.value);
    let m = Number(parts.find((p) => p.type === 'month')?.value) - monthsAgo;
    while (m <= 0) {
        m += 12;
        y -= 1;
    }
    return new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00+08:00`).toISOString();
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

async function listPaidSales(store_name, fromIso, toIso, { lite = true } = {}) {
    const PAGE = 1000;
    const all = [];
    let offset = 0;
    const until = toIso && !String(toIso).startsWith('9999-') ? toIso : '';
    for (;;) {
        const rows = await listKitchenOrders(store_name, {
            since: fromIso,
            until,
            limit: PAGE,
            offset,
            lite,
        });
        const batch = rows || [];
        all.push(...batch);
        if (batch.length < PAGE) break;
        offset += batch.length;
        if (offset >= 20000) break;
    }
    return all.filter(isPaidSale).filter((o) => inRange(o, fromIso, toIso));
}

async function buildSalesOverview(range = 'today', custom = {}) {
    const bounds = rangeBounds(range, custom);
    const stores = await Promise.all(KNOWN_STORES.map(async (store_name) => {
        const sales = await listPaidSales(store_name, bounds.from, bounds.to, { lite: true });
        return {
            store_name,
            label: STORE_LABEL_ZH[store_name] || store_name,
            ...summarizeSales(sales),
            sales,
        };
    }));
    const totals = summarizeSales(stores.flatMap((s) => s.sales));
    return {
        ok: true,
        range,
        range_label: bounds.label,
        from: bounds.from,
        to: bounds.to,
        orders: totals.orders,
        revenue: totals.revenue,
        aov: totals.aov,
        dine_in: totals.dine_in,
        takeaway: totals.takeaway,
        stores: stores.map(({ sales, ...rest }) => rest),
    };
}

function expenseDateBounds(bounds) {
    const fromYmd = formatHkYmd(bounds.from);
    const openEnded = !bounds.to || String(bounds.to).startsWith('9999');
    const toYmd = openEnded
        ? formatHkYmd(new Date().toISOString())
        : formatHkYmd(addHkDaysIso(bounds.to, -1));
    return { fromYmd, toYmd };
}

async function sbExpenses(path) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        const err = new Error('Missing SUPABASE_URL or key');
        err.status = 500;
        throw err;
    }
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!resp.ok) {
        // Table may not exist yet before expenses.sql is applied.
        if (resp.status === 404 || /expenses|schema cache|PGRST/i.test(String(text || ''))) {
            return [];
        }
        const err = new Error(typeof data === 'string' ? data : JSON.stringify(data));
        err.status = resp.status;
        throw err;
    }
    return Array.isArray(data) ? data : [];
}

async function listExpensesInRange(fromYmd, toYmd, storeCode) {
    let path = `expenses?select=id,store_id,merchant_name,amount,expense_date,receipt_url,created_at`
        + `&expense_date=gte.${encodeURIComponent(fromYmd)}`
        + `&expense_date=lte.${encodeURIComponent(toYmd)}`
        + `&order=expense_date.desc,created_at.desc&limit=2000`;
    const code = String(storeCode || '').trim().toUpperCase();
    if (code && ['SYP', 'TH', 'TW'].includes(code)) {
        path += `&store_id=eq.${encodeURIComponent(code)}`;
    }
    return sbExpenses(path);
}

function storeNameForCode(code) {
    const c = String(code || '').toUpperCase();
    for (const name of KNOWN_STORES) {
        if (storeCodeFor(name) === c) return name;
    }
    return '';
}

async function buildAccPnl(range = 'today', custom = {}) {
    const bounds = rangeBounds(range, custom);
    const { fromYmd, toYmd } = expenseDateBounds(bounds);
    const sales = await buildSalesOverview(range, custom);

    let expenses = [];
    let expensesError = null;
    try {
        expenses = await listExpensesInRange(fromYmd, toYmd);
    } catch (err) {
        expensesError = err.message || String(err);
        expenses = [];
    }

    const laborByStore = {};
    await Promise.all(KNOWN_STORES.map(async (store_name) => {
        let rows = [];
        try {
            rows = await listTimecardsInRange(store_name, bounds.from, bounds.to);
        } catch (_) {
            rows = [];
        }
        const closed = rows.filter((r) => r && r.clock_out_time != null);
        const open = rows.filter((r) => r && r.clock_out_time == null);
        const labor = closed.reduce((s, r) => s + (Number(r.total_pay) || 0), 0);
        const hours = closed.reduce((s, r) => s + (Number(r.total_hours) || 0), 0);
        laborByStore[store_name] = {
            labor: Math.round(labor * 100) / 100,
            hours: Math.round(hours * 100) / 100,
            punches: closed.length,
            open_punches: open.length,
        };
    }));

    const expenseByCode = { SYP: 0, TH: 0, TW: 0 };
    const expenseRows = expenses.map((e) => {
        const code = String(e.store_id || '').toUpperCase();
        const amount = Number(e.amount);
        const amt = Number.isFinite(amount) ? amount : 0;
        if (expenseByCode[code] != null) expenseByCode[code] += amt;
        return {
            id: e.id,
            store_id: code,
            store_name: storeNameForCode(code),
            label: STORE_LABEL_ZH[storeNameForCode(code)] || code,
            merchant_name: e.merchant_name || '',
            amount: Number.isFinite(amount) ? Math.round(amt * 100) / 100 : null,
            expense_date: e.expense_date,
            receipt_url: e.receipt_url || '',
            created_at: e.created_at,
        };
    });

    const stores = KNOWN_STORES.map((store_name) => {
        const code = storeCodeFor(store_name);
        const sale = (sales.stores || []).find((s) => s.store_name === store_name) || {};
        const labor = laborByStore[store_name] || { labor: 0, hours: 0, punches: 0, open_punches: 0 };
        const expense = Math.round((expenseByCode[code] || 0) * 100) / 100;
        const revenue = Math.round(Number(sale.revenue) || 0);
        const profit = Math.round((revenue - expense - labor.labor) * 100) / 100;
        return {
            store_name,
            store_id: code,
            label: STORE_LABEL_ZH[store_name] || store_name,
            revenue,
            orders: Number(sale.orders) || 0,
            expenses: expense,
            labor: labor.labor,
            labor_hours: labor.hours,
            labor_punches: labor.punches,
            open_punches: labor.open_punches,
            profit,
        };
    });

    const revenue = stores.reduce((s, r) => s + r.revenue, 0);
    const expenseTotal = stores.reduce((s, r) => s + r.expenses, 0);
    const laborTotal = stores.reduce((s, r) => s + r.labor, 0);
    const profit = Math.round((revenue - expenseTotal - laborTotal) * 100) / 100;

    return {
        ok: true,
        range,
        range_label: bounds.label,
        from: bounds.from,
        to: bounds.to,
        from_ymd: fromYmd,
        to_ymd: toYmd,
        revenue,
        expenses: Math.round(expenseTotal * 100) / 100,
        labor: Math.round(laborTotal * 100) / 100,
        profit,
        orders: Number(sales.orders) || 0,
        aov: Number(sales.aov) || 0,
        stores,
        expense_rows: expenseRows,
        expenses_error: expensesError,
        notes: {
            cogs: '配方／direct_cost 仍未計入 COGS；利潤 = 銷售 − 開支 − 出糧',
            labor: '出糧只計已打卡收工（有 total_pay）嘅班次',
        },
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
    const ticket = ticketIdOf(order) || order.order_no;
    return {
        order_no: ticket,
        display_id: order.display_id || ticket,
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

function rangeBounds(range, custom = {}) {
    const todayStart = startOfHkDayIso(0);
    const yesterdayStart = startOfHkDayIso(1);
    const far = '9999-12-31T00:00:00.000Z';
    if (range === 'yesterday') return { from: yesterdayStart, to: todayStart, label: '昨日' };
    if (range === 'week') return { from: startOfHkDayIso(6), to: far, label: '一星期' };
    if (range === 'month') return { from: startOfHkMonthIso(0), to: far, label: '今個月' };
    if (range === 'ytd') return { from: startOfHkYearIso(), to: far, label: '年頭到而家' };
    if (range === 'year') return { from: startOfHkDayIso(364), to: far, label: '近一年' };
    if (range === 'custom') {
        let from = parseHkDateInput(custom.from);
        let toDay = parseHkDateInput(custom.to);
        if (!from) from = startOfHkDayIso(6);
        if (!toDay) toDay = todayStart;
        if (Date.parse(from) > Date.parse(toDay)) {
            const swap = from;
            from = toDay;
            toDay = swap;
        }
        const to = addHkDaysIso(toDay, 1);
        const fromLabel = formatHkYmd(from);
        const toLabel = formatHkYmd(toDay);
        return {
            from,
            to,
            label: fromLabel === toLabel ? fromLabel : `${fromLabel} 至 ${toLabel}`,
        };
    }
    return { from: todayStart, to: far, label: '今日' };
}

function normalizeTicketQuery(raw) {
    return String(raw || '').trim().replace(/^#/, '').toUpperCase();
}

async function fetchPaidSince(sinceIso, untilIso, { lite = false } = {}) {
    const batches = await Promise.all(KNOWN_STORES.map((store_name) => (
        listPaidSales(store_name, sinceIso, untilIso || '9999-12-31T00:00:00.000Z', { lite })
    )));
    const all = batches.flat();
    all.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return all;
}

async function buildSalesTickets({ range = 'today', store_name = '', q = '', from = '', to = '' } = {}) {
    const query = normalizeTicketQuery(q);
    const store = KNOWN_STORES.includes(store_name) ? store_name : '';
    const bounds = rangeBounds(range, { from, to });
    const lookback = query ? startOfHkDayIso(13) : bounds.from;
    let rows = await fetchPaidSince(lookback, query ? '' : bounds.to, { lite: true });

    if (store) rows = rows.filter((o) => o.store_name === store);
    if (!query) rows = rows.filter((o) => inRange(o, bounds.from, bounds.to));
    else rows = rows.filter((o) => String(o.order_no || '').toUpperCase().includes(query));

    if (query && !rows.length) {
        const exact = await getOrderByNo(query).catch(() => null);
        if (exact && (!store || exact.store_name === store)) rows = [exact];
    }

    const tickets = rows.slice(0, 800).map(toTicket);
    const counted = rows.filter(isPaidSale);
    return {
        ok: true,
        range,
        range_label: bounds.label,
        store_name: store,
        q: query,
        orders: counted.length,
        revenue: counted.reduce((sum, o) => sum + Math.round(Number(o.total_amount) || 0), 0),
        truncated: rows.length > tickets.length,
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
            return res.status(200).json(await buildSalesOverview(body.range, {
                from: body.from,
                to: body.to,
            }));
        }

        if (action === 'acc_pnl' || action === 'pnl_overview') {
            return res.status(200).json(await buildAccPnl(body.range || 'today', {
                from: body.from,
                to: body.to,
            }));
        }

        if (action === 'expenses_list') {
            const bounds = rangeBounds(body.range || 'month', { from: body.from, to: body.to });
            const { fromYmd, toYmd } = expenseDateBounds(bounds);
            const rows = await listExpensesInRange(fromYmd, toYmd, body.store_id || body.store_code);
            return res.status(200).json({
                ok: true,
                from_ymd: fromYmd,
                to_ymd: toYmd,
                range_label: bounds.label,
                expenses: rows.map((e) => ({
                    id: e.id,
                    store_id: e.store_id,
                    store_name: storeNameForCode(e.store_id),
                    label: STORE_LABEL_ZH[storeNameForCode(e.store_id)] || e.store_id,
                    merchant_name: e.merchant_name || '',
                    amount: e.amount == null ? null : Number(e.amount),
                    expense_date: e.expense_date,
                    receipt_url: e.receipt_url || '',
                    created_at: e.created_at,
                })),
            });
        }

        if (action === 'sales_tickets') {
            return res.status(200).json(await buildSalesTickets({
                range: body.range,
                store_name: body.store_name,
                q: body.q,
                from: body.from,
                to: body.to,
            }));
        }

        if (action === 'sales_ticket') {
            const order = await getOrderByNo(body.order_no).catch(() => null);
            if (!order) return res.status(404).json({ error: 'Order not found' });
            return res.status(200).json({ ok: true, ticket: toTicket(order) });
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

        if (action === 'set_sold_out') {
            if (!body.id) return res.status(400).json({ error: 'Missing id' });
            const saved = await setMenuItemSoldOut(body.id, !!body.is_sold_out);
            return res.status(200).json({
                ok: true,
                item: Array.isArray(saved) ? saved[0] : saved,
                is_sold_out: !!body.is_sold_out,
            });
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

        // Payroll / staff (folded in to stay under Hobby's 12-function limit)
        if (action === 'payroll_get') {
            const store_name = String(body.store_name || '').trim();
            if (!store_name) return res.status(400).json({ error: 'Missing store' });
            const rules = await getPayrollRules(store_name);
            const payload = rulesPayload(store_name, rules);
            payload.label = STORE_LABEL_ZH[store_name] || store_name;
            payload.stores = KNOWN_STORES.map((name) => ({
                store_name: name,
                label: STORE_LABEL_ZH[name] || name,
            }));
            return res.status(200).json(payload);
        }

        if (action === 'payroll_generate') {
            const store_name = String(body.store_name || '').trim();
            if (!store_name) return res.status(400).json({ error: 'Missing store' });
            const saved = await generateAndSavePayrollRules(store_name, body.text || body.policy);
            saved.label = STORE_LABEL_ZH[store_name] || store_name;
            saved.stores = KNOWN_STORES.map((name) => ({
                store_name: name,
                label: STORE_LABEL_ZH[name] || name,
            }));
            return res.status(200).json(saved);
        }

        if (action === 'payroll_list_employees') {
            const store_name = String(body.store_name || '').trim();
            if (!store_name) return res.status(400).json({ error: 'Missing store' });
            const employees = await listEmployees(store_name);
            return res.status(200).json({ ok: true, store_name, employees });
        }

        if (action === 'payroll_upsert_employee') {
            const store_name = String(body.store_name || '').trim();
            const employee = await upsertEmployee({
                id: body.id,
                store_name,
                name: body.name,
                pin_code: body.pin_code,
                hourly_rate: body.hourly_rate,
            });
            return res.status(200).json({ ok: true, employee });
        }

        if (action === 'payroll_delete_employee') {
            const store_name = String(body.store_name || '').trim();
            await deleteEmployee(store_name, body.id);
            return res.status(200).json({ ok: true });
        }

        // Inventory & recipes
        if (action === 'inventory_list') {
            const store_code = String(body.store_code || storeCodeFor(body.store_name) || '').trim().toUpperCase();
            if (!store_code) return res.status(400).json({ error: 'Missing store_code' });
            const inventory = await listInventoryItems(store_code);
            return res.status(200).json({
                ok: true,
                store_code,
                inventory: inventory || [],
                stores: STORE_CODE_OPTIONS,
            });
        }

        if (action === 'inventory_upsert') {
            const item = await upsertInventoryItem(body.item || body);
            return res.status(200).json({ ok: true, item });
        }

        if (action === 'inventory_delete') {
            await deleteInventoryItem(body.id);
            return res.status(200).json({ ok: true });
        }

        if (action === 'recipe_list') {
            const menu_item_id = String(body.menu_item_id || '').trim();
            if (!menu_item_id) return res.status(400).json({ error: 'Missing menu_item_id' });
            const recipes = await listRecipesForMenu(menu_item_id);
            return res.status(200).json({ ok: true, menu_item_id, recipes: recipes || [], stores: STORE_CODE_OPTIONS });
        }

        if (action === 'recipe_set_costing') {
            const item = await setMenuCosting(body.menu_item_id || body.id, {
                costing_method: body.costing_method,
                direct_cost: body.direct_cost,
            });
            return res.status(200).json({ ok: true, item });
        }

        if (action === 'recipe_upsert_line') {
            const line = await upsertRecipeLine(body.line || body);
            return res.status(200).json({ ok: true, line });
        }

        if (action === 'recipe_delete_line') {
            await deleteRecipeLine(body.id);
            return res.status(200).json({ ok: true });
        }

        return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
        console.error('admin-menu error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Failed' });
    }
};
