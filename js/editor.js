/* Hilograma MyD - pantalla "Crear": imagen, diseño en vivo y generación.
 *
 * Privacidad: la imagen solo vive en memoria mientras estás en esta pantalla.
 * Al salir, o al sellar una sorpresa, se borran los pixeles y los lienzos.
 */
(function (root) {
  'use strict';
  const E = root.HiloEngine, I = root.HiloI18n, U = root.HiloUI, St = root.HiloStore;
  const { $, el, clear, icon } = U;
  const t = (k, v) => I.t(k, v);

  const DEFAULTS = Object.freeze({
    size: 500, nPins: 288, lines: 4000, weight: 20, minDist: 20, minLoop: 20, rounds: 3,
    threadMm: 0.2, opacity: 85, diameterCm: 60, pegMm: 1.5, marginPct: 10, tieCm: 15, spoolM: 0,
    bright: 0, contrast: 0, sat: 100, bg: '#ffffff'
  });
  const GEN_KEYS = ['size', 'nPins', 'lines', 'weight', 'minDist', 'minLoop', 'rounds'];
  const IMG_KEYS = ['bright', 'contrast', 'sat'];
  const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
  const MAX_SRC_SIDE = 2048;

  const D = Object.assign({}, DEFAULTS, { colors: [{ hex: '#000000', name: '' }] });
  let img = null;            // { canvas, w, h, cx, cy, vis, rot }
  let preview = null;        // resultado del motor + key
  let job = 0, worker = null, workerOK = true, running = false, genT0 = 0;
  let waiters = [];
  let view = 'split', split = 0.5;
  let dispPhoto = null, dispSim = null, S = 0;
  let composeReq = 0, simReq = 0;
  let step = 1;
  let fields = {};
  let onFinish = null;
  let mode = 'auto', autoStyle = 'classic', autoColorsN = 3, imgStats = null, runningKey = '', cfgApi = null;

  /* ================= imagen ================= */
  function isImageMagic(h) {
    const s = (a, b) => String.fromCharCode.apply(null, h.subarray(a, b));
    if (h[0] === 0xFF && h[1] === 0xD8 && h[2] === 0xFF) return true;                     // JPEG
    if (h[0] === 0x89 && s(1, 4) === 'PNG') return true;                                   // PNG
    if (s(0, 4) === 'GIF8') return true;                                                    // GIF
    if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return true;                             // WEBP
    if (h[0] === 0x42 && h[1] === 0x4D) return true;                                        // BMP
    if (s(4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1|avif|avis)$/.test(s(8, 12))) return true; // HEIC/AVIF
    return false;
  }

  async function decode(file) {
    try {
      return await root.createImageBitmap(file);
    } catch (e) {
      const url = URL.createObjectURL(file);
      try {
        const im = new root.Image();
        im.decoding = 'async';
        im.src = url;
        await im.decode();
        return im;
      } finally { URL.revokeObjectURL(url); }
    }
  }

  async function loadImageFile(file) {
    if (!file) return;
    try {
      if (file.size > MAX_IMAGE_BYTES) throw new St.HiloError('image_big');
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (head.length < 4 || !isImageMagic(head)) throw new St.HiloError('image_type');
      let src;
      try { src = await decode(file); } catch (e) { throw new St.HiloError('image'); }
      const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
      if (!w0 || !h0 || w0 * h0 > 200e6) throw new St.HiloError('image');
      const k = Math.min(1, MAX_SRC_SIDE / Math.max(w0, h0));
      const c = root.document.createElement('canvas');
      c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, c.width, c.height);
      if (src.close) src.close();
      wipeImage();
      img = { canvas: c, w: c.width, h: c.height, cx: c.width / 2, cy: c.height / 2, vis: Math.min(c.width, c.height), rot: 0 };
      if (mode === 'auto') { applyAuto(); autoLevels(); }
      goStep(2);
      if (mode === 'auto') { buildPanels(); if (autoStyle === 'color') suggestColors(autoColorsN); }
      syncZoomField();
      refreshPhoto();
      startGen();
    } catch (e) {
      U.toast(t('e_' + (e.code || 'image')), 'err');
    } finally {
      $('fileImage').value = '';
      $('fileCamera').value = '';
    }
  }

  // Borra pixeles y lienzos de la memoria.
  function wipeImage() {
    cancelGen();
    if (img) {
      const ctx = img.canvas.getContext('2d');
      ctx.clearRect(0, 0, img.canvas.width, img.canvas.height);
      img.canvas.width = 0; img.canvas.height = 0;
      img = null;
    }
    [dispPhoto, dispSim].forEach(c => { if (c) { c.width = 0; c.height = 0; } });
    dispPhoto = null; dispSim = null;
    preview = null; imgStats = null;
    if (photoArmedSafe()) U.disarm();
    const main = $('editCanvas');
    if (main) { main.getContext('2d').clearRect(0, 0, main.width, main.height); main.width = 0; main.height = 0; }
    S = 0;   // el lienzo quedo en 0x0: obliga a recalcular su tamano con la siguiente imagen
  }

  function photoArmedSafe() { const b = $('canvasBox'); return !!(b && b.classList.contains('armed')); }

  function isMonoBW() {
    return D.colors.length === 1 && D.colors[0].hex === '#000000' && D.bg === '#ffffff';
  }

  // Dibuja el recorte (con giro y zoom) en un lienzo cuadrado.
  function drawCrop(ctx, size) {
    ctx.save();
    ctx.fillStyle = D.bg;
    ctx.fillRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    ctx.rotate(img.rot * Math.PI / 2);
    const s = size / img.vis;
    ctx.scale(s, s);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.canvas, -img.cx, -img.cy);
    ctx.restore();
  }

  function adjustPixels(data, gray) {
    const b = D.bright * 1.28;
    const C = D.contrast * 2.55;
    const f = (259 * (C + 255)) / (255 * (259 - C));
    const sat = D.sat / 100;
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], bl = data[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * bl;
      if (gray) { r = g = bl = (r + g + bl) / 3; }
      else if (sat !== 1) { r = l + (r - l) * sat; g = l + (g - l) * sat; bl = l + (bl - l) * sat; }
      data[i] = f * (r - 128) + 128 + b;
      data[i + 1] = f * (g - 128) + 128 + b;
      data[i + 2] = f * (bl - 128) + 128 + b;
    }
  }

  function computeWorking() {
    const size = D.size;
    const c = root.document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    drawCrop(ctx, size);
    const id = ctx.getImageData(0, 0, size, size);
    adjustPixels(id.data, false);
    c.width = 0; c.height = 0;
    return id.data;
  }

  /* ================= lienzo de diseño ================= */
  function dpr() { return Math.min(2, root.devicePixelRatio || 1); }

  function ensureSize() {
    const box = $('canvasBox');
    const css = Math.max(200, box.clientWidth || 360);
    const s = Math.round(Math.min(1600, css * dpr()));
    const main = $('editCanvas');
    if (s !== S || main.width !== s) {
      S = s;
      main.width = S; main.height = S;
      return true;
    }
    return false;
  }

  function refreshPhoto(low) {
    if (!img) return;
    ensureSize();
    const size = low ? Math.round(S / 2) : S;
    if (!dispPhoto) dispPhoto = root.document.createElement('canvas');
    dispPhoto.width = size; dispPhoto.height = size;
    const ctx = dispPhoto.getContext('2d', { willReadFrequently: true });
    drawCrop(ctx, size);
    const id = ctx.getImageData(0, 0, size, size);
    adjustPixels(id.data, isMonoBW());
    ctx.putImageData(id, 0, 0);
    // oscurece lo que queda fuera del marco circular
    ctx.fillStyle = 'rgba(2, 8, 6, 0.74)';
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.7)';
    ctx.lineWidth = Math.max(1, size / 400);
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - ctx.lineWidth, 0, Math.PI * 2); ctx.stroke();
    requestCompose();
  }

  function pinXY(n) {
    // posiciones en pixeles de pantalla (misma orientacion que el original)
    const r = S / 2 - S / (2 * D.size), c = S / 2;
    const xs = new Float32Array(n), ys = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; xs[i] = c + r * Math.cos(a); ys[i] = c + r * Math.sin(a); }
    return { xs, ys };
  }

  function threadStyle(ctx) {
    ctx.lineWidth = Math.max(0.04, D.threadMm * S / (D.diameterCm * 10));
    ctx.globalAlpha = Math.max(0.01, Math.min(1, D.opacity / 100));
    ctx.lineCap = 'butt';
  }

  function resetSim(nPins) {
    ensureSize();
    if (!dispSim) dispSim = root.document.createElement('canvas');
    dispSim.width = S; dispSim.height = S;
    const ctx = dispSim.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = D.bg;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.fill();
    const n = nPins || D.nPins;
    const p = pinXY(n);
    const pr = Math.max(0.6, D.pegMm * S / (D.diameterCm * 10) / 2);
    ctx.fillStyle = '#8a8a8a';
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(p.xs[i], p.ys[i], pr, 0, Math.PI * 2); ctx.fill(); }
    dispSim._pins = p;
    dispSim._n = n;
  }

  function drawSegs(seg, colors) {
    if (!dispSim || !seg || !seg.length) return;
    const ctx = dispSim.getContext('2d');
    const p = dispSim._pins;
    threadStyle(ctx);
    for (let i = 0; i < seg.length; i += 3) {
      const a = seg[i + 1], b = seg[i + 2];
      if (a >= dispSim._n || b >= dispSim._n) continue;
      ctx.strokeStyle = colors[seg[i]];
      ctx.beginPath(); ctx.moveTo(p.xs[a], p.ys[a]); ctx.lineTo(p.xs[b], p.ys[b]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function redrawSimFull() {
    if (!preview) return;
    resetSim(preview.nPins);
    const colors = preview.colors;
    const seg = [];
    for (const b of preview.blocks) for (let j = 2; j < b.length; j++) seg.push(b[0], b[j - 1], b[j]);
    drawSegs(seg, colors);
    requestCompose();
  }
  function requestSimRedraw() {
    if (simReq) return;
    simReq = root.requestAnimationFrame(() => { simReq = 0; if (!running) redrawSimFull(); });
  }

  function requestCompose() {
    if (composeReq) return;
    composeReq = root.requestAnimationFrame(() => { composeReq = 0; compose(); });
  }

  function compose() {
    const main = $('editCanvas');
    if (!img || !S || !main.width) return;
    const ctx = main.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    const hasSim = !!dispSim;
    if (view === 'photo' || !hasSim) {
      if (dispPhoto) ctx.drawImage(dispPhoto, 0, 0, S, S);
    } else if (view === 'threads') {
      ctx.drawImage(dispSim, 0, 0, S, S);
    } else {
      const sx = Math.round(split * S);
      if (dispPhoto) ctx.drawImage(dispPhoto, 0, 0, S, S);
      ctx.save();
      ctx.beginPath(); ctx.rect(sx, 0, S - sx, S); ctx.clip();
      ctx.fillStyle = '#000'; ctx.fillRect(sx, 0, S - sx, S);
      ctx.drawImage(dispSim, 0, 0, S, S);
      ctx.restore();
      // barra de comparacion
      const k = dpr();
      ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2 * k;
      ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 10 * k;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, S); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#020806';
      ctx.beginPath(); ctx.arc(sx, S / 2, 17 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#00ff88';
      ctx.beginPath();
      ctx.moveTo(sx - 4 * k, S / 2 - 6 * k); ctx.lineTo(sx - 11 * k, S / 2); ctx.lineTo(sx - 4 * k, S / 2 + 6 * k);
      ctx.moveTo(sx + 4 * k, S / 2 - 6 * k); ctx.lineTo(sx + 11 * k, S / 2); ctx.lineTo(sx + 4 * k, S / 2 + 6 * k);
      ctx.fill();
      ctx.font = (12 * k) + 'px ui-monospace, Consolas, monospace';
      ctx.textBaseline = 'top';
      label(ctx, t('view_photo').toUpperCase(), 8 * k, 8 * k, 'left');
      label(ctx, t('view_threads').toUpperCase(), S - 8 * k, 8 * k, 'right');
    }
    if (running && view !== 'photo') {
      const k = dpr();
      ctx.font = (12 * k) + 'px ui-monospace, Consolas, monospace';
      ctx.textBaseline = 'bottom';
      label(ctx, t('st_calc').toUpperCase() + ' ' + Math.round(genPct * 100) + '%', S - 8 * k, S - 8 * k, 'right');
    }
  }
  function label(ctx, txt, x, y, align) {
    ctx.textAlign = align;
    const w = ctx.measureText(txt).width, k = dpr();
    ctx.fillStyle = 'rgba(2, 8, 6, 0.75)';
    const bx = align === 'right' ? x - w - 5 * k : x - 5 * k;
    const by = ctx.textBaseline === 'top' ? y - 3 * k : y - 15 * k;
    ctx.fillRect(bx, by, w + 10 * k, 18 * k);
    ctx.fillStyle = '#00ff88';
    ctx.fillText(txt, x, y);
  }

  /* ================= gestos sobre la imagen ================= */
  const pointers = new Map();
  let gesture = null;
  let tapStart = null;
  // La foto empieza bloqueada (como las barras): un toque la desbloquea para moverla o acercarla.
  const photoArmed = () => $('canvasBox').classList.contains('armed');

  function evXY(e) {
    const r = $('editCanvas').getBoundingClientRect();
    return { x: (e.clientX - r.left) * (S / r.width), y: (e.clientY - r.top) * (S / r.height) };
  }

  function onPointerDown(e) {
    if (!img) return;
    const cv = $('editCanvas');
    const p0 = evXY(e);
    const nearSplit = view === 'split' && dispSim && Math.abs(p0.x - split * S) < 30 * dpr();
    if (!photoArmed()) {
      // bloqueada: solo se puede mover la barra de comparar; lo demas desplaza la pagina
      if (nearSplit && pointers.size === 0) {
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* puntero no capturable */ }
        pointers.set(e.pointerId, p0);
        gesture = { type: 'split', last: p0, moved: false };
        e.preventDefault();
        return;
      }
      tapStart = { x: e.clientX, y: e.clientY, t: root.performance.now(), id: e.pointerId };
      return;
    }
    U.bumpArm();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* puntero no capturable */ }
    pointers.set(e.pointerId, p0);
    if (pointers.size === 1) {
      const p = p0;
      gesture = { type: nearSplit ? 'split' : 'pan', last: p, moved: false };
    } else if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, vis0: img.vis, moved: false };
    }
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId) || !gesture || !img) return;
    const p = evXY(e);
    pointers.set(e.pointerId, p);
    if (gesture.type === 'split') {
      split = Math.min(0.98, Math.max(0.02, p.x / S));
      requestCompose();
      return;
    }
    if (gesture.type !== 'split') U.bumpArm();
    if (gesture.type === 'pan' && pointers.size === 1) {
      const dx = p.x - gesture.last.x, dy = p.y - gesture.last.y;
      gesture.last = p;
      const k = img.vis / S;
      // delta de pantalla -> delta en la imagen (rotacion inversa)
      const a = -img.rot * Math.PI / 2;
      const ux = dx * Math.cos(a) - dy * Math.sin(a), uy = dx * Math.sin(a) + dy * Math.cos(a);
      img.cx = Math.min(img.w, Math.max(0, img.cx - ux * k));
      img.cy = Math.min(img.h, Math.max(0, img.cy - uy * k));
      gesture.moved = true;
      refreshPhoto(true);
    } else if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = Array.from(pointers.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setVis(gesture.vis0 * gesture.d0 / d, true);
      gesture.moved = true;
    }
  }

  function onPointerUp(e) {
    if (tapStart && tapStart.id === e.pointerId) {
      const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
      if (e.type === 'pointerup' && moved < 10 && root.performance.now() - tapStart.t < 700 && img) U.arm($('canvasBox'));
      tapStart = null;
    }
    pointers.delete(e.pointerId);
    if (gesture && pointers.size === 0) {
      const moved = gesture.moved && gesture.type !== 'split';
      gesture = null;
      if (moved) { syncZoomField(); refreshPhoto(); startGenSoon(); }
    } else if (pointers.size === 1 && gesture && gesture.type === 'pinch') {
      gesture = { type: 'pan', last: Array.from(pointers.values())[0], moved: true };
    }
  }

  function setVis(v, low) {
    const maxV = Math.max(img.w, img.h) * 2, minV = 48;
    img.vis = Math.min(maxV, Math.max(minV, v));
    refreshPhoto(low);
  }

  function onWheel(e) {
    if (!img || !photoArmed()) return;     // bloqueada: la rueda desplaza la pagina
    U.bumpArm();
    e.preventDefault();
    setVis(img.vis * Math.exp(e.deltaY * 0.0015), true);
    syncZoomField();
    startGenSoon();
    clearTimeout(onWheel.t);
    onWheel.t = setTimeout(() => refreshPhoto(), 180);
  }

  /* ================= generacion (Web Worker o hilo principal) ================= */
  let genPct = 0;
  let liveColors = [];

  function paramsKey() {
    if (!img) return '';
    return JSON.stringify([img.cx, img.cy, img.vis, img.rot, D.bright, D.contrast, D.sat, D.size, D.nPins, D.lines,
      D.weight, D.minDist, D.minLoop, D.colors.length > 1 ? D.rounds : 1, D.bg, D.colors.map(c => c.hex)]);
  }

  function cancelGen() {
    job++;
    if (worker) { worker.terminate(); worker = null; }
    running = false;
  }

  const startGenSoon = U.debounce(() => startGen(), 650);

  function startGen() {
    if (!img) return;
    const key = paramsKey();
    if (preview && preview.key === key) return;
    if (running && runningKey === key) return;
    cancelGen();
    const my = job;
    const input = {
      rgba: computeWorking(), size: D.size, nPins: D.nPins, lines: D.lines, weight: D.weight,
      minDist: D.minDist, minLoop: D.minLoop, rounds: D.rounds, bg: D.bg, colors: D.colors.map(c => c.hex)
    };
    imgStats = measureImage(input.rgba, D.size);
    liveColors = input.colors.slice();
    preview = null;
    running = true;
    runningKey = key;
    genPct = 0;
    genT0 = root.performance.now();
    resetSim(D.nPins);
    log(t('g_start') + '…');
    setBar(0);
    updateStats();
    if (workerOK) {
      try {
        worker = new root.Worker(U.scriptURL('js/worker.js'));
        worker.onmessage = ev => handleMsg(ev.data, my, key);
        worker.onerror = ev => {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (my !== job) return;
          workerOK = false;
          if (worker) { worker.terminate(); worker = null; }
          input.rgba = computeWorking();
          runMain(input, my, key);
        };
        worker.postMessage({ type: 'run', job: my, input }, [input.rgba.buffer]);
        return;
      } catch (err) {
        workerOK = false;
        worker = null;
      }
    }
    runMain(input, my, key);
  }

  function runMain(input, my, key) {
    log(t('g_mainthread'));
    let it;
    try { it = E.generate(input); } catch (e) { handleMsg({ type: 'error', message: e.message }, my, key); return; }
    (function slice() {
      if (my !== job) return;
      const t0 = root.performance.now();
      try {
        while (root.performance.now() - t0 < 14) {
          const r = it.next();
          if (r.done) { input.rgba.fill(0); handleMsg({ type: 'done', result: r.value }, my, key); return; }
          handleMsg({ type: 'progress', p: r.value }, my, key);
        }
      } catch (e) { handleMsg({ type: 'error', message: e.message }, my, key); return; }
      setTimeout(slice, 0);
    })();
  }

  function handleMsg(m, my, key) {
    if (my !== job || !m) return;
    if (m.type === 'progress') {
      const p = m.p;
      if (p.phase === 'pins') log(t('g_pins', { n: D.nPins }));
      else if (p.phase === 'colors') { genPct = 0.1 * p.done / p.total; log(t('g_colors', { p: Math.round(100 * p.done / p.total) })); }
      else if (p.phase === 'lines') {
        genPct = 0.1 + 0.9 * p.done / p.total;
        log(t('g_lines', { d: p.done, t: p.total }));
        drawSegs(p.seg, liveColors);
      }
      setBar(genPct);
      requestCompose();
    } else if (m.type === 'done') {
      running = false;
      if (worker) { worker.terminate(); worker = null; }
      preview = Object.assign({}, m.result, { key, colors: liveColors.slice() });
      const ms = Math.round(root.performance.now() - genT0);
      log(t('g_done', { n: preview.lines, ms }));
      setBar(1);
      updateStats();
      requestCompose();
      const w = waiters; waiters = [];
      w.forEach(f => f(true));
    } else if (m.type === 'error') {
      running = false;
      log(t('g_err', { m: m.message }));
      U.toast(t('e_generic', { m: m.message }), 'err');
      const w = waiters; waiters = [];
      w.forEach(f => f(false));
    }
  }

  function waitPreview() {
    if (preview && preview.key === paramsKey()) return Promise.resolve(true);
    if (!running) startGen();
    return new Promise(res => waiters.push(res));
  }

  function log(s) { const g = $('genLog'); if (g) g.textContent = '> ' + s; }
  function setBar(f) { const b = $('genBar'); if (b) b.style.width = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + '%'; }

  /* ================= estadisticas (metros por color) ================= */
  function projectLike(src) {
    return {
      nPins: src.nPins, blocks: src.blocks, colors: D.colors.map(c => ({ hex: c.hex, name: c.name })),
      diameterCm: D.diameterCm, pegMm: D.pegMm, tieCm: D.tieCm, marginPct: D.marginPct, spoolM: D.spoolM
    };
  }

  function colorLabel(c, k) {
    return el('span', { class: 'chip' }, [
      el('i', null), el('b', { text: U.letter(k) }), el('span', { text: c.name || I.colorName(c.hex) })
    ]);
  }

  function statsTable(p) {
    const st = E.threadStats(p);
    const spools = p.spoolM > 0;
    const head = el('tr', null, [
      el('th', { text: t('st_thread') }), el('th', { text: t('st_lines') }),
      el('th', { text: t('st_net') + ' (m)' }), el('th', { text: t('st_rec') + ' (m)' }),
      spools ? el('th', { text: t('st_spools', { n: '' }).trim() }) : null
    ]);
    const body = el('tbody');
    let tl = 0, tn = 0, tt = 0, ts = 0;
    p.colors.forEach((c, k) => {
      const s = st[k];
      tl += s.lines; tn += s.netM; tt += s.totalM;
      const chip = colorLabel(c, k);
      chip.firstChild.style.background = c.hex;
      const nsp = spools ? Math.ceil(s.totalM / p.spoolM) : 0; ts += nsp;
      body.appendChild(el('tr', null, [
        el('td', null, chip), el('td', { text: I.fmt(s.lines) }),
        el('td', { text: I.fmt(s.netM, 1) }), el('td', { class: 'big', text: I.fmt(Math.ceil(s.totalM)) }),
        spools ? el('td', { text: I.fmt(nsp) }) : null
      ]));
    });
    const foot = el('tfoot', null, el('tr', null, [
      el('td', { text: t('st_total') }), el('td', { text: I.fmt(tl) }), el('td', { text: I.fmt(tn, 1) }),
      el('td', { text: I.fmt(Math.ceil(tt)) }), spools ? el('td', { text: I.fmt(ts) }) : null
    ]));
    return el('table', { class: 'tbl' }, [el('thead', null, head), body, foot]);
  }

  function spacingInfo(nPins, diameterCm) {
    const cm = Math.PI * diameterCm / nPins;
    return { cm, deg: 360 / nPins, warn: cm * 10 < D.pegMm * 1.8 + 0.6 };
  }

  function updateStats() {
    const box = $('liveStats');
    if (!box) return;
    clear(box);
    const sp = spacingInfo(D.nPins, D.diameterCm);
    if (!preview) {
      box.appendChild(el('p', { class: 'mono small muted', text: '> ' + t('st_calc') }));
    } else {
      box.appendChild(statsTable(projectLike(preview)));
      box.appendChild(el('div', { class: 'kv' }, [
        el('span', null, [t('r_pins') + ': ', el('b', { text: I.fmt(preview.nPins) })]),
        el('span', null, [t('r_diam') + ': ', el('b', { text: I.fmt(D.diameterCm, 1) + ' cm' })]),
        el('span', null, [t('st_changes') + ': ', el('b', { text: I.fmt(Math.max(0, preview.blocks.length - 1)) })]),
        el('span', null, [t('s_spacing', { cm: I.fmt(sp.cm, 2), deg: I.fmt(sp.deg, 2) })])
      ]));
    }
    const warn = imageWarning();
    if (warn) box.insertBefore(el('p', { class: 'note warn', text: warn }), box.firstChild);
    box.appendChild(densityBox());
    const qs = $('qSummary');
    if (qs) qs.textContent = t('q_auto_sum', { pins: I.fmt(D.nPins), lines: I.fmt(D.lines), cm: I.fmt(sp.cm, 2) });
    const si = $('spacingInfo');
    if (si) {
      si.textContent = t('s_spacing', { cm: I.fmt(sp.cm, 2), deg: I.fmt(sp.deg, 2) }) + (sp.warn ? ' · ' + t('s_spacing_warn') : '');
      si.className = 'note' + (sp.warn ? ' warn' : '');
    }
  }

  /* ================= controles ================= */
  function field(key, labelKey, min, max, step, o) {
    o = o || {};
    const id = 'f_' + key;
    const num = el('input', { type: 'number', class: 'inp num', id, min, max, step, inputmode: 'decimal' });
    const range = el('input', { type: 'range', min: o.rmin != null ? o.rmin : min, max: o.rmax != null ? o.rmax : max, step, 'aria-label': t(labelKey), 'data-i18n-aria': labelKey });
    const set = v => { num.value = String(v); range.value = String(v); };
    const get = () => (o.get ? o.get() : D[key]);
    set(get());
    // linea que explica que cambia al subir o bajar esta barra
    const help = el('p', { class: 'fhelp mono', 'aria-live': 'polite', hidden: true });
    let base = get();
    const mark = () => { base = get(); };
    const apply = (v, final) => {
      v = Number(v);
      if (!Number.isFinite(v)) { set(get()); return; }
      v = Math.min(max, Math.max(min, v));
      if (step >= 1) v = Math.round(v);
      if (o.set) o.set(v); else D[key] = v;
      if (final) set(get());
      onParam(key, final);
      showFieldHelp(key, base, get(), help, step);
      if (final) mark();
    };
    range.addEventListener('pointerdown', mark);
    range.addEventListener('focus', mark);
    num.addEventListener('focus', mark);
    range.addEventListener('input', () => { num.value = range.value; apply(range.value, false); });
    range.addEventListener('change', () => apply(range.value, true));
    num.addEventListener('change', () => apply(num.value, true));
    fields[key] = { set: () => { set(get()); mark(); } };
    const lab = el('label', { for: id, title: t('g_tap') }, el('span', { i18n: labelKey }));
    const box = el('div', { class: 'field' }, [lab, num, range, help]);
    U.guard(box, [range, num]);
    return box;
  }

  const HELP_KEYS = new Set(['zoom', 'bright', 'contrast', 'sat', 'threadMm', 'opacity', 'lines', 'weight', 'diameterCm',
    'nPins', 'pegMm', 'marginPct', 'tieCm', 'spoolM', 'minDist', 'minLoop', 'size', 'rounds']);
  const DENSITY_KEYS = new Set(['lines', 'threadMm', 'diameterCm']);
  let lastHelp = null;

  function showFieldHelp(key, from, to, helpEl, step) {
    if (!HELP_KEYS.has(key) || from === to || !Number.isFinite(from) || !Number.isFinite(to)) return;
    const up = to > from;
    let k = 'fh_' + key + '_' + (up ? 'up' : 'down');
    if (key === 'bright' && U.luminance(D.bg) < 0.4) k += '_inv';
    const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    const extra = [];
    if (DENSITY_KEYS.has(key)) extra.push(t('fh_density', { lvl: t('dn_' + densityLevel(coverageOf(null).c)) }));
    if (key === 'nPins' || key === 'diameterCm') {
      const sp = spacingInfo(D.nPins, D.diameterCm);
      extra.push(t('s_spacing', { cm: I.fmt(sp.cm, 2), deg: I.fmt(sp.deg, 2) }));
    }
    const msg = extra.length ? t(k).replace(/\.$/, '') : t(k);
    const txt = (up ? '▲ ' : '▼ ') + I.fmt(from, dec) + ' → ' + I.fmt(to, dec) + ': ' + [msg].concat(extra).join(' · ');
    if (lastHelp && lastHelp !== helpEl) lastHelp.hidden = true;
    helpEl.textContent = txt;
    helpEl.hidden = false;
    helpEl.classList.toggle('up', up);
    helpEl.classList.toggle('down', !up);
    lastHelp = helpEl;
  }

  function onParam(key, final) {
    if (IMG_KEYS.indexOf(key) >= 0 || key === 'zoom') {
      refreshPhoto(!final);
      startGenSoon();
    } else if (GEN_KEYS.indexOf(key) >= 0) {
      if (key === 'nPins' || key === 'size') { if (!running && !preview) resetSim(D.nPins); }
      updateStats();
      startGenSoon();
    } else if (key === 'threadMm' || key === 'opacity' || key === 'diameterCm' || key === 'pegMm') {
      requestSimRedraw();
      updateStats();
    } else {
      updateStats();
    }
  }

  function syncZoomField() { if (fields.zoom) fields.zoom.set(); }

  function buildFramePanel() {
    const p = clear($('pFrame'));
    p.appendChild(field('zoom', 'f_zoom', 0.5, 8, 0.01, {
      get: () => (img ? +(Math.min(img.w, img.h) / img.vis).toFixed(2) : 1),
      set: v => { if (img) img.vis = Math.min(img.w, img.h) / v; }
    }));
    p.appendChild(field('bright', 'f_bright', -100, 100, 1));
    p.appendChild(field('contrast', 'f_contrast', -100, 100, 1));
    p.appendChild(field('sat', 'f_sat', 0, 200, 1));
    p.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { type: 'button', class: 'btn small', onclick: () => { if (!img) return; img.rot = (img.rot + 1) % 4; refreshPhoto(); startGenSoon(); } }, [icon('rotate'), el('span', { i18n: 'f_rotate' })]),
      el('button', {
        type: 'button', class: 'btn small', onclick: () => {
          if (!img) return;
          img.cx = img.w / 2; img.cy = img.h / 2; img.vis = Math.min(img.w, img.h); img.rot = 0;
          D.bright = 0; D.contrast = 0; D.sat = 100;
          ['bright', 'contrast', 'sat', 'zoom'].forEach(k => fields[k] && fields[k].set());
          refreshPhoto(); startGenSoon();
        }
      }, [icon('target'), el('span', { i18n: 'f_reset' })]),
      el('button', { type: 'button', class: 'btn small danger', onclick: () => { wipeImage(); goStep(1); } }, [icon('trash'), el('span', { i18n: 'f_change' })])
    ]));
  }

  function buildThreadPanel() {
    const p = clear($('pThread'));
    p.appendChild(field('threadMm', 't_thick', 0.02, 3, 0.01, { rmin: 0.05, rmax: 1.5 }));
    p.appendChild(field('opacity', 't_opacity', 1, 100, 1));
    p.appendChild(field('lines', 't_lines', 1, E.LIMITS.maxLines, 1, { rmin: 200, rmax: 10000 }));
    p.appendChild(field('weight', 't_weight', 1, 255, 1, { rmax: 120 }));
    p.appendChild(el('p', { class: 'note', i18n: 't_note' }));
  }

  function buildSizePanel() {
    const p = clear($('pSize'));
    p.appendChild(field('diameterCm', 's_diam', 5, 300, 0.5, { rmin: 10, rmax: 150 }));
    p.appendChild(field('nPins', 's_pins', E.LIMITS.minPins, E.LIMITS.maxPins, 1, { rmin: 60, rmax: 600 }));
    p.appendChild(field('pegMm', 's_peg', 0.1, 20, 0.1, { rmin: 0.5, rmax: 6 }));
    p.appendChild(el('p', { class: 'note', id: 'spacingInfo' }));
    p.appendChild(field('marginPct', 's_margin', 0, 100, 1, { rmax: 50 }));
    p.appendChild(field('tieCm', 's_tie', 0, 200, 1, { rmax: 50 }));
    p.appendChild(field('spoolM', 's_spool', 0, 100000, 1, { rmax: 2000 }));
    p.appendChild(el('p', { class: 'note', i18n: 's_pin0' }));
    p.appendChild(el('button', { type: 'button', class: 'btn small', onclick: () => root.HiloFrame.open(frameSpec()) }, [icon('template'), el('span', { i18n: 'fr_open' })]));
  }

  // Datos del diseño actual para la guia del marco (la imagen no sale de aqui)
  function frameSpec() {
    const ok = !!(preview && preview.key === paramsKey());
    return {
      fromDesign: true, name: St.cleanText($('projName').value, 60) || t('proj_name_ph'),
      nPins: ok ? preview.nPins : D.nPins, diameterCm: D.diameterCm, pegMm: D.pegMm, threadMm: D.threadMm, bg: D.bg,
      colors: D.colors.map(c => ({ hex: c.hex, name: c.name })), blocks: ok ? preview.blocks : null,
      marginPct: D.marginPct, tieCm: D.tieCm, spoolM: D.spoolM, lines: D.lines
    };
  }

  function buildAdvPanel() {
    const p = clear($('pAdv'));
    p.appendChild(field('minDist', 'a_mindist', 1, 200, 1, { rmax: 80 }));
    p.appendChild(field('minLoop', 'a_minloop', 0, 200, 1, { rmax: 80 }));
    p.appendChild(field('size', 'a_size', E.LIMITS.minSize, 800, 50));
    p.appendChild(el('p', { class: 'note', i18n: 'a_note' }));
    p.appendChild(el('button', {
      type: 'button', class: 'btn small', onclick: () => {
        ['size', 'nPins', 'lines', 'weight', 'minDist', 'minLoop'].forEach(k => { D[k] = DEFAULTS[k]; if (fields[k]) fields[k].set(); });
        D.bg = '#ffffff'; D.colors = [{ hex: '#000000', name: '' }];
        buildColorsPanel(); onParam('lines', true);
      }
    }, [icon('reset'), el('span', { i18n: 'a_reset' })]));
  }

  /* ----- colores ----- */
  function swatch(hex, on, title, onPick) {
    const b = el('button', { type: 'button', class: 'sw' + (on ? ' on' : ''), title, 'aria-label': title });
    b.style.background = hex;
    b.addEventListener('click', onPick);
    return b;
  }
  function customSwatch(value, title, onPick) {
    const inp = el('input', { type: 'color', value, 'aria-label': title });
    inp.addEventListener('change', () => onPick(inp.value.toLowerCase()));
    return el('label', { class: 'sw custom', title }, inp);
  }

  function colorsChanged() {
    buildColorsPanel();
    buildQuickPanel();
    refreshPhoto();
    startGenSoon();
    updateStats();
  }

  function buildColorsPanel() {
    const p = clear($('pColors'));
    p.appendChild(el('div', { class: 'lbl', i18n: 'c_board' }));
    const bgRow = el('div', { class: 'swatches' });
    I.BOARDS.forEach(b => bgRow.appendChild(swatch(b[0], D.bg === b[0], I.lang === 'es' ? b[1] : b[2], () => { D.bg = b[0]; colorsChanged(); })));
    bgRow.appendChild(customSwatch(D.bg, t('c_custom'), v => { D.bg = v; colorsChanged(); }));
    p.appendChild(bgRow);

    p.appendChild(el('div', { class: 'lbl', i18n: 'c_threads' }));
    const list = el('div', { class: 'thread-list' });
    D.colors.forEach((c, k) => {
      const sw = customSwatch(c.hex, t('c_pick'), v => { c.hex = v; c.name = ''; colorsChanged(); });
      sw.style.background = c.hex;
      sw.classList.remove('custom');
      const name = el('input', { type: 'text', class: 'inp', maxlength: 40, value: c.name || I.colorName(c.hex), 'aria-label': t('c_name'), spellcheck: 'false' });
      name.addEventListener('change', () => { c.name = St.cleanText(name.value, 40); updateStats(); });
      const rm = el('button', { type: 'button', class: 'btn small', 'aria-label': t('c_remove'), title: t('c_remove'), disabled: D.colors.length <= 1 }, icon('x'));
      rm.addEventListener('click', () => { D.colors.splice(k, 1); colorsChanged(); });
      list.appendChild(el('div', { class: 'thread' }, [sw, el('span', { class: 'letter', text: U.letter(k) }), name, rm]));
    });
    p.appendChild(list);

    const add = el('button', { type: 'button', class: 'btn small', disabled: D.colors.length >= E.LIMITS.maxColors }, [icon('plus'), el('span', { i18n: 'c_add' })]);
    add.addEventListener('click', pickThread);
    const kSel = el('select', { class: 'inp short', 'aria-label': t('c_suggest_n') });
    [2, 3, 4, 5].forEach(n => kSel.appendChild(el('option', { value: n, text: n, selected: n === 3 })));
    const sug = el('button', { type: 'button', class: 'btn small' }, [icon('wand'), el('span', { i18n: 'c_suggest' })]);
    sug.addEventListener('click', () => suggestColors(Number(kSel.value)));
    p.appendChild(el('div', { class: 'btn-row' }, [add, sug, kSel]));
    p.appendChild(el('p', { class: 'note', i18n: 'c_max' }));
    if (D.colors.length > 1) {
      p.appendChild(field('rounds', 'c_rounds', 1, E.LIMITS.maxRounds, 1, { rmax: 8 }));
      p.appendChild(el('p', { class: 'note', i18n: 'c_rounds_d' }));
    }
  }

  async function pickThread() {
    if (D.colors.length >= E.LIMITS.maxColors) return;
    const grid = el('div', { class: 'picker' });
    let chosen = null;
    const done = () => { const b = root.document.querySelector('#modalActions .btn.primary'); if (b) b.click(); };
    I.THREADS.forEach(c => grid.appendChild(swatch(c[0], false, I.lang === 'es' ? c[1] : c[2], () => { chosen = c[0]; done(); })));
    grid.appendChild(customSwatch('#ff00aa', t('c_custom'), v => { chosen = v; done(); }));
    const ok = await U.modal({
      title: t('c_pick'), body: grid, dismiss: false,
      actions: [{ label: t('cancel'), value: false }, { label: t('ok'), value: true, kind: 'primary' }]
    });
    if (ok && chosen) { D.colors.push({ hex: chosen, name: '' }); colorsChanged(); }
  }

  function suggestColors(k) {
    if (!img) { U.toast(t('need_image'), 'err'); return; }
    const size = D.size, rgba = computeWorking(), r = size / 2;
    const pts = [];
    for (let n = 0; n < 9000 && pts.length < 5000; n++) {
      const x = (Math.random() * size) | 0, y = (Math.random() * size) | 0;
      if ((x - r) * (x - r) + (y - r) * (y - r) > r * r) continue;
      const i = (y * size + x) * 4;
      pts.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
    }
    rgba.fill(0);
    const K = Math.min(k + 1, pts.length);
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const cent = [pts[(Math.random() * pts.length) | 0].slice()];
    while (cent.length < K) {
      const dist = pts.map(q => Math.min.apply(null, cent.map(c => d2(q, c))));
      const sum = dist.reduce((a, b) => a + b, 0) || 1;
      let x = Math.random() * sum, i = 0;
      while (i < pts.length - 1 && (x -= dist[i]) > 0) i++;
      cent.push(pts[i].slice());
    }
    for (let it = 0; it < 14; it++) {
      const acc = cent.map(() => [0, 0, 0, 0]);
      for (const q of pts) {
        let bi = 0, bd = Infinity;
        cent.forEach((c, j) => { const d = d2(q, c); if (d < bd) { bd = d; bi = j; } });
        const a = acc[bi]; a[0] += q[0]; a[1] += q[1]; a[2] += q[2]; a[3]++;
      }
      acc.forEach((a, j) => { if (a[3]) cent[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
    }
    const bg = E.hexToRgb(D.bg);
    cent.sort((a, b) => d2(a, bg) - d2(b, bg));
    const keep = cent.slice(1);
    const used = new Set();
    const out = [];
    for (const c of keep) {
      const opts = I.THREADS.map(x => [x[0], d2(c, E.hexToRgb(x[0]))])
        .filter(x => !used.has(x[0]) && d2(E.hexToRgb(x[0]), bg) > 2500)
        .sort((a, b) => a[1] - b[1]);
      if (opts.length) { used.add(opts[0][0]); out.push({ hex: opts[0][0], name: '' }); }
    }
    if (out.length) { D.colors = out.slice(0, E.LIMITS.maxColors); colorsChanged(); }
  }

  /* ================= modo automatico ================= */
  // Densidad objetivo: (metros de hilo x grosor) / area del circulo. ~1 = equilibrio
  // entre detalle y claridad; por encima de 1,25 el hilograma empieza a oscurecerse.
  const COVER_TARGET = 1.0;
  const AVG_CHORD = 0.82;          // largo medio de una linea / diametro (medido con el algoritmo)
  const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function autoPins(diam) { return clampN(Math.round(Math.PI * diam * 10 / 6.55 / 4) * 4, 120, 360); }
  function autoLines(diam, threadMm) {
    const L = COVER_TARGET * Math.PI * diam / (4 * AVG_CHORD * (threadMm / 10));
    return clampN(Math.round(L / 50) * 50, 600, 6000);
  }
  function applyAuto() {
    D.nPins = autoPins(D.diameterCm);
    D.lines = autoLines(D.diameterCm, D.threadMm);
    D.weight = DEFAULTS.weight; D.minDist = DEFAULTS.minDist; D.minLoop = DEFAULTS.minLoop; D.size = DEFAULTS.size;
    D.rounds = DEFAULTS.rounds;
  }

  // Brillo y contraste automaticos: estira el histograma y aclara si la imagen es oscura.
  function autoLevels() {
    if (!img) return;
    D.bright = 0; D.contrast = 0; D.sat = 100;
    const size = D.size, r = size / 2, rgba = computeWorking();
    const hist = new Uint32Array(256);
    let n = 0;
    for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) {
      if ((x - r) * (x - r) + (y - r) * (y - r) > r * r) continue;
      const i = (y * size + x) * 4;
      hist[(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) | 0]++; n++;
    }
    rgba.fill(0);
    if (!n) return;
    const pct = q => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= q * n) return v; } return 255; };
    const lo = pct(0.02), hi = pct(0.98), med = pct(0.5);
    let f = hi - lo > 12 ? 235 / (hi - lo) : 1;
    f = clampN(f, 0.8, 2.2);
    let Cs = Math.round(255 * 259 * (f - 1) / (259 + 255 * f) / 2.55);
    Cs = clampN(Cs, -30, 70);
    const C = Cs * 2.55;
    f = (259 * (C + 255)) / (255 * (259 - C));
    let b = 12 - 128 - f * (lo - 128);
    const mid = f * (med - 128) + 128 + b;
    if (mid < 118) b += (118 - mid) * 0.7;          // imagen oscura: aclara los tonos medios
    D.contrast = Cs;
    D.bright = clampN(Math.round(b / 1.28), -60, 60);
  }

  const STYLES = [
    { id: 'classic', name: 'q_classic', desc: 'q_classic_d', bg: '#ffffff', colors: ['#000000'] },
    { id: 'inverse', name: 'q_inverse', desc: 'q_inverse_d', bg: '#000000', colors: ['#ffffff'] },
    { id: 'color', name: 'q_color', desc: 'q_color_d', bg: '#ffffff', colors: ['#c8102e', '#1f4fbf', '#000000'] },
    { id: 'custom', name: 'q_custom', desc: 'q_custom_d', bg: null, colors: null }
  ];

  function setStyle(id) {
    autoStyle = id;
    const st = STYLES.find(x => x.id === id);
    if (id === 'classic' || id === 'inverse') {
      D.bg = st.bg; D.colors = st.colors.map(h => ({ hex: h, name: '' }));
    } else if (id === 'color') {
      D.bg = '#ffffff';
      applyAuto();
      if (img) { suggestColors(autoColorsN); return; }
      D.colors = st.colors.map(h => ({ hex: h, name: '' }));
    }
    applyAuto();
    colorsChanged();
  }

  function quickChip(label, on, onClick, extraClass) {
    const b = el('button', { type: 'button', class: 'qchip' + (on ? ' on' : '') + (extraClass ? ' ' + extraClass : ''), 'aria-pressed': String(!!on) }, label);
    b.addEventListener('click', onClick);
    return b;
  }

  function stylePreview(bg, colors) {
    const box = el('span', { class: 'qs-prev' });
    box.style.background = bg;
    colors.slice(0, 4).forEach(h => { const d = el('i'); d.style.background = h; box.appendChild(d); });
    return box;
  }

  function buildQuickPanel() {
    const p = clear($('pQuick'));
    p.appendChild(el('p', { class: 'note', i18n: 'q_auto_note' }));

    // 1. estilo de color
    p.appendChild(el('div', { class: 'lbl', i18n: 'q_style' }));
    const grid = el('div', { class: 'qstyles' });
    STYLES.forEach(st => {
      const bg = st.bg || D.bg, cols = st.colors || D.colors.map(c => c.hex);
      const showCols = st.id === autoStyle ? D.colors.map(c => c.hex) : cols;
      const b = el('button', { type: 'button', class: 'qs' + (autoStyle === st.id ? ' on' : ''), 'aria-pressed': String(autoStyle === st.id) }, [
        stylePreview(st.id === autoStyle ? D.bg : bg, showCols),
        el('span', { class: 'qs-t', i18n: st.name }),
        el('span', { class: 'qs-d mono', i18n: st.desc })
      ]);
      b.addEventListener('click', () => setStyle(st.id));
      grid.appendChild(b);
    });
    p.appendChild(grid);

    if (autoStyle === 'color') {
      p.appendChild(el('div', { class: 'lbl', i18n: 'q_ncolors' }));
      const row = el('div', { class: 'qchips' });
      [2, 3, 4].forEach(k => row.appendChild(quickChip(String(k), autoColorsN === k, () => { autoColorsN = k; applyAuto(); suggestColors(k); })));
      p.appendChild(row);
    } else if (autoStyle === 'custom') {
      p.appendChild(el('div', { class: 'lbl', i18n: 'q_board' }));
      const bgRow = el('div', { class: 'swatches' });
      I.BOARDS.forEach(b => bgRow.appendChild(swatch(b[0], D.bg === b[0], I.lang === 'es' ? b[1] : b[2], () => { D.bg = b[0]; colorsChanged(); })));
      p.appendChild(bgRow);
      p.appendChild(el('div', { class: 'lbl', i18n: 'q_threads' }));
      const tRow = el('div', { class: 'swatches' });
      I.THREADS.forEach(c => {
        const on = D.colors.some(x => x.hex === c[0]);
        const sw = swatch(c[0], on, I.lang === 'es' ? c[1] : c[2], () => {
          if (on) { if (D.colors.length > 1) D.colors = D.colors.filter(x => x.hex !== c[0]); }
          else if (D.colors.length < 4) D.colors.push({ hex: c[0], name: '' });
          else { U.toast(t('q_max4')); return; }
          applyAuto();
          colorsChanged();
        });
        sw.setAttribute('aria-pressed', String(on));
        tRow.appendChild(sw);
      });
      p.appendChild(tRow);
    }

    // 2. diametro
    p.appendChild(el('div', { class: 'lbl', i18n: 'q_diam' }));
    const drow = el('div', { class: 'qchips' });
    [30, 40, 50, 60, 70, 80].forEach(v => drow.appendChild(quickChip(v + ' cm', D.diameterCm === v, () => setDiameter(v))));
    const num = el('input', { type: 'number', class: 'inp short', min: 10, max: 200, step: 1, value: D.diameterCm, inputmode: 'decimal', 'aria-label': t('s_diam') });
    num.addEventListener('change', () => { const v = Number(num.value); if (Number.isFinite(v)) setDiameter(clampN(Math.round(v * 2) / 2, 10, 200)); });
    drow.appendChild(el('label', { class: 'qnum' }, [num, el('span', { class: 'mono', text: 'cm' })]));
    p.appendChild(drow);

    // 3. resumen automatico
    p.appendChild(el('div', { class: 'qsum mono', id: 'qSummary' }));

    // 4. pasar a avanzado
    const adv = el('button', { type: 'button', class: 'btn small' }, [icon('menu'), el('span', { i18n: 'q_more' })]);
    adv.addEventListener('click', () => setMode('advanced'));
    p.appendChild(adv);
  }

  function setDiameter(v) {
    D.diameterCm = v;
    applyAuto();
    Object.keys(fields).forEach(k => fields[k].set());
    buildQuickPanel();
    requestSimRedraw();
    updateStats();
    startGenSoon();
  }

  function setMode(m, quiet) {
    mode = m === 'advanced' ? 'advanced' : 'auto';
    if (cfgApi) cfgApi.set({ designMode: mode });
    root.document.querySelectorAll('[data-mode]').forEach(b => {
      const on = b.getAttribute('data-mode') === mode;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
    });
    $('pQuick').hidden = mode !== 'auto';
    $('advBox').hidden = mode !== 'advanced';
    if (quiet) return;
    if (mode === 'auto') {
      applyAuto();
      if (img) { autoLevels(); refreshPhoto(); }
    }
    buildPanels();
    if (img) startGenSoon();
  }

  /* ----- densidad del hilo y avisos ----- */
  function coverageOf(src) {
    const area = Math.PI * (D.diameterCm / 2) * (D.diameterCm / 2);
    if (src && src.blocks) {
      const st = E.threadStats(projectLike(src));
      const cm = st.reduce((a, x) => a + x.chordCm, 0);
      return { c: cm * (D.threadMm / 10) / area, est: false };
    }
    return { c: D.lines * AVG_CHORD * D.diameterCm * (D.threadMm / 10) / area, est: true };
  }
  function densityLevel(c) { return c < 0.6 ? 'light' : c < 1.25 ? 'ideal' : c < 1.6 ? 'high' : 'vhigh'; }

  function densityBox() {
    const cv = coverageOf(preview), lvl = densityLevel(cv.c);
    const bar = el('i');
    bar.style.width = (Math.min(1, cv.c / 2) * 100).toFixed(1) + '%';
    const kids = [
      el('div', { class: 'dn-head' }, [
        el('span', { class: 'dn-t', i18n: 'dn_t' }),
        el('b', { class: 'dn-l', text: t('dn_' + lvl) + (cv.est ? ' (' + t('dn_est') + ')' : '') })
      ]),
      el('div', { class: 'dn-meter' }, [bar, el('span', { class: 'dn-ideal' })]),
      el('p', { class: 'mono small', text: t('dn_' + lvl + '_d') })
    ];
    if (mode === 'advanced' && (lvl === 'high' || lvl === 'vhigh' || lvl === 'light')) {
      const fix = el('button', { type: 'button', class: 'btn small' }, [icon('wand'), el('span', { i18n: 'dn_fix' })]);
      fix.addEventListener('click', () => {
        D.lines = autoLines(D.diameterCm, D.threadMm);
        if (fields.lines) fields.lines.set();
        updateStats();
        startGenSoon();
      });
      kids.push(fix);
    }
    return el('div', { class: 'density dn-' + lvl }, kids);
  }

  // Zonas que se llenaran de hilo: oscuras con hilo oscuro, claras con hilo claro.
  function measureImage(rgba, size) {
    const r = size / 2;
    let n = 0, dark = 0, light = 0, sum = 0;
    for (let y = 0; y < size; y += 3) for (let x = 0; x < size; x += 3) {
      if ((x - r) * (x - r) + (y - r) * (y - r) > r * r) continue;
      const i = (y * size + x) * 4;
      const l = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      n++; sum += l; if (l < 70) dark++; if (l > 185) light++;
    }
    return n ? { mean: sum / n, dark: dark / n, light: light / n } : null;
  }
  function imageWarning() {
    if (!imgStats) return null;
    const lightBoard = U.luminance(D.bg) > 0.4;
    if (lightBoard && (imgStats.dark > 0.35 || imgStats.mean < 95)) return t('w_dark', { pct: Math.round(imgStats.dark * 100) });
    if (!lightBoard && (imgStats.light > 0.35 || imgStats.mean > 165)) return t('w_light', { pct: Math.round(imgStats.light * 100) });
    return null;
  }

  function renderTips() {
    const ul = $('tipsList');
    if (!ul) return;
    clear(ul);
    t('tips').forEach(s => {
      const i = s.indexOf(': ');
      ul.appendChild(el('li', null, i > 0 ? [el('b', { text: s.slice(0, i + 1) }), ' ' + s.slice(i + 2)] : s));
    });
  }

  /* ================= pasos del asistente ================= */
  function goStep(n) {
    step = n;
    ['cStep1', 'cStep2', 'cStep3'].forEach((id, i) => { $(id).hidden = i + 1 !== n; });
    root.document.querySelectorAll('#stepper li').forEach(li => {
      const k = Number(li.getAttribute('data-n'));
      li.classList.toggle('on', k === n);
      li.classList.toggle('done', k < n);
    });
    if (n === 2) {
      root.requestAnimationFrame(() => {
        if (ensureSize()) { refreshPhoto(); if (preview) redrawSimFull(); }
        requestCompose();
      });
      updateStats();
    }
    if (n === 3) {
      const nm = $('projName');
      if (!nm.value) nm.value = t('proj_name_ph');
      pwCheck();
    }
    root.scrollTo(0, 0);
  }

  function pwScore(pw) {
    if (!pw) return 0;
    let s = Math.min(4, Math.floor(pw.length / 4));
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(7, s);
  }
  function pwCheck() {
    const a = $('pw1').value, b = $('pw2').value, m = $('pwMeter'), msg = $('pwMsg');
    const sc = pwScore(a);
    m.style.width = (sc / 7 * 100) + '%';
    m.style.background = sc < 3 ? 'var(--red)' : sc < 5 ? 'var(--amber)' : 'var(--neon)';
    let txt = a ? (sc < 3 ? t('pw_weak') : sc < 5 ? t('pw_ok') : t('pw_strong')) : '';
    let bad = false;
    if (a && a.length < 8) { txt = t('pw_short'); bad = true; }
    else if (a && b && a !== b) { txt = t('pw_mismatch'); bad = true; }
    msg.textContent = txt;
    msg.className = 'mono small' + (bad ? ' err' : '');
    return !bad && (!a || a === b);
  }

  async function generateAndSave() {
    if (!img && !preview) { U.toast(t('need_image'), 'err'); goStep(1); return; }
    const a = $('pw1').value, b = $('pw2').value;
    if (!pwCheck() || (a && a !== b)) { U.toast(a !== b ? t('pw_mismatch') : t('pw_short'), 'err'); return; }
    const surprise = root.document.querySelector('input[name="mode"]:checked').value === 'surprise';
    const btn = $('btnGenerate');
    btn.disabled = true;
    try {
      if (!(preview && preview.key === paramsKey())) {
        U.toast(t('wait_preview'));
        const ok = await waitPreview();
        if (!ok) return;
      }
      if (surprise) {
        const go = await U.confirmBox(t('seal_confirm_t'), t('seal_confirm'), t('seal_ok'), true);
        if (!go) return;
      }
      if (a && !St.cryptoOK()) { U.toast(t('e_no_crypto'), 'err'); return; }
      const project = {
        id: St.randomId(),
        name: St.cleanText($('projName').value, 60) || t('proj_name_ph'),
        created: Date.now(),
        surprise,
        nPins: preview.nPins, size: preview.size,
        diameterCm: D.diameterCm, pegMm: D.pegMm, threadMm: D.threadMm, opacity: D.opacity / 100,
        marginPct: D.marginPct, tieCm: D.tieCm, spoolM: D.spoolM,
        bg: D.bg,
        colors: D.colors.map(c => ({ hex: c.hex, name: c.name || '' })),
        blocks: preview.blocks.map(x => x.slice()),
        step: 0,
        params: { lines: D.lines, weight: D.weight, minDist: D.minDist, minLoop: D.minLoop, rounds: D.colors.length > 1 ? D.rounds : 1 }
      };
      log(t('g_saving'));
      const keyInfo = a ? await St.makeKey(a) : null;
      $('pw1').value = ''; $('pw2').value = '';
      await St.saveProject(project, keyInfo);
      if (surprise) wipeImage();
      if (onFinish) await onFinish(project, keyInfo, $('optDownload').checked);
    } catch (e) {
      U.toast(t('e_' + (e.code || 'generic'), { m: e.message }), 'err');
    } finally {
      btn.disabled = false;
    }
  }

  /* ================= montaje ================= */
  function init(opts) {
    onFinish = opts.onFinish;
    cfgApi = opts.cfg || null;
    mode = cfgApi && cfgApi.get().designMode === 'advanced' ? 'advanced' : 'auto';
    if (mode === 'auto') applyAuto();
    root.document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.getAttribute('data-mode'))));
    const fi = $('fileImage'), fc = $('fileCamera'), dz = $('dropImage');
    fi.addEventListener('change', () => loadImageFile(fi.files && fi.files[0]));
    fc.addEventListener('change', () => loadImageFile(fc.files && fc.files[0]));
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('over');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadImageFile(f);
    });

    const cv = $('editCanvas');
    cv.addEventListener('pointerdown', onPointerDown);
    cv.addEventListener('pointermove', onPointerMove);
    cv.addEventListener('pointerup', onPointerUp);
    cv.addEventListener('pointercancel', onPointerUp);
    cv.addEventListener('wheel', onWheel, { passive: false });

    $('viewModes').addEventListener('click', e => {
      const b = e.target.closest('button[data-view]');
      if (!b) return;
      setView(b.getAttribute('data-view'));
    });
    $('designTabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      const tab = b.getAttribute('data-tab');
      root.document.querySelectorAll('#designTabs button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
      root.document.querySelectorAll('#scr-create .tabpanel').forEach(pn => { pn.hidden = pn.getAttribute('data-panel') !== tab; });
    });
    root.document.querySelector('#designTabs button[data-tab="frame"]').classList.add('on');

    $('btnBack1').addEventListener('click', () => { wipeImage(); goStep(1); });
    $('btnToSeal').addEventListener('click', () => { if (!img) { U.toast(t('need_image'), 'err'); return; } goStep(3); });
    $('btnBack2').addEventListener('click', () => goStep(img ? 2 : 1));
    $('btnGenerate').addEventListener('click', generateAndSave);
    $('pw1').addEventListener('input', pwCheck);
    $('pw2').addEventListener('input', pwCheck);

    root.addEventListener('resize', U.debounce(() => {
      if (step === 2 && img && ensureSize()) { refreshPhoto(); if (preview) redrawSimFull(); else if (dispSim) resetSim(); }
    }, 200));

    buildPanels();
    setMode(mode, true);
    setView('split');
  }

  function setView(v) {
    view = v;
    root.document.querySelectorAll('#viewModes button').forEach(x => x.classList.toggle('on', x.getAttribute('data-view') === v));
    requestCompose();
  }

  function buildPanels() {
    fields = {};
    buildFramePanel(); buildThreadPanel(); buildColorsPanel(); buildSizePanel(); buildAdvPanel();
    buildQuickPanel();
    renderTips();
    updateStats();
  }

  function enter() {
    if (!img) goStep(1);
    else goStep(step);
  }

  function leave() {
    wipeImage();
    $('pw1').value = ''; $('pw2').value = '';
    goStep(1);
  }

  root.HiloEditor = Object.freeze({
    init, enter, leave, buildPanels, statsTable, spacingInfo, DEFAULTS,
    hasImage: () => !!img
  });
})(self);
