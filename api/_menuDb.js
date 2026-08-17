function sb() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_KEY');
    }
    return { SUPABASE_URL, SUPABASE_KEY };
}

async function sbFetch(path, options = {}) {
    const { SUPABASE_URL, SUPABASE_KEY } = sb();
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

async function listMenuItems({ includeInactive = false } = {}) {
    // Prefer sort_order when column exists; fall back if schema not migrated yet
    const filters = includeInactive ? '' : '&is_active=eq.true';
    try {
        return await sbFetch(
            `menu_items?select=*${filters}&order=category.asc,sort_order.asc,id.asc`
        );
    } catch (err) {
        const msg = String(err.message || '');
        if (msg.includes('sort_order') || msg.includes('is_active')) {
            return sbFetch('menu_items?select=*&order=category.asc,id.asc');
        }
        throw err;
    }
}

async function listModifiers({ includeInactive = false } = {}) {
    const filters = includeInactive ? '' : '&is_active=eq.true';
    try {
        return await sbFetch(
            `menu_modifiers?select=*${filters}&order=kind.asc,sort_order.asc,id.asc`
        );
    } catch (err) {
        // Table may not exist until menu-full.sql is run — don't blank the whole admin
        console.warn('menu_modifiers list skipped:', err.message);
        return [];
    }
}

async function upsertMenuItem(item) {
    if (!item || !item.id) throw new Error('Missing item id');
    const row = {
        id: String(item.id).trim(),
        category: item.category,
        name_en: item.name_en,
        name_zh: item.name_zh,
        price: Number(item.price),
        desc_en: item.desc_en ?? null,
        desc_zh: item.desc_zh ?? null,
        img: item.img ?? null,
        tag_en: item.tag_en ?? null,
        tag_zh: item.tag_zh ?? null,
        dietary: item.dietary ?? [],
        sizes: item.sizes ?? null,
        is_side: !!item.is_side,
        has_temp: !!item.has_temp,
        is_sold_out: !!item.is_sold_out,
        is_active: item.is_active !== false,
        sort_order: Number(item.sort_order) || 0,
        updated_at: new Date().toISOString(),
    };
    return sbFetch('menu_items?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: JSON.stringify(row),
    });
}

async function deleteMenuItem(id) {
    return sbFetch(`menu_items?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        prefer: 'return=minimal',
    });
}

async function upsertModifier(mod) {
    if (!mod || !mod.id) throw new Error('Missing modifier id');
    const row = {
        id: String(mod.id).trim(),
        kind: mod.kind,
        name_en: mod.name_en,
        name_zh: mod.name_zh,
        price: Number(mod.price) || 0,
        is_active: mod.is_active !== false,
        sort_order: Number(mod.sort_order) || 0,
        updated_at: new Date().toISOString(),
    };
    return sbFetch('menu_modifiers?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: JSON.stringify(row),
    });
}

async function deleteModifier(id) {
    return sbFetch(`menu_modifiers?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        prefer: 'return=minimal',
    });
}

async function getSetting(key) {
    const rows = await sbFetch(`menu_settings?key=eq.${encodeURIComponent(key)}&select=value`);
    return Array.isArray(rows) && rows[0] ? rows[0].value : null;
}

async function listSoldOutIds(storeName) {
    const store = String(storeName || '').trim();
    if (!store) return new Set();
    try {
        const rows = await sbFetch(
            `menu_sold_out?store_name=eq.${encodeURIComponent(store)}&is_sold_out=eq.true&select=item_id`
        );
        return new Set((Array.isArray(rows) ? rows : []).map((r) => r.item_id).filter(Boolean));
    } catch (err) {
        console.warn('menu_sold_out list skipped:', err.message);
        return new Set();
    }
}

async function setMenuItemSoldOut(id, isSoldOut) {
    if (!id) throw new Error('Missing item id');
    return sbFetch(`menu_items?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: JSON.stringify({
            is_sold_out: !!isSoldOut,
            updated_at: new Date().toISOString(),
        }),
    });
}

module.exports = {
    listMenuItems,
    listModifiers,
    upsertMenuItem,
    deleteMenuItem,
    upsertModifier,
    deleteModifier,
    getSetting,
    listSoldOutIds,
    setMenuItemSoldOut,
};
