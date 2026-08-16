/**
 * VAPID keys for Web Push.
 * Prefer Vercel env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT).
 * Private-repo fallback so kitchen push works without manual dashboard setup.
 */
const FALLBACK_PUBLIC =
    'BGxWSgujZQlewcnVDitvBpsvMW8bkCXuuZE-HzPRLWyss71UEEfk7FWKGGGxKPBy26R7qhEYqEq7Wv83RCcZ1fk';
const FALLBACK_PRIVATE = 'pJOaRBc6CMvv2L1wO6sY_grDEkGjuNyJEUeVEY-r8K4';
const FALLBACK_SUBJECT = 'mailto:mirrorshk@gmail.com';

function getVapidConfig() {
    const publicKey = (process.env.VAPID_PUBLIC_KEY || FALLBACK_PUBLIC).trim();
    const privateKey = (process.env.VAPID_PRIVATE_KEY || FALLBACK_PRIVATE).trim();
    const subject = (process.env.VAPID_SUBJECT || FALLBACK_SUBJECT).trim();
    if (!publicKey || !privateKey) {
        return null;
    }
    return { publicKey, privateKey, subject };
}

module.exports = { getVapidConfig };
