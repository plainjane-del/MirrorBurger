/**
 * Server-side order pricing — never trust client total_amount.
 * Loads live prices from menu_items + menu_modifiers (+ sizes JSON).
 */

const DEFAULT_COMBO_BASE = 19;

const DEFAULT_ADDONS = {
    a1: 4, a2: 4, a3: 5, a4: 6, a5: 12, a6: 12, a7: 16, a8: 23, a9: 33,
};
const DEFAULT_SAUCES = {
    sc1: 6, sc2: 8, sc3: 8, sc4: 8, sc5: 8,
};
const DEFAULT_COMBO_SNACKS = {
    cs1: 0, cs3: 4, cs2: 0, cs4: 4, cs5: 6, cs6: 11, cs7: 6,
};
const DEFAULT_COMBO_DRINKS = {
    cd1: 0, cd1a: 0, cd2: 0, cd3: 2, cd4: 3,
    cd5h: 6, cd5c: 6, cd6h: 8, cd6c: 8, cd7h: 8, cd7c: 8,
    cd8h: 8, cd8c: 8, cd9: 18, cd10: 20,
};
const DEFAULT_SIZES = {
    s1: { M: 0, L: 8 },
    s2: { M: 0, L: 8 },
    s5: { M: 0, L: 13 },
    s3: { '3pcs': 0, '5pcs': 13 },
};
const DEFAULT_BASE_PRICES = {
    b1: 68, b3: 71, b4: 82, b2: 102,
    v2: 60, c1: 69, c2: 99,
    v1: 61, v3: 64, v4: 67,
    s1: 15, s2: 15, s5: 26, s3: 26, s7: 50,
    d1: 13, d1a: 13, d2: 13, d3: 15, d4: 22, d5: 22, d6: 25, d7: 25, d8: 25, d9: 37, d10: 40,
    ss1: 6, ss2: 8, ss3: 8, ss4: 8, ss5: 8,
};

async function sbGet(path) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) return null;
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
    if (!resp.ok) return null;
    return resp.json();
}

async function loadPricingCatalog() {
    const catalog = {
        basePrices: { ...DEFAULT_BASE_PRICES },
        addons: { ...DEFAULT_ADDONS },
        sauces: { ...DEFAULT_SAUCES },
        comboSnacks: { ...DEFAULT_COMBO_SNACKS },
        comboDrinks: { ...DEFAULT_COMBO_DRINKS },
        sizes: { ...DEFAULT_SIZES },
        comboBase: DEFAULT_COMBO_BASE,
    };

    try {
        const [items, mods, settings] = await Promise.all([
            sbGet('menu_items?select=id,price,sizes&is_active=eq.true'),
            sbGet('menu_modifiers?select=id,kind,price&is_active=eq.true'),
            sbGet('menu_settings?key=eq.combo_base&select=value'),
        ]);

        if (Array.isArray(items)) {
            for (const row of items) {
                if (row?.id != null && Number.isFinite(Number(row.price))) {
                    catalog.basePrices[row.id] = Number(row.price);
                }
                if (row?.id && Array.isArray(row.sizes) && row.sizes.length) {
                    const map = {};
                    for (const sz of row.sizes) {
                        if (sz && sz.label != null) map[sz.label] = Number(sz.upcharge) || 0;
                    }
                    catalog.sizes[row.id] = map;
                }
            }
        }

        if (Array.isArray(mods)) {
            for (const row of mods) {
                const p = Number(row.price);
                if (!row?.id || !Number.isFinite(p)) continue;
                if (row.kind === 'addon') catalog.addons[row.id] = p;
                else if (row.kind === 'sauce') catalog.sauces[row.id] = p;
                else if (row.kind === 'combo_snack') catalog.comboSnacks[row.id] = p;
                else if (row.kind === 'combo_drink') catalog.comboDrinks[row.id] = p;
            }
        }

        if (Array.isArray(settings) && settings[0] && settings[0].value != null) {
            const v = Number(settings[0].value);
            if (Number.isFinite(v)) catalog.comboBase = v;
        }
    } catch (err) {
        console.warn('loadPricingCatalog fallback:', err);
    }

    return catalog;
}

function parseItems(itemsJson) {
    let items = itemsJson;
    if (typeof items === 'string') {
        try {
            items = JSON.parse(items || '[]');
        } catch {
            items = [];
        }
    }
    return Array.isArray(items) ? items : [];
}

function priceLine(item, catalog) {
    const { basePrices, addons, sauces, comboSnacks, comboDrinks, sizes, comboBase } = catalog;

    if (item.kind === 'extra_sauce' || (item.sauceId && !item.menuId)) {
        const sid = item.sauceId || item.menuId;
        if (!sid || !(sid in sauces)) throw new Error(`Unknown sauce: ${sid || '?'}`);
        const qty = Math.max(1, Number(item.qty) || 1);
        return sauces[sid] * qty;
    }

    const menuId = item.menuId;
    if (!menuId || !(menuId in basePrices)) {
        throw new Error(`Unknown or missing menuId: ${menuId || '(none)'}`);
    }

    let line = Number(basePrices[menuId]);
    if (!Number.isFinite(line)) throw new Error(`Invalid base price for ${menuId}`);

    if (item.size) {
        const sizeMap = sizes[menuId];
        const raw = String(item.size);
        const aliases = {
            M: ['M', '中', '中份'],
            L: ['L', '大', '大份'],
            '3pcs': ['3pcs', '3', '三件'],
            '5pcs': ['5pcs', '5', '五件'],
        };
        let key = sizeMap && Object.prototype.hasOwnProperty.call(sizeMap, raw) ? raw : null;
        if (!key && sizeMap) {
            for (const [canon, names] of Object.entries(aliases)) {
                if (names.includes(raw) && Object.prototype.hasOwnProperty.call(sizeMap, canon)) {
                    key = canon;
                    break;
                }
            }
        }
        if (key && sizeMap) line += Number(sizeMap[key]) || 0;
    }

    const addonIds = (Array.isArray(item.addonIds) ? item.addonIds : []).slice(0, 3);
    for (const aid of addonIds) {
        if (!(aid in addons)) throw new Error(`Unknown addon: ${aid}`);
        line += addons[aid];
    }

    for (const sid of Array.isArray(item.sauceIds) ? item.sauceIds : []) {
        if (!(sid in sauces)) throw new Error(`Unknown sauce option: ${sid}`);
        line += sauces[sid];
    }

    if (item.comboSnackId || item.comboDrinkId) {
        const cs = item.comboSnackId;
        const cd = item.comboDrinkId;
        if (!cs || !(cs in comboSnacks)) throw new Error(`Invalid combo snack: ${cs || '?'}`);
        if (!cd || !(cd in comboDrinks)) throw new Error(`Invalid combo drink: ${cd || '?'}`);
        line += comboBase + comboSnacks[cs] + comboDrinks[cd];
    }

    const qty = Math.max(1, Number(item.qty) || 1);
    return line * qty;
}

function isTakeawayOrder(order) {
    const fulfill = String(
        (order && (order.fulfill || order.fulfillment || order.delivery_mode)) || ''
    ).toLowerCase();
    if (fulfill === 'dine_in' || fulfill === 'dine-in' || fulfill === 'dinein' || fulfill === '堂食') {
        return false;
    }
    const pickup = String((order && order.pickup_time) || '');
    if (/(^|·|\s)堂食(\s|·|$)/.test(pickup) || pickup.startsWith('堂食')) return false;
    return true;
}

function computeDiscount(storeName, subtotal, hasCombo, order) {
    if (!isTakeawayOrder(order || {})) return 0;
    if (storeName === 'Tsuen Wan (Takeaway Only)') {
        return Math.floor(subtotal * 0.15);
    }
    if (subtotal >= 120 || hasCombo) {
        return Math.floor(subtotal * 0.10);
    }
    return 0;
}

async function recalculateOrderTotal(order) {
    const items = parseItems(order.items_json);
    if (!items.length) throw new Error('Order has no items');

    const catalog = await loadPricingCatalog();
    const lines = [];
    let hasCombo = false;

    for (const item of items) {
        const hasMeta = item.menuId || item.sauceId || item.kind === 'extra_sauce';
        if (!hasMeta) {
            throw new Error(
                'Order items missing pricing metadata. Please refresh the page and place the order again.'
            );
        }
        if (item.comboSnackId || item.comboDrinkId) hasCombo = true;
        if (typeof item.detailsEn === 'string' && item.detailsEn.includes('Combo')) hasCombo = true;
        lines.push(priceLine(item, catalog));
    }

    const subtotal = lines.reduce((a, b) => a + b, 0);
    const discount = computeDiscount(order.store_name, subtotal, hasCombo, order);
    const total = subtotal - discount;
    if (!Number.isFinite(total) || total <= 0) {
        throw new Error('Invalid recalculated total');
    }
    return { total, subtotal, discount, lines };
}

module.exports = {
    recalculateOrderTotal,
    loadPricingCatalog,
};
