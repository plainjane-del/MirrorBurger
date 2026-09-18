/**
 * Inventory & recipe costing helpers (service role).
 */
function sbConfig() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_KEY/SERVICE_ROLE_KEY');
    }
    return { SUPABASE_URL, SUPABASE_KEY };
}

async function sbRest(path, options = {}) {
    const { SUPABASE_URL, SUPABASE_KEY } = sbConfig();
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: options.prefer || 'return=representation',
            ...(options.headers || {}),
        },
    });
    const text = await resp.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    if (!resp.ok) {
        const err = new Error(typeof data === 'string' ? data : JSON.stringify(data));
        err.status = resp.status;
        throw err;
    }
    return data;
}

const STORE_CODE_BY_NAME = {
    'Sai Ying Pun': 'SYP',
    'Fortress Hill': 'TH',
    'Tsuen Wan (Takeaway Only)': 'TW',
};

function storeCodeFor(storeName) {
    const raw = String(storeName || '').trim();
    if (STORE_CODE_BY_NAME[raw]) return STORE_CODE_BY_NAME[raw];
    const slug = raw.toLowerCase().replace(/\s+/g, '-');
    if (slug === 'tsuen-wan') return 'TW';
    if (slug === 'tin-hau' || slug === 'fortress-hill') return 'TH';
    if (slug === 'sai-ying-pun') return 'SYP';
    if (/^[A-Z]{2,4}$/i.test(raw)) return raw.toUpperCase();
    return '';
}

function parseItemsJson(itemsJson) {
    let items = itemsJson;
    if (typeof items === 'string') {
        try { items = JSON.parse(items || '[]'); } catch { items = []; }
    }
    return Array.isArray(items) ? items : [];
}

async function deductInventoryForOrder(order) {
    if (!order || !order.order_no) return { ok: false, skipped: true, reason: 'no_order' };
    const storeCode = storeCodeFor(order.store_name);
    if (!storeCode) {
        console.warn('inventory deduct skipped: unknown store', order.store_name);
        return { ok: false, skipped: true, reason: 'unknown_store' };
    }
    const items = parseItemsJson(order.items_json);
    const { SUPABASE_URL, SUPABASE_KEY } = sbConfig();
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/deduct_inventory_for_order`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            p_order_no: order.order_no,
            p_store_code: storeCode,
            p_order_items: items,
        }),
    });
    const text = await resp.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    if (!resp.ok) {
        const err = new Error(typeof data === 'string' ? data : JSON.stringify(data));
        err.status = resp.status;
        throw err;
    }
    return data && typeof data === 'object' ? data : { ok: true, low_stock: [] };
}

async function listInventoryItems(storeCode) {
    const code = String(storeCode || '').trim().toUpperCase();
    if (!code) throw Object.assign(new Error('Missing store_code'), { status: 400 });
    return sbRest(
        `inventory_items?store_code=eq.${encodeURIComponent(code)}&select=*&order=name.asc`
    );
}

async function upsertInventoryItem(input) {
    const store_code = String((input && input.store_code) || '').trim().toUpperCase();
    if (!/^[A-Z]{2,4}$/.test(store_code)) {
        throw Object.assign(new Error('Invalid store_code'), { status: 400 });
    }
    const name = String((input && input.name) || '').trim();
    if (!name) throw Object.assign(new Error('Missing name'), { status: 400 });
    const row = {
        store_code,
        name,
        unit_of_measure: String((input && input.unit_of_measure) || 'g').trim() || 'g',
        cost_per_unit: Number(input && input.cost_per_unit) || 0,
        current_stock: Number(input && input.current_stock) || 0,
        low_stock_threshold: Number(input && input.low_stock_threshold) || 0,
        updated_at: new Date().toISOString(),
    };
    if (input && input.id) {
        const id = String(input.id).trim();
        const saved = await sbRest(`inventory_items?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(row),
        });
        return Array.isArray(saved) ? saved[0] : saved;
    }
    const saved = await sbRest('inventory_items', {
        method: 'POST',
        body: JSON.stringify(row),
    });
    return Array.isArray(saved) ? saved[0] : saved;
}

async function deleteInventoryItem(id) {
    const itemId = String(id || '').trim();
    if (!itemId) throw Object.assign(new Error('Missing id'), { status: 400 });
    await sbRest(`inventory_items?id=eq.${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        prefer: 'return=minimal',
    });
    return { ok: true };
}

async function listRecipesForMenu(menuItemId) {
    const mid = String(menuItemId || '').trim();
    if (!mid) throw Object.assign(new Error('Missing menu_item_id'), { status: 400 });
    return sbRest(
        `recipes?menu_item_id=eq.${encodeURIComponent(mid)}&select=id,menu_item_id,inventory_item_id,quantity_used,inventory_items(id,name,unit_of_measure,store_code,current_stock)&order=created_at.asc`
    );
}

async function setMenuCosting(menuItemId, { costing_method, direct_cost } = {}) {
    const mid = String(menuItemId || '').trim();
    if (!mid) throw Object.assign(new Error('Missing menu_item_id'), { status: 400 });
    const method = String(costing_method || 'direct').toLowerCase();
    if (method !== 'direct' && method !== 'recipe') {
        throw Object.assign(new Error('costing_method must be direct or recipe'), { status: 400 });
    }
    const body = {
        costing_method: method,
        direct_cost: Math.max(0, Number(direct_cost) || 0),
        updated_at: new Date().toISOString(),
    };
    const saved = await sbRest(`menu_items?id=eq.${encodeURIComponent(mid)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });
    return Array.isArray(saved) ? saved[0] : saved;
}

async function upsertRecipeLine(input) {
    const menu_item_id = String((input && input.menu_item_id) || '').trim();
    const inventory_item_id = String((input && input.inventory_item_id) || '').trim();
    const quantity_used = Number(input && input.quantity_used);
    if (!menu_item_id || !inventory_item_id) {
        throw Object.assign(new Error('Missing menu_item_id or inventory_item_id'), { status: 400 });
    }
    if (!(quantity_used > 0)) {
        throw Object.assign(new Error('quantity_used must be > 0'), { status: 400 });
    }
    if (input && input.id) {
        const saved = await sbRest(`recipes?id=eq.${encodeURIComponent(String(input.id).trim())}`, {
            method: 'PATCH',
            body: JSON.stringify({ quantity_used }),
        });
        return Array.isArray(saved) ? saved[0] : saved;
    }
    const saved = await sbRest('recipes?on_conflict=menu_item_id,inventory_item_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: JSON.stringify({ menu_item_id, inventory_item_id, quantity_used }),
    });
    return Array.isArray(saved) ? saved[0] : saved;
}

async function deleteRecipeLine(id) {
    const lineId = String(id || '').trim();
    if (!lineId) throw Object.assign(new Error('Missing id'), { status: 400 });
    await sbRest(`recipes?id=eq.${encodeURIComponent(lineId)}`, {
        method: 'DELETE',
        prefer: 'return=minimal',
    });
    return { ok: true };
}

module.exports = {
    storeCodeFor,
    deductInventoryForOrder,
    listInventoryItems,
    upsertInventoryItem,
    deleteInventoryItem,
    listRecipesForMenu,
    setMenuCosting,
    upsertRecipeLine,
    deleteRecipeLine,
};
