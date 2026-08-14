/**
 * Server-side order pricing — never trust client total_amount.
 * Base item prices: defaults + live overrides from Supabase menu_items.
 * Add-ons / sizes / combo upcharges: catalog (same as js/menu.js).
 */

const COMBO_BASE = 19;

const ADDONS = {
    a1: 4, a2: 4, a3: 5, a4: 6, a5: 12, a6: 12, a7: 16, a8: 23, a9: 33,
};

const SAUCES = {
    sc1: 6, sc2: 8, sc3: 8, sc4: 8, sc5: 8,
};

const COMBO_SNACKS = {
    cs1: 0, cs3: 4, cs2: 0, cs4: 4, cs5: 6, cs6: 11, cs7: 6,
};

const COMBO_DRINKS = {
    cd1: 0, cd1a: 0, cd2: 0, cd3: 2, cd4: 3,
    cd5h: 6, cd5c: 6, cd6h: 8, cd6c: 8, cd7h: 8, cd7c: 8,
    cd8h: 8, cd8c: 8, cd9: 18, cd10: 20,
};

/** menuId → { label → upcharge } */
const SIZES = {
    s1: { M: 0, L: 8 },
    s2: { M: 0, L: 8 },
    s5: { M: 0, L: 13 },
    s3: { '3pcs': 0, '5pcs': 13 },
};

/** Fallback base prices (mirror js/menu.js); overridden by menu_items when available */
const DEFAULT_BASE_PRICES = {
    b1: 65, b3: 68, b4: 82, b2: 99,
    v2: 60, c1: 69, c2: 99,
    v1: 58, v3: 61, v4: 65,
    s1: 15, s2: 15, s5: 26, s3: 26, s7: 50,
    d1: 13, d1a: 13, d2: 13, d3: 15, d4: 22, d5: 22, d6: 25, d7: 25, d8: 25, d9: 37, d10: 40,
    ss1: 6, ss2: 8, ss3: 8, ss4: 8, ss5: 8,
};

async function fetchMenuBasePrices() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const prices = { ...DEFAULT_BASE_PRICES };
    if (!SUPABASE_URL || !SUPABASE_KEY) return prices;

    try {
        const url = `${SUPABASE_URL}/rest/v1/menu_items?select=id,price`;
        const resp = await fetch(url, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        });
        if (!resp.ok) {
            console.warn('menu_items fetch failed:', resp.status);
            return prices;
        }
        const rows = await resp.json();
        if (Array.isArray(rows)) {
            for (const row of rows) {
                if (row && row.id != null && Number.isFinite(Number(row.price))) {
                    prices[row.id] = Number(row.price);
                }
            }
        }
    } catch (err) {
        console.warn('menu_items fetch error:', err);
    }
    return prices;
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

function priceLine(item, basePrices) {
    // Standalone extra sauce (upsell)
    if (item.kind === 'extra_sauce' || (item.sauceId && !item.menuId)) {
        const sid = item.sauceId || item.menuId;
        if (!sid || !(sid in SAUCES)) {
            throw new Error(`Unknown sauce: ${sid || '?'}`);
        }
        const qty = Math.max(1, Number(item.qty) || 1);
        return SAUCES[sid] * qty;
    }

    const menuId = item.menuId;
    if (!menuId || !(menuId in basePrices)) {
        throw new Error(`Unknown or missing menuId: ${menuId || '(none)'}`);
    }

    let line = Number(basePrices[menuId]);
    if (!Number.isFinite(line)) throw new Error(`Invalid base price for ${menuId}`);

    if (item.size) {
        const sizeMap = SIZES[menuId];
        if (!sizeMap || !(item.size in sizeMap)) {
            throw new Error(`Invalid size "${item.size}" for ${menuId}`);
        }
        line += sizeMap[item.size];
    }

    const addonIds = Array.isArray(item.addonIds) ? item.addonIds : [];
    for (const aid of addonIds) {
        if (!(aid in ADDONS)) throw new Error(`Unknown addon: ${aid}`);
        line += ADDONS[aid];
    }

    const sauceIds = Array.isArray(item.sauceIds) ? item.sauceIds : [];
    for (const sid of sauceIds) {
        if (!(sid in SAUCES)) throw new Error(`Unknown sauce option: ${sid}`);
        line += SAUCES[sid];
    }

    if (item.comboSnackId || item.comboDrinkId) {
        const cs = item.comboSnackId;
        const cd = item.comboDrinkId;
        if (!cs || !(cs in COMBO_SNACKS)) throw new Error(`Invalid combo snack: ${cs || '?'}`);
        if (!cd || !(cd in COMBO_DRINKS)) throw new Error(`Invalid combo drink: ${cd || '?'}`);
        line += COMBO_BASE + COMBO_SNACKS[cs] + COMBO_DRINKS[cd];
    }

    const qty = Math.max(1, Number(item.qty) || 1);
    return line * qty;
}

function computeDiscount(storeName, subtotal, hasCombo) {
    // Website KPay orders are pickup-only (delivery goes to Foodpanda/KeeTa)
    if (storeName === 'Tsuen Wan (Takeaway Only)') {
        return Math.floor(subtotal * 0.15);
    }
    if (subtotal >= 120 || hasCombo) {
        return Math.floor(subtotal * 0.10);
    }
    return 0;
}

/**
 * @returns {{ total: number, subtotal: number, discount: number, lines: number[] }}
 */
async function recalculateOrderTotal(order) {
    const items = parseItems(order.items_json);
    if (!items.length) throw new Error('Order has no items');

    const basePrices = await fetchMenuBasePrices();
    const lines = [];
    let hasCombo = false;

    for (const item of items) {
        // Legacy carts without pricing metadata — refuse (force re-order after deploy)
        const hasMeta =
            item.menuId ||
            item.sauceId ||
            item.kind === 'extra_sauce';
        if (!hasMeta) {
            throw new Error(
                'Order items missing pricing metadata. Please refresh the page and place the order again.'
            );
        }
        if (item.comboSnackId || item.comboDrinkId) hasCombo = true;
        if (typeof item.detailsEn === 'string' && item.detailsEn.includes('Combo')) hasCombo = true;
        lines.push(priceLine(item, basePrices));
    }

    const subtotal = lines.reduce((a, b) => a + b, 0);
    const discount = computeDiscount(order.store_name, subtotal, hasCombo);
    const total = subtotal - discount;
    if (!Number.isFinite(total) || total <= 0) {
        throw new Error('Invalid recalculated total');
    }
    return { total, subtotal, discount, lines };
}

module.exports = {
    recalculateOrderTotal,
    fetchMenuBasePrices,
    COMBO_BASE,
};
