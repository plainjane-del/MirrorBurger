// Shared public menu reads: go straight to Supabase REST (no Vercel cold start),
// and keep a localStorage snapshot so the next visit paints immediately.
(function (root) {
    var SB_URL = 'https://olmoingcxkgdrqezweuf.supabase.co';
    var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbW9pbmdjeGtnZHJxZXp3ZXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwOTA4MTMsImV4cCI6MjA5NDY2NjgxM30.FHH8doicN8j1OKtt10BL9LS5Ta5dhLn5mSCF_cQ_pNw';
    var CATALOG_KEY = 'mb_db_catalog_v1';
    var SETTINGS_KEY = 'mb_db_store_settings_v1';
    var DEFAULT_TABLES = {
        'Sai Ying Pun': 5,
        'Fortress Hill': 0,
        'Tsuen Wan (Takeaway Only)': 0,
    };

    function sbGet(path) {
        return fetch(SB_URL + '/rest/v1/' + path, {
            headers: {
                apikey: SB_ANON,
                Authorization: 'Bearer ' + SB_ANON,
                Accept: 'application/json',
            },
        }).then(function (res) {
            return res.text().then(function (text) {
                var data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
                if (!res.ok) {
                    var msg = (data && (data.message || data.hint || data.details)) || text || ('HTTP ' + res.status);
                    var err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
                    err.status = res.status;
                    throw err;
                }
                return data;
            });
        });
    }

    function readJson(key) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {}
    }

    function mergeSoldOut(items, soldIds) {
        var set = {};
        (soldIds || []).forEach(function (id) { set[id] = true; });
        return (items || []).map(function (item) {
            var copy = {};
            for (var k in item) {
                if (Object.prototype.hasOwnProperty.call(item, k)) copy[k] = item[k];
            }
            copy.is_sold_out = !!(item.is_sold_out || set[item.id]);
            return copy;
        });
    }

    function readCatalog(storeName) {
        var all = readJson(CATALOG_KEY) || {};
        var key = String(storeName || '').trim();
        return (key && all[key]) || all._ || null;
    }

    function saveCatalog(storeName, payload) {
        var all = readJson(CATALOG_KEY) || {};
        var key = String(storeName || '').trim();
        if (key) all[key] = payload;
        all._ = {
            items: payload.items,
            modifiers: payload.modifiers,
            combo_base: payload.combo_base,
            hours: payload.hours,
            savedAt: payload.savedAt,
        };
        writeJson(CATALOG_KEY, all);
    }

    function fetchItems() {
        var full = 'menu_items?select=id,category,name_en,name_zh,price,desc_en,desc_zh,description_en,description_zh,img,image_url,tag_en,tag_zh,dietary,sizes,is_side,has_temp,is_sold_out,is_active,sort_order&is_active=eq.true&order=category.asc,sort_order.asc,id.asc';
        var simple = 'menu_items?select=id,category,name_en,name_zh,price,img,image_url,is_sold_out,is_active,is_side,has_temp,sizes&is_active=eq.true&order=id.asc';
        return sbGet(full).catch(function () { return sbGet(simple); });
    }

    function fetchModifiers() {
        var full = 'menu_modifiers?select=id,kind,name_en,name_zh,price,is_active,sort_order&is_active=eq.true&order=kind.asc,sort_order.asc,id.asc';
        var simple = 'menu_modifiers?select=id,kind,name_en,name_zh,price,is_active&is_active=eq.true';
        return sbGet(full).catch(function () { return sbGet(simple).catch(function () { return []; }); });
    }

    function fetchPublicMenu(storeName) {
        var store = String(storeName || '').trim();
        var jobs = [
            fetchItems(),
            fetchModifiers(),
            sbGet('menu_settings?key=eq.combo_base&select=value').catch(function () { return []; }),
            sbGet('menu_settings?key=eq.table_counts&select=value').catch(function () { return []; }),
            sbGet('store_settings?select=store_name,is_open,override_until').catch(function () { return []; }),
        ];
        if (store) {
            jobs.push(sbGet(
                'menu_sold_out?select=item_id&store_name=eq.' + encodeURIComponent(store) + '&is_sold_out=eq.true'
            ).catch(function () { return []; }));
        }

        return Promise.all(jobs).then(function (rows) {
            var items = rows[0] || [];
            var modifiers = rows[1] || [];
            var comboRows = rows[2] || [];
            var tableRows = rows[3] || [];
            var hoursRows = rows[4] || [];
            var soldRows = store ? (rows[5] || []) : [];

            var combo_base = 19;
            var rawCombo = comboRows[0] && comboRows[0].value;
            var n = Number(rawCombo);
            if (Number.isFinite(n)) combo_base = n;

            var soldIds = (soldRows || []).map(function (r) { return r && r.item_id; }).filter(Boolean);

            var hours = {};
            (hoursRows || []).forEach(function (row) {
                if (!row || !row.store_name) return;
                hours[row.store_name] = {
                    is_open: !!row.is_open,
                    override_until: row.override_until || null,
                };
            });

            var is_open = true;
            if (store && root.MBStoreHours && typeof root.MBStoreHours.effectiveIsOpen === 'function') {
                is_open = !!root.MBStoreHours.effectiveIsOpen(store, hours[store] || {});
            } else if (store && hours[store] && hours[store].is_open === false) {
                is_open = false;
            }

            var table_counts = {};
            try {
                var tv = tableRows[0] && tableRows[0].value;
                if (typeof tv === 'string') tv = JSON.parse(tv);
                if (tv && typeof tv === 'object') table_counts = tv;
            } catch (e) {}

            var table_count = Number(
                table_counts[store] != null ? table_counts[store] : (DEFAULT_TABLES[store] || 0)
            );

            var payload = {
                items: mergeSoldOut(items, soldIds),
                raw_items: items,
                sold_ids: soldIds,
                modifiers: modifiers,
                combo_base: combo_base,
                is_open: is_open,
                store_name: store,
                table_count: table_count,
                hours: hours,
                savedAt: Date.now(),
            };
            saveCatalog(store, payload);
            writeJson(SETTINGS_KEY, hours);
            return payload;
        });
    }

    root.MBPublicDb = {
        sbGet: sbGet,
        readCatalog: readCatalog,
        readHours: function () { return readJson(SETTINGS_KEY) || {}; },
        fetchPublicMenu: fetchPublicMenu,
        withSoldOut: mergeSoldOut,
    };
}(typeof window !== 'undefined' ? window : this));
