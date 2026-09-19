/**
 * Store landing page (menu.html) — language toggle + hydrate by ?store= or pretty path.
 * Checkout CTAs always go to /?store=<slug>&order=1 so index.html getActiveStore() is correct.
 */
(function () {
    var SITE = 'https://mirrorburger.com';
    var HERO =
        'https://res.cloudinary.com/dnuhe2uwy/image/upload/w_1200,f_auto,q_auto,e_improve,e_saturation:20/v1777801017/IMG_2364_sr2yuj.jpg';

    /** @type {Record<string, object>} */
    var STORES = {
        SYP: {
            code: 'SYP',
            slug: 'sai-ying-pun',
            path: '/sai-ying-pun',
            storeName: 'Sai Ying Pun',
            eyebrow: 'Sai Ying Pun · 西營盤',
            h1En: 'Halal burgers in Sai Ying Pun',
            h1Zh: '西營盤清真漢堡',
            introEn:
                "Mirror Burger on Queen's Road West serves Halal Angus, Wagyu, chicken, seafood and vegetarian burgers. Open every day from 11:15am to midnight — one of the later burger spots on Hong Kong Island. Pickup in-store, or delivery via Foodpanda and KeeTa.",
            introZh:
                '西營盤皇后大道西的 Mirror Burger 供應清真安格斯、和牛、脆雞、海鮮及素食漢堡。每天 11:15 開至午夜，港島區較遲打烊的漢堡店之一。可到店自取，亦可經 Foodpanda、KeeTa 外送。',
            addrEn: "G/F, 194 Queen's Road West, Sai Ying Pun, Hong Kong",
            addrZh: '香港西營盤皇后大道西 194 號地下',
            hrsEn: 'Daily 11:15am – 12:00 midnight',
            hrsZh: '每天 11:15am – 午夜 12:00',
            transit:
                "MTR Sai Ying Pun Station, then walk along Queen's Road West. Also a short walk from HKU Station. 港鐵西營盤站沿皇后大道西步行；亦可由香港大學站步行前往。",
            mapLink: 'https://maps.app.goo.gl/MnNp3yi6eyedsFfM9',
            lat: 22.286866,
            lng: 114.144379,
            sectionTitle: 'Signature burgers / 招牌漢堡',
            sectionHtml:
                '<ul class="text-sm space-y-2 text-gray-700">' +
                '<li>Classic Beef 經典芝士牛肉 — lava-grilled 4oz Angus &amp; Wagyu, red wine onion jam</li>' +
                '<li>Hottest Beef 墨辣芝士牛肉 · Hottest Blue Cheese 墨辣藍紋芝士</li>' +
                '<li>3.2.1 — double patty, bacon, triple cheese</li>' +
                '<li>Smoked Salmon &amp; Egg 煙三文魚煎蛋 · Buffalo Chicken 水牛城脆雞 · Soft Shell Crab 脆炸軟殼蟹</li>' +
                '<li>Vegetarian: Mushroom Schnitzel, Housemade Veggie, Hottest Veggie 素食漢堡</li>' +
                '</ul>' +
                '<p class="text-sm text-gray-600">10% off takeaway over $120 or any combo. 外賣自取滿 $120 或任何套餐 9 折。</p>',
            cta: 'Order Sai Ying Pun pickup / 西營盤自取落單',
            heroAlt: 'Halal burger at Mirror Burger Sai Ying Pun, Hong Kong',
            mapTitle: 'Mirror Burger Sai Ying Pun Google Map',
            title: 'Halal Burgers in Sai Ying Pun | Mirror Burger 西營盤清真漢堡',
            description:
                "Mirror Burger Sai Ying Pun — Halal burgers on Queen's Road West, open until midnight. Angus, Wagyu and vegetarian. Near Sai Ying Pun MTR. 西營盤皇后大道西清真漢堡，每天營業至午夜。",
            ogTitle: 'Halal Burgers in Sai Ying Pun | Mirror Burger',
            ogDescription:
                "西營盤清真漢堡。Queen's Road West, open daily until midnight. Pickup or Foodpanda / KeeTa.",
            crumbName: 'Sai Ying Pun 西營盤',
            schemaId: SITE + '/#sai-ying-pun',
            schemaName: 'Mirror Burger Sai Ying Pun',
            schemaAlt: 'Mirror Burger 西營盤清真漢堡',
            streetAddress: "G/F, 194 Queen's Road West",
            locality: 'Sai Ying Pun',
            region: 'Hong Kong Island',
            hoursSpec: [
                {
                    '@type': 'OpeningHoursSpecification',
                    dayOfWeek: [
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday',
                    ],
                    opens: '11:15',
                    closes: '24:00',
                },
            ],
            others: [
                { href: '/tin-hau', label: 'Tin Hau / Fortress Hill 天后漢堡' },
                { href: '/tsuen-wan', label: 'Tsuen Wan takeaway 荃灣漢堡外賣自取' },
            ],
        },
        TH: {
            code: 'TH',
            slug: 'tin-hau',
            path: '/tin-hau',
            storeName: 'Fortress Hill',
            eyebrow: 'Tin Hau · Fortress Hill · 天后 · 炮台山',
            h1En: 'Halal burgers in Tin Hau',
            h1Zh: '天后／炮台山清真漢堡',
            introEn:
                "Mirror Burger's Fortress Hill shop sits at 1A Merlin Street, between Tin Hau and Fortress Hill MTR. Halal Angus and Wagyu burgers, smoked salmon, buffalo chicken, soft-shell crab and vegetarian options. Pickup in-store, or delivery on Foodpanda and KeeTa.",
            introZh:
                'Mirror Burger 炮台山／天后店位於麥連街 1A，港鐵炮台山站與天后站之間。供應清真安格斯、和牛漢堡，以及煙三文魚、水牛城脆雞、軟殼蟹和素食選擇。可到店自取，或經 Foodpanda、KeeTa 外送。',
            addrEn: '1A Merlin Street, Tin Hau / Fortress Hill, Hong Kong',
            addrZh: '香港天后／炮台山麥連街 1A 號',
            hrsEn: 'Sun–Thu 11:15am – 9:30pm · Fri–Sat 11:15am – 11:30pm',
            hrsZh: '星期日－四 11:15am–9:30pm · 星期五、六 11:15am–11:30pm',
            transit:
                'Closest MTR: Fortress Hill Station. Tin Hau Station is also a short walk. 最近港鐵站為炮台山站；天后站步行亦方便。',
            mapLink: 'https://maps.app.goo.gl/8944PrWNxNKrNXaZ9',
            lat: 22.287105,
            lng: 114.192261,
            sectionTitle: 'What to order / 推薦',
            sectionHtml:
                '<ul class="text-sm space-y-2 text-gray-700">' +
                '<li>Classic Beef 經典芝士牛肉 · Hottest Beef 墨辣芝士牛肉</li>' +
                '<li>3.2.1 double patty · Hottest Blue Cheese 墨辣藍紋芝士</li>' +
                '<li>Smoked Salmon &amp; Egg 煙三文魚煎蛋 · Buffalo Chicken · Soft Shell Crab</li>' +
                '<li>Vegetarian burgers 素食漢堡 — mushroom schnitzel and housemade veggie</li>' +
                '</ul>' +
                '<p class="text-sm text-gray-600">10% off takeaway over $120 or any combo. 外賣自取滿 $120 或任何套餐 9 折。</p>',
            cta: 'Order Tin Hau pickup / 天后自取落單',
            heroAlt: 'Halal burger at Mirror Burger Tin Hau and Fortress Hill, Hong Kong',
            mapTitle: 'Mirror Burger Tin Hau Fortress Hill Google Map',
            title: 'Halal Burgers in Tin Hau & Fortress Hill | Mirror Burger 天后漢堡',
            description:
                'Mirror Burger Tin Hau / Fortress Hill — Halal burgers at 1A Merlin Street. Near Fortress Hill and Tin Hau MTR. 天后、炮台山清真漢堡，麥連街 1A。',
            ogTitle: 'Halal Burgers in Tin Hau | Mirror Burger',
            ogDescription:
                '天后／炮台山清真漢堡。1A Merlin Street, near Fortress Hill MTR. Pickup or Foodpanda / KeeTa.',
            crumbName: 'Tin Hau / Fortress Hill 天后',
            schemaId: SITE + '/#fortress-hill',
            schemaName: 'Mirror Burger Fortress Hill',
            schemaAlt: ['Mirror Burger 天后', 'Mirror Burger Tin Hau', 'Mirror Burger 炮台山'],
            streetAddress: '1A Merlin Street',
            locality: 'Tin Hau',
            region: 'Hong Kong Island',
            hoursSpec: [
                {
                    '@type': 'OpeningHoursSpecification',
                    dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
                    opens: '11:15',
                    closes: '21:30',
                },
                {
                    '@type': 'OpeningHoursSpecification',
                    dayOfWeek: ['Friday', 'Saturday'],
                    opens: '11:15',
                    closes: '23:30',
                },
            ],
            others: [
                { href: '/sai-ying-pun', label: 'Sai Ying Pun 西營盤漢堡' },
                { href: '/tsuen-wan', label: 'Tsuen Wan takeaway 荃灣漢堡外賣自取' },
            ],
        },
        TW: {
            code: 'TW',
            slug: 'tsuen-wan',
            path: '/tsuen-wan',
            storeName: 'Tsuen Wan (Takeaway Only)',
            eyebrow: 'Tsuen Wan · 荃灣 · Takeaway only',
            h1En: 'Halal burgers in Tsuen Wan',
            h1Zh: '荃灣清真漢堡（只限外賣自取）',
            introEn:
                'This Mirror Burger is a kitchen for pickup and delivery — no dine-in. Order Halal Angus, Wagyu, chicken, seafood or vegetarian burgers for 15% off when you collect at Yue Fung Industrial Building, Chai Wan Kok Street. Foodpanda and KeeTa cover the Tsuen Wan area.',
            introZh:
                '荃灣店是廚房取餐點，沒有堂食。到柴灣角街裕豐工業大廈自取享 85 折，可點清真安格斯、和牛、脆雞、海鮮或素食漢堡。荃灣一帶亦可經 Foodpanda、KeeTa 外送。',
            addrEn:
                'Flat 01, 13/F, Yue Fung Industrial Building, 35-45 Chai Wan Kok Street, Tsuen Wan',
            addrZh: '荃灣柴灣角街 35-45 號裕豐工業大廈 13 樓 01 室',
            hrsEn: 'Daily 11:30am – 11:30pm',
            hrsZh: '每天 11:30am – 11:30pm',
            transit:
                'Industrial building — use the lift to 13/F. Allow extra time if you are coming from Tsuen Wan or Tsuen Wan West MTR. 工業大廈，請乘升降機上 13 樓。由荃灣或荃灣西站前往請預留步行時間。',
            mapLink: 'https://maps.app.goo.gl/6oxTsRNSUwmtibUx9',
            lat: 22.373556,
            lng: 114.107284,
            sectionTitle: 'Pickup deal / 自取優惠',
            sectionHtml:
                '<p class="text-sm text-gray-700">Tsuen Wan pickup is 15% off (85 折), every day. Same menu as Sai Ying Pun and Tin Hau: Classic Beef, Hottest Beef, 3.2.1, smoked salmon, buffalo chicken, soft-shell crab, and vegetarian burgers.</p>' +
                '<p class="text-sm text-gray-700">荃灣自取全日 85 折，菜單與西營盤、天后相同：經典芝士牛肉、墨辣、3.2.1、煙三文魚、水牛城脆雞、軟殼蟹及素食漢堡。</p>',
            cta: 'Order Tsuen Wan pickup / 荃灣自取落單',
            heroAlt: 'Halal takeaway burgers from Mirror Burger Tsuen Wan',
            mapTitle: 'Mirror Burger Tsuen Wan Google Map',
            title: 'Halal Burgers in Tsuen Wan — Takeaway | Mirror Burger 荃灣漢堡外賣',
            description:
                'Mirror Burger Tsuen Wan is takeaway only — Halal burgers from Yue Fung Industrial Building, Chai Wan Kok Street. 15% off pickup. 荃灣清真漢堡，只限外賣自取，自取 85 折。',
            ogTitle: 'Tsuen Wan Halal Burgers (Takeaway) | Mirror Burger',
            ogDescription:
                '荃灣漢堡只限外賣自取。裕豐工業大廈，自取 85 折。Foodpanda and KeeTa delivery also available.',
            crumbName: 'Tsuen Wan 荃灣',
            schemaId: SITE + '/#tsuen-wan',
            schemaName: 'Mirror Burger Tsuen Wan',
            schemaAlt: 'Mirror Burger 荃灣 (只限外賣自取)',
            streetAddress:
                'Flat 01, 13/F, Yue Fung Industrial Building, 35-45 Chai Wan Kok Street',
            locality: 'Tsuen Wan',
            region: 'New Territories',
            hoursSpec: [
                {
                    '@type': 'OpeningHoursSpecification',
                    dayOfWeek: [
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday',
                    ],
                    opens: '11:30',
                    closes: '23:30',
                },
            ],
            others: [
                { href: '/sai-ying-pun', label: 'Sai Ying Pun 西營盤漢堡' },
                { href: '/tin-hau', label: 'Tin Hau / Fortress Hill 天后漢堡' },
            ],
        },
    };

    var ALIAS = {
        SYP: 'SYP',
        syp: 'SYP',
        'sai-ying-pun': 'SYP',
        'sai ying pun': 'SYP',
        TH: 'TH',
        th: 'TH',
        'tin-hau': 'TH',
        'fortress-hill': 'TH',
        'fortress hill': 'TH',
        TW: 'TW',
        tw: 'TW',
        'tsuen-wan': 'TW',
        'tsuen wan': 'TW',
    };

    function resolveCode() {
        var params = new URLSearchParams(location.search);
        var q = String(params.get('store') || '').trim();
        if (q && ALIAS[q]) return ALIAS[q];
        if (q && ALIAS[q.toLowerCase()]) return ALIAS[q.toLowerCase()];
        var path = (location.pathname || '').replace(/\/+$/, '').toLowerCase();
        if (path.endsWith('/sai-ying-pun') || path.endsWith('sai-ying-pun.html')) return 'SYP';
        if (path.endsWith('/tin-hau') || path.endsWith('tin-hau.html')) return 'TH';
        if (path.endsWith('/fortress-hill') || path.endsWith('fortress-hill.html')) return 'TH';
        if (path.endsWith('/tsuen-wan') || path.endsWith('tsuen-wan.html')) return 'TW';
        return 'SYP';
    }

    function setMeta(name, content, attr) {
        attr = attr || 'name';
        var el = document.querySelector('meta[' + attr + '="' + name + '"]');
        if (el) el.setAttribute('content', content);
    }

    function setLink(rel, href) {
        document.querySelectorAll('link[rel="' + rel + '"]').forEach(function (el) {
            el.setAttribute('href', href);
        });
        document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(function (el) {
            el.setAttribute('href', href);
        });
    }

    function hydrate(store) {
        var orderHref = '/?store=' + encodeURIComponent(store.slug) + '&order=1';
        var canonical = SITE + store.path;

        document.title = store.title;
        setMeta('description', store.description);
        setMeta('og:url', canonical, 'property');
        setMeta('og:title', store.ogTitle, 'property');
        setMeta('og:description', store.ogDescription, 'property');
        setLink('canonical', canonical);

        var hero = document.getElementById('store-hero');
        if (hero) {
            hero.src = HERO;
            hero.alt = store.heroAlt;
        }

        var setText = function (id, text) {
            var el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        setText('store-eyebrow', store.eyebrow);
        setText('store-h1-en', store.h1En);
        setText('store-h1-zh', store.h1Zh);
        setText('store-intro-en', store.introEn);
        setText('store-intro-zh', store.introZh);
        setText('store-addr-en', store.addrEn);
        setText('store-addr-zh', store.addrZh);
        setText('store-hrs-en', store.hrsEn);
        setText('store-hrs-zh', store.hrsZh);
        setText('store-transit', store.transit);
        setText('store-section-title', store.sectionTitle);
        setText('store-cta-label', store.cta);

        var sectionBody = document.getElementById('store-section-body');
        if (sectionBody) sectionBody.innerHTML = store.sectionHtml;

        var mapLink = document.getElementById('store-map-link');
        if (mapLink) mapLink.href = store.mapLink;

        var map = document.getElementById('store-map');
        if (map) {
            map.title = store.mapTitle;
            map.src =
                'https://maps.google.com/maps?q=' +
                store.lat +
                ',' +
                store.lng +
                '&z=16&hl=zh-TW&output=embed';
        }

        document.querySelectorAll('[data-order-cta]').forEach(function (a) {
            a.setAttribute('href', orderHref);
        });

        var others = document.getElementById('store-others');
        if (others) {
            others.innerHTML = store.others
                .map(function (o) {
                    return '<p><a class="underline" href="' + o.href + '">' + o.label + '</a></p>';
                })
                .join('') +
                '<p><a class="underline" href="/">Full menu 完整菜單</a></p>';
        }

        var ld = {
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'BreadcrumbList',
                    itemListElement: [
                        { '@type': 'ListItem', position: 1, name: 'Mirror Burger', item: SITE + '/' },
                        { '@type': 'ListItem', position: 2, name: store.crumbName, item: canonical },
                    ],
                },
                {
                    '@type': 'Restaurant',
                    '@id': store.schemaId,
                    name: store.schemaName,
                    alternateName: store.schemaAlt,
                    url: canonical,
                    image:
                        'https://res.cloudinary.com/dnuhe2uwy/image/upload/w_1200,f_auto,q_auto/v1777801017/IMG_2364_sr2yuj.jpg',
                    servesCuisine: ['Burger', 'Halal', 'American'],
                    suitableForDiet: [
                        'https://schema.org/HalalDiet',
                        'https://schema.org/VegetarianDiet',
                    ],
                    priceRange: '$$',
                    currenciesAccepted: 'HKD',
                    acceptsReservations: 'False',
                    menu: SITE + '/#menu-section',
                    address: {
                        '@type': 'PostalAddress',
                        streetAddress: store.streetAddress,
                        addressLocality: store.locality,
                        addressRegion: store.region,
                        addressCountry: 'HK',
                    },
                    geo: {
                        '@type': 'GeoCoordinates',
                        latitude: store.lat,
                        longitude: store.lng,
                    },
                    hasMap: store.mapLink,
                    openingHoursSpecification: store.hoursSpec,
                },
            ],
        };
        var ldEl = document.getElementById('store-ldjson');
        if (ldEl) ldEl.textContent = JSON.stringify(ld);

        // Keep pretty URL in the address bar when opened as /menu.html?store=
        var path = (location.pathname || '').replace(/\/+$/, '');
        if (/menu\.html$/i.test(path) || /\/menu$/i.test(path)) {
            try {
                history.replaceState(null, '', store.path);
            } catch (_) { /* ignore */ }
        }
    }

    // —— Language (unchanged behaviour) ——
    var params = new URLSearchParams(location.search);
    var navLang = (navigator.language || '').toLowerCase();
    var current = params.get('lang')
        ? params.get('lang').toLowerCase().startsWith('zh')
            ? 'zh'
            : 'en'
        : navLang.includes('zh')
          ? 'zh'
          : 'en';

    function applyLang() {
        document.body.classList.toggle('lang-en', current === 'en');
        document.body.classList.toggle('lang-zh', current === 'zh');
        document.querySelectorAll('.js-lang-btn').forEach(function (btn) {
            btn.textContent = current === 'en' ? '中文' : 'ENG';
        });
    }

    window.toggleLang = function () {
        current = current === 'en' ? 'zh' : 'en';
        applyLang();
    };

    var code = resolveCode();
    var store = STORES[code] || STORES.SYP;
    hydrate(store);
    applyLang();
})();
