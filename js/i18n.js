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
