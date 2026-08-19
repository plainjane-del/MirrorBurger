const crypto = require('crypto');
const {
    getStoreSecret,
    getMasterSecret,
    makeKitchenToken,
    verifyKitchenTokenAny,
} = require('./_kitchenAuth.js');
const {
    MASTER_ID,
    passwordMatches,
    saveHash,
    validateNewPassword,
    accountIdFor,
} = require('./_kitchenPasswords.js');

function compare(input, target) {
    const a = Buffer.from(String(input));
    const b = Buffer.from(String(target || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readToken(req, body) {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    return body.token || bearer || '';
}

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

        if (body.action === 'change_password') {
            const auth = verifyKitchenTokenAny(readToken(req, body));
            if (!auth) return res.status(401).json({ error: 'Session expired' });
            const current = String(body.currentPassword || '');
            const next = String(body.newPassword || '');
            try {
                validateNewPassword(next);
            } catch (err) {
                return res.status(err.status || 400).json({ error: err.message });
            }
            const accountId = auth.scope === 'all_stores'
                ? MASTER_ID
                : accountIdFor(auth.store_name);
            if (!accountId) {
                return res.status(400).json({ error: 'Missing store' });
            }
            const currentOk = await passwordMatches(accountId, current);
            if (!currentOk) {
                return res.status(401).json({ error: '而家呢個密碼唔正確' });
            }
            try {
                await saveHash(accountId, next);
            } catch (err) {
                if (err.code === 'MISSING_TABLE') {
                    return res.status(500).json({
                        error: '未開密碼表。請喺 Supabase SQL Editor 跑 supabase/kitchen-credentials.sql',
                    });
                }
                throw err;
            }
            return res.status(200).json({
                ok: true,
                account: auth.scope === 'all_stores' ? 'master' : accountId,
            });
        }

        if (body.token && !body.password) {
            const auth = verifyKitchenTokenAny(body.token);
            if (auth) {
                return res.status(200).json({
                    ok: true,
                    token: makeKitchenToken(auth),
                    scope: auth.scope,
                    store_name: auth.store_name || '',
                });
            }
            return res.status(401).json({ error: 'Session expired' });
        }

        const password = String(body.password || '').trim();
        let auth = null;
        if (requestedStore) {
            if (await passwordMatches(requestedStore, password)) {
                auth = { scope: 'single_store', store_name: requestedStore };
            } else if (await passwordMatches(MASTER_ID, password)) {
                auth = { scope: 'single_store', store_name: requestedStore };
            }
        } else if (await passwordMatches(MASTER_ID, password)) {
            auth = { scope: 'all_stores', store_name: '' };
        } else if (sharedSecret && compare(password, sharedSecret)) {
            auth = { scope: 'all_stores', store_name: '', secret: sharedSecret };
        }

        if (!auth) {
            return res.status(401).json({ error: 'Wrong password' });
        }

        return res.status(200).json({
            ok: true,
            token: makeKitchenToken(auth),
            scope: auth.scope,
            store_name: auth.store_name || '',
        });
    } catch (err) {
        console.error('kitchen-login error:', err);
        return res.status(500).json({ error: 'Login failed' });
    }
};
