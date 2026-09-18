/**
 * Single public API entry (Hobby ≤12 serverless functions).
 *
 * Call via:
 *   POST/GET /api/router?route=kitchen-menu
 *   POST /api/router  body: { route: "kitchen-menu", ... }
 *
 * vercel.json rewrites keep old URLs working (no HTML/JS changes needed):
 *   /api/kitchen-menu → /api/router?route=kitchen-menu
 *
 * Independent (not routed here): kpay-checkout, kpay-notify, webhook
 *
 * Handlers live in lib/api-routes/ so they are NOT counted as separate functions.
 */
const ROUTES = {
    'admin-login': () => require('../lib/api-routes/adminLogin.js'),
    'admin-menu': () => require('../lib/api-routes/adminMenu.js'),
    'kitchen-login': () => require('../lib/api-routes/kitchenLogin.js'),
    'kitchen-menu': () => require('../lib/api-routes/kitchenMenu.js'),
    checkout: () => require('../lib/api-routes/checkout.js'),
    'ai-parse-order': () => require('../lib/api-routes/aiParseOrder.js'),
    'push-subscribe': () => require('../lib/api-routes/pushSubscribe.js'),
    'push-vapid-public': () => require('../lib/api-routes/pushVapidPublic.js'),
    'cleanup-pending': () => require('../lib/api-routes/cleanupPending.js'),
};

// Optional aliases if body.route uses underscores
const ACTION_ALIASES = {
    admin_login: 'admin-login',
    admin_menu: 'admin-menu',
    kitchen_login: 'kitchen-login',
    kitchen_menu: 'kitchen-menu',
    ai_parse_order: 'ai-parse-order',
    push_subscribe: 'push-subscribe',
    push_vapid_public: 'push-vapid-public',
    cleanup_pending: 'cleanup-pending',
};

function pathBasename(urlPath) {
    const clean = String(urlPath || '').split('?')[0].replace(/\/+$/, '');
    const parts = clean.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
}

function resolveRouteKey(req) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let q;
    try {
        q = new URL(req.url || '', 'https://mirrorburger.com').searchParams;
    } catch {
        q = new URLSearchParams();
    }

    // Prefer ?route= from vercel rewrite. Do NOT use body.action —
    // kitchen-menu / admin-menu already use body.action for sub-commands.
    let key = String(
        q.get('route') ||
        body.route ||
        (typeof body.routerAction === 'string' ? body.routerAction : '') ||
        ''
    ).trim();

    if (key && ACTION_ALIASES[key]) key = ACTION_ALIASES[key];
    if (key && ROUTES[key]) return key;

    const candidates = [
        req.headers['x-forwarded-uri'],
        req.headers['x-invoke-path'],
        req.headers['x-vercel-original-path'],
        req.url,
    ];
    for (const c of candidates) {
        const base = pathBasename(c);
        if (base && base !== 'router' && ROUTES[base]) return base;
        if (base && ACTION_ALIASES[base] && ROUTES[ACTION_ALIASES[base]]) {
            return ACTION_ALIASES[base];
        }
    }
    return '';
}

module.exports = async (req, res) => {
    const routeKey = resolveRouteKey(req);
    if (!routeKey || !ROUTES[routeKey]) {
        return res.status(404).json({
            error: 'Unknown route',
            hint: 'Pass ?route=kitchen-menu (or body.route). See api/router.js ROUTES.',
            route: routeKey || null,
        });
    }
    try {
        const handler = ROUTES[routeKey]();
        return await handler(req, res);
    } catch (err) {
        console.error('router error:', routeKey, err);
        if (!res.headersSent) {
            return res.status(err.status || 500).json({ error: err.message || 'Router failed' });
        }
    }
};
