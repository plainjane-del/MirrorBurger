// Shared Hong Kong store hours. Used by website, kitchen, and checkout.
// Keep this the single source of truth with the times shown on the site.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MBStoreHours = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    function windowFor(storeName, weekday) {
        if (storeName === 'Sai Ying Pun') return { open: 11 * 60 + 15, close: 24 * 60 };
        if (storeName === 'Fortress Hill') {
            const close = (weekday === 5 || weekday === 6) ? (23 * 60 + 30) : (21 * 60 + 30);
            return { open: 11 * 60 + 15, close };
        }
        if (storeName === 'Tsuen Wan (Takeaway Only)') return { open: 11 * 60 + 30, close: 23 * 60 + 30 };
        return { open: 11 * 60 + 15, close: 22 * 60 };
    }

    function hkParts(date) {
        const fmt = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Hong_Kong',
            weekday: 'short',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        });
        const map = {};
        fmt.formatToParts(date).forEach((p) => { map[p.type] = p.value; });
        return {
            weekday: WEEKDAY[map.weekday],
            year: Number(map.year),
            month: Number(map.month),
            day: Number(map.day),
            minutes: Number(map.hour) * 60 + Number(map.minute),
        };
    }

    function addDays(parts, n) {
        const utc = Date.UTC(parts.year, parts.month - 1, parts.day + n, 4, 0, 0);
        return hkParts(new Date(utc));
    }

    function hkStamp(parts, minutes) {
        let p = parts;
        let m = minutes;
        if (m >= 24 * 60) {
            p = addDays(parts, 1);
            m -= 24 * 60;
        }
        const h = Math.floor(m / 60);
        const min = m % 60;
        return new Date(Date.UTC(p.year, p.month - 1, p.day, h - 8, min, 0));
    }

    function todayWindow(storeName, date) {
        const p = hkParts(date || new Date());
        const w = windowFor(storeName, p.weekday);
        return { ...w, parts: p };
    }

    function isScheduledOpen(storeName, date) {
        const now = date || new Date();
        const { open, close, parts } = todayWindow(storeName, now);
        return parts.minutes >= open && parts.minutes < close;
    }

    function nextOpenAt(storeName, date) {
        let cursor = date || new Date();
        let p = hkParts(cursor);
        for (let i = 0; i < 8; i += 1) {
            const w = windowFor(storeName, p.weekday);
            const start = hkStamp(p, w.open);
            if (cursor < start) return start;
            p = addDays(p, 1);
            cursor = hkStamp(p, 0);
        }
        return null;
    }

    function nextCloseAt(storeName, date) {
        let cursor = date || new Date();
        let p = hkParts(cursor);
        for (let i = 0; i < 8; i += 1) {
            const w = windowFor(storeName, p.weekday);
            const end = hkStamp(p, w.close);
            if (cursor < end) return end;
            p = addDays(p, 1);
            cursor = hkStamp(p, 0);
        }
        return null;
    }

    function overrideActive(row, date) {
        if (!row || !row.override_until) return false;
        const until = new Date(row.override_until);
        if (Number.isNaN(until.getTime())) return false;
        return (date || new Date()) < until;
    }

    function overrideUntilFor(storeName, desiredOpen, date) {
        const now = date || new Date();
        const scheduled = isScheduledOpen(storeName, now);
        if (desiredOpen === scheduled) return null;
        if (!desiredOpen && scheduled) return nextOpenAt(storeName, now);
        if (desiredOpen && !scheduled) return nextCloseAt(storeName, now);
        return null;
    }

    function effectiveIsOpen(storeName, row, date) {
        const now = date || new Date();
        if (overrideActive(row, now)) return !!row.is_open;
        return isScheduledOpen(storeName, now);
    }

    return {
        todayWindow,
        isScheduledOpen,
        nextOpenAt,
        nextCloseAt,
        overrideActive,
        overrideUntilFor,
        effectiveIsOpen,
    };
}));
