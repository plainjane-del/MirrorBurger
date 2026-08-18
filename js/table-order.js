const STORE = 'Sai Ying Pun';
const CATS = [
    { id: 'beef', label: '牛肉' }, { id: 'others', label: '其他' }, { id: 'veggie', label: '素食' },
    { id: 'snacks', label: '小食' }, { id: 'drinks', label: '飲品' }, { id: 'sauces', label: '醬汁' },
];
const FALLBACK = {
    addon: [
        { id: 'a1', name_zh: '自家製酸瓜', price: 4 }, { id: 'a2', name_zh: '墨西哥酸辣辣椒', price: 4 },
        { id: 'a3', name_zh: '美國芝士', price: 5 }, { id: 'a4', name_zh: '煎蛋', price: 6 },
        { id: 'a5', name_zh: '煙肉', price: 12 }, { id: 'a6', name_zh: '牛油果片', price: 12 },
        { id: 'a7', name_zh: '丹麥藍芝士', price: 16 }, { id: 'a8', name_zh: '炸素雞排', price: 23 },
        { id: 'a9', name_zh: '安格斯漢堡扒', price: 33 },
    ],
    sauce: [
        { id: 'sc1', name_zh: '焦糖蒜蓉醬', price: 6 }, { id: 'sc2', name_zh: '煙燻墨西哥辣椒醬', price: 8 },
        { id: 'sc3', name_zh: '水牛城辣醬', price: 8 }, { id: 'sc4', name_zh: '秘製他他醬', price: 8 },
        { id: 'sc5', name_zh: '藍紋芝士醬', price: 8 },
    ],
    combo_snack: [
        { id: 'cs1', name_zh: '脆炸薯條 (M)', price: 0 }, { id: 'cs3', name_zh: '脆炸薯條 (L)', price: 4 },
        { id: 'cs2', name_zh: '蓮藕脆片 (M)', price: 0 }, { id: 'cs4', name_zh: '蓮藕脆片 (L)', price: 4 },
        { id: 'cs5', name_zh: '炸番薯條 (M)', price: 6 }, { id: 'cs6', name_zh: '炸番薯條 (L)', price: 11 },
        { id: 'cs7', name_zh: '煙燻雞翼 (3件)', price: 6 },
    ],
    combo_drink: [
        { id: 'cd1', name_zh: '可口可樂', price: 0 }, { id: 'cd1a', name_zh: '零系可口可樂', price: 0 },
        { id: 'cd2', name_zh: '忌廉哥冰', price: 0 }, { id: 'cd3', name_zh: '梳打水', price: 2 },
        { id: 'cd4', name_zh: '肉桂凍檸茶', price: 3 }, { id: 'cd5h', name_zh: '美式咖啡 (熱)', price: 6 },
        { id: 'cd5c', name_zh: '美式咖啡 (凍)', price: 6 }, { id: 'cd6h', name_zh: '鮮奶咖啡 (熱)', price: 8 },
        { id: 'cd6c', name_zh: '鮮奶咖啡 (凍)', price: 8 }, { id: 'cd7h', name_zh: '朱古力咖啡 (熱)', price: 8 },
        { id: 'cd7c', name_zh: '朱古力咖啡 (凍)', price: 8 }, { id: 'cd8h', name_zh: '朱古力 (熱)', price: 8 },
        { id: 'cd8c', name_zh: '朱古力 (凍)', price: 8 }, { id: 'cd9', name_zh: '燕麥牛油果沙冰', price: 18 },
        { id: 'cd10', name_zh: '雙重阿華田沙冰', price: 20 },
    ],
};

let tableNo = 0;
let currentCat = 'beef';
let menuItems = [];
let mods = { addon: [], sauce: [], combo_snack: [], combo_drink: [] };
let comboBase = 19;
let cart = [];
let sending = false;
let cfgItem = null;
let cfg = {};
let cfgEditIndex = -1;

function parseTableNo() {
    const path = (location.pathname || '').replace(/\/+$/, '');
    const fromPath = path.match(/^\/t\/(\d+)$/);
    const n = fromPath ? Number(fromPath[1]) : Number(new URLSearchParams(location.search).get('table') || 0);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function itemImg(item) {
    return (item && (item.img || item.image_url)) || '';
}

function cloudinaryUrl(url, width) {
    if (!url || typeof url !== 'string') return '';
    const marker = '/image/upload/';
    const idx = url.indexOf(marker);
    if (idx === -1) return url;
    const prefix = url.slice(0, idx + marker.length);
    const parts = url.slice(idx + marker.length).split('/');
    let assetStart = 0;
    while (assetStart < parts.length - 1 && !/^v\d+$/.test(parts[assetStart])) assetStart += 1;
    const assetPath = parts.slice(assetStart).join('/');
    const w = Number(width);
    const tx = Number.isFinite(w) && w > 0 ? `c_limit,w_${Math.round(w)}/f_auto/q_auto` : 'f_auto/q_auto';
    return `${prefix}${tx}/${assetPath}`;
}

function thumbHtml(item) {
    const url = itemImg(item);
    if (!url) {
        return `<div class="pos-thumb flex items-center justify-center text-[10px] font-black text-yellow-400">MB</div>`;
    }
    const src = cloudinaryUrl(url, 480);
    return `<div class="pos-thumb"><img src="${src}" alt="" loading="lazy" decoding="async"></div>`;
}

function sizesOf(item) {
    if (Array.isArray(item && item.sizes) && item.sizes.length) return item.sizes;
    return ({
        s1: [{ label: 'M', upcharge: 0 }, { label: 'L', upcharge: 8 }],
        s2: [{ label: 'M', upcharge: 0 }, { label: 'L', upcharge: 8 }],
        s5: [{ label: 'M', upcharge: 0 }, { label: 'L', upcharge: 13 }],
        s3: [{ label: '3pcs', upcharge: 0 }, { label: '5pcs', upcharge: 13 }],
    })[item && item.id] || [];
}

function sizeChipLabel(s) {
    const label = s.label || s.value;
    const zh = label === 'M' ? '中' : (label === 'L' ? '大' : label);
    return zh + (s.upcharge ? ' +$' + s.upcharge : '');
}

function sizeUpcharge(item, size) {
    if (!size) return 0;
    const sz = sizesOf(item).find((s) => (s.label || s.value) === size);
    return Number(sz && sz.upcharge) || 0;
}

function isBurger(item) { return ['beef', 'others', 'veggie'].includes(item && item.category); }
function isSpicy(item) { return Array.isArray(item && item.dietary) && item.dietary.some((d) => String(d).includes('🌶')); }
function itemNeedsTemp(item) {
    if (!item) return false;
    if (item.has_temp || item.hasTemp) return true;
    return ['d5', 'd6', 'd7', 'd8'].includes(item.id);
}
function modsOf(kind) { return mods[kind] && mods[kind].length ? mods[kind] : FALLBACK[kind]; }
function findMod(kind, id) { return modsOf(kind).find((m) => m.id === id); }
function isSold(item) { return !!(item && item.is_sold_out); }
function catalogItem(id) { return menuItems.find((i) => i && i.id === id) || null; }

function unitOf(line) {
    const direct = Number(line && line.unit);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const item = catalogItem(line && line.menuId);
    const price = Number(item && item.price);
    return Number.isFinite(price) && price > 0 ? price : 0;
}

function linePrice(line) {
    let n = unitOf(line);
    if (line.size) n += sizeUpcharge(catalogItem(line.menuId) || { id: line.menuId }, line.size);
    for (const id of line.addonIds || []) n += Number((findMod('addon', id) || {}).price) || 0;
    for (const id of line.sauceIds || []) n += Number((findMod('sauce', id) || {}).price) || 0;
    if (line.comboSnackId && line.comboDrinkId) {
        n += comboBase;
        n += Number((findMod('combo_snack', line.comboSnackId) || {}).price) || 0;
        n += Number((findMod('combo_drink', line.comboDrinkId) || {}).price) || 0;
    }
    return n * (line.qty || 1);
}

function cartTotal() {
    return cart.map(linePrice).reduce((a, b) => a + b, 0);
}

async function api(payload) {
    const res = await fetch('/api/kpay-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
}

function renderCats() {
    document.getElementById('cat-tabs').innerHTML = CATS.map((c) =>
        `<button type="button" class="chip-btn shrink-0 ${currentCat === c.id ? 'is-active' : ''}" onclick="setCat('${c.id}')">${c.label}</button>`
    ).join('');
}

function setCat(id) {
    currentCat = id;
    renderCats();
    renderMenu();
}

function renderMenu() {
    const rows = menuItems.filter((i) => (i.category || '') === currentCat);
    const grid = document.getElementById('menu-grid');
    if (!rows.length) {
        grid.innerHTML = '<p class="col-span-2 text-center font-bold text-neutral-500 py-10">呢類暫時冇嘢</p>';
        return;
    }
    grid.innerHTML = rows.map((item) => {
        const sold = isSold(item);
        return `<button type="button" class="item-btn ${sold ? 'opacity-40' : ''}" ${sold ? 'disabled' : ''} onclick="openCfg('${escapeHtml(item.id)}')">
            ${thumbHtml(item)}
            <div class="font-black leading-tight text-sm">${escapeHtml(item.name_zh || item.name_en || item.id)}</div>
            <div class="text-sm font-bold text-neutral-400 mt-0.5">$${Number(item.price) || 0}${sold ? ' · 賣晒' : ''}</div>
        </button>`;
    }).join('');
}

function openCfg(id, editIndex) {
    const item = menuItems.find((i) => i.id === id);
    if (!item || (isSold(item) && editIndex == null)) return;
    cfgItem = item;
    cfgEditIndex = editIndex == null ? -1 : editIndex;
    const existing = cfgEditIndex >= 0 ? cart[cfgEditIndex] : null;
    const sz = sizesOf(item);
    cfg = {
        size: existing ? existing.size : (sz.length ? (sz[0].label || sz[0].value) : null),
        bun: existing ? (String(existing.detailsEn || '').includes('Lettuce') ? 'Lettuce Wrap' : (isBurger(item) ? 'Nissin Bun' : null)) : (isBurger(item) ? 'Nissin Bun' : null),
        spice: existing && String(existing.detailsEn || '').includes('Mild') ? 'Mild' : (isSpicy(item) ? 'Normal' : null),
        temp: existing && String(existing.detailsEn || '').includes('Iced') ? 'Iced' : (itemNeedsTemp(item) ? 'Hot' : null),
        addonIds: existing && Array.isArray(existing.addonIds) ? existing.addonIds.slice() : [],
        sauceIds: existing && Array.isArray(existing.sauceIds) ? existing.sauceIds.slice() : [],
        combo: !!(existing && existing.comboSnackId),
        comboSnackId: (existing && existing.comboSnackId) || null,
        comboDrinkId: (existing && existing.comboDrinkId) || null,
        qty: existing ? existing.qty : 1,
    };
    if (existing && existing.detailsZh && existing.detailsZh.includes('生菜包')) cfg.bun = 'Lettuce Wrap';
    document.getElementById('cfg-title').textContent = item.name_zh || item.name_en;
    const imgWrap = document.getElementById('cfg-img-wrap');
    if (itemImg(item)) {
        imgWrap.classList.remove('hidden');
        imgWrap.innerHTML = `<img src="${cloudinaryUrl(itemImg(item), 640)}" alt="">`;
    } else {
        imgWrap.classList.add('hidden');
        imgWrap.innerHTML = '';
    }
    renderCfg();
    document.getElementById('cfg-sheet').classList.add('is-open');
}

function closeCfg() {
    document.getElementById('cfg-sheet').classList.remove('is-open');
    cfgItem = null;
    cfgEditIndex = -1;
}

function chipRow(title, html) {
    return `<div><div class="text-[11px] font-black text-neutral-500 mb-1">${title}</div><div class="flex flex-wrap gap-1">${html}</div></div>`;
}
function optChip(on, label, fn) {
    return `<button type="button" class="chip-btn ${on ? 'is-active' : ''}" onclick="${fn}">${escapeHtml(label)}</button>`;
}

function renderCfg() {
    if (!cfgItem) return;
    const item = cfgItem;
    const bits = [];
    bits.push(chipRow('數量', optChip(false, '−', 'cfg.qty=Math.max(1,(cfg.qty||1)-1);renderCfg()') + `<span class="font-black px-3 py-2">${cfg.qty || 1}</span>` + optChip(false, '+', 'cfg.qty=(cfg.qty||1)+1;renderCfg()')));
    const sz = sizesOf(item);
    if (sz.length) {
        bits.push(chipRow('份量', sz.map((s) => {
            const label = s.label || s.value;
            return optChip(cfg.size === label, sizeChipLabel(s), `setCfg('size', '${escapeHtml(label)}')`);
        }).join('')));
    }
    if (isBurger(item)) {
        bits.push(chipRow('包', optChip(cfg.bun === 'Nissin Bun', '日清麵包', "setCfg('bun','Nissin Bun')") + optChip(cfg.bun === 'Lettuce Wrap', '生菜包', "setCfg('bun','Lettuce Wrap')")));
    }
    if (isSpicy(item)) {
        bits.push(chipRow('辣度', optChip(cfg.spice === 'Normal', '正常', "setCfg('spice','Normal')") + optChip(cfg.spice === 'Mild', '小辣', "setCfg('spice','Mild')")));
    }
    if (itemNeedsTemp(item)) {
        bits.push(chipRow('溫度', optChip(cfg.temp === 'Hot', '熱', "setCfg('temp','Hot')") + optChip(cfg.temp === 'Iced', '凍', "setCfg('temp','Iced')")));
    }
    if (isBurger(item)) {
        bits.push(chipRow('加料', modsOf('addon').map((a) => optChip(cfg.addonIds.includes(a.id), `${a.name_zh || a.name_en} +$${a.price}`, `toggleCfg('addonIds','${a.id}')`)).join('')));
        bits.push(chipRow('加醬', modsOf('sauce').map((a) => optChip(cfg.sauceIds.includes(a.id), `${a.name_zh || a.name_en} +$${a.price}`, `toggleCfg('sauceIds','${a.id}')`)).join('')));
        bits.push(chipRow('套餐 +$' + comboBase, optChip(!cfg.combo, '單點', "setCfg('combo', false)") + optChip(cfg.combo, '套餐', "setCfg('combo', true)")));
        if (cfg.combo) {
            bits.push(chipRow('套餐小食', modsOf('combo_snack').map((m) =>
                optChip(cfg.comboSnackId === m.id, `${m.name_zh || m.name_en} +$${m.price}`, `setCfg('comboSnackId','${m.id}')`)
            ).join('')));
            bits.push(chipRow('套餐飲品', modsOf('combo_drink').map((m) =>
                optChip(cfg.comboDrinkId === m.id, `${m.name_zh || m.name_en} +$${m.price}`, `setCfg('comboDrinkId','${m.id}')`)
            ).join('')));
            if (!cfg.comboSnackId || !cfg.comboDrinkId) {
                bits.push('<p class="text-sm font-bold text-red-300">套餐請揀小食同飲品。</p>');
            }
        }
    }
    document.getElementById('cfg-body').innerHTML = bits.join('');
    const preview = buildLineFromCfg();
    document.getElementById('cfg-price').textContent = '$' + linePrice(preview);
    const addBtn = document.getElementById('cfg-add');
    const comboNeed = isBurger(item) && cfg.combo && (!cfg.comboSnackId || !cfg.comboDrinkId);
    addBtn.disabled = comboNeed;
    addBtn.textContent = comboNeed
        ? '請揀套餐小食同飲品'
        : ((cfgEditIndex >= 0 ? '更新　$' : '加入　$') + linePrice(preview));
}

function setCfg(key, value) {
    cfg[key] = value;
    if (key === 'combo' && value === false) {
        cfg.comboSnackId = null;
        cfg.comboDrinkId = null;
    }
    renderCfg();
}

function toggleCfg(key, id) {
    const arr = cfg[key].slice();
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
    cfg[key] = arr;
    renderCfg();
}

function buildLineFromCfg() {
    const item = cfgItem;
    const detailsZh = [];
    const detailsEn = [];
    if (cfg.size) {
        const zh = cfg.size === 'M' ? '中' : (cfg.size === 'L' ? '大' : cfg.size);
        detailsZh.push('份量: ' + zh);
        detailsEn.push('Size: ' + cfg.size);
    }
    if (cfg.bun) {
        detailsZh.push(cfg.bun === 'Nissin Bun' ? '日清麵包' : '生菜包');
        detailsEn.push(cfg.bun);
    }
    if (cfg.spice) {
        detailsZh.push('辣度: ' + (cfg.spice === 'Mild' ? '小辣' : '正常'));
        detailsEn.push('Spice: ' + cfg.spice);
    }
    if (cfg.temp) {
        detailsZh.push(cfg.temp === 'Iced' ? '凍' : '熱');
        detailsEn.push(cfg.temp);
    }
    for (const id of cfg.addonIds) {
        const m = findMod('addon', id);
        if (m) { detailsZh.push(m.name_zh || m.name_en); detailsEn.push(m.name_en || m.name_zh); }
    }
    for (const id of cfg.sauceIds) {
        const m = findMod('sauce', id);
        if (m) { detailsZh.push(m.name_zh || m.name_en); detailsEn.push(m.name_en || m.name_zh); }
    }
    let comboSnackId = null;
    let comboDrinkId = null;
    if (cfg.combo) {
        comboSnackId = cfg.comboSnackId;
        comboDrinkId = cfg.comboDrinkId;
        const s = findMod('combo_snack', comboSnackId);
        const d = findMod('combo_drink', comboDrinkId);
        detailsZh.push(`套餐 [${(s && s.name_zh) || ''}, ${(d && d.name_zh) || ''}]`);
        detailsEn.push(`Combo [${(s && s.name_en) || ''}, ${(d && d.name_en) || ''}]`);
    }
    return {
        menuId: item.id,
        nameEn: item.name_en,
        nameZh: item.name_zh,
        size: cfg.size,
        qty: Math.max(1, Number(cfg.qty) || 1),
        addonIds: cfg.addonIds.slice(),
        sauceIds: cfg.sauceIds.slice(),
        comboSnackId,
        comboDrinkId,
        detailsEn: detailsEn.join(' • '),
        detailsZh: detailsZh.join(' • '),
        unit: Number(item.price) || 0,
    };
}

function confirmCfg() {
    if (!cfgItem) return;
    if (sizesOf(cfgItem).length && !cfg.size) return alert('請揀份量');
    if (itemNeedsTemp(cfgItem) && !cfg.temp) return alert('請揀熱定凍');
    if (isBurger(cfgItem) && cfg.combo && (!cfg.comboSnackId || !cfg.comboDrinkId)) {
        return alert('套餐請揀小食同飲品。');
    }
    const line = buildLineFromCfg();
    if (cfgEditIndex >= 0) cart[cfgEditIndex] = line;
    else cart.push(line);
    closeCfg();
    renderCart();
}

function changeQty(i, delta) {
    cart[i].qty += delta;
    if (cart[i].qty <= 0) cart.splice(i, 1);
    renderCart();
}

function removeLine(i) {
    cart.splice(i, 1);
    renderCart();
}

function renderCart() {
    const list = document.getElementById('cart-list');
    const total = cartTotal();
    const count = cart.reduce((n, l) => n + (l.qty || 1), 0);
    document.getElementById('cart-bar-btn').textContent = count
        ? `購物車 ${count} 項 · $${total}`
        : '購物車 $0';
    document.getElementById('price-break').textContent = `小計 $${total} · 堂食冇外賣折扣`;
    document.getElementById('cart-total').textContent = '$' + total;
    if (!cart.length) {
        list.innerHTML = '<p class="text-neutral-500 font-bold py-8 text-center">撳上面加餸</p>';
        return;
    }
    list.innerHTML = cart.map((line, i) => `
        <div class="rounded-xl bg-neutral-900 border border-neutral-800 p-2">
            <div class="flex items-start justify-between gap-2">
                <button type="button" class="min-w-0 text-left" onclick="openCfg('${escapeHtml(line.menuId)}', ${i})">
                    <div class="font-black">${escapeHtml(line.nameZh || line.nameEn)}</div>
                    <div class="text-[11px] font-bold text-neutral-500">${escapeHtml(line.detailsZh || '')}</div>
                    <div class="text-[11px] font-black text-yellow-400 mt-0.5">$${linePrice(line)} · 撳改</div>
                </button>
                <div class="flex items-center gap-1 shrink-0">
                    <button type="button" class="chip-btn px-2" onclick="changeQty(${i}, -1)">−</button>
                    <span class="font-black w-5 text-center">${line.qty}</span>
                    <button type="button" class="chip-btn px-2" onclick="changeQty(${i}, 1)">+</button>
                    <button type="button" class="chip-btn px-2 text-red-300" onclick="removeLine(${i})">刪</button>
                </div>
            </div>
        </div>`).join('');
}

function openCart() {
    renderCart();
    document.getElementById('cart-sheet').classList.add('is-open');
}
function closeCart() {
    document.getElementById('cart-sheet').classList.remove('is-open');
}

async function sendOrder() {
    if (sending) return;
    if (!cart.length) return alert('未揀餸');
    const name = document.getElementById('guest-name').value.trim();
    if (!name) return alert('請寫你的名字');
    sending = true;
    const btn = document.getElementById('send-btn');
    btn.disabled = true;
    btn.textContent = '送到廚房中…';
    try {
        const items = cart.map((line) => ({
            menuId: line.menuId,
            nameEn: line.nameEn,
            nameZh: line.nameZh,
            size: line.size || null,
            qty: line.qty,
            addonIds: line.addonIds || [],
            sauceIds: line.sauceIds || [],
            comboSnackId: line.comboSnackId || null,
            comboDrinkId: line.comboDrinkId || null,
            detailsEn: line.detailsEn,
            detailsZh: line.detailsZh,
        }));
        const data = await api({
            action: 'create_table',
            store_name: STORE,
            customer_name: name,
            items,
            table: tableNo,
        });
        cart = [];
        document.getElementById('guest-name').value = '';
        renderCart();
        closeCart();
        document.getElementById('ticket-no').textContent = '#' + (data.orderNo || '');
        document.getElementById('ticket-meta').textContent = `${tableNo}號枱 · $${data.total || 0}`;
        document.getElementById('done-sheet').classList.add('is-open');
    } catch (err) {
        alert(err.message || '送單失敗');
    } finally {
        sending = false;
        btn.disabled = false;
        btn.textContent = '送到廚房';
    }
}

function closeDone() {
    document.getElementById('done-sheet').classList.remove('is-open');
}

async function boot() {
    tableNo = parseTableNo();
    if (!tableNo) {
        document.getElementById('bad-table').classList.remove('hidden');
        return;
    }
    document.getElementById('table-title').textContent = tableNo + '號枱';
    try {
        const data = await api({ action: 'public_menu', store_name: STORE });
        menuItems = data.items || [];
        const grouped = { addon: [], sauce: [], combo_snack: [], combo_drink: [] };
        for (const m of data.modifiers || []) {
            if (grouped[m.kind]) grouped[m.kind].push(m);
        }
        mods = grouped;
        if (Number.isFinite(Number(data.combo_base))) comboBase = Number(data.combo_base);
        if (data.is_open === false) document.getElementById('closed-lock').classList.remove('hidden');
    } catch (err) {
        document.getElementById('menu-grid').innerHTML =
            `<p class="col-span-2 text-center font-bold text-red-400 py-10">載入菜單失敗：${escapeHtml(err.message || err)}</p>`;
        return;
    }
    renderCats();
    renderMenu();
    renderCart();
}

boot();
