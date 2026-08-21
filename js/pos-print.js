/* POS kitchen tickets — pick a path from what this till can actually do:
 * 1) Sunmi JS USDK on Sunmi OS (old Chrome or Firefox, no Play Store).
 *    USB ESC/POS (佳博、Epson TM-m30II, etc.) must be plugged into the Sunmi
 *    and selected in Sunmi printer settings.
 * 2) WebUSB / Web Serial on Chrome / Edge (computer) — any USB ESC/POS printer
 * 3) System print dialog on desktop browsers, never on Sunmi
 * iPhone Chrome and Safari cannot USB-print (same WebKit). Epson app pairing is not shared.
 */
(function (global) {
    const STORE_ZH = {
        'Sai Ying Pun': '西營盤',
        'Fortress Hill': '天后',
        'Tsuen Wan (Takeaway Only)': '荃灣',
    };
    const PAY_ZH = { cash: '現金', fps: '轉數快', payme: 'PayMe', card: '卡機' };
    const DRIVER_KEY = 'mb_pos_printer_driver';
    const PAPER_KEY = 'mb_pos_paper_mm';
    const GPRINTER_VID = 0x6868;
    const GPRINTER_PID = 0x0200;
    const EPSON_VID = 0x04B8;

    let sdk = null;
    let readySunmi = false;
    let readyBrowser = false;
    let usb = null;
    let serialPort = null;
    let serialWriter = null;

    function paperMm() {
        try {
            const n = Number(localStorage.getItem(PAPER_KEY));
            if (n === 80) return 80;
        } catch (_) {}
        return 58;
    }
    function setPaperMm(mm) {
        try { localStorage.setItem(PAPER_KEY, String(mm === 80 ? 80 : 58)); } catch (_) {}
        refreshSheet();
    }
    function paperDots() {
        return paperMm() === 80 ? 576 : 384;
    }

    function currentDriver() {
        try {
            const saved = localStorage.getItem(DRIVER_KEY);
            if (saved) return saved;
        } catch (_) {}
        return isSunmiTill() ? 'sunmi' : 'gprinter-usb';
    }
    function setDriver(name) {
        try { localStorage.setItem(DRIVER_KEY, name); } catch (_) {}
    }
    function isAndroid() {
        return /android/i.test(navigator.userAgent || '');
    }
    function isFirefox() {
        return /firefox/i.test(navigator.userAgent || '');
    }
    function isSunmiTill() {
        const ua = navigator.userAgent || '';
        if (/sunmi/i.test(ua)) return true;
        if (/android/i.test(ua)) return true;
        return isFirefox() && /linux/i.test(ua) && !/windows|mac os x|iphone|ipad/i.test(ua);
    }
    function isIosDevice() {
        const ua = navigator.userAgent || '';
        return /iPad|iPhone|iPod/i.test(ua)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }
    function hasWebUsb() {
        return !!(navigator.usb && typeof navigator.usb.requestDevice === 'function');
    }
    function hasWebSerial() {
        return !!(navigator.serial && typeof navigator.serial.requestPort === 'function');
    }
    function hasDirectUsb() {
        return hasWebUsb() || hasWebSerial();
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
            throw new Error('USB 被系統驅動霸住，直駁失敗。可改用系統列印，或喺 Windows 用 Zadig 裝 WinUSB 後再用新版 Chrome。');
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
            const known = list.filter(function (d) { return d.vendorId === EPSON_VID; })[0]
                || list.filter(function (d) { return d.vendorId === GPRINTER_VID; })[0]
                || list.filter(function (d) { return d.productId === GPRINTER_PID; })[0]
                || list[0];
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
            throw new Error('呢個瀏覽器冇 WebUSB，改用系統列印。');
        }
        const device = await navigator.usb.requestDevice({
            filters: [
                { vendorId: EPSON_VID },
                { vendorId: GPRINTER_VID, productId: GPRINTER_PID },
                { vendorId: GPRINTER_VID },
                { classCode: 7 },
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
        const W = paperDots();
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
            setDriver('sunmi');
            setStatus('出單機已駁', true);
            return true;
        }
        if (!isSunmiTill() && currentDriver() !== 'sunmi') return false;
        setStatus('駁緊出單機…', false);
        if (!sdk.socketManager) sdk.init();
        if (await waitConnected(1000)) {
            readySunmi = true;
            setDriver('sunmi');
            setStatus('出單機已駁', true);
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
        if (readySunmi) {
            setDriver('sunmi');
            setStatus('出單機已駁', true);
        }
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

    function ticketDocument(job) {
        const rows = (job.lines || []).map((row) =>
            row.kind === 'item'
                ? `<div class="item">${escapeHtml(row.text)}</div>`
                : `<div class="detail">${escapeHtml(row.text)}</div>`
        ).join('');
        const mm = paperMm();
        return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>廚房單 #${escapeHtml(job.orderNo)}</title>
<style>
@page { size: ${mm}mm auto; margin: 2mm; }
html, body { width: ${mm}mm; margin: 0; padding: 0; color: #000; background: #fff;
  font-family: "PingFang HK","Noto Sans TC","Microsoft JhengHei",sans-serif; font-weight: 800; }
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
    }

    function printViaWindow(html) {
        let w = null;
        try { w = window.open('', 'mb_pos_ticket'); } catch (_) { w = null; }
        if (!w) return false;
        try {
            w.document.open();
            w.document.write(html);
            w.document.close();
            setTimeout(function () {
                try { w.focus(); w.print(); } catch (_) {}
            }, 250);
            return true;
        } catch (err) {
            try { w.close(); } catch (_) {}
            return false;
        }
    }

    function printViaIframe(html) {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:58mm;height:800px;border:0;opacity:0;pointer-events:none';
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (!doc) {
            iframe.remove();
            return false;
        }
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(function () {
            try {
                const cw = iframe.contentWindow;
                if (cw) { cw.focus(); cw.print(); }
            } catch (_) {}
            setTimeout(function () { iframe.remove(); }, 4000);
        }, 300);
        return true;
    }

    function printBrowser(job) {
        enableBrowserPrint();
        const html = ticketDocument(job);
        if (isFirefox() && printViaWindow(html)) return true;
        if (printViaIframe(html)) return true;
        return printViaWindow(html);
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
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
            store: '出單機',
            orderNo: 'OK',
            fulfill: '出單機已駁',
            pay: '',
            total: '',
            guest: '',
            when: new Date().toLocaleString('zh-HK', { hour12: false }),
            lines: [{ kind: 'item', text: 'Mirror Burger POS' }],
        }, false);
    }

    function browserFallbackToast(kind) {
        if (typeof global.showToast !== 'function') return;
        if (isIosDevice()) {
            global.showToast('iPhone Chrome 同 Safari 都駁唔到 USB。Epson App 配對只得 App 自己用。請用店舖 Sunmi 或電腦版 Chrome 出單。');
            return;
        }
        if (kind === 'pair') {
            global.showToast('呢部瀏覽器唔支援直駁 USB。請喺列印視窗揀出單機，紙闊 ' + paperMm() + 'mm。');
            return;
        }
        global.showToast('請喺列印視窗揀出單機（' + paperMm() + 'mm）。');
    }

    function enableBrowserPrint() {
        readyBrowser = true;
        setDriver('browser');
        setStatus(isFirefox() ? 'Firefox 系統列印' : '系統列印', true);
    }

    function printBrowserTestSlip() {
        printBrowser({
            store: '出單機',
            orderNo: 'OK',
            fulfill: '請揀呢部出單機',
            pay: '',
            total: '',
            guest: '',
            when: new Date().toLocaleString('zh-HK', { hour12: false }),
            lines: [{ kind: 'item', text: '系統列印 · 紙闊 ' + paperMm() + 'mm' }],
        });
    }

    async function printSunmiTestSlip() {
        await printSunmi({
            store: '出單機',
            orderNo: 'OK',
            fulfill: '已駁',
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
            setStatus('出單機已駁', true);
            return true;
        }
        if (!isSunmiTill() && hasDirectUsb() && (await reconnectUsb() || await reconnectSerial())) {
            setStatus('出單機已駁', true);
            return true;
        }

        // Sunmi OS (old Chrome or Firefox, no Play): print via local printer service.
        if (isSunmiTill() || currentDriver() === 'sunmi') {
            const ok = await connectSunmi(opts);
            if (ok) {
                if (launch) {
                    try { await printSunmiTestSlip(); } catch (err) { console.warn('sunmi test print', err); }
                    if (typeof global.showToast === 'function') global.showToast('已駁出單機，試咗印一張');
                }
                return true;
            }
            if (launch && typeof global.showToast === 'function') {
                global.showToast('未駁到出單機。USB 線插呢部 Sunmi（佳博或 Epson 都得），喺系統揀呢部出單機，再撳一次。');
            }
            setStatus(launch ? '未駁到出單機' : '出單機未駁', false);
            if (isSunmiTill()) return false;
        }

        if (launch && hasWebUsb()) {
            setStatus('揀出單機…', false);
            try {
                await requestUsb();
                setStatus('出單機已駁', true);
                try { await printTestSlip(); } catch (err) { console.warn('test print', err); }
                if (typeof global.showToast === 'function') global.showToast('已駁出單機，試咗印一張');
                return true;
            } catch (err) {
                if (err && err.name === 'NotFoundError' && hasWebSerial()) {
                    try {
                        await requestSerial();
                        setStatus('出單機已駁', true);
                        try { await printTestSlip(); } catch (_) {}
                        return true;
                    } catch (err2) {
                        console.warn('serial pick failed', err2);
                    }
                }
                if (err && err.name !== 'NotFoundError') {
                    console.warn('USB pick failed', err);
                    if (typeof global.showToast === 'function') {
                        global.showToast(err.message || 'USB 直駁失敗。');
                    }
                }
            }
        } else if (launch && hasWebSerial()) {
            try {
                await requestSerial();
                setStatus('出單機已駁', true);
                try { await printTestSlip(); } catch (_) {}
                return true;
            } catch (err) {
                console.warn('serial pick failed', err);
            }
        }

        if (!isSunmiTill() && (launch || !hasDirectUsb() || currentDriver() === 'browser' || readyBrowser)) {
            enableBrowserPrint();
            if (launch) {
                printBrowserTestSlip();
                browserFallbackToast('pair');
            }
            return true;
        }

        setStatus(launch ? '未駁到出單機' : '出單機未駁', false);
        return false;
    }

    async function printTicket(data, items, opts) {
        const job = ticketLines(data, items);
        const openDrawer = !!(opts && opts.openDrawer);
        const forceBrowser = !!(opts && opts.forceBrowser);

        if (!forceBrowser) {
            if (!gprinterReady() && !readySunmi) await connect({ launch: false });
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
            if (!readySunmi) await connectSunmi({ launch: false });
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
        }

        if (isSunmiTill()) {
            if (typeof global.showToast === 'function') {
                global.showToast('出單失敗。撳右上「出單機」再試。USB 要插喺呢部 Sunmi。');
            }
            return false;
        }

        printBrowser(job);
        if (isIosDevice()) {
            browserFallbackToast('ticket');
        } else if (typeof global.showToast === 'function') {
            global.showToast('請喺列印視窗揀出單機 · #' + job.orderNo);
        }
        return true;
    }

    function deviceHint() {
        if (isIosDevice()) {
            return 'iPhone Chrome／Safari 都駁唔到 USB。Epson App 連機只得個 App 用，網頁 POS 用唔到。請用店舖 Sunmi 或電腦版 Chrome。';
        }
        if (isSunmiTill()) {
            return 'USB 線插呢部 Sunmi。系統設定揀 ESC/POS 出單機。佳博 GP-58 用 58mm；Epson TM-m30II 用 80mm。';
        }
        if (hasDirectUsb()) {
            return '用 Chrome／Edge 撳「駁 USB」。佳博、Epson TM-m30II、Xprinter 等 ESC/POS 熱敏機都得。';
        }
        return '呢個瀏覽器唔支援 USB。用系統列印，或改用店舖 Sunmi／電腦 Chrome。';
    }

    function refreshSheet() {
        const hint = document.getElementById('printer-hint');
        if (hint) hint.textContent = deviceHint();
        const mm = paperMm();
        const b58 = document.getElementById('paper-mm-58');
        const b80 = document.getElementById('paper-mm-80');
        if (b58) b58.classList.toggle('is-active', mm === 58);
        if (b80) b80.classList.toggle('is-active', mm === 80);
        const st = document.getElementById('printer-sheet-status');
        if (st) {
            if (gprinterReady() || readySunmi) st.textContent = '已駁 USB／Sunmi 出單機';
            else if (readyBrowser || currentDriver() === 'browser') st.textContent = '用系統列印';
            else st.textContent = '未駁出單機';
        }
        const usbBtn = document.getElementById('printer-usb-btn');
        if (usbBtn) {
            usbBtn.disabled = isIosDevice();
            usbBtn.textContent = isIosDevice() ? 'iPhone 唔支援 USB' : (isSunmiTill() ? '駁 Sunmi 出單機' : '駁 USB 出單機');
        }
    }

    function openSheet() {
        const el = document.getElementById('printer-sheet');
        if (el) el.classList.add('is-open');
        refreshSheet();
    }
    function closeSheet() {
        const el = document.getElementById('printer-sheet');
        if (el) el.classList.remove('is-open');
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
        isReady: () => gprinterReady() || readySunmi || readyBrowser || currentDriver() === 'browser',
        currentDriver: currentDriver,
        setDriver: setDriver,
        paperMm: paperMm,
        setPaperMm: setPaperMm,
        openSheet: openSheet,
        closeSheet: closeSheet,
        refreshSheet: refreshSheet,
    };
})(window);
