const crypto = require('crypto');
const {
    getStoreSecret,
    getMasterSecret,
    makeKitchenToken,
    verifyKitchenTokenAny,
} = require('./_kitchenAuth.js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const sharedSecret = getStoreSecret('');
    const masterSecret = getMasterSecret();
    if (!sharedSecret && !masterSecret) {
        return res.status(500).json({ error: 'Server missing kitchen password env' });
    }

    try {
        const body = req.body || {};
        const requestedStore = String(body.store_name || '').trim();

        if (body.token) {
            const auth = verifyKitchenTokenAny(body.token);
            if (auth) {
                return res.status(200).json({
                    ok: true,
                    token: makeKitchenToken(auth.secret, auth),
                    scope: auth.scope,
                    store_name: auth.store_name || '',
                });
            }
            return res.status(401).json({ error: 'Session expired' });
        }

        const password = String(body.password || '').trim();
        const compare = (input, target) => {
            const a = Buffer.from(String(input));
            const b = Buffer.from(String(target || ''));
            return a.length === b.length && crypto.timingSafeEqual(a, b);
        };

        let auth = null;
        if (requestedStore) {
            const storeSecret = getStoreSecret(requestedStore);
            if (storeSecret && compare(password, storeSecret)) {
                auth = { scope: 'single_store', store_name: requestedStore, secret: storeSecret };
            } else if (masterSecret && compare(password, masterSecret)) {
                auth = { scope: 'single_store', store_name: requestedStore, secret: masterSecret };
            }
        } else if (masterSecret && compare(password, masterSecret)) {
            auth = { scope: 'all_stores', store_name: '', secret: masterSecret };
        } else if (sharedSecret && compare(password, sharedSecret)) {
            // Old kitchen/POS clients only sent password.
            auth = { scope: 'all_stores', store_name: '', secret: sharedSecret };
        }

        if (!auth) {
            return res.status(401).json({ error: 'Wrong password' });
        }

        return res.status(200).json({
            ok: true,
            token: makeKitchenToken(auth.secret, auth),
            scope: auth.scope,
            store_name: auth.store_name || '',
        });
    } catch (err) {
        console.error('kitchen-login error:', err);
        return res.status(500).json({ error: 'Login failed' });
    }
};
