const { requireKitchen } = require('./_kitchenAuth.js');
const { listMenuItems, listModifiers, listSoldOutIds, getSetting, setMenuItemSoldOut } = require('./_menuDb.js');
const { listKitchenOrders, startOfTodayHkIso, updateKitchenOrderStatus, createPosOrder, cancelPosOrder } = require('./_orders.js');
const { setStoreOpen } = require('./_storeSettings.js');

const ALLOWED_STATUS = new Set(['PREPARING', 'READY', 'COMPLETED']);

/**
 * Single kitchen function (Vercel Hobby = 12 functions max).
 * POST /api/kitchen-menu
 * Actions: list, set_sold_out, board, completed, stats, set_order_status, set_store_open, create_pos_order, cancel_pos_order
 */
module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        requireKitchen(req);
        const body = req.body || {};
        const action = body.action || 'list';

        if (action === 'list') {
            const items = await listMenuItems({ includeInactive: false });
            let modifiers = [];
            let combo_base = 19;
            try {
                modifiers = await listModifiers({ includeInactive: false }) || [];
            } catch (err) {
                console.warn('POS modifiers skipped:', err.message);
            }
            try {
                const raw = await getSetting('combo_base');
                const n = Number(raw);
                if (Number.isFinite(n)) combo_base = n;
            } catch (err) {
                console.warn('combo_base skipped:', err.message);
            }
            const storeName = String(body.store_name || '').trim();
            let soldIds = new Set();
            if (storeName) {
                soldIds = await listSoldOutIds(storeName);
            }
            const merged = (items || []).map((item) => ({
                ...item,
                is_sold_out: !!(item.is_sold_out || soldIds.has(item.id)),
            }));
            return res.status(200).json({
                items: merged,
                modifiers,
                combo_base,
            });
        }

        if (action === 'set_sold_out') {
            if (!body.id) return res.status(400).json({ error: 'Missing id' });
            const saved = await setMenuItemSoldOut(body.id, !!body.is_sold_out);
            return res.status(200).json({
                ok: true,
                item: Array.isArray(saved) ? saved[0] : saved,
            });
        }

        if (action === 'board' || action === 'completed' || action === 'stats') {
            const storeName = String(body.store_name || '').trim();
            if (!storeName) return res.status(400).json({ error: 'Missing store_name' });

            if (action === 'board') {
                const orders = await listKitchenOrders(storeName, { limit: 200 });
                return res.status(200).json({ orders: orders || [] });
            }

            if (action === 'completed') {
                const rows = await listKitchenOrders(storeName, {
                    since: startOfTodayHkIso(),
                    limit: 200,
                });
                const orders = (rows || []).filter((o) => {
                    const pay = String(o.payment_status || '').toUpperCase();
                    const st = String(o.status || '').toUpperCase();
                    return st === 'COMPLETED' || pay === 'COMPLETED';
                }).slice(0, 80);
                return res.status(200).json({ orders });
            }

            const orders = await listKitchenOrders(storeName, {
                since: startOfTodayHkIso(),
                limit: 500,
            });
            return res.status(200).json({ orders: orders || [] });
        }

        if (action === 'set_order_status') {
            const orderNo = String(body.orderNo || '').trim();
            const status = String(body.status || '').trim().toUpperCase();
            if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });
            if (!ALLOWED_STATUS.has(status)) {
                return res.status(400).json({ error: `Invalid status (allowed: ${[...ALLOWED_STATUS].join(', ')})` });
            }
            const result = await updateKitchenOrderStatus(orderNo, status);
            return res.status(200).json({ ok: true, ...result });
        }

        if (action === 'create_pos_order') {
            const result = await createPosOrder({
                store_name: body.store_name,
                pay_method: body.pay_method,
                customer_name: body.customer_name,
                note: body.note,
                fulfill: body.fulfill,
                items: body.items,
            });
            return res.status(200).json({ ok: true, ...result });
        }

        if (action === 'cancel_pos_order') {
            const orderNo = String(body.orderNo || '').trim();
            if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });
            const result = await cancelPosOrder(orderNo);
            return res.status(200).json(result);
        }

        if (action === 'set_store_open') {
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
        }

        return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
        console.error('kitchen-menu error:', err);
        const status = err.message === 'Invalid store' ? 400 : (err.status || 500);
        return res.status(status).json({ error: err.message || 'Failed' });
    }
};
