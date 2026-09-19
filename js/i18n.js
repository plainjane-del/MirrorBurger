/**
 * Shared i18n for internal tools (POS → Kitchen → Admin).
 *
 * You own 100% of the dictionary below — edit zh/en strings freely.
 * Usage:
 *   t('pos.login.title')
 *   setLang('en') / setLang('zh')
 *   applyI18n(rootEl)  — updates [data-i18n], [data-i18n-placeholder], [data-i18n-title]
 *
 * Lang preference: localStorage mb_lang (zh | en), shared across POS/Kitchen/Admin.
 */
(function (global) {
    var STORAGE_KEY = 'mb_lang';
    var DEFAULT_LANG = 'zh';

    /** @type {{ zh: Record<string,string>, en: Record<string,string> }} */
    var DICT = {
        zh: {
            // —— Common ——
            'common.lang.zh': '中文',
            'common.lang.en': 'EN',
            'common.loading': '載入中…',
            'common.error': '出錯',
            'common.save': '儲存',
            'common.cancel': '取消',
            'common.close': '關閉',
            'common.confirm': '確認',
            'common.delete': '刪除',
            'common.logout': '登出',
            'common.retry': '再試',

            // —— POS login ——
            'pos.login.badge': 'Test POS',
            'pos.login.title': '店內收銀',
            'pos.login.hint': '用分店密碼登入；Master 可以切換所有分店。',
            'pos.login.password': '廚房密碼',
            'pos.login.submit': '進入 POS',
            'pos.login.fail': '登入失敗',
            'pos.login.wrong': '密碼錯誤',
            'pos.store.syp': '西營盤',
            'pos.store.th': '天后',
            'pos.store.tw': '荃灣',
            'pos.store.master': 'Master 全部分店',

            // —— POS chrome ——
            'pos.title': '測試 POS',
            'pos.title.master': '測試 POS · Master',
            'pos.cart': '購物車',
            'pos.clock': '打卡',
            'pos.today': '今日單',
            'pos.holds': '掛單',
            'pos.tables': '枱單',
            'pos.printer': '出單機',
            'pos.queue': '斷網排隊 {n} 單 · 網絡一回復就自動上雲',
            'pos.search': '搜尋餸名',
            'pos.table_no': '枱號（堂食必填）',
            'pos.guest_name': '客人名（選填）',
            'pos.note': '備註（選填）',
            'pos.dine_in': '堂食',
            'pos.takeaway': '外賣／即取',
            'pos.pay.cash': '現金',
            'pos.pay.fps': '轉數快',
            'pos.pay.payme': 'PayMe',
            'pos.pay.card': '卡機',
            'pos.pay.hold': '掛單',
            'pos.empty_cart': '撳左邊加餸',
            'pos.subtotal': '小計',
            'pos.discount.takeaway': '外賣折扣',
            'pos.no_discount_dine': '堂食無折扣',
            'pos.cat.empty': '呢類暫時冇嘢',
            'pos.cfg.size': '請揀份量',
            'pos.cfg.temp': '請揀熱定凍',
            'pos.cfg.combo': '套餐請揀小食同飲品。',
            'pos.cfg.add': '加入',
            'pos.cfg.need_combo': '請完成套餐',
            'pos.ticket.void': '作廢',
            'pos.ticket.reprint': '重印',
            'pos.ticket.close': '關閉',
            'pos.ticket.void_confirm': '作廢 #{id}？廚房未開始先得。',
            'pos.ticket.voided': '已作廢 #{id}',
            'pos.ticket.reprint_fail': '重印失敗：{msg}',
            'pos.ticket.none': '未有店內單',
            'pos.today.loading': '載入中…',
            'pos.today.cashup': '計緊今日收款…',
            'pos.today.empty': '今日未有店內／枱單',
            'pos.today.collected': '今日已收 ${amount} · {n} 單',
            'pos.today.voided': '已作廢 {n} 單',
            'pos.today.unpaid': '未收款',
            'pos.tables.empty': '暫時冇未收款枱單',
            'pos.tables.count': '枱單 {n}',
            'pos.collect.fail': '收款失敗：{msg}',
            'pos.cash.received': '實收金額',
            'pos.last_none': '未有店內單',

            // —— Admin ——
            'admin.login.title': '後台',
            'admin.login.hint': '睇今日生意、改價錢、印枱 QR、搵單。廚房 Master 密碼通常都得。',
            'admin.login.password': '密碼',
            'admin.login.submit': '登入',
            'admin.login.pwa': '加主畫面：Safari / 瀏覽器 → 分享／選單 →「加入主畫面」。圖示會寫住 ADMIN。',
            'admin.brand': '後台',
            'admin.nav.sales': '概况',
            'admin.nav.items': '菜品',
            'admin.nav.tables': '堂食/外賣 QR',
            'admin.nav.orders': '訂單',
            'admin.nav.payroll': '出糧',
            'admin.nav.inventory': '庫存／配方',
            'admin.nav.printer': '出單機',
            'admin.nav.pos': 'POS',
            'admin.nav.kitchen': '廚房',
            'admin.nav.site': '網站',
            'admin.reload': '重新載入',
            'admin.range.today': '今日',
            'admin.range.yesterday': '昨日',
            'admin.range.week': '一星期',
            'admin.range.month': '今個月',
            'admin.range.ytd': '年頭到而家',
            'admin.range.year': '一年',
            'admin.range.custom': '自訂',
            'admin.sales.paid_only': '已收款先計；未付／取消唔計。',
            'admin.from': '由',
            'admin.to': '至',
            'admin.page.sales.title': '概况',
            'admin.page.sales.sub': '每間舖收咗幾多錢',
            'admin.page.items.title': '菜品',
            'admin.page.items.sub': '改名稱、價錢、上下架',
            'admin.page.tables.title': '堂食/外賣 QR Code',
            'admin.page.tables.sub': '堂食枱 · 外賣自取門口 QR',
            'admin.page.orders.title': '訂單',
            'admin.page.orders.sub': '搜單號 · 揀店 · 撳開睇餐',
            'admin.page.printer.title': '出單機',
            'admin.page.printer.sub': '佳博 58mm · Epson 80mm · USB 插 Sunmi 或電腦',
            'admin.page.payroll.title': '出糧',
            'admin.page.payroll.sub': '員工 PIN · AI 出糧規則',
            'admin.page.inventory.title': '庫存／配方',
            'admin.page.inventory.sub': '物料庫存 · 餐點配方成本',
            'admin.items.prices': '餐點價錢',
            'admin.items.mods': '加料／套餐',
            'admin.label.category': '分類',
            'admin.label.kind': '類型',
            'admin.label.store': '分店',
            'admin.label.date': '日期',
            'admin.label.ticket': '單號',
            'admin.all': '全部',
            'admin.query': '查詢',
            'admin.ticket.placeholder': 'SYP-260919-P-001',
            'admin.qr.help': '揀分店、設定枱數，然後列印 QR 貼枱面。加多一張就撳 ＋。每張 A4 最多 12 個枱 QR。',
            'admin.qr.table': '堂食枱',
            'admin.qr.pickup': '外賣自取',
            'admin.qr.search_store': '搜尋分店',
            'admin.qr.search_ph': '店名／地區',
            'admin.qr.tables': '枱數',
            'admin.qr.save_tables': '儲存枱數',
            'admin.qr.print': '列印 QR',
            'admin.items.new': '＋ 新項目',
            'admin.mods.new': '＋ 新選項',
            'admin.sales.total_collected': '{range} 三間舖共收',
            'admin.sales.no_revenue': '呢段時間未有收款',
            'admin.sales.paid_orders': '{n} 張已收款',
            'admin.sales.order_count': '訂單總數',
            'admin.sales.aov': '客單價',
            'admin.sales.dine_vs_take': '堂食／外賣',
            'admin.sales.dine_line': '堂食 {n} 張 · {money}',
            'admin.sales.take_line': '外賣 {n} 張 · {money}',
            'admin.sales.store_line': '堂食 {dine} · 外賣 {take} · 撳入睇單',
            'admin.sales.tickets_n': '{n} 張',
            'admin.sales.load_fail': '載入失敗：{msg}',
            'admin.kind.dine_in': '堂食',
            'admin.kind.takeaway': '外賣',
            'admin.pay.cash': '現金',
            'admin.pay.fps': '轉數快',
            'admin.pay.payme': 'PayMe',
            'admin.pay.card': '卡機',
            'admin.pay.kpay': 'KPay',
            'admin.status.paid': '已收款',
            'admin.status.pending': '等付款',
            'admin.status.unpaid': '未付',
            'admin.status.cancelled': '已取消',
            'admin.orders.found': '搵到 {n} 張（單號含 {q}）',
            'admin.orders.not_found': '搵唔到 {q}',
            'admin.orders.truncated_note': '已收款先計入合計。下面只列出最近 {n} 張。',
            'admin.orders.hint': '已收款先計入合計；撳一張睇餐。',
            'admin.orders.empty': '呢段時間未有單',
            'admin.orders.sum': '{range} · {n} 張 · {money}',
            'admin.orders.items_n': '{n} 件',
            'admin.orders.no_items': '冇餐點明細',
        },
        en: {
            'common.lang.zh': '中文',
            'common.lang.en': 'EN',
            'common.loading': 'Loading…',
            'common.error': 'Error',
            'common.save': 'Save',
            'common.cancel': 'Cancel',
            'common.close': 'Close',
            'common.confirm': 'Confirm',
            'common.delete': 'Clear',
            'common.logout': 'Log out',
            'common.retry': 'Retry',

            'pos.login.badge': 'Test POS',
            'pos.login.title': 'In-store POS',
            'pos.login.hint': 'Sign in with store password. Master can switch all stores.',
            'pos.login.password': 'Kitchen password',
            'pos.login.submit': 'Enter POS',
            'pos.login.fail': 'Login failed',
            'pos.login.wrong': 'Wrong password',
            'pos.store.syp': 'Sai Ying Pun',
            'pos.store.th': 'Tin Hau',
            'pos.store.tw': 'Tsuen Wan',
            'pos.store.master': 'Master · all stores',

            'pos.title': 'Test POS',
            'pos.title.master': 'Test POS · Master',
            'pos.cart': 'Cart',
            'pos.clock': 'Clock',
            'pos.today': 'Today',
            'pos.holds': 'Holds',
            'pos.tables': 'Tables',
            'pos.printer': 'Printer',
            'pos.queue': 'Offline queue: {n} · will sync when online',
            'pos.search': 'Search items',
            'pos.table_no': 'Table no. (required for dine-in)',
            'pos.guest_name': 'Guest name (optional)',
            'pos.note': 'Note (optional)',
            'pos.dine_in': 'Dine-in',
            'pos.takeaway': 'Takeaway',
            'pos.pay.cash': 'Cash',
            'pos.pay.fps': 'FPS',
            'pos.pay.payme': 'PayMe',
            'pos.pay.card': 'Card',
            'pos.pay.hold': 'Hold',
            'pos.empty_cart': 'Tap left to add items',
            'pos.subtotal': 'Subtotal',
            'pos.discount.takeaway': 'Takeaway discount',
            'pos.no_discount_dine': 'No dine-in discount',
            'pos.cat.empty': 'Nothing in this category',
            'pos.cfg.size': 'Please pick a size',
            'pos.cfg.temp': 'Please pick hot or iced',
            'pos.cfg.combo': 'Please pick combo snack and drink.',
            'pos.cfg.add': 'Add',
            'pos.cfg.need_combo': 'Finish combo first',
            'pos.ticket.void': 'Void',
            'pos.ticket.reprint': 'Reprint',
            'pos.ticket.close': 'Close',
            'pos.ticket.void_confirm': 'Void #{id}? Only if kitchen has not started.',
            'pos.ticket.voided': 'Voided #{id}',
            'pos.ticket.reprint_fail': 'Reprint failed: {msg}',
            'pos.ticket.none': 'No in-store ticket yet',
            'pos.today.loading': 'Loading…',
            'pos.today.cashup': 'Calculating today’s takings…',
            'pos.today.empty': 'No in-store / table orders today',
            'pos.today.collected': 'Collected ${amount} · {n} orders',
            'pos.today.voided': 'Voided {n}',
            'pos.today.unpaid': 'Unpaid',
            'pos.tables.empty': 'No unpaid table orders',
            'pos.tables.count': 'Tables {n}',
            'pos.collect.fail': 'Collect failed: {msg}',
            'pos.cash.received': 'Amount received',
            'pos.last_none': 'No in-store ticket yet',

            'admin.login.title': 'Admin',
            'admin.login.hint': 'Sales, prices, table QR, find tickets. Kitchen Master password usually works.',
            'admin.login.password': 'Password',
            'admin.login.submit': 'Sign in',
            'admin.login.pwa': 'Add to Home Screen: Safari / browser → Share / menu → Add to Home Screen. Icon says ADMIN.',
            'admin.brand': 'Admin',
            'admin.nav.sales': 'Overview',
            'admin.nav.items': 'Menu',
            'admin.nav.tables': 'Dine-in / Takeaway QR',
            'admin.nav.orders': 'Orders',
            'admin.nav.payroll': 'Payroll',
            'admin.nav.inventory': 'Inventory / Recipes',
            'admin.nav.printer': 'Printer',
            'admin.nav.pos': 'POS',
            'admin.nav.kitchen': 'Kitchen',
            'admin.nav.site': 'Website',
            'admin.reload': 'Reload',
            'admin.range.today': 'Today',
            'admin.range.yesterday': 'Yesterday',
            'admin.range.week': '7 days',
            'admin.range.month': 'This month',
            'admin.range.ytd': 'Year to date',
            'admin.range.year': '1 year',
            'admin.range.custom': 'Custom',
            'admin.sales.paid_only': 'Paid only; unpaid / cancelled excluded.',
            'admin.from': 'From',
            'admin.to': 'To',
            'admin.page.sales.title': 'Overview',
            'admin.page.sales.sub': 'How much each store collected',
            'admin.page.items.title': 'Menu',
            'admin.page.items.sub': 'Names, prices, availability',
            'admin.page.tables.title': 'Dine-in / Takeaway QR',
            'admin.page.tables.sub': 'Table QR · pickup door QR',
            'admin.page.orders.title': 'Orders',
            'admin.page.orders.sub': 'Search ticket · filter store · tap to view',
            'admin.page.printer.title': 'Printer',
            'admin.page.printer.sub': 'Gprinter 58mm · Epson 80mm · USB via Sunmi or PC',
            'admin.page.payroll.title': 'Payroll',
            'admin.page.payroll.sub': 'Staff PIN · AI payroll rules',
            'admin.page.inventory.title': 'Inventory / Recipes',
            'admin.page.inventory.sub': 'Stock · recipe cost',
            'admin.items.prices': 'Item prices',
            'admin.items.mods': 'Add-ons / combos',
            'admin.label.category': 'Category',
            'admin.label.kind': 'Type',
            'admin.label.store': 'Store',
            'admin.label.date': 'Date',
            'admin.label.ticket': 'Ticket #',
            'admin.all': 'All',
            'admin.query': 'Search',
            'admin.ticket.placeholder': 'SYP-260919-P-001',
            'admin.qr.help': 'Pick a store, set table count, print QR for tables. Tap ＋ for more. Max 12 table QR per A4.',
            'admin.qr.table': 'Dine-in tables',
            'admin.qr.pickup': 'Takeaway pickup',
            'admin.qr.search_store': 'Search store',
            'admin.qr.search_ph': 'Name / area',
            'admin.qr.tables': 'Tables',
            'admin.qr.save_tables': 'Save table count',
            'admin.qr.print': 'Print QR',
            'admin.items.new': '+ New item',
            'admin.mods.new': '+ New option',
            'admin.sales.total_collected': '{range} · all stores',
            'admin.sales.no_revenue': 'No paid orders in this period',
            'admin.sales.paid_orders': '{n} paid orders',
            'admin.sales.order_count': 'Orders',
            'admin.sales.aov': 'Avg order',
            'admin.sales.dine_vs_take': 'Dine-in / Takeaway',
            'admin.sales.dine_line': 'Dine-in {n} · {money}',
            'admin.sales.take_line': 'Takeaway {n} · {money}',
            'admin.sales.store_line': 'Dine-in {dine} · Takeaway {take} · tap for tickets',
            'admin.sales.tickets_n': '{n} orders',
            'admin.sales.load_fail': 'Load failed: {msg}',
            'admin.kind.dine_in': 'Dine-in',
            'admin.kind.takeaway': 'Takeaway',
            'admin.pay.cash': 'Cash',
            'admin.pay.fps': 'FPS',
            'admin.pay.payme': 'PayMe',
            'admin.pay.card': 'Card',
            'admin.pay.kpay': 'KPay',
            'admin.status.paid': 'Paid',
            'admin.status.pending': 'Pending pay',
            'admin.status.unpaid': 'Unpaid',
            'admin.status.cancelled': 'Cancelled',
            'admin.orders.found': 'Found {n} (ticket contains {q})',
            'admin.orders.not_found': 'No match for {q}',
            'admin.orders.truncated_note': 'Paid only in totals. Showing latest {n} tickets.',
            'admin.orders.hint': 'Paid only in totals; tap a ticket to view items.',
            'admin.orders.empty': 'No tickets in this period',
            'admin.orders.sum': '{range} · {n} · {money}',
            'admin.orders.items_n': '{n} items',
            'admin.orders.no_items': 'No item details',
        },
    };

    function normalizeLang(lang) {
        var s = String(lang || '').toLowerCase();
        if (s === 'en' || s.indexOf('en') === 0) return 'en';
        return 'zh';
    }

    function getLang() {
        try {
            return normalizeLang(localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG);
        } catch (_) {
            return DEFAULT_LANG;
        }
    }

    function setLang(lang) {
        var next = normalizeLang(lang);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch (_) { /* ignore */ }
        document.documentElement.lang = next === 'en' ? 'en' : 'zh-HK';
        document.documentElement.setAttribute('data-lang', next);
        applyI18n(document);
        try {
            document.dispatchEvent(new CustomEvent('mb:lang', { detail: { lang: next } }));
        } catch (_) { /* ignore */ }
        return next;
    }

    function toggleLang() {
        return setLang(getLang() === 'zh' ? 'en' : 'zh');
    }

    function fill(template, vars) {
        var out = String(template == null ? '' : template);
        if (!vars) return out;
        Object.keys(vars).forEach(function (k) {
            var val = String(vars[k]);
            out = out.split('#{' + k + '}').join(val);
            out = out.split('{' + k + '}').join(val);
        });
        return out;
    }

    function t(key, vars) {
        var lang = getLang();
        var pack = DICT[lang] || DICT.zh;
        var fallback = DICT.zh || {};
        var text = pack[key] != null ? pack[key] : fallback[key];
        if (text == null) return key;
        return fill(text, vars);
    }

    function applyI18n(root) {
        var el = root || document;
        el.querySelectorAll('[data-i18n]').forEach(function (node) {
            var key = node.getAttribute('data-i18n');
            if (!key) return;
            node.textContent = t(key);
        });
        el.querySelectorAll('[data-i18n-html]').forEach(function (node) {
            var key = node.getAttribute('data-i18n-html');
            if (!key) return;
            node.innerHTML = t(key);
        });
        el.querySelectorAll('[data-i18n-placeholder]').forEach(function (node) {
            var key = node.getAttribute('data-i18n-placeholder');
            if (!key) return;
            node.setAttribute('placeholder', t(key));
        });
        el.querySelectorAll('[data-i18n-title]').forEach(function (node) {
            var key = node.getAttribute('data-i18n-title');
            if (!key) return;
            node.setAttribute('title', t(key));
        });
        // Sync lang toggle labels if present
        el.querySelectorAll('[data-lang-toggle]').forEach(function (btn) {
            btn.textContent = getLang() === 'zh' ? t('common.lang.en') : t('common.lang.zh');
        });
    }

    /** Merge/override dictionary entries (owner control). */
    function extendDict(lang, entries) {
        var L = normalizeLang(lang);
        if (!DICT[L]) DICT[L] = {};
        Object.assign(DICT[L], entries || {});
    }

    function getDict() {
        return DICT;
    }

    // boot
    try {
        document.documentElement.setAttribute('data-lang', getLang());
        document.documentElement.lang = getLang() === 'en' ? 'en' : 'zh-HK';
    } catch (_) { /* ignore */ }

    global.MB_I18N = {
        t: t,
        setLang: setLang,
        getLang: getLang,
        toggleLang: toggleLang,
        applyI18n: applyI18n,
        extendDict: extendDict,
        getDict: getDict,
        DICT: DICT,
        STORAGE_KEY: STORAGE_KEY,
    };
    global.t = t;
})(typeof window !== 'undefined' ? window : global);
