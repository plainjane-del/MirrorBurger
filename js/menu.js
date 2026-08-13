// js/menu.js

// --- 1. SUPABASE & SERVER 設定 ---
const SB_URL = 'https://olmoingcxkgdrqezweuf.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbW9pbmdjeGtnZHJxZXp3ZXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwOTA4MTMsImV4cCI6MjA5NDY2NjgxM30.FHH8doicN8j1OKtt10BL9LS5Ta5dhLn5mSCF_cQ_pNw';
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbym1vHsZ3ggBc-FPxQ7CZLP7SaNkhR1arGoqhKOMJFmJ6Ix-PX-9kyM1QA_nkZztZMmvw/exec';

const supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);

// --- 2. GLOBAL STATE & CONFIG ---
let currentLang = 'en';
let cart = [];
let deliveryMode = 'pickup';
let activeItem = null;
let currentCategory = 'beef';
let flowSelectedStore = '';

const lang = (en, zh) => currentLang === 'en' ? en : zh;

// --- 3. DATA DICTIONARY ---
let menuData = {
    beef: [
        { id: 'b1', nameEn: 'Classic Beef', nameZh: '經典芝士牛肉', price: 65, desc: 'Lava-grilled 4oz Angus & Wagyu beef & red wine onion jam', descZh: '火山石燒 4oz 澳洲安斯及和牛、紅酒洋蔥醬', img: 'https://res.cloudinary.com/dxtmqjdxh/image/upload/f_auto,q_auto/v1777545605/classic_beef_b5lcwl.png', tag: '🔥 Best Seller', tagZh: '🔥 人氣必點', isSoldOut: false },
        { id: 'b3', nameEn: 'Hottest Beef', nameZh: '墨辣芝士牛肉', price: 68, desc: 'Double jalapenos: smoked and pickled. Spicy!', descZh: '雙重墨西哥辣椒：煙燻及醃製。辣！', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777801224/hottest_beef2_flpfqk.jpg', dietary: ['🌶️'], isSoldOut: false },
        { id: 'b4', nameEn: 'Hottest Blue Cheese', nameZh: '墨辣藍紋芝士牛肉', price: 82, desc: 'For true blue cheese lovers. Mouth-watering.', descZh: '藍芝士愛好者必選。惹味濃郁。', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777801226/IMG_1624_ljwuo6.png', dietary: ['🌶️'], tag: '👨‍🍳 Chef\'s Pick', tagZh: '👨‍🍳 主廚推薦', isSoldOut: false },
        { id: 'b2', nameEn: '3.2.1', nameZh: '3.2.1', price: 99, desc: 'Double patty, bacon, triple cheese. Extreme flavor.', descZh: '雙層漢堡扒、煙肉、三重芝士。極致滋味。', img: 'https://res.cloudinary.com/dxtmqjdxh/image/upload/f_auto,q_auto/321_2_spjsm1', tag: '🔥 Best Seller', tagZh: '🔥 人氣必點', isSoldOut: false }
    ],
    others: [
        { id: 'v2', nameEn: 'Smoked Salmon & Egg', nameZh: '煙三文魚煎蛋', price: 60, desc: 'Healthy avo & fried egg combo.', descZh: '健康牛油果與煎蛋的完美配搭。', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777825358/unnamed_zsvj4k.jpg', isSoldOut: false },
        { id: 'c1', nameEn: 'Buffalo Chicken', nameZh: '水牛城脆雞', price: 69, desc: 'House-blend buffalo sauce, marinated thigh, cucumber', descZh: '自家調配水牛城辣醬、醃製雞大腿、青瓜', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777826197/unnamed_1_rs1od0.jpg', dietary: ['🌶️'], isSoldOut: false },
        { id: 'c2', nameEn: 'Soft Shell Crab', nameZh: '脆炸軟殼蟹', price: 99, desc: 'Crispy whole crab with secret tartar sauce', descZh: '原隻香脆軟殼蟹配秘製他他醬', img: 'https://res.cloudinary.com/dxtmqjdxh/image/upload/f_auto,q_auto/v1777545604/soft_shell_crab_dsrxqx.jpg', isSoldOut: false }
    ],
    veggie: [
        { id: 'v1', nameEn: 'Mushroom Schnitzel', nameZh: '燕麥吉列大啡菇', price: 58, desc: 'Vegetarian chicken-style schnitzel. Soft and crispy.', descZh: '素食炸雞排，外脆內軟。', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777829653/unnamed_3_ij0fbk.jpg', dietary: ['🌱'], isSoldOut: false },
        { id: 'v3', nameEn: 'Housemade Veggie', nameZh: '自家製素肉', price: 61, desc: 'Sweet potatoes, oats, kidney beans & chickpeas', descZh: '番薯、燕麥、腰豆及鷹嘴豆自家製成', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777801226/mushroom_vdx1m3.jpg', dietary: ['🌱'], isSoldOut: false },
        { id: 'v4', nameEn: 'Hottest Veggie', nameZh: '墨辣素', price: 65, desc: 'Double jalapenos: smoked and pickled. Spicy plant-based joy!', descZh: '雙重墨西哥辣椒：煙燻及醃製。惹味植物肉！', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777801210/hot_veggie_qtszvh.jpg', dietary: ['🌱', '🌶️'], isSoldOut: false }
    ],
    snacks: [
        { id: 's1', nameEn: 'Crispy Fries M/L', nameZh: '脆炸薯條 M/L', price: 15, sizes: [{label: 'M', labelZh: 'M', upcharge: 0}, {label: 'L', labelZh: 'L', upcharge: 8}], isSide: true, dietary: ['🌱'], desc: 'A customer complained he cracked his teeth by having just one!', descZh: '脆到連客客人都投訴話差啲咬崩牙！', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778137380/2a85989b-f02f-47df-82c7-df7af2fd84bf_b84fak.jpg', isSoldOut: false },
        { id: 's2', nameEn: 'Renkon Chips M/L', nameZh: '蓮藕脆片 M/L', price: 15, sizes: [{label: 'M', labelZh: 'M', upcharge: 0}, {label: 'L', labelZh: 'L', upcharge: 8}], isSide: true, dietary: ['🌱'], desc: 'For those who wanna be different.', descZh: '專為追求獨特口味嘅你而設。', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778137520/PHOTO-2026-05-07-14-56-58_intdw2.jpg', isSoldOut: false },
        { id: 's5', nameEn: 'Sweet Potato M/L', nameZh: '炸番薯條 M/L', price: 26, sizes: [{label: 'M', labelZh: 'M', upcharge: 0}, {label: 'L', labelZh: 'L', upcharge: 13}], isSide: true, dietary: ['🌱'], tag: '👨‍🍳 Chef\'s Pick', tagZh: '👨‍🍳 主廚推薦', desc: 'I have never had such a genuine taste of it in my life.', descZh: '我人生中未試過咁純粹嘅番薯鮮甜。', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778137381/b766620c-1db8-434d-b929-066dcf0cc46b_wjghea.jpg', isSoldOut: false },
        { id: 's3', nameEn: 'Smoky Wings 3pcs/5pcs', nameZh: '煙燻雞翼 3件/5件', price: 26, sizes: [{label: '3pcs', labelZh: '3件', upcharge: 0}, {label: '5pcs', labelZh: '5件', upcharge: 13}], isSide: true, desc: 'If you don\'t smoke, don\'t choose (kidding).', descZh: '煙燻味極濃，非煙民慎點！(講笑)', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778137380/3e099907-efa3-42d8-a2e5-0d92ab7e27a8_ug23hi.jpg', isSoldOut: false },
        { id: 's7', nameEn: 'Buffalo Wings 5pcs', nameZh: '水牛城雞翼 5件', price: 50, isSide: true, dietary: ['🌶️'], desc: 'Just lose your shit!', descZh: '惹味到令人失去理智！', img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778137380/ae707be9-605e-418a-bea8-25b7a79d441f_gtxou9.jpg', isSoldOut: false }
    ],
    drinks: [
        { id: 'd1', nameEn: 'Coke', nameZh: '可口可樂', price: 13, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138704/Coke_wba2do.jpg', isSoldOut: false },
        { id: 'd1a', nameEn: 'Coke No Sugar', nameZh: '零系可口可樂', price: 13, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138703/coke_zero_jdjubx.jpg', dietary: ['🚫🍬'], isSoldOut: false },
        { id: 'd2', nameEn: 'Cream Soda', nameZh: '忌廉哥冰', price: 13, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138716/SCHWEPPES-Cream-Soda-Hong-Kong-24-X-330mL-600x600_jiecdy.jpg', isSoldOut: false },
        { id: 'd3', nameEn: 'Soda Water', nameZh: '梳打水', price: 15, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138715/170200178-1-schweppes-soda-water-330ml_tyvsww.jpg', dietary: ['🚫🍬'], isSoldOut: false },
        { id: 'd4', nameEn: 'Cinnamon Iced Lemon Tea', nameZh: '肉桂凍檸茶', price: 22, isSoldOut: false },
        { id: 'd5', nameEn: 'Americano', nameZh: '美式咖啡', price: 22, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1777801201/americano_fqaszt.png', hasTemp: true, isSoldOut: false },
        { id: 'd6', nameEn: 'Latte', nameZh: '鮮奶咖啡', price: 25, hasTemp: true, isSoldOut: false },
        { id: 'd7', nameEn: 'Mocha', nameZh: '朱古力咖啡', price: 25, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138479/mocha_niop9r.png', hasTemp: true, isSoldOut: false },
        { id: 'd8', nameEn: 'Chocolate', nameZh: '朱古力', price: 25, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138479/mocha_niop9r.png', hasTemp: true, isSoldOut: false },
        { id: 'd9', nameEn: 'Avocado Smoothie with Oat', nameZh: '燕麥牛油果沙冰', price: 37, isSoldOut: false },
        { id: 'd10', nameEn: 'Double Ovaltine Smoothie', nameZh: '雙重阿華田沙冰', price: 40, isSoldOut: false }
    ],
    sauces: [
        { id: 'ss1', nameEn: 'Caramelized Garlic', nameZh: '焦糖蒜蓉醬', price: 6, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138619/garlic-mayonnaise_kg8fez.jpg', isSoldOut: false },
        { id: 'ss2', nameEn: 'Smoked Jalapeño', nameZh: '煙燻墨西哥辣椒醬', price: 8, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138635/Copy_of_jalapeno_sauce_mfd8qv.jpg', isSoldOut: false },
        { id: 'ss3', nameEn: 'Buffalo Sauce', nameZh: '水牛城辣醬', price: 8, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138636/vegan-buffalo-sauce-6-737x1024_vnpb7z.jpg', isSoldOut: false },
        { id: 'ss4', nameEn: 'Tartar Sauce', nameZh: '秘製他他醬', price: 8, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138636/tartar-sauce-1500-6-square_i8owfz.jpg', isSoldOut: false },
        { id: 'ss5', nameEn: 'Blue Cheese', nameZh: '藍紋芝士醬', price: 8, img: 'https://res.cloudinary.com/dnuhe2uwy/image/upload/v1778138636/blue_cheese_sauce_rewu7i.jpg', isSoldOut: false }
    ]
};

const addons = [
    { id: 'a1', nameEn: 'Housemade Pickles', nameZh: '自家製酸瓜', p: 4 },
    { id: 'a2', nameEn: 'Pickled Jalapeno', nameZh: '墨西哥酸辣辣椒', p: 4 },
    { id: 'a3', nameEn: 'American Cheese', nameZh: '美國芝士', p: 5 },
    { id: 'a4', nameEn: 'Fried Egg', nameZh: '煎蛋', p: 6 },
    { id: 'a5', nameEn: 'Bacon', nameZh: '煙肉', p: 12 },
    { id: 'a6', nameEn: 'Avocado Slices', nameZh: '牛油果片', p: 12 },
    { id: 'a7', nameEn: 'Danish Blue Cheese', nameZh: '丹麥藍芝士', p: 16 },
    { id: 'a8', nameEn: 'Mushroom Schnitzel', nameZh: '炸素雞排', p: 23 },
    { id: 'a9', nameEn: 'Angus Beef Patty', nameZh: '安格斯漢堡扒', p: 33 }
];

const sauces = [
    { id: 'sc1', nameEn: 'Caramelized Garlic', nameZh: '焦糖蒜蓉醬', p: 6 },
    { id: 'sc2', nameEn: 'Smoked Jalapeño', nameZh: '煙燻墨西哥辣椒醬', p: 8 },
    { id: 'sc3', nameEn: 'Buffalo Sauce', nameZh: '水牛城辣醬', p: 8 },
    { id: 'sc4', nameEn: 'Tartar Sauce', nameZh: '秘製他他醬', p: 8 },
    { id: 'sc5', nameEn: 'Blue Cheese', nameZh: '藍紋芝士醬', p: 8 }
];

const comboSnacks = [
    { id: 'cs1', nameEn: 'Crispy Fries (M)', nameZh: '脆炸薯條 (M)', p: 0 },
    { id: 'cs3', nameEn: 'Crispy Fries (L)', nameZh: '脆炸薯條 (L)', p: 4 },
    { id: 'cs2', nameEn: 'Renkon Chips (M)', nameZh: '蓮藕脆片 (M)', p: 0 },
    { id: 'cs4', nameEn: 'Renkon Chips (L)', nameZh: '蓮藕脆片 (L)', p: 4 },
    { id: 'cs5', nameEn: 'Sweet Potato (M)', nameZh: '炸番薯條 (M)', p: 6 },
    { id: 'cs6', nameEn: 'Sweet Potato (L)', nameZh: '炸番薯條 (L)', p: 11 },
    { id: 'cs7', nameEn: 'Smoky Wings (3pcs)', nameZh: '煙燻雞翼 (3件)', p: 6 }
];

const comboDrinks = [
    { id: 'cd1', nameEn: 'Coke', nameZh: '可口可樂', p: 0 },
    { id: 'cd1a', nameEn: 'Coke No Sugar', nameZh: '零系可口可樂', p: 0 },
    { id: 'cd2', nameEn: 'Cream Soda', nameZh: '忌廉哥冰', p: 0 },
    { id: 'cd3', nameEn: 'Soda Water', nameZh: '梳打水', p: 2 },
    { id: 'cd4', nameEn: 'Cinnamon Iced Lemon Tea', nameZh: '肉桂凍檸茶', p: 3 },
    { id: 'cd5h', nameEn: 'Americano (Hot)', nameZh: '美式咖啡 (熱)', p: 6 },
    { id: 'cd5c', nameEn: 'Americano (Iced)', nameZh: '美式咖啡 (凍)', p: 6 },
    { id: 'cd6h', nameEn: 'Latte (Hot)', nameZh: '鮮奶咖啡 (熱)', p: 8 },
    { id: 'cd6c', nameEn: 'Latte (Iced)', nameZh: '鮮奶咖啡 (凍)', p: 8 },
    { id: 'cd7h', nameEn: 'Mocha (Hot)', nameZh: '朱古力咖啡 (熱)', p: 8 },
    { id: 'cd7c', nameEn: 'Mocha (Iced)', nameZh: '朱古力咖啡 (凍)', p: 8 },
    { id: 'cd8h', nameEn: 'Chocolate (Hot)', nameZh: '朱古力 (熱)', p: 8 },
    { id: 'cd8c', nameEn: 'Chocolate (Iced)', nameZh: '朱古力 (凍)', p: 8 },
    { id: 'cd9', nameEn: 'Avocado Smoothie with Oat', nameZh: '燕麥牛油果沙冰', p: 18 },
    { id: 'cd10', nameEn: 'Double Ovaltine Smoothie', nameZh: '雙重阿華田沙冰', p: 20 }
];

const stores = [
    { name: 'Sai Ying Pun', nameZh: '西營盤', addr: 'G/F 194 Queen\'s Rd West', addrZh: '皇后大道西 194號地下', hrs: 'Every Day 11:15am – 12:00mn', hrsZh: '每天 11:15am – 12:00mn', lat: 22.286866, lng: 114.144379, mapLink: 'https://maps.app.goo.gl/MnNp3yi6eyedsFfM9', keeta: 'https://url.mykeeta.com/TXrih7Gz', panda: 'https://foodpanda.go.link/a8X5L' },
    { name: 'Fortress Hill', nameZh: '天后', addr: '1A Merlin St', addrZh: '麥連街 1A號', hrs: 'Sun-Thu 11:15am–9:30pm • Fri-Sat 11:15am–11:30pm', hrsZh: '日-四 11:15am–9:30pm • 五-六 11:15am–11:30pm', lat: 22.287105, lng: 114.192261, mapLink: 'https://maps.app.goo.gl/8944PrWNxNKrNXaZ9', keeta: 'https://url.mykeeta.com/ixe3ihSz', panda: 'https://foodpanda.go.link/kzqnZ' },
    { name: 'Tsuen Wan (Takeaway Only)', nameZh: '荃灣 (只限外賣自取)', addr: 'Flat 01, 13/F, Yue Fung Ind. Bldg', addrZh: '柴灣角街 35-45號裕豐工業大廈 13樓01室', hrs: '11:30am – 11:30pm', hrsZh: '11:30am – 11:30pm', lat: 22.373556, lng: 114.107284, mapLink: 'https://maps.app.goo.gl/6oxTsRNSUwmtibUx9', keeta: 'https://url.mykeeta.com/YNjywtYz', panda: 'https://foodpanda.go.link/1ML5Y', wa: true }
];

const storeOpenMap = {};
stores.forEach(s => { storeOpenMap[s.name] = true; });

function isStoreOpen(storeName) {
    return storeOpenMap[storeName] !== false;
}

// --- 4. 讀取 SUPABASE ---
async function fetchLiveMenu() {
    try {
        const { data, error } = await supabaseClient.from('menu_items').select('*');
        if (error) throw error;
        
        data.forEach(dbItem => {
            if(menuData[dbItem.category]) {
                const idx = menuData[dbItem.category].findIndex(i => i.id === dbItem.id);
                if(idx !== -1) {
                    menuData[dbItem.category][idx].price = dbItem.price;
                    menuData[dbItem.category][idx].nameEn = dbItem.name_en;
                    menuData[dbItem.category][idx].nameZh = dbItem.name_zh;
                    menuData[dbItem.category][idx].isSoldOut = dbItem.is_sold_out;
                }
            }
        });
        renderMenuByCategory(currentCategory);
    } catch (error) {
        console.error("Supabase Error:", error);
        renderMenuByCategory(currentCategory); 
    }
}

async function fetchStoreSettings() {
    try {
        const { data, error } = await supabaseClient
            .from('store_settings')
            .select('store_name, is_open');
        if (error) throw error;

        (data || []).forEach(row => {
            if (row.store_name) storeOpenMap[row.store_name] = !!row.is_open;
        });
        applyStoreOpenUI();
    } catch (err) {
        console.error('store_settings fetch failed', err);
    }
}

function startStoreSettingsRealtime() {
    supabaseClient
        .channel('store-settings-public')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'store_settings' },
            (payload) => {
                const row = payload.new;
                if (!row || !row.store_name) return;
                storeOpenMap[row.store_name] = !!row.is_open;
                applyStoreOpenUI();
            }
        )
        .subscribe();
}

const STORE_BTN_BASE = 'store-pick-btn w-full p-4 rounded-2xl flex flex-col items-center justify-center gap-1 transition-transform border-2';
const STORE_BTN_OPEN = 'bg-apple-bg text-black active:scale-95 border-gray-100 hover:border-black';
const STORE_BTN_CLOSED = 'opacity-50 cursor-not-allowed text-gray-400 border-gray-200 bg-apple-bg';

function updateStoreModalButtons() {
    document.querySelectorAll('.store-pick-btn[data-store]').forEach(btn => {
        const name = btn.dataset.store;
        const closed = !isStoreOpen(name);
        const tag = btn.querySelector('.store-closed-tag');

        btn.className = `${STORE_BTN_BASE} ${closed ? STORE_BTN_CLOSED : STORE_BTN_OPEN}`;
        btn.disabled = closed;
        btn.setAttribute('aria-disabled', closed ? 'true' : 'false');
        if (closed) {
            btn.removeAttribute('onclick');
            btn.onclick = null;
        } else {
            btn.setAttribute('onclick', `setFlowStore('${name.replace(/'/g, "\\'")}')`);
            btn.onclick = () => setFlowStore(name);
        }
        if (tag) tag.classList.toggle('hidden', !closed);
    });
}

function applyStoreOpenUI() {
    updateStoreModalButtons();
    populateStoresDropdown();

    if (flowSelectedStore && !isStoreOpen(flowSelectedStore)) {
        flowSelectedStore = '';
        updateCartStoreUI();
        updateCartUI();
        const step1 = document.getElementById('flow-step-1');
        const step2 = document.getElementById('flow-step-2');
        if (step1 && step2 && !step2.classList.contains('hidden')) {
            step1.classList.remove('hidden');
            step2.classList.add('hidden');
        }
    }
}

// --- 5. 核心邏輯與 UI 渲染 ---
function getActiveStore() {
    const select = document.getElementById('cust-store');
    if (select && select.value) return select.value;
    return flowSelectedStore;
}

function getDiscountRate() {
    return getActiveStore() === 'Tsuen Wan (Takeaway Only)' ? 0.15 : 0.10;
}

function isDiscountActive() {
    const store = getActiveStore();
    if (store === 'Tsuen Wan (Takeaway Only)' && deliveryMode === 'pickup') return true;
    let subtotal = cart.reduce((sum, item) => sum + item.price, 0);
    let hasCombo = cart.some(item => item.detailsEn && item.detailsEn.includes('Combo'));
    return deliveryMode === 'pickup' && (subtotal >= 120 || hasCombo);
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2-lat1) * (Math.PI/180);  
    const dLon = (lon2-lon1) * (Math.PI/180); 
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
}

function sanitizeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

function toggleLang() {
    currentLang = currentLang === 'en' ? 'zh' : 'en';
    document.body.classList.toggle('lang-en', currentLang === 'en');
    document.body.classList.toggle('lang-zh', currentLang === 'zh');
    document.getElementById('lang-btn').innerText = currentLang === 'en' ? '中文' : 'ENG';
    updatePlaceholders();
    populateStoresDropdown();
    generateTimeOptions();
    renderMenuByCategory(currentCategory);
    renderStores();
    updateCartStoreUI();
    updateCartUI();
    closeAllSheets();
}

function updatePlaceholders() {
    document.getElementById('cust-name').placeholder = lang('Your Name *', '你的名字 *');
    document.getElementById('cust-phone').placeholder = lang('Phone Number * (for WhatsApp notification)', '電話號碼 * (接收 WhatsApp 取餐通知)');
}

function showCustomAlert(msg) {
    document.getElementById('custom-alert-msg').innerText = msg;
    const modal = document.getElementById('custom-alert-modal');
    const content = document.getElementById('custom-alert-content');
    modal.classList.remove('hidden'); void modal.offsetWidth;
    modal.classList.remove('opacity-0'); content.classList.remove('scale-95');
}

function closeCustomAlert() {
    const modal = document.getElementById('custom-alert-modal');
    const content = document.getElementById('custom-alert-content');
    modal.classList.add('opacity-0'); content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function renderMenuByCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.category-tab').forEach(b => {
        const isBeef = cat === 'beef' && b.innerText.includes('Beef');
        const isOthers = cat === 'others' && b.innerText.includes('Others');
        const isVeggie = cat === 'veggie' && b.innerText.includes('Veggie');
        const isSnacks = cat === 'snacks' && b.innerText.includes('Snacks');
        const isDrinks = cat === 'drinks' && b.innerText.includes('Drinks');
        const isSauces = cat === 'sauces' && b.innerText.includes('Sauces');
        b.classList.toggle('active', isBeef || isOthers || isVeggie || isSnacks || isDrinks || isSauces);
    });
    const container = document.getElementById('menu-container');
    const discountActive = isDiscountActive();
    const rate = getDiscountRate();
    container.innerHTML = menuData[cat].map(item => {
        let displayPrice = '';
        if (item.sizes) {
            let p1 = item.price, p2 = item.price + item.sizes[1].upcharge;
            if (discountActive) { displayPrice = `<span class="text-gray-400 line-through text-[10px] mr-1 font-semibold">${p1} / ${p2}</span><span class="text-red-500">${p1 - Math.floor(p1*rate)} / ${p2 - Math.floor(p2*rate)}</span>`; } 
            else displayPrice = `${p1} / ${p2}`;
        } else {
            if (discountActive) displayPrice = `<span class="text-gray-400 line-through text-[10px] mr-1 font-semibold">${item.price}</span><span class="text-red-500">${item.price - Math.floor(item.price*rate)}</span>`;
            else displayPrice = `${item.price}`;
        }

        const soldOutOverlay = item.isSoldOut ? `<div class="absolute inset-0 bg-white/70 z-20 flex items-center justify-center backdrop-blur-[1px]"><span class="bg-black text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl transform -rotate-6 border border-gray-800">Sold Out</span></div>` : '';
        const clickAction = item.isSoldOut ? '' : `onclick="openConfig('${cat}', '${item.id}')"`;

        return `<div ${clickAction} class="relative bg-white rounded-3xl border border-gray-100 shadow-sm transition-transform cursor-pointer overflow-hidden flex flex-col ${item.isSoldOut ? 'opacity-80' : 'active:scale-95'}">
            ${soldOutOverlay}
            ${item.tag ? `<span class="absolute top-2 left-2 bg-burger-gold/90 backdrop-blur text-black text-[8px] font-black px-2 py-1 rounded-full shadow-sm uppercase tracking-widest border border-yellow-400 z-10"><span class="en">${item.tag}</span><span class="zh">${item.tagZh}</span></span>` : ''}
            <div class="relative w-full aspect-[4/3] bg-[#f8f9fa] flex items-center justify-center p-2 flex-shrink-0 overflow-hidden">${item.img ? `<img src="${item.img}" alt="${lang(item.nameEn, item.nameZh)}" loading="lazy" class="w-full h-full object-contain object-center mix-blend-multiply scale-[1.15]">` : '<div class="text-gray-300 font-bold tracking-widest text-[8px]">MIRROR</div>'}</div>
            <div class="p-3 flex-grow flex flex-col">
                <div class="flex justify-between items-start gap-1"><h3 class="text-[11px] font-black uppercase italic tracking-tight leading-tight line-clamp-2 pr-1.5 pb-0.5">${lang(item.nameEn, item.nameZh)}</h3></div>
                ${item.desc ? `<p class="text-[9px] text-gray-400 font-medium leading-tight line-clamp-2 mt-1">${lang(item.desc, item.descZh || item.desc)}</p>` : ''}
                <div class="mt-auto pt-3 flex justify-between items-end"><div class="text-xs font-black italic tracking-tight">${displayPrice}</div><div class="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-bold text-base leading-none shadow-md pb-0.5">+</div></div>
            </div>
        </div>`;
    }).join('');
}

function openConfig(cat, id) {
    const item = menuData[cat].find(i => i.id === id);
    activeItem = { ...item };
    document.getElementById('config-name').innerText = lang(item.nameEn, item.nameZh);
    document.getElementById('config-desc').innerText = lang(item.desc || "", item.descZh || "");
    document.getElementById('config-hero').src = item.img || '';
    
    const isBurger = ['beef', 'others', 'veggie'].includes(cat), isSnack = cat === 'snacks', hasSizes = !!item.sizes, isSpicy = item.dietary && item.dietary.some(d => d.includes('🌶️')), hasTemp = !!item.hasTemp;
    document.getElementById('size-section').classList.toggle('hidden', !hasSizes);
    document.getElementById('spice-section').classList.toggle('hidden', !isSpicy);
    document.getElementById('temp-section').classList.toggle('hidden', !hasTemp);
    document.getElementById('bun-section').classList.toggle('hidden', !isBurger);
    document.getElementById('addons-section').classList.toggle('hidden', !isBurger);
    document.getElementById('sauces-section').classList.toggle('hidden', !isSnack);
    document.getElementById('combo-section').classList.toggle('hidden', !isBurger);

    if (hasSizes) document.getElementById('size-list').innerHTML = item.sizes.map((sz, index) => `<label class="relative flex flex-col items-center p-4 border-2 rounded-3xl cursor-pointer bg-apple-bg border-transparent has-[:checked]:border-black"><input type="radio" name="opt-size" value="${sz.label}" data-zh="${sz.labelZh}" data-price="${sz.upcharge}" class="hidden" ${index === 0 ? 'checked' : ''} onchange="updateConfigPrice()"><span class="text-xs font-bold uppercase"><span class="en">${sz.label}</span><span class="zh">${sz.labelZh}</span> ${sz.upcharge > 0 ? '(+' + sz.upcharge + ')' : ''}</span></label>`).join('');
    document.getElementById('addons-list').innerHTML = addons.map(a => `<label class="flex items-center justify-between p-4 bg-apple-bg rounded-2xl cursor-pointer"><span class="text-xs font-bold uppercase tracking-tight">${lang(a.nameEn, a.nameZh)} (+${a.p})</span><input type="checkbox" name="addon" value="${a.id}" data-price="${a.p}" class="w-5 h-5 accent-black rounded" onchange="updateConfigPrice()"></label>`).join('');
    document.getElementById('sauces-list').innerHTML = sauces.map(s => `<label class="flex items-center justify-between p-4 bg-apple-bg rounded-2xl cursor-pointer"><span class="text-xs font-bold uppercase tracking-tight">${lang(s.nameEn, s.nameZh)} (+${s.p})</span><input type="checkbox" name="sauce" value="${s.id}" data-price="${s.p}" class="w-5 h-5 accent-black rounded" onchange="updateConfigPrice()"></label>`).join('');
    
    document.getElementById('combo-snack').innerHTML = comboSnacks.map(s => `<option value="${s.id}" data-price="${s.p}">${lang(s.nameEn, s.nameZh)} ${s.p > 0 ? '(+' + s.p + ')' : ''}</option>`).join('');
    document.getElementById('combo-drink').innerHTML = comboDrinks.map(d => `<option value="${d.id}" data-price="${d.p}">${lang(d.nameEn, d.nameZh)} ${d.p > 0 ? '(+' + d.p + ')' : ''}</option>`).join('');

    document.getElementById('opt-combo').checked = false;
    toggleComboDetails();
    updateConfigPrice();
    document.getElementById('config-scroll-area').scrollTop = 0;
    document.getElementById('sheet-overlay').classList.remove('hidden');
    setTimeout(() => { document.getElementById('sheet-overlay').classList.remove('opacity-0'); document.getElementById('config-sheet').classList.add('sheet-open'); }, 10);
}

function updateConfigPrice() {
    if (!activeItem) return;
    let total = activeItem.price;
    
    if (activeItem.sizes) {
        const selectedSize = document.querySelector('input[name="opt-size"]:checked');
        if (selectedSize) total += parseInt(selectedSize.dataset.price);
    }

    document.querySelectorAll('input[name="addon"]:checked').forEach(cb => total += parseInt(cb.dataset.price));
    document.querySelectorAll('input[name="sauce"]:checked').forEach(cb => total += parseInt(cb.dataset.price));
    
    const isCombo = document.getElementById('opt-combo') ? document.getElementById('opt-combo').checked : false;
    if (isCombo) {
        total += 19; 
        const snackSelect = document.getElementById('combo-snack');
        const drinkSelect = document.getElementById('combo-drink');
        if (snackSelect && drinkSelect) {
            const snackPrice = parseInt(snackSelect.options[snackSelect.selectedIndex]?.dataset?.price || 0);
            const drinkPrice = parseInt(drinkSelect.options[drinkSelect.selectedIndex]?.dataset?.price || 0);
            total += snackPrice + drinkPrice;
        }
    }

    let tempSubtotal = cart.reduce((sum, item) => sum + item.price, 0) + total;
    let tempHasCombo = cart.some(item => item.detailsEn && item.detailsEn.includes('Combo')) || isCombo;
    let willHaveDiscount = false;
    const store = getActiveStore();
    const rate = getDiscountRate();

    if (deliveryMode === 'pickup') {
        if (store === 'Tsuen Wan (Takeaway Only)') {
            willHaveDiscount = true;
        } else {
            willHaveDiscount = (tempSubtotal >= 120 || tempHasCombo);
        }
    }

    const btn = document.getElementById('config-total-btn');
    if (btn) {
        if (willHaveDiscount) {
            let discountAmt = Math.floor(total * rate);
            let finalPrice = total - discountAmt;
            btn.innerHTML = `<span class="text-white/60 line-through text-[10px] mr-2 font-medium">${total}</span>${finalPrice}`;
        } else {
            btn.innerHTML = `${total}`;
        }
    }
}

function addCurrentToBag() {
    const bunVal = document.querySelector('input[name="opt-bun"]:checked')?.value || 'Standard';
    const bunEn = bunVal, bunZh = (bunVal === 'Nissin Bun' ? '日清麵包' : '生菜包');
    let finalPrice = activeItem.price, detailsEn = [], detailsZh = [];
    
    if (activeItem.sizes) {
        const s = document.querySelector('input[name="opt-size"]:checked');
        finalPrice += parseInt(s.dataset.price);
        detailsEn.push(`Size: ${s.value}`); detailsZh.push(`份量: ${s.dataset.zh}`);
    }
    if (activeItem.dietary && activeItem.dietary.some(d => d.includes('🌶️'))) {
        const sp = document.querySelector('input[name="opt-spice"]:checked');
        detailsEn.push(`Spice: ${sp.value}`); detailsZh.push(`辣度: ${sp.dataset.zh}`);
    }
    if (activeItem.hasTemp) {
        const t = document.querySelector('input[name="opt-temp"]:checked');
        detailsEn.push(t.value); detailsZh.push(t.dataset.zh);
    }
    if (['beef', 'others', 'veggie'].includes(currentCategory)) { detailsEn.push(bunEn); detailsZh.push(bunZh); }
    document.querySelectorAll('input[name="addon"]:checked').forEach(cb => { const a = addons.find(x => x.id === cb.value); finalPrice += a.p; detailsEn.push(a.nameEn); detailsZh.push(a.nameZh); });
    document.querySelectorAll('input[name="sauce"]:checked').forEach(cb => { const s = sauces.find(x => x.id === cb.value); finalPrice += s.p; detailsEn.push(s.nameEn); detailsZh.push(s.nameZh); });
    
    if (document.getElementById('opt-combo').checked) {
        const sEl = document.getElementById('combo-snack'), dEl = document.getElementById('combo-drink');
        const s = comboSnacks.find(x => x.id === sEl.value), d = comboDrinks.find(x => x.id === dEl.value);
        finalPrice += 19 + parseInt(sEl.options[sEl.selectedIndex].dataset.price) + parseInt(dEl.options[dEl.selectedIndex].dataset.price);
        detailsEn.push(`Combo [${s.nameEn}, ${d.nameEn}]`); detailsZh.push(`套餐 [${s.nameZh}, ${d.nameZh}]`);
    }
    cart.push({ id: Date.now(), nameEn: activeItem.nameEn, nameZh: activeItem.nameZh, price: finalPrice, detailsEn: detailsEn.join(' • '), detailsZh: detailsZh.join(' • ') });
    updateCartUI(); closeAllSheets(); showAddedSuccessModal();
}

// --- ORDER FLOW MODALS ---
function showOrderFlow() {
    const modal = document.getElementById('order-flow-modal');
    const content = document.getElementById('order-flow-content');
    if (!modal || !content) return;
    updateStoreModalButtons();
    document.getElementById('flow-step-1').classList.remove('hidden');
    document.getElementById('flow-step-2').classList.add('hidden');
    modal.classList.remove('hidden'); void modal.offsetWidth; 
    modal.classList.remove('opacity-0'); content.classList.remove('scale-95');
}

function closeOrderFlow() {
    const modal = document.getElementById('order-flow-modal');
    const content = document.getElementById('order-flow-content');
    modal.classList.add('opacity-0'); content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function setFlowStore(storeName) {
    if (!isStoreOpen(storeName)) {
        showCustomAlert(lang('This store is closed today.', '此分店今日休息。'));
        return;
    }
    flowSelectedStore = storeName;
    const storeObj = stores.find(s => s.name === storeName);
    const storeZh = storeObj ? storeObj.nameZh : storeName;
    document.getElementById('flow-selected-store-label').innerText = lang(`From: ${storeName}`, `取餐分店: ${storeZh}`);
    
    const pickupBtnText = document.getElementById('pickup-btn-text');
    const pickupBtnDesc = document.getElementById('pickup-btn-desc');
    if (storeName === 'Tsuen Wan (Takeaway Only)') {
        pickupBtnText.innerHTML = `<span class="en">Pickup (15% OFF)</span><span class="zh">外賣自取 (85折)</span>`;
        pickupBtnDesc.innerHTML = `<span class="en">Tsuen Wan Special</span><span class="zh">荃灣限定優惠</span>`;
    } else {
        pickupBtnText.innerHTML = `<span class="en">Pickup</span><span class="zh">外賣自取</span>`;
        pickupBtnDesc.innerHTML = `<span class="en">Order via Website</span><span class="zh">經本網站直接落單</span>`;
    }

    const deliveryContainer = document.getElementById('delivery-options-container');
    if (deliveryContainer && storeObj) {
        deliveryContainer.innerHTML = ''; 
        if (storeObj.panda) {
            deliveryContainer.innerHTML += `
                <a href="${storeObj.panda}" target="_blank" onclick="closeOrderFlow()" class="w-full bg-[#D70F64] text-white p-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-sm border border-transparent">
                    <span class="text-sm font-black uppercase tracking-widest">🐼 Foodpanda</span>
                </a>`;
        }
        if (storeObj.keeta) {
            deliveryContainer.innerHTML += `
                <a href="${storeObj.keeta}" target="_blank" onclick="closeOrderFlow()" class="w-full bg-[#FFC20E] text-black p-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-sm border border-transparent">
                    <span class="text-sm font-black uppercase tracking-widest">🦅 KeeTa</span>
                </a>`;
        }
    }

    document.getElementById('flow-step-1').classList.add('hidden');
    document.getElementById('flow-step-2').classList.remove('hidden');
    updateCartUI(); 
}

function backToStep1() {
    document.getElementById('flow-step-1').classList.remove('hidden');
    document.getElementById('flow-step-2').classList.add('hidden');
}

function selectPickup() {
    closeOrderFlow(); updateCartStoreUI(); generateTimeOptions(); validateCheckout();
    document.getElementById('menu-section').scrollIntoView({behavior: 'smooth'});
}

function autoLocateStore() {
    const btn = document.getElementById('btn-locate');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="text-xs font-black uppercase tracking-widest animate-pulse">${lang('Locating...', '定位中...')}</span>`;
    
    if (!navigator.geolocation) {
        showCustomAlert(lang('Geolocation is not supported by your browser', '你的瀏覽器不支援定位功能'));
        btn.innerHTML = originalText; return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            let nearestStore = null; let minDistance = Infinity;

            stores.forEach(store => {
                if (!isStoreOpen(store.name)) return;
                const dist = getDistanceFromLatLonInKm(userLat, userLng, store.lat, store.lng);
                if (dist < minDistance) { minDistance = dist; nearestStore = store.name; }
            });

            if (nearestStore) {
                setFlowStore(nearestStore);
            } else {
                showCustomAlert(lang(
                    'No open stores nearby. Please try again later.',
                    '附近暫時沒有營業中的分店，請稍後再試。'
                ));
            }
            btn.innerHTML = originalText;
        },
        (error) => {
            showCustomAlert(lang('Could not get your location. Please select manually.', '無法獲取你的位置，請手動選擇。'));
            btn.innerHTML = originalText;
        }
    );
}

// --- UPSELL MODALS ---
function showAddedSuccessModal() {
    const modal = document.getElementById('added-success-modal');
    const content = document.getElementById('added-success-content');
    if (!modal || !content) return;
    renderUpsellBlock();
    modal.classList.remove('hidden'); void modal.offsetWidth;
    modal.classList.remove('opacity-0'); content.classList.remove('scale-95');
}

function renderUpsellBlock() {
    const upsellBlock = document.getElementById('upsell-block');
    if (!upsellBlock) return;
    const isBurger = ['beef', 'others', 'veggie'].includes(currentCategory);
    const isSnack = currentCategory === 'snacks';
    const lastItem = cart.length > 0 ? cart[cart.length - 1] : null;
    const store = getActiveStore();

    if (isBurger && lastItem && !lastItem.detailsEn.includes('Combo')) {
        let snackOptions = comboSnacks.map(s => `<option value="${s.id}" data-price="${s.p}">${lang(s.nameEn, s.nameZh)} ${s.p > 0 ? '(+' + s.p + ')' : ''}</option>`).join('');
        let drinkOptions = comboDrinks.map(d => `<option value="${d.id}" data-price="${d.p}">${lang(d.nameEn, d.nameZh)} ${d.p > 0 ? '(+' + d.p + ')' : ''}</option>`).join('');

        const promoTitleEn = 'Upgrade to Combo?'; const promoTitleZh = '升級至套餐？';
        const promoDescEn = store === 'Tsuen Wan (Takeaway Only)' ? 'Enjoy 15% OFF on everything!' : 'Add Snack & Drink for 10% OFF!';
        const promoDescZh = store === 'Tsuen Wan (Takeaway Only)' ? '全單即享 85折 優惠！' : '加配小食及飲品即享 9折！';

        upsellBlock.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="text-2xl">🥤</div>
                <div class="flex-grow">
                    <p class="text-[10px] font-black uppercase text-burger-gold"><span class="en">${promoTitleEn}</span><span class="zh">${promoTitleZh}</span></p>
                    <p class="text-[10px] font-bold text-gray-600"><span class="en">${promoDescEn}</span><span class="zh">${promoDescZh}</span></p>
                </div>
            </div>
            <div class="flex gap-2">
                <select id="upsell-combo-snack" aria-label="Select Combo Snack" class="w-1/2 bg-white p-3 rounded-xl text-[10px] font-bold border border-gray-200 outline-none" onchange="updateUpsellButton('combo')">${snackOptions}</select>
                <select id="upsell-combo-drink" aria-label="Select Combo Drink" class="w-1/2 bg-white p-3 rounded-xl text-[10px] font-bold border border-gray-200 outline-none" onchange="updateUpsellButton('combo')">${drinkOptions}</select>
            </div>
            <button id="upsell-btn" onclick="addUpsell('combo')" class="w-full bg-black text-white p-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform">
                ${lang('YES, UPGRADE', '好，立即升級')}
            </button>
        `;
        upsellBlock.classList.remove('hidden');
        updateUpsellButton('combo');

    } else if (isSnack) {
        let sauceOptions = sauces.map(s => { return `<option value="${s.id}" data-price="${s.p}">${lang(s.nameEn, s.nameZh)}</option>`; }).join('');

        upsellBlock.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="text-2xl">🥫</div>
                <div class="flex-grow">
                    <p class="text-[10px] font-black uppercase text-burger-gold">${lang('Need some sauce?', '需要加配醬汁嗎？')}</p>
                    <p class="text-[10px] font-bold text-gray-600">${lang('Perfect with your snacks!', '配搭小食的絕佳選擇！')}</p>
                </div>
            </div>
            <select id="upsell-select" aria-label="Select Extra Sauce" class="w-full bg-white p-3 rounded-xl text-xs font-bold border border-gray-200 outline-none" onchange="updateUpsellButton('sauce')">${sauceOptions}</select>
            <button id="upsell-btn" onclick="addUpsell('sauce')" class="w-full bg-black text-white p-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform">
                ${lang('YES, ADD TO BAG', '好，加入購物車')}
            </button>
        `;
        upsellBlock.classList.remove('hidden');
        updateUpsellButton('sauce');
    } else { upsellBlock.classList.add('hidden'); }
}

function updateUpsellButton(type) {
    let price = 0; let btnText = lang('YES, ADD TO BAG', '好，加入購物車');

    if (type === 'combo') {
        const snackSelect = document.getElementById('upsell-combo-snack');
        const drinkSelect = document.getElementById('upsell-combo-drink');
        if(!snackSelect || !drinkSelect) return;
        const sPrice = parseInt(snackSelect.options[snackSelect.selectedIndex].dataset.price);
        const dPrice = parseInt(drinkSelect.options[drinkSelect.selectedIndex].dataset.price);
        price = 19 + sPrice + dPrice; btnText = lang('YES, UPGRADE', '好，立即升級');
    } else {
        const select = document.getElementById('upsell-select');
        if(!select) return; price = parseInt(select.options[select.selectedIndex].dataset.price);
    }
    
    let currentSubtotal = cart.reduce((sum, item) => sum + item.price, 0);
    let currentHasCombo = cart.some(item => item.detailsEn && item.detailsEn.includes('Combo')) || type === 'combo';
    
    let willHaveDiscount = false;
    const store = getActiveStore();
    const rate = getDiscountRate();

    if (deliveryMode === 'pickup') {
        if (store === 'Tsuen Wan (Takeaway Only)') willHaveDiscount = true;
        else willHaveDiscount = (currentSubtotal + price >= 120 || currentHasCombo);
    }
    
    const btn = document.getElementById('upsell-btn');
    if (btn) {
        if (willHaveDiscount) {
            let discountAmt = Math.floor(price * rate); let discounted = price - discountAmt;
            btn.innerHTML = `${btnText} (<span class="line-through text-white/50 mr-1 text-[9px] font-medium">+${price}</span>+${discounted})`;
        } else { btn.innerHTML = `${btnText} (+${price})`; }
    }
}

function addUpsell(type) {
    if (type === 'combo') {
        const snackSelect = document.getElementById('upsell-combo-snack');
        const drinkSelect = document.getElementById('upsell-combo-drink');
        if(!snackSelect || !drinkSelect) return;
        const sPrice = parseInt(snackSelect.options[snackSelect.selectedIndex].dataset.price);
        const dPrice = parseInt(drinkSelect.options[drinkSelect.selectedIndex].dataset.price);
        const comboPrice = 19 + sPrice + dPrice;

        const s = comboSnacks.find(x => x.id === snackSelect.value);
        const d = comboDrinks.find(x => x.id === drinkSelect.value);

        const lastItem = cart[cart.length - 1];
        if (lastItem) {
            lastItem.price += comboPrice;
            lastItem.detailsEn += ` • Combo [${s.nameEn}, ${d.nameEn}]`;
            lastItem.detailsZh += ` • 套餐 [${s.nameZh}, ${d.nameZh}]`;
        }
        updateCartUI();
        const upsellBlock = document.getElementById('upsell-block');
        if (upsellBlock) upsellBlock.innerHTML = `<div class="p-3 text-center text-[10px] font-black text-green-600 uppercase tracking-widest bg-green-50 rounded-xl border border-green-200">✓ ${lang('Upgraded to Combo!', '成功升級套餐！')}</div>`;
        return;
    }

    const select = document.getElementById('upsell-select');
    if(!select) return;
    const price = parseInt(select.options[select.selectedIndex].dataset.price);
    
    let itemToAdd;
    if (type === 'sauce') {
        const s = sauces.find(x => x.id === select.value);
        if (s) { itemToAdd = { id: Date.now(), nameEn: s.nameEn, nameZh: s.nameZh, price: price, detailsEn: 'Extra Sauce', detailsZh: '額外醬汁', qty: 1 }; }
    }
    if (itemToAdd) cart.push(itemToAdd);
    updateCartUI();
    
    const upsellBlock = document.getElementById('upsell-block');
    if (upsellBlock) upsellBlock.innerHTML = `<div class="p-3 text-center text-[10px] font-black text-green-600 uppercase tracking-widest bg-green-50 rounded-xl border border-green-200">✓ ${lang('Added to Bag successfully!', '成功加入購物車！')}</div>`;
}

function goToCartFromSuccess() { hideAddedSuccessModal(); setTimeout(() => { toggleCart(); }, 300); }
function continueShopping() { hideAddedSuccessModal(); }

// --- HELPERS ---
function hideAddedSuccessModal() { const m=document.getElementById('added-success-modal'); const c=document.getElementById('added-success-content'); m.classList.add('opacity-0'); c.classList.add('scale-95'); setTimeout(() => m.classList.add('hidden'), 300); }
function toggleComboDetails() { document.getElementById('combo-details').classList.toggle('hidden', !document.getElementById('opt-combo').checked); updateConfigPrice(); }
function closeAllSheets() { document.getElementById('sheet-overlay').classList.add('opacity-0'); document.getElementById('cart-sheet').classList.remove('sheet-open'); document.getElementById('config-sheet').classList.remove('sheet-open'); setTimeout(() => document.getElementById('sheet-overlay').classList.add('hidden'), 400); }
function toggleCart() { if (document.getElementById('cart-sheet').classList.contains('sheet-open')) closeAllSheets(); else { updateCartStoreUI(); generateTimeOptions(); document.getElementById('sheet-overlay').classList.remove('hidden'); setTimeout(() => { document.getElementById('sheet-overlay').classList.remove('opacity-0'); document.getElementById('cart-sheet').classList.add('sheet-open'); }, 10); } }

function updateCartUI() {
    const container = document.getElementById('cart-items'), badge = document.getElementById('cart-badge');
    if (cart.length === 0) { container.innerHTML = `<div class="h-40 flex flex-col items-center justify-center text-gray-300 font-bold uppercase text-[10px] tracking-widest gap-2"><span>${lang('Your bag is empty', '你的購物車是空的')}</span></div>`; badge.classList.add('hidden'); }
    else { badge.innerText = cart.length; badge.classList.remove('hidden'); container.innerHTML = cart.map(item => `<div class="flex justify-between items-center p-5 bg-apple-bg rounded-[2rem] italic w-full border border-gray-100/50 shadow-sm flex-shrink-0"><div class="pr-4 flex-grow"><div class="text-[11px] font-black uppercase tracking-tight text-black">${lang(item.nameEn, item.nameZh)}</div><div class="text-[9px] text-gray-400 font-bold uppercase mt-1 leading-relaxed">${lang(item.detailsEn, item.detailsZh)}</div><div class="text-[10px] font-black mt-2 text-black">${item.price}</div></div><button onclick="removeFromCart(${item.id})" class="text-[10px] font-black text-red-500 uppercase flex-shrink-0 active:scale-95 transition-transform bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">${lang('Remove', '移除')}</button></div>`).join(''); }
    let subtotal = cart.reduce((sum, item) => sum + item.price, 0), hasCombo = cart.some(item => item.detailsEn && item.detailsEn.includes('Combo')), store = getActiveStore(), rate = getDiscountRate(), discount = 0;
    if (deliveryMode === 'pickup') { if (store === 'Tsuen Wan (Takeaway Only)') discount = Math.floor(subtotal * 0.15); else if (subtotal >= 120 || hasCombo) discount = Math.floor(subtotal * 0.10); }
    document.getElementById('subtotal-val').innerText = subtotal;
    document.getElementById('discount-label').innerHTML = `<span class="en">${store && store.includes('Tsuen Wan') ? '15%' : '10%'} Discount</span><span class="zh">${store && store.includes('Tsuen Wan') ? '85折' : '9折'}</span>`;
    document.getElementById('discount-val').innerText = `-${discount}`;
    document.getElementById('discount-row').classList.toggle('hidden', discount === 0);
    document.getElementById('total-val').innerHTML = discount > 0 ? `<span class="text-gray-400 text-base font-bold line-through mr-2">${subtotal}</span>${subtotal - discount}` : subtotal;
    if (cart.length > 0) { document.getElementById('floating-cart-count').innerText = cart.length; document.getElementById('floating-cart-total').innerText = subtotal - discount; document.getElementById('floating-cart-btn').classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none'); }
    else document.getElementById('floating-cart-btn').classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
    validateCheckout(); generateTimeOptions();
}

function removeFromCart(id) { cart = cart.filter(i => i.id !== id); updateCartUI(); }
function handleStoreChange() { flowSelectedStore = document.getElementById('cust-store').value; updateCartStoreUI(); updateCartUI(); }
function changeStore() { flowSelectedStore = ''; updateCartStoreUI(); updateCartUI(); }

function populateStoresDropdown() {
    const s = document.getElementById('cust-store');
    if (!s) return;
    s.innerHTML = `<option value="" disabled selected>${lang('Select Store *', '選擇分店 *')}</option>`;
    stores.forEach(st => {
        const open = isStoreOpen(st.name);
        const label = open
            ? lang(st.name, st.nameZh)
            : lang(`${st.name} [今日休息]`, `${st.nameZh} [今日休息]`);
        const opt = new Option(label, st.name);
        opt.disabled = !open;
        s.add(opt);
    });
    if (flowSelectedStore && isStoreOpen(flowSelectedStore)) {
        s.value = flowSelectedStore;
    } else if (flowSelectedStore && !isStoreOpen(flowSelectedStore)) {
        s.value = '';
    }
}

function updateCartStoreUI() { const d = document.getElementById('cart-store-display'), c = document.getElementById('cart-store-select-container'); if(flowSelectedStore) { document.getElementById('cart-store-name').innerText = lang(flowSelectedStore, stores.find(x=>x.name===flowSelectedStore).nameZh); d.classList.remove('hidden'); c.classList.add('hidden'); } else { d.classList.add('hidden'); c.classList.remove('hidden'); } }

function generateTimeOptions() {
    const s = document.getElementById('cust-time');
    const prevValue = s.value;
    const storeName = flowSelectedStore || document.getElementById('cust-store').value;
    if (!storeName) { s.innerHTML = `<option value="" disabled selected>${lang('Select Store First', '請先選擇分店')}</option>`; return; }
    
    let openTime = "11:15";
    let closeTime = "22:00";
    
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    if (storeName === 'Sai Ying Pun') {
        openTime = "11:15"; closeTime = "24:00";
    } else if (storeName === 'Fortress Hill') {
        openTime = "11:15";
        closeTime = (dayOfWeek === 5 || dayOfWeek === 6) ? "23:30" : "21:30";
    } else if (storeName === 'Tsuen Wan (Takeaway Only)') {
        openTime = "11:30"; closeTime = "23:30";
    }
    
    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);
    
    const openTotal = openH * 60 + openM;
    const closeTotal = closeH * 60 + closeM;
    const lastOrderTotal = closeTotal - 15;
    
    const currentTotal = today.getHours() * 60 + today.getMinutes();
    
    s.innerHTML = "";
    
    if (currentTotal >= lastOrderTotal) {
        s.add(new Option(lang('Sorry, Closed for today / 今日已收舖', 'Sorry, Closed for today / 今日已收舖'), 'CLOSED'));
        validateCheckout();
        return;
    }
    
    s.add(new Option(lang('Select Time *', '選擇取餐時間 *'), ''));
    
    const base = Math.max(openTotal, currentTotal);
    const offsets = [15, 20, 25, 30];
    
    let count = 0;
    offsets.forEach(off => {
        const mins = base + off;
        if (mins <= closeTotal) {
            const h = Math.floor(mins / 60) % 24;
            const m = mins % 60;
            const displayTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            s.add(new Option(displayTime, displayTime));
            count++;
        }
    });
    
    if (count === 0) {
        s.innerHTML = `<option value="CLOSED">${lang('Too close to closing / 太接近收舖時間', 'Too close to closing / 太接近收舖時間')}</option>`;
    } else if (prevValue) {
        for (let i = 0; i < s.options.length; i++) {
            if (s.options[i].value === prevValue) { s.value = prevValue; break; }
        }
    }
    validateCheckout();
}

function renderStores() { 
    const container = document.getElementById('stores-container');
    if(container) {
        container.innerHTML = stores.map(s => `<div class="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between gap-4"><div><h3 class="text-lg font-black uppercase">${lang(s.name, s.nameZh)}</h3><p class="text-[9px] font-bold text-gray-500 uppercase">${lang(s.addr, s.addrZh)}</p></div><a href="${s.mapLink}" target="_blank" class="w-12 h-12 rounded-full bg-apple-bg flex items-center justify-center shadow-sm">📍</a></div>`).join(''); 
    }
}

// --- TELEGRAM CHECKOUT LOGIC ---
function processTelegramOrder() {
    const store = getActiveStore();
    let name = document.getElementById('cust-name').value.trim();
    let phone = document.getElementById('cust-phone').value.trim();
    const time = document.getElementById('cust-time').value;

    if (!store || !name || !phone || !time || cart.length === 0) return;

    name = sanitizeHTML(name); phone = sanitizeHTML(phone);

    const btn = document.getElementById('checkout-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="en">Sending Order...</span><span class="zh">發送訂單中...</span>`;
    btn.disabled = true;

    const list = cart.map(i => `• ${i.nameEn} ${i.nameZh !== i.nameEn ? '('+i.nameZh+')' : ''} - ${i.price}\n  └ ${i.detailsEn} / ${i.detailsZh}`).join('\n');
    let calcSubtotal = cart.reduce((sum, item) => sum + item.price, 0);
    let hasCombo = cart.some(item => item.detailsEn && item.detailsEn.includes('Combo'));
    let calcDiscount = 0;
    
    if (deliveryMode === 'pickup') {
        if (store === 'Tsuen Wan (Takeaway Only)') { calcDiscount = Math.floor(calcSubtotal * 0.15); } 
        else if (calcSubtotal >= 120 || hasCombo) { calcDiscount = Math.floor(calcSubtotal * 0.10); }
    }
    
    let delivery = 0; let calcTotal = calcSubtotal - calcDiscount + delivery;

    const storeObj = stores.find(s => s.name === store);
    const storeDisplay = storeObj ? `${store} (${storeObj.nameZh})` : store;

    const msg = `🍔 <b>NEW ORDER: Mirror Burger</b>\n` +
                `------------------\n` +
                `<b>Customer Details:</b>\n` +
                `Store: ${storeDisplay}\n` +
                `Name: ${name}\n` +
                `Phone: ${phone}\n` +
                `Mode: ${deliveryMode.toUpperCase()}\n` +
                `Time: ${time}\n` +
                `------------------\n` +
                `<b>Items:</b>\n${list}\n` +
                `------------------\n` +
                `Subtotal: ${calcSubtotal}\n` +
                (calcDiscount > 0 ? `Discount: -${calcDiscount}\n` : '') +
                `<b>Total: ${calcTotal}</b>`;

    const TELEGRAM_CHAT_IDS = {
        'Sai Ying Pun': '-1003968192417',
        'Fortress Hill': '-5288271012',
        'Tsuen Wan (Takeaway Only)': '-5178883118'
    };
    const chatId = TELEGRAM_CHAT_IDS[store];

    fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ chat_id: chatId, text: msg })
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success' && data.data.ok) {
            finishOrderSuccess(store, time, btn, originalText);
        } else {
            showCustomAlert('傳送失敗，請聯絡管理員。');
            btn.innerHTML = originalText; btn.disabled = false;
        }
    })
    .catch(err => {
        showCustomAlert('網絡錯誤，請重試。');
        btn.innerHTML = originalText; btn.disabled = false;
    });
}

function finishOrderSuccess(store, time, btn, originalText) {
    closeAllSheets(); cart = []; updateCartUI();
    
    const storeObj = stores.find(s => s.name === store);
    const storeZh = storeObj ? storeObj.nameZh : store;
    
    document.getElementById('confirm-modal-store').innerText = lang(store, storeZh);
    document.getElementById('confirm-modal-time').innerText = time; 
    
    const dirBtn = document.getElementById('confirm-modal-direction-btn');
    if (dirBtn && storeObj && storeObj.lat && storeObj.lng) {
        dirBtn.href = `https://maps.google.com/?q=${storeObj.lat},${storeObj.lng}`;
    }
    
    const modal = document.getElementById('order-confirmed-modal');
    const content = document.getElementById('order-confirmed-content');
    modal.classList.remove('hidden'); void modal.offsetWidth;
    modal.classList.remove('opacity-0'); content.classList.remove('scale-95');

    btn.innerHTML = originalText; btn.disabled = false;
    document.getElementById('cust-name').value = ''; document.getElementById('cust-phone').value = '';
}

function closeConfirmation() {
    const modal = document.getElementById('order-confirmed-modal');
    const content = document.getElementById('order-confirmed-content');
    modal.classList.add('opacity-0'); content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
    window.scrollTo({top: 0, behavior: 'smooth'});
}

async function confirmPaymentFromRedirect() {
    try {
        const params = new URLSearchParams(window.location.search);
        // order_return = KPay 返回（成功或取消都會用）；paid = 舊連結相容
        const orderNo = params.get('order_return') || params.get('paid');
        if (!orderNo) return;

        params.delete('order_return');
        params.delete('paid');
        const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, document.title, cleanUrl);

        // ⚠️ 唔可以喺前端自行改成 PAID：KPay 取消付款都會打返 returnUrl，
        // 只信任 webhook (kpay-notify / Stripe webhook) 先會標 PAID。
        // Webhook 可能慢幾秒，所以短暫輪詢 DB。
        let order = null;
        for (let i = 0; i < 6; i++) {
            const { data, error } = await supabaseClient
                .from('orders')
                .select('order_no, store_name, pickup_time, payment_status')
                .eq('order_no', orderNo)
                .maybeSingle();

            if (error) throw error;
            order = data;
            if (order && String(order.payment_status || '').toUpperCase() === 'PAID') break;
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!order) return;

        const pay = String(order.payment_status || '').toUpperCase();
        if (pay === 'PAID') {
            cart = [];
            updateCartUI();
            closeAllSheets();
            const fakeBtn = { innerHTML: '', disabled: false };
            finishOrderSuccess(order.store_name || getActiveStore(), order.pickup_time || '', fakeBtn, '');
            return;
        }

        // 仍係 PENDING：客人取消／未完成付款 → 廚房唔會顯示，亦唔喺前端改狀態
        showCustomAlert(lang(
            'Payment was not completed. Your order was not sent to the kitchen.',
            '付款未完成，訂單未有送去廚房。'
        ));
    } catch (err) {
        console.warn('Redirect payment confirmation failed:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => { 
    const userLang = navigator.language || navigator.userLanguage;
    currentLang = userLang.toLowerCase().includes('zh') ? 'zh' : 'en';
    document.body.classList.toggle('lang-en', currentLang === 'en');
    document.body.classList.toggle('lang-zh', currentLang === 'zh');
    document.getElementById('lang-btn').innerText = currentLang === 'en' ? '中文' : 'ENG';

    updatePlaceholders(); populateStoresDropdown(); renderStores();
    fetchLiveMenu();
    fetchStoreSettings();
    startStoreSettingsRealtime();

    confirmPaymentFromRedirect();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW registration failed', err));
    }
});