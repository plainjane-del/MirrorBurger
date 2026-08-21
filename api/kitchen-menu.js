const crypto = require('crypto');
const { requireKitchen } = require('./_kitchenAuth.js');
const { listMenuItems, listModifiers, listSoldOutIds, getSetting, setMenuItemSoldOut, setStoreMenuSoldOut, isPermissionError } = require('./_menuDb.js');
const { listKitchenOrders, startOfTodayHkIso, updateKitchenOrderStatus, createPosOrder, cancelPosOrder, markTableOrderPaid, getOrderByNo, markOrderPaid, reconcileRecentPending, reconcilePendingIfPaid } = require('./_orders.js');
const { setStoreOpen, syncStoreToSchedule } = require('./_storeSettings.js');

const ALLOWED_STATUS = new Set(['PREPARING', 'READY', 'COMPLETED']);

function isKitchenBoardOrder(order) {
    const pay = String((order && order.payment_status) || '').toUpperCase();
    const st = String((order && order.status) || '').toUpperCase();
    if (pay === 'PENDING' || pay === 'CANCELLED' || st === 'CANCELLED') return false;
    if (st === 'COMPLETED' || pay === 'COMPLETED') return false;
    const active = ['PAID', 'PREPARING', 'READY'];
    const paidOk = pay === 'PAID' || pay === 'UNPAID' || active.includes(pay);
    if (!paidOk) return false;
    const kitchen = active.includes(st) ? st : (pay === 'UNPAID' ? 'PAID' : pay);
    return active.includes(kitchen);
}

function sendJsonWithEtag(req, res, payload) {
    const body = JSON.stringify(payload);
    const etag = '"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (String(req.headers['if-none-match'] || '') === etag) {
        return res.status(304).end();
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).end(body);
}

function resolveStoreAccess(auth, inputStoreName) {
    const requested = String(inputStoreName || '').trim();
    if (auth.scope === 'all_stores') return requested;
    if (requested && auth.store_name && requested !== auth.store_name) {
        const err = new Error('Forbidden store');
        err.status = 403;
        throw err;
    }
    return auth.store_name || requested;
}

/**
 * Single kitchen function (Vercel Hobby = 12 functions max).
 * POST /api/kitchen-menu
 * Actions: list, set_sold_out, board, completed, stats, set_order_status, set_store_open, sync_store_hours, create_pos_order, cancel_pos_order, mark_table_paid, mark_order_paid
 */
module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const auth = requireKitchen(req);
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
            const storeName = resolveStoreAccess(auth, body.store_name);
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
            const storeName = resolveStoreAccess(auth, body.store_name);
            let saved = null;
            let perStore = false;
            if (storeName) {
                try {
                    saved = await setStoreMenuSoldOut(storeName, body.id, !!body.is_sold_out);
                    perStore = true;
                    // Stop sharing one global flag across all 3 shops.
                    await setMenuItemSoldOut(body.id, false).catch(() => {});
                } catch (err) {
                    console.warn('menu_sold_out write failed, using global flag:', err.message);
                }
            }
            if (!perStore) {
                saved = await setMenuItemSoldOut(body.id, !!body.is_sold_out);
            }
            return res.status(200).json({
                ok: true,
                per_store: perStore,
                store_name: storeName || null,
                item: Array.isArray(saved) ? saved[0] : saved,
            });
        }

        if (action === 'board' || action === 'completed' || action === 'stats') {
            const storeName = resolveStoreAccess(auth, body.store_name);
            if (!storeName) return res.status(400).json({ error: 'Missing store_name' });

            if (action === 'board') {
                const getPendingOnline = (orders) => {
                    const pendingCutoff = Date.now() - 4 * 60 * 60 * 1000;
                    return (orders || [])
                        .filter((o) => {
                            const pay = String(o.payment_status || '').toUpperCase();
                            if (pay !== 'PENDING') return false;
                            const ch = String(o.channel || '').toLowerCase();
                            if (ch === 'table' || ch === 'pos') return false;
                            const created = Date.parse(o.created_at || '');
                            if (Number.isFinite(created) && created < pendingCutoff) return false;
                            return true;
                        })
                        .slice(0, 12);
                };

                // 先列出廚房畫面上會顯示嘅 pending online 訂單，
                // 再針對呢幾張做即時 reconcile，確保「已收款」會自動跳出 pending 區。
                const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
                const orders = await listKitchenOrders(storeName, { since, limit: 60 });
                const pendingOnline = getPendingOnline(orders);

                const toReconcile = pendingOnline.slice(0, 2).map((o) => o.order_no).filter(Boolean);
                if (!toReconcile.length) {
                    return sendJsonWithEtag(req, res, {
                        orders: (orders || []).filter(isKitchenBoardOrder),
                        pending_online: pendingOnline,
                    });
                }
                const deadline = Date.now() + 8000;
                for (const orderNo of toReconcile) {
                    if (Date.now() > deadline) break;
                    try {
                        await reconcilePendingIfPaid(orderNo);
                    } catch (err) {
                        console.warn('board targeted reconcile failed:', orderNo, err.message || err);
                    }
                }

                const orders2 = await listKitchenOrders(storeName, { since, limit: 60 });
                const pendingOnline2 = getPendingOnline(orders2);
                const board = (orders2 || []).filter(isKitchenBoardOrder);
                return sendJsonWithEtag(req, res, { orders: board, pending_online: pendingOnline2 });
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
            const storeName = resolveStoreAccess(auth, body.store_name);
            if (!storeName) return res.status(400).json({ error: 'Missing store_name' });
            const result = await createPosOrder({
                store_name: storeName,
                pay_method: body.pay_method,
                customer_name: body.customer_name,
                note: body.note,
                fulfill: body.fulfill,
                table_no: body.table_no,
                items: body.items,
                client_id: body.client_id || body.pos_client_id,
                allow_sold_out: !!body.allow_sold_out,
            });
            return res.status(200).json({ ok: true, ...result });
        }

        if (action === 'cancel_pos_order') {
            const orderNo = String(body.orderNo || '').trim();
            if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });
            const existing = await getOrderByNo(orderNo);
            if (existing) resolveStoreAccess(auth, existing.store_name);
            const result = await cancelPosOrder(orderNo);
            return res.status(200).json(result);
        }

        if (action === 'mark_table_paid') {
            const orderNo = String(body.orderNo || '').trim();
            if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });
            const existing = await getOrderByNo(orderNo);
            if (existing) resolveStoreAccess(auth, existing.store_name);
            const result = await markTableOrderPaid(orderNo, body.pay_method);
            return res.status(200).json(result);
        }

        if (action === 'mark_order_paid') {
            const orderNo = String(body.orderNo || '').trim();
            if (!orderNo) return res.status(400).json({ error: 'Missing orderNo' });
            const existing = await getOrderByNo(orderNo);
            if (!existing) return res.status(404).json({ error: 'Order not found' });
            resolveStoreAccess(auth, existing.store_name);
            const pay = String(existing.payment_status || '').toUpperCase();
            if (pay === 'PAID' || pay === 'COMPLETED' || pay === 'PREPARING' || pay === 'READY') {
                return res.status(200).json({ ok: true, alreadyPaid: true, order: existing });
            }
            if (pay !== 'PENDING') {
                return res.status(400).json({ error: `Cannot mark ${pay} as paid` });
            }
            const result = await markOrderPaid(orderNo);
            return res.status(200).json({
                ok: true,
                updated: Boolean(result && result.updated),
                order: (result && result.order) || existing,
            });
        }

        if (action === 'set_store_open') {
            const storeName = resolveStoreAccess(auth, body.store_name);
            if (!storeName) return res.status(400).json({ error: 'Missing store_name' });
            if (typeof body.is_open !== 'boolean') {
                return res.status(400).json({ error: 'Missing is_open (boolean)' });
            }
            const row = await setStoreOpen(storeName, body.is_open);
            return res.status(200).json({
                ok: true,
                store_name: row.store_name,
                is_open: !!row.is_open,
                override_until: row.override_until || null,
            });
        }

        if (action === 'sync_store_hours') {
            const storeName = resolveStoreAccess(auth, body.store_name);
            if (!storeName) return res.status(400).json({ error: 'Missing store_name' });
            const row = await syncStoreToSchedule(storeName);
            return res.status(200).json({
                ok: true,
                store_name: row && row.store_name,
                is_open: !!(row && row.is_open),
                override_until: (row && row.override_until) || null,
            });
        }

        return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
        console.error('kitchen-menu error:', err);
        const status = err.message === 'Invalid store' ? 400 : (err.status || 500);
        let message = err.message || 'Failed';
        if (err.body && typeof err.body === 'object' && err.body.message) {
            message = err.body.message;
        } else {
            try {
                const parsed = JSON.parse(String(err.message || ''));
                if (parsed && parsed.message) message = parsed.message;
            } catch (_) {}
        }
        if (isPermissionError(err)) {
            message = '沽清寫入被拒。Vercel 要設 SUPABASE_SERVICE_ROLE_KEY（唔可以用 anon key）。';
        }
        return res.status(status).json({ error: message });
    }
};
