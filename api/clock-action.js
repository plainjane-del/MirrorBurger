const { requireKitchen } = require('./_kitchenAuth.js');
const {
    normalizeStoreName,
    clipPin,
    getPayrollRules,
    findEmployeeByPin,
    findOpenTimecard,
    clockIn,
    clockOut,
} = require('./_payroll.js');
const { sendClockPush } = require('./_notify.js');

function resolveStoreAccess(auth, inputStoreName) {
    const requested = String(inputStoreName || '').trim();
    if (auth.scope === 'all_stores') {
        if (!requested) {
            const err = new Error('Missing store');
            err.status = 400;
            throw err;
        }
        return normalizeStoreName(requested);
    }
    if (requested && auth.store_name && requested !== auth.store_name) {
        const err = new Error('Forbidden store');
        err.status = 403;
        throw err;
    }
    return normalizeStoreName(auth.store_name || requested);
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const auth = requireKitchen(req);
        const body = req.body || {};
        const store_name = resolveStoreAccess(auth, body.store_name || body.store_id);
        const pin = clipPin(body.pin_code || body.pin);
        if (pin.length !== 4) {
            return res.status(400).json({ error: 'PIN 要 4 位數字' });
        }

        const employee = await findEmployeeByPin(store_name, pin);
        if (!employee) {
            return res.status(404).json({ error: '搵唔到呢個 PIN' });
        }

        const open = await findOpenTimecard(employee.id);
        if (!open) {
            const row = await clockIn(employee);
            return res.status(200).json({
                ok: true,
                action: 'clock_in',
                employee_name: employee.name,
                store_name,
                clock_in_time: row && row.clock_in_time,
                message: `${employee.name} 已開工`,
            });
        }

        const rules = await getPayrollRules(store_name);
        const { row, calc } = await clockOut(open, employee, rules);
        const payload = {
            ok: true,
            action: 'clock_out',
            employee_name: employee.name,
            store_name,
            clock_in_time: open.clock_in_time,
            clock_out_time: row && row.clock_out_time,
            total_hours: calc.total_hours,
            total_pay: calc.total_pay,
            message: `${employee.name} 收工。工時 ${calc.total_hours}，人工 HK$${calc.total_pay}`,
        };
        try {
            await sendClockPush({
                store_name,
                employee_name: employee.name,
                total_hours: calc.total_hours,
                total_pay: calc.total_pay,
            });
        } catch (err) {
            console.warn('clock-out push failed:', err.message || err);
        }
        return res.status(200).json(payload);
    } catch (err) {
        console.error('clock-action error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Failed' });
    }
};
