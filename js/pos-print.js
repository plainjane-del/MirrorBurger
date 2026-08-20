/* POS kitchen tickets.
 * 1) Gprinter GP-58MBIII+ (USB ESC/POS, VID 6868 / PID 0200) via WebUSB or Web Serial
 * 2) Sunmi JS USDK on Android Sunmi devices
 * 3) Browser 58mm print as last resort
 *
 * Printer model is stored per till (mb_pos_printer_driver) so a later admin
 * picker can switch drivers without rewriting the ticket layout.
 */
(function (global) {
    const STORE_ZH = {
        'Sai Ying Pun': '西營盤',
        'Fortress Hill': '天后',
        'Tsuen Wan (Takeaway Only)': '荃灣',
    };
    const PAY_ZH = { cash: '現金', fps: '轉數快', payme: 'PayMe', card: '卡機' };
    const DRIVER_KEY = 'mb_pos_printer_driver';
    const GPRINTER_VID = 0x6868;
    const GPRINTER_PID = 0x0200;
    const DOTS = 384;

    let sdk = null;
    let readySunmi = false;
    let usb = null;
    let serialPort = null;
    let serialWriter = null;

    function currentDriver() {
        try { return localStorage.getItem(DRIVER_KEY) || 'gprinter-usb'; } catch (_) {
            return 'gprinter-usb';
        }
    }
    function setDriver(name) {
        try { localStorage.setItem(DRIVER_KEY, name); } catch (_) {}
    }
    function isAndroid() {
        return /android/i.test(navigator.userAgent || '');
    }
    function setStatus(label, ok) {
        const el = document.getElementById('print-status');
        if (!el) return;
        el.textContent = label;
        el.classList.toggle('is-on', !!ok);
    }
    function usbReady() { return !!(usb && usb.device && usb.device.opened); }
    function serialReady() { return !!(serialPort && serialWriter); }
    function gprinterReady() { return usbReady() || serialReady(); }
    function isSocketUp() {
        return !!(sdk && sdk.socketManager && sdk.socketManager.connected);
    }

    function concatBytes(parts) {
        let n = 0;
        for (let i = 0; i < parts.length; i++) n += parts[i].length;
        const out = new Uint8Array(n);
        let o = 0;
        for (let i = 0; i < parts.length; i++) {
            out.set(parts[i], o);
            o += parts[i].length;
        }
        return out;
    }

    async function writeUsb(bytes) {
        const chunk = 512;
        for (let i = 0; i < bytes.length; i += chunk) {
            await usb.device.transferOut(usb.endpoint, bytes.subarray(i, i + chunk));
        }
    }
    async function writeSerial(bytes) {
        await serialWriter.write(bytes);
    }
    async function writePrinter(bytes) {
        if (usbReady()) return writeUsb(bytes);
        if (serialReady()) return writeSerial(bytes);
        throw new Error('出單機未駁');
    }

    function findBulkOut(device) {
        const ifaces = (device.configuration && device.configuration.interfaces) || [];
        for (let i = 0; i < ifaces.length; i++) {
            const iface = ifaces[i];
            const alts = iface.alternates || [];
            for (let a = 0; a < alts.length; a++) {
                const alt = alts[a];
                const eps = alt.endpoints || [];
                for (let e = 0; e < eps.length; e++) {
                    const ep = eps[e];
                    if (ep.direction === 'out' && (ep.type === 'bulk' || ep.type === 'interrupt')) {
                        return {
                            interfaceNumber: iface.interfaceNumber,
                            alternateSetting: alt.alternateSetting,
                            endpoint: ep.endpointNumber,
                        };
                    }
                }
            }
        }
        return null;
    }

    async function openUsbDevice(device) {
        await device.open();
        if (!device.configuration) await device.selectConfiguration(1);
        const found = findBulkOut(device);
        if (!found) {
            try { await device.close(); } catch (_) {}
            throw new Error('呢部 USB 機冇輸出端');
        }
        try {
            await device.claimInterface(found.interfaceNumber);
        } catch (err) {
            try { await device.close(); } catch (_) {}
            throw new Error('Chrome 用唔到呢部 USB 機（可能 Windows 驅動霸住）。請用 Chrome，插 9V 火牛，再撳「出單機」揀 GP-58MBIII+。');
        }
        if (found.alternateSetting) {
            try { await device.selectAlternateInterface(found.interfaceNumber, found.alternateSetting); } catch (_) {}
        }
        usb = { device: device, endpoint: found.endpoint, iface: found.interfaceNumber };
        setDriver('gprinter-usb');
        return true;
    }

    async function reconnectUsb() {
        if (!navigator.usb || typeof navigator.usb.getDevices !== 'function') return false;
        try {
            const list = await navigator.usb.getDevices();
            const known = list.filter(function (d) { return d.vendorId === GPRINTER_VID; })[0]
                || list.filter(function (d) { return d.productId === GPRINTER_PID; })[0];
            if (!known) return false;
            await openUsbDevice(known);
            return true;
        } catch (err) {
            console.warn('USB reconnect failed:', err);
            usb = null;
            return false;
        }
    }

    async function requestUsb() {
        if (!navigator.usb || typeof navigator.usb.requestDevice !== 'function') {
            throw new Error('呢個瀏覽器唔支援 USB 出單。請用 Chrome / Edge。');
        }
        const device = await navigator.usb.requestDevice({
            filters: [
                { vendorId: GPRINTER_VID, productId: GPRINTER_PID },
                { vendorId: GPRINTER_VID },
                { classCode: 7 },
                {},
            ],
        });
        await openUsbDevice(device);
        return true;
    }

    async function closeSerial() {
        try { if (serialWriter) await serialWriter.releaseLock(); } catch (_) {}
        serialWriter = null;
        try { if (serialPort) await serialPort.close(); } catch (_) {}
        serialPort = null;
    }

    async function openSerialPort(port) {
        await port.open({ baudRate: 9600 });
        serialPort = port;
        serialWriter = port.writable.getWriter();
        setDriver('gprinter-usb');
        return true;
    }

    async function reconnectSerial() {
        if (!navigator.serial || typeof navigator.serial.getPorts !== 'function') return false;
        try {
            const ports = await navigator.serial.getPorts();
            if (!ports.length) return false;
            await openSerialPort(ports[0]);
            return true;
        } catch (err) {
            console.warn('Serial reconnect failed:', err);
            await closeSerial();
            return false;
        }
    }

    async function requestSerial() {
        if (!navigator.serial || typeof navigator.serial.requestPort !== 'function') {
            throw new Error('呢個瀏覽器唔支援 Serial 出單');
        }
        const port = await navigator.serial.requestPort({ filters: [] });
        await openSerialPort(port);
        return true;
    }

    function wrapText(ctx, text, maxWidth) {
        const src = String(text == null ? '' : text);
        if (!src) return [' '];
        const chars = Array.from(src);
        const lines = [];
        let line = '';
        for (let i = 0; i < chars.length; i++) {
            const trial = line + chars[i];
            if (line && ctx.measureText(trial).width > maxWidth) {
                lines.push(line);
                line = chars[i];
            } else {
                line = trial;
            }
        }
        if (line) lines.push(line);
        return lines.length ? lines : [' '];
    }

    function ticketCanvas(job) {
        const W = DOTS;
        const rows = [
            { text: '廚房單', size: 28, align: 'center', bold: true },
            { text: 'MIRROR BURGER', size: 22, align: 'center', bold: true },
            job.store ? { text: job.store, size: 22, align: 'center', bold: true } : null,
            { text: '--------------------------------', size: 18, align: 'center', bold: false },
            { text: '#' + job.orderNo, size: 54, align: 'center', bold: true },
            job.fulfill ? { text: job.fulfill, size: 28, align: 'center', bold: true } : null,
            job.pay ? { text: job.pay, size: 22, align: 'center', bold: true } : null,
            { text: '--------------------------------', size: 18, align: 'center', bold: false },
        ];
        (job.lines || []).forEach((row) => {
            if (row.kind === 'item') rows.push({ text: row.text, size: 26, align: 'left', bold: true });
            else rows.push({ text: '  ' + row.text, size: 20, align: 'left', bold: false });
        });
        rows.push({ text: '--------------------------------', size: 18, align: 'center', bold: false });
        if (job.guest) rows.push({ text: '客人 ' + job.guest, size: 20, align: 'left', bold: true });
        rows.push({ text: '$' + job.total, size: 36, align: 'center', bold: true });
        rows.push({ text: job.when, size: 18, align: 'center', bold: false });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const fontOf = (row) => (row.bold ? '700 ' : '600 ') + row.size + 'px "PingFang HK","Noto Sans TC","Microsoft JhengHei",sans-serif';
        const laid = [];
        let y = 10;
        rows.filter(Boolean).forEach((row) => {
            ctx.font = fontOf(row);
            const wrapped = wrapText(ctx, row.text, W - 16);
            const h = wrapped.length * (row.size + 6);
            laid.push({ row: row, wrapped: wrapped, y: y, h: h });
            y += h;
        });
        canvas.width = W;
        canvas.height = Math.max(y + 20, 80);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'top';
        laid.forEach((item) => {
            ctx.font = fontOf(item.row);
            item.wrapped.forEach((t, i) => {
                const tw = ctx.measureText(t).width;
                let x = 8;
                if (item.row.align === 'center') x = Math.max(0, (W - tw) / 2);
                ctx.fillText(t, x, item.y + i * (item.row.size + 6));
            });
        });
        return canvas;
    }

    function canvasToRaster(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const img = ctx.getImageData(0, 0, width, height);
        const widthBytes = Math.ceil(width / 8);
        const data = new Uint8Array(widthBytes * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const lum = img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11;
                if (lum < 160) data[y * widthBytes + (x >> 3)] |= (0x80 >> (x & 7));
            }
        }
        return { widthBytes: widthBytes, height: height, data: data };
    }

    function rasterToEscPos(raster) {
        const parts = [new Uint8Array([0x1b, 0x40])];
        const maxH = 120;
        for (let y = 0; y < raster.height; y += maxH) {
            const h = Math.min(maxH, raster.height - y);
            const hdr = new Uint8Array([
                0x1d, 0x76, 0x30, 0x00,
                raster.widthBytes & 0xff, (raster.widthBytes >> 8) & 0xff,
                h & 0xff, (h >> 8) & 0xff,
            ]);
            parts.push(hdr, raster.data.subarray(y * raster.widthBytes, (y + h) * raster.widthBytes));
        }
        parts.push(new Uint8Array([0x1b, 0x64, 0x05]));
        return concatBytes(parts);
    }

    async function printGprinter(job, openDrawer) {
        const canvas = ticketCanvas(job);
        const bytes = rasterToEscPos(canvasToRaster(canvas));
        await writePrinter(bytes);
        if (openDrawer) {
            try { await writePrinter(new Uint8Array([0x1b, 0x70, 0x00, 0x3c, 0x78])); } catch (_) {}
        }
    }

    function waitConnected(ms) {
        return new Promise((resolve) => {
            const t0 = Date.now();
            (function tick() {
                if (isSocketUp()) return resolve(true);
                if (Date.now() - t0 > ms) return resolve(false);
                setTimeout(tick, 200);
            })();
        });
    }
    function resetSocket() {
        try { sdk && sdk.socketManager && sdk.socketManager.disconnect(); } catch (_) {}
        if (sdk) {
            sdk.socketManager = null;
            sdk.printer = null;
        }
    }
    async function connectSunmi(opts) {
        const launch = !!(opts && opts.launch);
        if (typeof SUNMI !== 'function') {
            return false;
        }
        if (!sdk) sdk = new SUNMI();
        if (isSocketUp()) {
            readySunmi = true;
            setStatus('Sunmi 已駁', true);
            return true;
        }
        if (!isAndroid()) return false;
        setStatus('駁緊出單機…', false);
        if (!sdk.socketManager) sdk.init();
        if (await waitConnected(1000)) {
            readySunmi = true;
            setStatus('Sunmi 已駁', true);
            return true;
        }
        if (!launch) {
            readySunmi = false;
            return false;
        }
        try { await sdk.launchPrinterService(); } catch (_) {}
        resetSocket();
        sdk.init();
        readySunmi = await waitConnected(4000);
        if (readySunmi) setStatus('Sunmi 已駁', true);
        return readySunmi;
    }

    async function printSunmi(job, openDrawer) {
        const { Align } = sdk.ENUM;
        const { BaseStyle, TextStyle } = sdk.class;
        const line = sdk.printer.lineApi;
        const center = () => TextStyle.getStyle().setAlign(Align.CENTER).setEnableBold(true);
        const left = () => TextStyle.getStyle().setAlign(Align.LEFT);
        const huge = () => TextStyle.getStyle().setAlign(Align.CENTER).setEnableBold(true).setTextSize(56).setTextHeightRatio(1).setTextWidthRatio(1);

        await line.initLine(BaseStyle.getStyle().setAlign(Align.CENTER));
        await line.printText('廚房單', center().setTextSize(28));
        await line.printText('MIRROR BURGER', center().setTextSize(24));
        if (job.store) await line.printText(job.store, center());
        await line.printDividingLine(sdk.ENUM.DividingLine.DOTTED, 2);
        await line.printText('#' + job.orderNo, huge());
        if (job.fulfill) await line.printText(job.fulfill, center().setTextSize(32));
        if (job.pay) await line.printText(job.pay, center());
        await line.printDividingLine(sdk.ENUM.DividingLine.DOTTED, 2);
        await line.initLine(BaseStyle.getStyle().setAlign(Align.LEFT));
        for (const row of job.lines) {
            if (row.kind === 'item') {
                await line.printText(row.text, left().setEnableBold(true).setTextSize(28));
            } else {
                await line.printText('  ' + row.text, left().setTextSize(22));
            }
        }
        await line.printDividingLine(sdk.ENUM.DividingLine.DOTTED, 2);
        if (job.guest) await line.printText('客人 ' + job.guest, left());
        await line.printText('$' + job.total, center().setTextSize(32).setEnableBold(true));
        await line.printText(job.when, center().setTextSize(20));
        await line.autoOut();

        if (openDrawer) {
            try {
                const pulse = [0x1b, 0x70, 0x00, 0x3c, 0x78].map((b) => b.toString(16).padStart(2, '0'));
                await sdk.printer.commandApi.sendEscCommand(pulse);
            } catch (_) {}
        }
    }

    function printBrowser(job) {
        const rows = job.lines.map((row) =>
            row.kind === 'item'
                ? `<div class="item">${escapeHtml(row.text)}</div>`
                : `<div class="detail">${escapeHtml(row.text)}</div>`
        ).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@page { size: 58mm auto; margin: 2mm; }
body { width: 54mm; margin: 0; color: #000; font-family: "PingFang HK","Noto Sans TC",sans-serif; font-weight: 800; }
h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
.no { font-size: 28px; text-align: center; margin: 6px 0; letter-spacing: -0.04em; }
.center { text-align: center; }
.item { font-size: 14px; margin-top: 6px; }
.detail { font-size: 12px; padding-left: 8px; font-weight: 700; }
hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
</style></head><body>
<h1>廚房單</h1>
<h1>MIRROR BURGER</h1>
<div class="center">${escapeHtml(job.store)}</div>
<hr>
<div class="no">#${escapeHtml(job.orderNo)}</div>
<div class="center">${escapeHtml(job.fulfill)}</div>
<div class="center">${escapeHtml(job.pay)}</div>
<hr>
${rows}
<hr>
${job.guest ? `<div>客人 ${escapeHtml(job.guest)}</div>` : ''}
<div class="no">$${escapeHtml(job.total)}</div>
<div class="center">${escapeHtml(job.when)}</div>
</body></html>`;
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument;
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(() => {
            try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (_) {}
            setTimeout(() => iframe.remove(), 2500);
        }, 250);
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function ticketLines(data, items) {
        const store = STORE_ZH[data.store_name || global.currentStore] || (data.store_name || global.currentStore || '');
        const pay = PAY_ZH[data.pay_method] || data.pay_method || '';
        const when = new Date().toLocaleString('zh-HK', { hour12: false, hour: '2-digit', minute: '2-digit' });
        const guest = data.customer_name || '';
        const lines = [];
        (items || []).forEach((it) => {
            const name = it.nameZh || it.nameEn || it.menuId || '';
            lines.push({ kind: 'item', text: `${it.qty || 1}× ${name}` });
            if (it.detailsZh) lines.push({ kind: 'detail', text: String(it.detailsZh) });
        });
        return {
            store,
            orderNo: String(data.orderNo || ''),
            fulfill: data.pickup_time || '',
            pay,
            total: data.total,
            guest,
            when,
            lines,
        };
    }

    async function printTestSlip() {
        await printGprinter({
            store: '佳博 58MBIII+',
            orderNo: 'OK',
            fulfill: '出單機已駁',
            pay: '',
            total: '',
            guest: '',
            when: new Date().toLocaleString('zh-HK', { hour12: false }),
            lines: [{ kind: 'item', text: 'Mirror Burger POS' }],
        }, false);
    }

    async function connect(opts) {
        const launch = !!(opts && opts.launch);
        if (gprinterReady()) {
            setStatus('佳博已駁', true);
            return true;
        }
        if (await reconnectUsb() || await reconnectSerial()) {
            setStatus('佳博已駁', true);
            return true;
        }
        if (launch) {
            setStatus('揀出單機…', false);
            try {
                await requestUsb();
                setStatus('佳博已駁', true);
                try { await printTestSlip(); } catch (err) { console.warn('test print', err); }
                if (typeof global.showToast === 'function') global.showToast('已駁佳博出單機，試咗印一張');
                return true;
            } catch (err) {
                if (err && err.name === 'NotFoundError') {
                    try {
                        await requestSerial();
                        setStatus('佳博已駁', true);
                        try { await printTestSlip(); } catch (_) {}
                        return true;
                    } catch (err2) {
                        console.warn('serial pick failed', err2);
                    }
                }
                if (err && err.name !== 'NotFoundError') {
                    setStatus(err.message || '駁唔到出單機', false);
                    if (typeof global.showToast === 'function') {
                        global.showToast(err.message || '駁唔到佳博出單機。請用 Chrome，USB 插實再撳一次。');
                    }
                }
            }
        }
        if (currentDriver() !== 'gprinter-usb' || isAndroid()) {
            const ok = await connectSunmi(opts);
            if (ok) return true;
        }
        setStatus(launch ? '未揀到出單機' : '出單機未駁', false);
        return false;
    }

    async function printTicket(data, items, opts) {
        const job = ticketLines(data, items);
        const openDrawer = !!(opts && opts.openDrawer);
        if (!gprinterReady()) await connect({ launch: false });
        if (gprinterReady()) {
            try {
                await printGprinter(job, openDrawer);
                if (typeof global.showToast === 'function') global.showToast('已出廚房單 #' + job.orderNo);
                return true;
            } catch (err) {
                usb = null;
                await closeSerial();
                setStatus('出單失敗', false);
                console.warn('Gprinter print failed:', err);
            }
        }
        if (!readySunmi) await connectSunmi({ launch: isAndroid() && currentDriver() === 'sunmi' });
        if (readySunmi) {
            try {
                await printSunmi(job, openDrawer);
                if (typeof global.showToast === 'function') global.showToast('已出廚房單 #' + job.orderNo);
                return true;
            } catch (err) {
                readySunmi = false;
                setStatus('出單失敗', false);
                console.warn('Sunmi print failed:', err);
            }
        }
        if (opts && opts.forceBrowser) {
            printBrowser(job);
            return true;
        }
        if (typeof global.showToast === 'function') {
            global.showToast('單已入廚房。撳右上「出單機」駁佳博再重印。');
        }
        return false;
    }

    if (navigator.usb && navigator.usb.addEventListener) {
        navigator.usb.addEventListener('disconnect', (ev) => {
            if (usb && usb.device === ev.device) {
                usb = null;
                setStatus('出單機已拔', false);
            }
        });
    }

    global.PosPrint = {
        connect: connect,
        printTicket: printTicket,
        isReady: () => gprinterReady() || readySunmi,
        currentDriver: currentDriver,
        setDriver: setDriver,
    };
})(window);
