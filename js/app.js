/* Hilograma MyD - control general de la aplicacion. */
(function (root) {
  'use strict';
  const doc = root.document;
  const E = root.HiloEngine, I = root.HiloI18n, U = root.HiloUI, St = root.HiloStore;
  const ED = root.HiloEditor, M = root.HiloManual, F = root.HiloFlags;
  const { $, el, clear, icon } = U;
  const t = (k, v) => I.t(k, v);
  const SCREENS = ['home', 'create', 'result', 'manual', 'open', 'paste', 'settings'];

  /* ---------- proteccion contra clickjacking (la CSP por meta no admite frame-ancestors) ---------- */
  let framed = false;
  try { framed = root.top !== root.self; } catch (e) { framed = true; }

  const settings = Object.assign({
    lang: 'es', flag: 'co', voice: false, handsFreeSec: 6, wake: true, backupEvery: 500, showArt: true
  }, St.getSettings());
  const cfg = {
    get: () => settings,
    set: patch => { Object.assign(settings, patch); St.setSettings(settings); }
  };

  let screen = null;
  let res = null;            // { project, keyInfo, unsaved }
  let drawAnim = 0;
  let deferredInstall = null;

  function errMsg(e) {
    const code = e && e.code;
    if (code === 'cancelled') return null;
    if (code) return t('e_' + code, { m: e.message });
    return t('e_generic', { m: (e && e.message) || String(e) });
  }
  function fail(e) { const m = errMsg(e); if (m) U.toast(m, 'err'); }

  /* ---------- navegacion ---------- */
  function show(name, push) {
    if (screen === name) return;
    if (screen === 'create') ED.leave();
    if (screen === 'manual') M.leave();
    if (screen === 'result') stopDraw();
    SCREENS.forEach(s => { $('scr-' + s).hidden = s !== name; });
    const from = screen;
    screen = name;
    doc.body.setAttribute('data-screen', name);
    if (push !== false && name !== 'home' && from === 'home') root.history.pushState({ s: name }, '');
    if (name === 'home') renderProjects();
    if (name === 'create') ED.enter();
    if (name === 'settings') renderSettings();
    root.scrollTo(0, 0);
  }

  /* ---------- idioma ---------- */
  function langButton() {
    const b = clear($('btnLang'));
    const f = I.flagInfo();
    b.appendChild(F.make(f.id, f.name));
  }

  function langChooser(onPick) {
    const wrap = el('div', { class: 'lang-chooser' });
    const es = el('div', { class: 'lang-opt es' + (I.lang === 'es' ? ' on' : '') });
    const esBtn = el('button', { type: 'button', class: 'flag-btn' + (I.lang === 'es' ? ' on' : ''), 'aria-label': 'Español (Colombia)' }, F.make('co', 'Colombia'));
    esBtn.addEventListener('click', () => onPick('es', 'co'));
    es.appendChild(esBtn);
    es.appendChild(el('span', { class: 'lang-name', text: t('lang_es') }));
    wrap.appendChild(es);
    const en = el('div', { class: 'lang-opt' + (I.lang === 'en' ? ' on' : '') });
    en.appendChild(el('span', { class: 'lang-name', text: t('lang_en') }));
    const flags = el('div', { class: 'row wrap' });
    I.FLAGS.en.forEach(f => {
      const b = el('button', { type: 'button', class: 'flag-btn' + (I.lang === 'en' && I.flag === f.id ? ' on' : ''), 'aria-label': 'English (' + f.name + ')', title: f.name }, F.make(f.id, f.name));
      b.addEventListener('click', () => onPick('en', f.id));
      flags.appendChild(b);
    });
    en.appendChild(flags);
    wrap.appendChild(en);
    return wrap;
  }

  function setLanguage(lang, flag) {
    I.setLang(lang, flag);
    cfg.set({ lang: I.lang, flag: I.flag });
    I.apply();
    langButton();
    ED.buildPanels();
    M.refresh();
    root.HiloFrame.refresh();
    if (screen === 'home') renderProjects();
    if (screen === 'settings') renderSettings();
    if (screen === 'result' && res) renderResultInfo();
    buildExamples();
    boot(true);
  }

  async function openLangModal() {
    let picked = null;
    const body = langChooser((l, f) => {
      picked = [l, f];
      const b = doc.querySelector('#modalActions .btn');
      if (b) b.click();
    });
    await U.modal({ title: t('lang_choose'), body, actions: [{ label: t('close'), value: true }], dismiss: true });
    if (picked) setLanguage(picked[0], picked[1]);
  }

  /* ---------- inicio ---------- */
  let bootTimer = 0;
  function boot(instant) {
    const lines = ['> hilograma_myd v1.0.0', '> ' + t('boot1') + ' ........ [OK]', '> ' + t('boot2') + ' .. [OK]', '> ' + t('boot3') + ' _'];
    const pre = $('bootLog');
    clearTimeout(bootTimer);
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (instant || reduce) { pre.textContent = lines.join('\n'); return; }
    const full = lines.join('\n');
    let i = 0;
    (function tick() {
      i += 3;
      pre.textContent = full.slice(0, i);
      if (i < full.length) bootTimer = setTimeout(tick, 12);
    })();
  }

  function renderResume(list) {
    const rb = clear($('resumeBox'));
    const r = list.filter(p => (p.step | 0) > 0 && (p.step | 0) < (p.total | 0))
      .sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
    rb.hidden = !r;
    if (!r) return;
    const pct = Math.floor(r.step / r.total * 100);
    const b = el('button', { type: 'button', class: 'resume' }, [
      el('span', { class: 'rs-i' }, icon('play')),
      el('span', { class: 'rs-t', text: t('home_resume_t') }),
      el('span', { class: 'rs-d mono', text: t('home_resume_d', { name: St.cleanText(r.name, 60), step: I.fmt(r.step + 1), total: I.fmt(r.total), pct }) }),
      el('span', { class: 'rs-go' }, icon('right'))
    ]);
    b.addEventListener('click', () => continueProject(r.id));
    rb.appendChild(b);
  }

  function renderProjects() {
    const list = St.list();
    renderResume(list);
    const box = clear($('projectList'));
    $('projectEmpty').hidden = list.length > 0;
    list.forEach(p => {
      const total = Math.max(1, p.total | 0), step = Math.min(total, Math.max(0, p.step | 0));
      const pct = Math.floor(step / total * 100);
      const dots = el('span', { class: 'dots' });
      (p.colors || []).slice(0, 6).forEach(h => { if (/^#[0-9a-f]{6}$/i.test(h)) { const d = el('i'); d.style.background = h; dots.appendChild(d); } });
      const bar = el('i');
      bar.style.width = pct + '%';
      const date = new Date(p.updated || p.created || Date.now()).toLocaleDateString(I.flagInfo().num, { day: '2-digit', month: 'short', year: 'numeric' });
      const act = (label, ic, fn, cls) => {
        const b = el('button', { type: 'button', class: 'btn small ' + (cls || '') }, [icon(ic), el('span', { text: label })]);
        b.addEventListener('click', fn);
        return b;
      };
      box.appendChild(el('div', { class: 'proj' }, [
        el('div', { class: 'proj-h' }, [
          el('span', { class: 'proj-name', text: St.cleanText(p.name, 60) }),
          p.surprise ? el('span', { class: 'tag s' }, [icon('eyeoff'), t('p_surprise')]) : null,
          p.enc ? el('span', { class: 'tag l' }, [icon('lock'), t('p_locked')]) : null,
          step >= total ? el('span', { class: 'tag d' }, [icon('check'), t('p_done')]) : null,
          dots
        ]),
        el('div', { class: 'proj-meta mono', text: t('p_progress', { pct, step: I.fmt(Math.min(step + 1, total)), total: I.fmt(total) }) + ' · ' + date }),
        el('div', { class: 'proj-bar' }, bar),
        el('div', { class: 'proj-actions' }, [
          act(t('p_continue'), 'play', () => continueProject(p.id), 'primary'),
          act(t('p_details'), 'list', () => detailsProject(p.id)),
          act(t('p_download'), 'download', () => downloadProject(p.id)),
          act(t('p_delete'), 'trash', () => deleteProject(p), 'danger')
        ])
      ]));
    });
  }

  const askPw = a => U.askPassword(a);

  async function continueProject(id) {
    try {
      const r = await St.loadProject(id, askPw);
      show('manual');
      M.open(r.project, r.keyInfo);
    } catch (e) { fail(e); }
  }
  async function detailsProject(id) {
    try {
      const r = await St.loadProject(id, askPw);
      openResult(r.project, r.keyInfo, {});
    } catch (e) { fail(e); }
  }
  async function downloadProject(id) {
    try {
      const r = await St.loadProject(id, askPw);
      await downloadFile(r.project, r.keyInfo);
    } catch (e) { fail(e); }
  }
  async function deleteProject(p) {
    const ok = await U.confirmBox(t('delete_t'), t('delete_confirm', { name: St.cleanText(p.name, 60) }), t('p_delete'), true);
    if (!ok) return;
    St.deleteProject(p.id);
    renderProjects();
    U.toast(t('deleted'));
  }

  async function downloadFile(project, keyInfo) {
    const txt = await St.buildFile(project, keyInfo);
    const fn = St.safeFileName(project.name) + '.hilo';
    U.download(fn, txt);
    U.toast(t('backup_done', { file: fn }));
  }

  /* ---------- resultado ---------- */
  function openResult(project, keyInfo, opts) {
    res = { project, keyInfo, unsaved: !!opts.unsaved };
    show('result');
    const sur = !!project.surprise;
    $('resSealed').hidden = !sur;
    $('resCanvasBox').hidden = sur;
    $('btnJustDraw').hidden = sur;
    $('btnSeq').hidden = sur;
    $('seqBox').hidden = true;
    $('btnShare').hidden = !U.canShareFiles();
    renderResultInfo();
    if (!sur) root.requestAnimationFrame(() => drawResult(!!opts.animate));
  }

  function renderResultInfo() {
    const p = res.project;
    $('resTitle').textContent = p.name;
    const box = clear($('resStats'));
    box.appendChild(ED.statsTable(p));
    const idx = E.indexSteps(p);
    const sp = ED.spacingInfo(p.nPins, p.diameterCm);
    box.appendChild(el('div', { class: 'kv' }, [
      el('span', null, [t('r_pins') + ': ', el('b', { text: I.fmt(p.nPins) })]),
      el('span', null, [t('r_diam') + ': ', el('b', { text: I.fmt(p.diameterCm, 1) + ' cm' })]),
      el('span', null, [t('r_steps') + ': ', el('b', { text: I.fmt(idx.total) })]),
      el('span', null, [t('st_changes') + ': ', el('b', { text: I.fmt(Math.max(0, p.blocks.length - 1)) })]),
      el('span', null, [t('s_spacing', { cm: I.fmt(sp.cm, 2), deg: I.fmt(sp.deg, 2) })])
    ]));
    box.appendChild(el('p', { class: 'note', text: t('s_pin0') }));
    const plan = clear($('resPlan'));
    p.blocks.forEach((bl, b) => {
      const c = p.colors[bl[0]];
      const sw = el('i'); sw.style.background = c.hex;
      const li = el('li', null, [
        el('span', { class: 'chip' }, [sw, el('b', { text: U.letter(bl[0]) }), el('span', { text: c.name || I.colorName(c.hex) })]),
        el('span', { text: t('r_block', { n: b + 1 }) + ' · ' + t('r_block_steps', { a: I.fmt(idx.start[b] + 1), b: I.fmt(idx.start[b + 1]) }) })
      ]);
      li.style.borderLeftColor = c.hex;
      plan.appendChild(li);
    });
  }

  function stopDraw() { if (drawAnim) root.cancelAnimationFrame(drawAnim); drawAnim = 0; }

  // Dibuja el hilograma simulado (igual que "Just Draw" del original, pero con colores, grosor y opacidad)
  function drawResult(animate) {
    stopDraw();
    const p = res.project;
    if (p.surprise) return;
    const cv = $('resCanvas'), box = $('resCanvasBox');
    const S = Math.round(Math.min(1600, Math.max(300, box.clientWidth) * Math.min(2, root.devicePixelRatio || 1)));
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = p.bg;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.fill();
    const n = p.nPins, rp = S / 2 - S / (2 * p.size), c = S / 2;
    const xs = new Float32Array(n), ys = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; xs[i] = c + rp * Math.cos(a); ys[i] = c + rp * Math.sin(a); }
    const seg = [];
    for (const bl of p.blocks) for (let j = 2; j < bl.length; j++) seg.push(bl[0], bl[j - 1], bl[j]);
    const lw = Math.max(0.04, p.threadMm * S / (p.diameterCm * 10));
    const total = seg.length / 3;
    let i = 0;
    const t0 = root.performance.now(), DURATION = 4000;
    (function frame() {
      ctx.lineWidth = lw;
      ctx.globalAlpha = p.opacity;
      const end = animate ? Math.min(total, Math.max(i + 1, Math.floor(total * (root.performance.now() - t0) / DURATION))) : total;
      for (; i < end; i++) {
        ctx.strokeStyle = p.colors[seg[i * 3]].hex;
        ctx.beginPath(); ctx.moveTo(xs[seg[i * 3 + 1]], ys[seg[i * 3 + 1]]); ctx.lineTo(xs[seg[i * 3 + 2]], ys[seg[i * 3 + 2]]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (i < total) drawAnim = root.requestAnimationFrame(frame);
      else drawAnim = 0;
    })();
  }

  function sequenceText(p) {
    if (p.blocks.length === 1 && p.colors.length === 1) return p.blocks[0].slice(1).join(',');
    return p.blocks.map((b, i) => '# ' + t('r_block', { n: i + 1 }) + ' · ' + U.letter(b[0]) + ' ' + (p.colors[b[0]].name || I.colorName(p.colors[b[0]].hex)) + ' (' + p.colors[b[0]].hex + ')\n' + b.slice(1).join(',')).join('\n\n');
  }

  async function resultStart() {
    try {
      if (res.unsaved) { await St.saveProject(res.project, res.keyInfo); res.unsaved = false; }
      const p = res.project, k = res.keyInfo;
      show('manual');
      M.open(p, k);
    } catch (e) { fail(e); }
  }

  /* ---------- abrir archivo .hilo ---------- */
  async function importFile(file) {
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new St.HiloError('too_big');
      const text = await file.text();
      const r = await St.parseFile(text, askPw);
      const p = r.project;
      let existed = false;
      if (St.exists(p.id)) {
        existed = true;
        const local = St.list().find(x => x.id === p.id);
        if (local && Number.isInteger(local.step)) p.step = Math.max(p.step, Math.min(local.step, St.totalSteps(p)));
      }
      await St.saveProject(p, r.keyInfo);
      U.toast(existed ? t('o_exists') : t('o_ok'));
      show('manual');
      M.open(p, r.keyInfo);
    } catch (e) {
      fail(e);
    } finally {
      $('fileHilo').value = '';
    }
  }

  /* ---------- pegar numeros (opcion del original) ---------- */
  function pastedProject() {
    const pins = Math.round(Number($('pastePins').value));
    const diam = Number($('pasteDiam').value);
    const parts = $('pasteText').value.split(/[\s,;]+/).filter(Boolean);
    if (!(pins >= E.LIMITS.minPins && pins <= E.LIMITS.maxPins) || parts.length < 2 || parts.length > 50001 || parts.some(x => !/^\d{1,4}$/.test(x))) throw new St.HiloError('pa_bad');
    const seq = parts.map(Number);
    if (seq.some(v => v >= pins)) throw new St.HiloError('pa_bad');
    const d = ED.DEFAULTS;
    return St.sanitizeProject({
      id: St.randomId(), name: t('pa_name'), created: Date.now(), surprise: false,
      nPins: pins, size: d.size, diameterCm: diam > 0 ? diam : d.diameterCm, pegMm: d.pegMm, threadMm: d.threadMm,
      opacity: d.opacity / 100, marginPct: d.marginPct, tieCm: d.tieCm, spoolM: 0,
      bg: '#ffffff', colors: [{ hex: '#000000', name: '' }],
      blocks: [[0].concat(seq)], step: 0,
      params: { lines: seq.length - 1, weight: d.weight, minDist: d.minDist, minLoop: d.minLoop, rounds: 1 }
    });
  }
  function pasteAction(start) {
    let p;
    try { p = pastedProject(); } catch (e) {
      U.toast(e.code === 'pa_bad' ? t('pa_bad') : errMsg(e), 'err');
      return;
    }
    if (start) { res = { project: p, keyInfo: null, unsaved: true }; resultStart(); }
    else openResult(p, null, { unsaved: true, animate: true });
  }

  // Botones de ejemplo: las 3 secuencias del StringArtGenerator original (288 clavos, aro de 62,5 cm)
  function buildExamples() {
    const ex = clear($('pasteExamples'));
    (root.HILO_EXAMPLES || []).forEach((seq, i) => {
      const b = el('button', { type: 'button', class: 'btn small', text: t('pa_example', { n: i + 1 }) });
      b.addEventListener('click', () => { $('pasteText').value = seq; $('pastePins').value = 288; $('pasteDiam').value = 62.5; });
      ex.appendChild(b);
    });
  }

  /* ---------- ajustes ---------- */
  function renderSettings() {
    const lc = clear($('langChooser'));
    lc.appendChild(langChooser((l, f) => setLanguage(l, f)));
    const pb = clear($('prefsBox'));
    const row = (labelKey, control) => el('div', { class: 'prefs-row' }, [el('label', { i18n: labelKey }), control]);
    const voice = el('input', { type: 'checkbox', class: 'switch', checked: !!settings.voice, 'aria-label': t('se_voice') });
    voice.addEventListener('change', () => cfg.set({ voice: voice.checked }));
    const hf = el('input', { type: 'number', class: 'inp short', min: 2, max: 30, step: 1, value: Math.min(30, settings.handsFreeSec), 'aria-label': t('se_handsfree') });
    hf.addEventListener('change', () => { const v = Math.min(30, Math.max(2, Math.round(Number(hf.value)) || 6)); hf.value = v; cfg.set({ handsFreeSec: v }); });
    const wake = el('input', { type: 'checkbox', class: 'switch', checked: settings.wake !== false, 'aria-label': t('se_wake') });
    wake.addEventListener('change', () => cfg.set({ wake: wake.checked }));
    const bk = el('select', { class: 'inp', 'aria-label': t('se_backup') });
    [0, 100, 250, 500, 1000].forEach(n => bk.appendChild(el('option', { value: n, text: n ? t('se_every', { n }) : t('se_never'), selected: Number(settings.backupEvery) === n })));
    bk.addEventListener('change', () => cfg.set({ backupEvery: Number(bk.value) }));
    pb.appendChild(row('se_voice', voice));
    pb.appendChild(row('se_handsfree', hf));
    pb.appendChild(row('se_wake', wake));
    pb.appendChild(row('se_backup', bk));
    const sl = clear($('secList'));
    t('se_sec').forEach(s => sl.appendChild(el('li', { text: s })));
  }

  async function wipeEverything() {
    const ok = await U.confirmBox(t('se_wipe'), t('se_wipe_confirm'), t('p_delete'), true);
    if (!ok) return;
    St.wipeAll();
    try {
      if (root.caches) { const keys = await root.caches.keys(); await Promise.all(keys.map(k => root.caches.delete(k))); }
      if (root.navigator.serviceWorker) { const regs = await root.navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); }
    } catch (e) { /* nada */ }
    U.toast(t('se_wiped'));
    setTimeout(() => root.location.reload(), 900);
  }

  /* ---------- arranque ---------- */
  function wire() {
    $('btnBrand').addEventListener('click', () => show('home'));
    $('btnSettings').addEventListener('click', () => show(screen === 'settings' ? 'home' : 'settings'));
    $('btnLang').addEventListener('click', openLangModal);
    $('goCreate').addEventListener('click', () => show('create'));
    $('goOpen').addEventListener('click', () => show('open'));
    $('goPaste').addEventListener('click', () => show('paste'));

    $('btnStart').addEventListener('click', resultStart);
    $('btnDlFile').addEventListener('click', async () => {
      try {
        if (res.unsaved) { await St.saveProject(res.project, res.keyInfo); res.unsaved = false; }
        await downloadFile(res.project, res.keyInfo);
      } catch (e) { fail(e); }
    });
    $('btnShare').addEventListener('click', async () => {
      try {
        const txt = await St.buildFile(res.project, res.keyInfo);
        await U.shareFile(St.safeFileName(res.project.name) + '.hilo', txt);
      } catch (e) { fail(e); }
    });
    $('btnFrame').addEventListener('click', () => root.HiloFrame.open(root.HiloFrame.specFromProject(res.project)));
    $('btnSeq').addEventListener('click', () => {
      if (res.project.surprise) return;
      const box = $('seqBox');
      box.hidden = !box.hidden;
      if (!box.hidden) $('seqText').value = sequenceText(res.project);
    });
    $('btnCopySeq').addEventListener('click', async () => {
      const ta = $('seqText');
      try { await root.navigator.clipboard.writeText(ta.value); }
      catch (e) { ta.select(); doc.execCommand('copy'); }
      U.toast(t('copied'));
    });
    $('btnJustDraw').addEventListener('click', () => drawResult(true));

    const fh = $('fileHilo'), dh = $('dropHilo');
    fh.addEventListener('change', () => importFile(fh.files && fh.files[0]));
    dh.addEventListener('dragover', e => { e.preventDefault(); dh.classList.add('over'); });
    dh.addEventListener('dragleave', () => dh.classList.remove('over'));
    dh.addEventListener('drop', e => { e.preventDefault(); dh.classList.remove('over'); importFile(e.dataTransfer.files && e.dataTransfer.files[0]); });

    buildExamples();
    $('pasteStart').addEventListener('click', () => pasteAction(true));
    $('pasteDraw').addEventListener('click', () => pasteAction(false));
    $('btnWipe').addEventListener('click', wipeEverything);

    root.addEventListener('popstate', () => { if (screen !== 'home') show('home', false); });
    root.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('btnInstall').hidden = false; });
    $('btnInstall').addEventListener('click', async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      try { await deferredInstall.userChoice; } catch (e) { /* nada */ }
      deferredInstall = null; $('btnInstall').hidden = true;
    });
    root.addEventListener('unhandledrejection', e => { fail(e.reason); });
  }

  function registerSW() {
    const nav = root.navigator;
    if (!('serviceWorker' in nav)) return;
    const okProto = root.location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(root.location.hostname);
    if (!okProto) return;
    nav.serviceWorker.register(U.scriptURL('sw.js'), { scope: './' }).catch(() => { /* sin modo offline */ });
  }

  function start() {
    if (framed) {
      doc.body.textContent = '';
      doc.body.appendChild(el('p', { class: 'noscript', text: t('e_framed') }));
      return;
    }
    I.setLang(settings.lang, settings.flag);
    I.apply();
    U.hydrateIcons();
    langButton();
    ED.init({
      cfg,
      onFinish: async (project, keyInfo, wantDownload) => {
        if (wantDownload) await downloadFile(project, keyInfo);
        openResult(project, keyInfo, { animate: true });
      }
    });
    M.init(cfg);
    root.HiloFrame.init();
    wire();
    const setTopbarH = () => doc.documentElement.style.setProperty('--topbar-h', doc.querySelector('.topbar').offsetHeight + 'px');
    setTopbarH();
    root.addEventListener('resize', U.debounce(setTopbarH, 150));
    show('home', false);
    boot(false);
    registerSW();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(self);
