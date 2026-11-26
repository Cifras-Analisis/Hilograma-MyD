/* Hilograma MyD - manual paso a paso.
 * Guarda el avance en cada paso (almacenamiento local) y, si se activa,
 * descarga respaldos .hilo en la carpeta de Descargas. */
(function (root) {
  'use strict';
  const E = root.HiloEngine, I = root.HiloI18n, U = root.HiloUI, St = root.HiloStore;
  const { $, el, clear } = U;
  const t = (k, v) => I.t(k, v);

  let P = null, keyInfo = null, idx = null, stats = null;
  let s = 0, total = 0;
  let colorBefore = null;      // cm del mismo color antes de cada tramo
  let showArt = true, revealed = false;
  let artUpTo = 0, ring = null;
  let autoTimer = 0;
  let ccOpen = false;
  let cfg = null;              // { get: () => settings, set: (patch) => void }
  let lastSaved = 0;

  const isOpen = () => !!P && !$('scr-manual').hidden;

  /* ---------- datos derivados ---------- */
  function info(step) {
    const b = E.locate(idx, Math.min(step, total - 1));
    const bl = P.blocks[b];
    const j = Math.min(step, total - 1) - idx.start[b];
    return { b, c: bl[0], from: bl[1 + j], to: bl[2 + j], j, len: bl.length - 2 };
  }
  function colorOf(k) { return P.colors[k] || { hex: '#ffffff', name: '?' }; }
  function cname(k) { return colorOf(k).name || I.colorName(colorOf(k).hex); }

  function prepare() {
    idx = E.indexSteps(P);
    total = idx.total;
    stats = E.threadStats(P);
    colorBefore = new Float64Array(P.blocks.length);
    const acc = new Float64Array(P.colors.length);
    P.blocks.forEach((bl, b) => {
      colorBefore[b] = acc[bl[0]];
      acc[bl[0]] += idx.cum[idx.start[b + 1]] - idx.cum[idx.start[b]];
    });
  }

  /* ---------- barra de progreso por tramos de color ---------- */
  function buildBar() {
    const bar = clear($('mBar'));
    P.blocks.forEach((bl, b) => {
      const seg = el('div', { class: 'seg-b', title: cname(bl[0]) }, el('i'));
      seg.style.flexGrow = String(bl.length - 2);
      seg.style.background = colorOf(bl[0]).hex;
      seg.style.color = colorOf(bl[0]).hex;
      bar.appendChild(seg);
    });
  }
  function updateBar(cur) {
    const segs = $('mBar').children;
    for (let b = 0; b < segs.length; b++) {
      const sg = segs[b];
      sg.classList.toggle('past', b < cur.b || s >= total);
      sg.classList.toggle('cur', b === cur.b && s < total);
      sg.firstChild.style.width = b === cur.b && s < total ? ((cur.j / cur.len) * 100).toFixed(2) + '%' : '0';
    }
  }

  /* ---------- aro de clavos ---------- */
  function ringSetup() {
    const box = $('mRingBox');
    const css = Math.max(220, box.clientWidth || 320);
    const R = Math.round(Math.min(1400, css * Math.min(2, root.devicePixelRatio || 1)));
    const rc = $('mRingCanvas'), ac = $('mArtCanvas');
    if (ring && ring.R === R && ring.n === P.nPins) return false;
    rc.width = R; rc.height = R; ac.width = R; ac.height = R;
    const n = P.nPins, c = R / 2, rp = R / 2 * 0.84;
    const xs = new Float32Array(n), ys = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; xs[i] = c + rp * Math.cos(a); ys[i] = c + rp * Math.sin(a); }
    ring = { R, n, c, rp, xs, ys };
    artUpTo = -1;
    return true;
  }

  function drawRing(cur) {
    const r = ring, ctx = $('mRingCanvas').getContext('2d');
    const k = r.R / 600;
    ctx.clearRect(0, 0, r.R, r.R);
    ctx.strokeStyle = 'rgba(0,255,136,0.35)';
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath(); ctx.arc(r.c, r.c, r.rp, 0, Math.PI * 2); ctx.stroke();
    // clavos
    ctx.fillStyle = 'rgba(201,255,227,0.55)';
    const pr = Math.max(1, Math.min(3.2 * k, Math.PI * r.rp / r.n * 0.35));
    for (let i = 0; i < r.n; i++) { ctx.beginPath(); ctx.arc(r.xs[i], r.ys[i], pr, 0, Math.PI * 2); ctx.fill(); }
    // numeracion
    const every = r.n <= 72 ? 2 : r.n <= 150 ? 5 : r.n <= 400 ? 10 : 25;
    ctx.font = Math.round(13 * k) + 'px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < r.n; i += every) {
      const a = 2 * Math.PI * i / r.n, rr = r.rp + 24 * k;
      ctx.fillStyle = i === 0 ? '#29e7ff' : 'rgba(111,165,138,0.95)';
      ctx.fillText(String(i), r.c + rr * Math.cos(a), r.c + rr * Math.sin(a));
      ctx.strokeStyle = 'rgba(111,165,138,0.6)';
      ctx.beginPath();
      ctx.moveTo(r.c + (r.rp + 6 * k) * Math.cos(a), r.c + (r.rp + 6 * k) * Math.sin(a));
      ctx.lineTo(r.c + (r.rp + 12 * k) * Math.cos(a), r.c + (r.rp + 12 * k) * Math.sin(a));
      ctx.stroke();
    }
    // sentido horario junto al clavo 0
    ctx.strokeStyle = '#29e7ff'; ctx.lineWidth = 2 * k;
    const ra = r.rp + 44 * k;
    ctx.beginPath(); ctx.arc(r.c, r.c, ra, -0.12, 0.12); ctx.stroke();
    const ax = r.c + ra * Math.cos(0.12), ay = r.c + ra * Math.sin(0.12);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 7 * k, ay - 3 * k); ctx.moveTo(ax, ay); ctx.lineTo(ax + 2 * k, ay - 8 * k); ctx.stroke();
    if (s >= total) return;
    // paso actual
    const hex = colorOf(cur.c).hex;
    ctx.save();
    ctx.strokeStyle = hex; ctx.lineWidth = 3 * k;
    ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 12 * k;
    ctx.beginPath(); ctx.moveTo(r.xs[cur.from], r.ys[cur.from]); ctx.lineTo(r.xs[cur.to], r.ys[cur.to]); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 1.5 * k; ctx.setLineDash([4 * k, 4 * k]);
    ctx.beginPath(); ctx.moveTo(r.xs[cur.from], r.ys[cur.from]); ctx.lineTo(r.xs[cur.to], r.ys[cur.to]); ctx.stroke();
    ctx.setLineDash([]);
    dot(ctx, r.xs[cur.from], r.ys[cur.from], 7 * k, '#ffb000');
    dot(ctx, r.xs[cur.to], r.ys[cur.to], 11 * k, '#00ff88');
    // etiqueta del clavo destino
    const a = 2 * Math.PI * cur.to / r.n;
    const lx = r.c + (r.rp - 34 * k) * Math.cos(a), ly = r.c + (r.rp - 34 * k) * Math.sin(a);
    ctx.font = 'bold ' + Math.round(20 * k) + 'px ui-monospace, Consolas, monospace';
    const w = ctx.measureText(String(cur.to)).width;
    ctx.fillStyle = 'rgba(2,8,6,0.85)'; ctx.fillRect(lx - w / 2 - 5 * k, ly - 13 * k, w + 10 * k, 26 * k);
    ctx.fillStyle = '#00ff88'; ctx.fillText(String(cur.to), lx, ly);
  }
  function dot(ctx, x, y, r, col) {
    ctx.save();
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = r * 1.6;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function artVisible() { return (!P.surprise && showArt) || (P.surprise && revealed); }

  // Hilos ya colocados (solo en modo normal o tras revelar la sorpresa)
  function drawArt() {
    const r = ring, cv = $('mArtCanvas'), ctx = cv.getContext('2d');
    const upTo = artVisible() ? Math.min(s, total) : 0;
    if (!artVisible() || upTo < artUpTo || artUpTo < 0) {
      ctx.clearRect(0, 0, r.R, r.R);
      ctx.fillStyle = artVisible() ? P.bg : '#03100a';
      ctx.beginPath(); ctx.arc(r.c, r.c, r.rp, 0, Math.PI * 2); ctx.fill();
      artUpTo = 0;
    }
    $('mHidden').hidden = !(P.surprise && !revealed);
    if (!artVisible()) return;
    ctx.lineWidth = Math.max(0.3, P.threadMm * 2 * r.rp / (P.diameterCm * 10));
    ctx.globalAlpha = Math.max(0.05, P.opacity);
    for (let q = artUpTo; q < upTo; q++) {
      const f = info(q);
      ctx.strokeStyle = colorOf(f.c).hex;
      ctx.beginPath(); ctx.moveTo(r.xs[f.from], r.ys[f.from]); ctx.lineTo(r.xs[f.to], r.ys[f.to]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    artUpTo = upTo;
  }

  /* ---------- pantalla ---------- */
  function render() {
    if (!P) return;
    ringSetup();
    const done = s >= total;
    const cur = info(s);
    $('mStep').textContent = I.fmt(Math.min(s + 1, total));
    $('mTotal').textContent = I.fmt(total);
    $('mPct').textContent = '(' + I.fmt(Math.floor((s / total) * 1000) / 10, 1) + '%)';
    $('mFrom').textContent = String(cur.from);
    $('mTo').textContent = String(cur.to);
    $('mBig').hidden = done;
    $('mDone').hidden = !done;
    $('mReveal').hidden = !(done && P.surprise && !revealed);
    $('mNextBtn').disabled = done;
    $('mPrev').disabled = s <= 0;

    // color actual
    const col = colorOf(cur.c);
    const box = clear($('mColor'));
    const sw = el('div', { class: 'mc-sw', text: U.letter(cur.c) });
    sw.style.background = col.hex; sw.style.color = U.inkFor(col.hex);
    box.style.borderColor = col.hex;
    box.style.boxShadow = '0 0 18px ' + col.hex + '55';
    const used = (colorBefore[cur.b] + idx.cum[Math.min(s, total)] - idx.cum[idx.start[cur.b]]) / 100;
    box.appendChild(sw);
    box.appendChild(el('div', { class: 'mc-name', text: cname(cur.c) }));
    box.appendChild(el('div', { class: 'mc-info', text:
      t('r_block', { n: cur.b + 1 }) + '/' + P.blocks.length + ' · ' +
      t('m_thread', { used: I.fmt(used, 1), total: I.fmt(stats[cur.c].netM, 1) }) }));

    // aviso de cambio de color
    const w = $('mWarn');
    if (!done && cur.b + 1 < P.blocks.length) {
      const n = idx.start[cur.b + 1] - s;
      const next = cname(P.blocks[cur.b + 1][0]);
      w.hidden = n > 15;
      w.textContent = '! ' + (n <= 1 ? t('m_warn_now', { color: next.toUpperCase() }) : t('m_warn', { n, color: next.toUpperCase() }));
    } else w.hidden = true;

    // siguientes clavos (solo dentro del mismo color)
    const nx = clear($('mNext'));
    if (!done) {
      nx.appendChild(document.createTextNode(t('m_next') + ': '));
      for (let q = s + 1; q < Math.min(total, s + 7); q++) {
        const f = info(q);
        if (f.b !== cur.b) { nx.appendChild(el('b', { text: '| ' + cname(f.c).toUpperCase() })); break; }
        nx.appendChild(el('b', { text: String(f.to) }));
        nx.appendChild(document.createTextNode(' · '));
      }
    }
    updateBar(cur);
    drawRing(cur);
    drawArt();
  }

  function savedLabel() {
    const d = new Date(lastSaved);
    $('mSaved').textContent = t('m_saved', { time: d.toLocaleTimeString(I.flagInfo().num, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
  }

  function persist(forward) {
    P.step = s;
    St.saveStep(P.id, s);
    lastSaved = Date.now();
    savedLabel();
    const every = Number(cfg.get().backupEvery) || 0;
    if (forward && every > 0 && s > 0 && s % every === 0) backup(true);
  }

  async function backup(auto) {
    try {
      const txt = await St.buildFile(P, keyInfo);
      const fn = St.safeFileName(P.name) + (I.lang === 'es' ? '-paso-' : '-step-') + (Math.min(s, total)) + '.hilo';
      U.download(fn, txt);
      U.toast(t('backup_done', { file: fn }));
    } catch (e) {
      if (!auto) U.toast(t('e_generic', { m: e.message }), 'err');
    }
  }

  function go(to, forward) {
    if (!P || ccOpen) return;
    const prev = s;
    s = Math.max(0, Math.min(total, to));
    if (s === prev) return;
    persist(forward);
    render();
    if (s >= total) {
      stopAuto();
      if (cfg.get().voice) U.speak(t('voice_done'));
      U.vibrate([80, 60, 80, 60, 200]);
      return;
    }
    const cur = info(s);
    if (forward && s === idx.start[cur.b]) { showColorChange(cur); return; }
    if (cfg.get().voice) U.speak(t('voice_step', { pin: cur.to }));
  }
  const next = () => go(s + 1, true);
  const prev = () => go(s - 1, false);

  /* ---------- cambio de color ---------- */
  function showColorChange(cur) {
    const col = colorOf(cur.c);
    const first = cur.b === 0;
    const ov = $('ccOverlay');
    ov.style.setProperty('--cc', col.hex);
    ov.style.setProperty('--cc-glow', U.luminance(col.hex) < 0.12 ? '#c9ffe3' : col.hex);
    $('ccKicker').textContent = '// ' + (first ? t('cc_start_kicker') : t('cc_kicker'));
    const sw = $('ccSwatch');
    sw.style.background = col.hex; sw.style.color = U.inkFor(col.hex);
    $('ccLetter').textContent = U.letter(cur.c);
    $('ccTitle').textContent = first ? t('cc_first', { color: cname(cur.c).toUpperCase() }) : t('cc_title', { color: cname(cur.c).toUpperCase() });
    const ol = clear($('ccSteps'));
    if (!first) {
      const pb = P.blocks[cur.b - 1];
      ol.appendChild(el('li', { text: t('cc_s1', { old: cname(pb[0]), pin: pb[pb.length - 1] }) }));
    }
    ol.appendChild(el('li', { text: t('cc_s2', { color: cname(cur.c), letter: U.letter(cur.c) }) }));
    ol.appendChild(el('li', { text: t('cc_s3', { pin: cur.from }) }));
    ov.hidden = false;
    ccOpen = true;
    U.vibrate([200, 100, 200]);
    U.beep();
    if (cfg.get().voice) U.speak(t('voice_cc', { color: cname(cur.c), pin: cur.from }));
    setTimeout(() => $('ccOk').focus(), 50);
  }
  function closeColorChange() {
    $('ccOverlay').hidden = true;
    ccOpen = false;
    if (cfg.get().voice && s < total) U.speak(t('voice_step', { pin: info(s).to }));
  }

  /* ---------- manos libres ---------- */
  function startAuto() {
    stopAuto();
    const sec = Math.max(2, Math.min(60, Number(cfg.get().handsFreeSec) || 6));
    autoTimer = setInterval(() => { if (!ccOpen && isOpen()) next(); }, sec * 1000);
    $('mAuto').setAttribute('aria-pressed', 'true');
  }
  function stopAuto() {
    clearInterval(autoTimer); autoTimer = 0;
    $('mAuto').setAttribute('aria-pressed', 'false');
  }

  /* ---------- plan de colores ---------- */
  function planList(cur) {
    const ol = el('ol', { class: 'plan mono' });
    P.blocks.forEach((bl, b) => {
      const col = colorOf(bl[0]);
      const li = el('li', { class: cur && cur.b === b ? 'cur' : null }, [
        el('span', { class: 'chip' }, [el('i'), el('b', { text: U.letter(bl[0]) }), el('span', { text: cname(bl[0]) })]),
        el('span', { text: t('r_block', { n: b + 1 }) + ' · ' + t('r_block_steps', { a: I.fmt(idx.start[b] + 1), b: I.fmt(idx.start[b + 1]) }) })
      ]);
      li.style.borderLeftColor = col.hex;
      li.querySelector('i').style.background = col.hex;
      ol.appendChild(li);
    });
    return ol;
  }

  /* ---------- API ---------- */
  function open(project, ki, opts) {
    P = project; keyInfo = ki || null;
    prepare();
    s = Math.max(0, Math.min(total, P.step || 0));
    revealed = false;
    showArt = cfg.get().showArt !== false;
    ring = null;
    $('mName').textContent = P.name;
    $('mArt').hidden = !!P.surprise;
    $('mArt').setAttribute('aria-pressed', String(showArt));
    $('mVoice').setAttribute('aria-pressed', String(!!cfg.get().voice));
    buildBar();
    lastSaved = Date.now();
    savedLabel();
    render();
    if (cfg.get().wake !== false) U.keepAwake(true);
    if (s < total && s === idx.start[info(s).b] && !(opts && opts.quiet)) showColorChange(info(s));
  }

  function leave() {
    stopAuto();
    U.keepAwake(false);
    if (root.speechSynthesis) try { root.speechSynthesis.cancel(); } catch (e) { /* nada */ }
    $('ccOverlay').hidden = true; ccOpen = false;
    P = null; keyInfo = null; idx = null;
    const rc = $('mRingCanvas'), ac = $('mArtCanvas');
    rc.getContext('2d').clearRect(0, 0, rc.width, rc.height);
    ac.getContext('2d').clearRect(0, 0, ac.width, ac.height);
  }

  function init(settingsApi) {
    cfg = settingsApi;
    $('mNextBtn').addEventListener('click', next);
    $('mPrev').addEventListener('click', prev);
    $('mBig').addEventListener('click', next);
    $('mBig').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); next(); } });
    $('ccOk').addEventListener('click', closeColorChange);
    $('mGo').addEventListener('click', async () => {
      const n = await U.askNumber(t('m_go'), t('m_go_prompt', { n: total }), 1, total, Math.min(s + 1, total));
      if (n != null) go(n - 1, true);
    });
    $('mVoice').addEventListener('click', () => {
      const v = !cfg.get().voice;
      cfg.set({ voice: v });
      $('mVoice').setAttribute('aria-pressed', String(v));
      if (v && s < total) U.speak(t('voice_step', { pin: info(s).to }));
    });
    $('mAuto').addEventListener('click', () => {
      if (autoTimer) { stopAuto(); return; }
      if (!cfg.get().voice) { cfg.set({ voice: true }); $('mVoice').setAttribute('aria-pressed', 'true'); }
      startAuto();
    });
    $('mArt').addEventListener('click', () => {
      showArt = !showArt;
      cfg.set({ showArt });
      $('mArt').setAttribute('aria-pressed', String(showArt));
      artUpTo = -1;
      render();
    });
    $('mBackup').addEventListener('click', () => backup(false));
    $('mPlanBtn').addEventListener('click', () => {
      U.modal({ title: t('r_plan'), body: planList(s < total ? info(s) : null), actions: [{ label: t('close'), value: true, kind: 'primary' }] });
    });
    $('mReveal').addEventListener('click', () => { revealed = true; artUpTo = -1; render(); });
    $('mFrame').addEventListener('click', () => { if (P) root.HiloFrame.open(root.HiloFrame.specFromProject(P)); });

    root.document.addEventListener('keydown', e => {
      if (!isOpen() || !$('modal').hidden || (root.HiloFrame && root.HiloFrame.isOpen())) return;
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (ccOpen) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeColorChange(); }
        return;
      }
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    });
    root.document.addEventListener('visibilitychange', () => {
      if (root.document.visibilityState === 'visible' && isOpen() && cfg.get().wake !== false) U.keepAwake(true);
    });
    root.addEventListener('resize', U.debounce(() => { if (isOpen()) { ring = null; render(); } }, 200));
  }

  root.HiloManual = Object.freeze({
    init, open, leave, isOpen,
    refresh: () => { if (isOpen()) { buildBar(); render(); savedLabel(); } }
  });
})(self);
