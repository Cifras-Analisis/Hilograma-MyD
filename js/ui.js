/* Hilograma MyD - utilidades de interfaz: DOM seguro (sin innerHTML), iconos,
 * ventanas modales, avisos, descargas, voz y politica de Trusted Types. */
(function (root) {
  'use strict';
  const doc = root.document;
  const I = root.HiloI18n;
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- Trusted Types: solo se permiten nuestras propias URLs de script ---------- */
  const ALLOWED_SCRIPTS = new Set(['js/worker.js', 'sw.js']);
  let ttPolicy = null;
  if (root.trustedTypes && typeof root.trustedTypes.createPolicy === 'function') {
    ttPolicy = root.trustedTypes.createPolicy('hilo', {
      createScriptURL(u) {
        if (ALLOWED_SCRIPTS.has(u)) return u;
        throw new TypeError('blocked script URL');
      }
    });
  }
  function scriptURL(u) {
    if (!ALLOWED_SCRIPTS.has(u)) throw new TypeError('blocked script URL');
    return ttPolicy ? ttPolicy.createScriptURL(u) : u;
  }

  /* ---------- DOM ---------- */
  const $ = id => doc.getElementById(id);
  function el(tag, attrs, kids) {
    const e = doc.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'text') e.textContent = String(v);
        else if (k === 'class') e.className = v;
        else if (k === 'i18n') { e.setAttribute('data-i18n', v); e.textContent = I.t(v); }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (kids != null) {
      for (const c of [].concat(kids)) {
        if (c == null || c === false) continue;
        e.appendChild(typeof c === 'string' || typeof c === 'number' ? doc.createTextNode(String(c)) : c);
      }
    }
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  /* ---------- iconos (trazos 24x24) ---------- */
  const ICONS = {
    left: 'M19 12H5M12 19l-7-7 7-7',
    right: 'M5 12h14M12 5l7 7-7 7',
    home: 'M3 11l9-8 9 8M5 9v12h14V9',
    menu: 'M4 6h16M4 12h16M4 18h16',
    image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
    camera: 'M4 7h4l2-3h4l2 3h4v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    file: 'M6 2h9l5 5v15H6zM14 2v6h6',
    upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
    download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
    share: 'M4 12v8h16v-8M12 3v13M7 8l5-5 5 5',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    eyeoff: 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.6C3.9 8.4 2 12 2 12s4 6 10 6a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15',
    rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    play: 'M7 4l13 8-13 8z',
    pause: 'M7 4h4v16H7zM14 4h4v16h-4z',
    volume: 'M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
    mute: 'M11 5L6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6',
    hash: 'M5 9h14M5 15h14M10 3L8 21M16 3l-2 18',
    save: 'M5 3h11l5 5v13H3V3zM7 3v6h8V3M7 21v-7h10v7',
    list: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
    check: 'M4 12l5 5L20 6',
    copy: 'M8 8h12v12H8zM4 16V4h12',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    x: 'M6 6l12 12M18 6L6 18',
    wand: 'M15 4V2M15 10V8M11 6h2M17 6h2M4 20L14 10M18 13l1.5 1.5M5.5 4.5L7 6',
    reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
    timer: 'M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
    template: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v2M12 19v2M3 12h2M19 12h2'
  };
  function icon(name, cls) {
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const p = doc.createElementNS(NS, 'path');
    p.setAttribute('d', ICONS[name] || ICONS.x);
    svg.appendChild(p);
    return svg;
  }
  // Rellena los <span data-icon="..."> del HTML
  function hydrateIcons(scope) {
    (scope || doc).querySelectorAll('[data-icon]').forEach(s => {
      if (s.firstChild && s.firstChild.nodeName === 'svg') return;
      s.appendChild(icon(s.getAttribute('data-icon')));
    });
  }

  /* ---------- aviso flotante ---------- */
  let toastTimer = 0;
  function toast(msg, kind) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'err' ? 6000 : 3200);
  }

  /* ---------- ventana modal ---------- */
  let modalOpen = null;
  function modal(opts) {
    if (modalOpen) modalOpen(opts.dismiss);
    return new Promise(resolve => {
      const box = $('modal'), title = $('modalTitle'), body = clear($('modalBody')), acts = clear($('modalActions'));
      const prevFocus = doc.activeElement;
      title.textContent = opts.title || '';
      if (opts.body) [].concat(opts.body).forEach(n => body.appendChild(typeof n === 'string' ? el('p', { text: n }) : n));
      let done = false;
      function finish(v) {
        if (done) return;
        done = true; modalOpen = null;
        box.hidden = true;
        doc.removeEventListener('keydown', onKey, true);
        clear(body); clear(acts);
        if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* nada */ }
        resolve(v);
      }
      modalOpen = finish;
      const buttons = (opts.actions || [{ label: I.t('ok'), value: true, kind: 'primary' }]).map(a => {
        const b = el('button', { type: 'button', class: 'btn ' + (a.kind || ''), text: a.label });
        b.addEventListener('click', () => finish(typeof a.value === 'function' ? a.value() : a.value));
        acts.appendChild(b);
        return b;
      });
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); finish(opts.dismiss); }
        else if (e.key === 'Enter' && opts.enterValue && e.target.tagName === 'INPUT') { e.preventDefault(); finish(opts.enterValue()); }
        else if (e.key === 'Tab') {
          const f = Array.from(box.querySelectorAll('button, input, select, textarea, [tabindex="0"]')).filter(x => !x.disabled);
          if (!f.length) return;
          const i = f.indexOf(doc.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }
      }
      doc.addEventListener('keydown', onKey, true);
      box.hidden = false;
      const first = body.querySelector('input, select, textarea') || buttons.find((b, i) => (opts.actions || [])[i] && opts.actions[i].kind === 'primary') || buttons[0];
      if (first) setTimeout(() => first.focus(), 30);
    });
  }

  function confirmBox(title, text, okLabel, danger) {
    return modal({
      title, body: text, dismiss: false,
      actions: [{ label: I.t('cancel'), value: false }, { label: okLabel || I.t('ok'), value: true, kind: danger ? 'danger' : 'primary' }]
    });
  }

  function askPassword(attempt, title) {
    const inp = el('input', { type: 'password', class: 'inp', autocomplete: 'current-password', maxlength: 128, 'aria-label': I.t('o_pw') });
    const body = [el('p', { class: 'mono small', text: I.t('o_pw') }), inp];
    if (attempt > 0) body.push(el('p', { class: 'err mono small', text: I.t('o_pw_bad') }));
    return modal({
      title: title || I.t('o_pw_t'), body, dismiss: null,
      enterValue: () => inp.value,
      actions: [{ label: I.t('cancel'), value: null }, { label: I.t('ok'), value: () => inp.value, kind: 'primary' }]
    });
  }

  function askNumber(title, text, min, max, value) {
    const inp = el('input', { type: 'number', class: 'inp', min, max, step: 1, value, inputmode: 'numeric' });
    const read = () => {
      const v = Math.round(Number(inp.value));
      return Number.isFinite(v) && v >= min && v <= max ? v : null;
    };
    return modal({
      title, body: [el('p', { class: 'mono small', text }), inp], dismiss: null, enterValue: read,
      actions: [{ label: I.t('cancel'), value: null }, { label: I.t('ok'), value: read, kind: 'primary' }]
    });
  }

  /* ---------- archivos ---------- */
  function download(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename, rel: 'noopener' });
    a.hidden = true;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  async function shareFile(filename, text) {
    try {
      const f = new File([text], filename, { type: 'application/octet-stream' });
      if (!root.navigator.canShare || !root.navigator.canShare({ files: [f] })) return false;
      await root.navigator.share({ files: [f], title: 'Hilograma MyD' });
      return true;
    } catch (e) {
      return e && e.name === 'AbortError';
    }
  }
  function canShareFiles() {
    try {
      return !!(root.navigator.canShare && root.navigator.canShare({ files: [new File(['x'], 'x.hilo', { type: 'application/octet-stream' })] }));
    } catch (e) { return false; }
  }

  /* ---------- color ---------- */
  function luminance(hex) {
    const [r, g, b] = root.HiloEngine.hexToRgb(hex).map(v => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const inkFor = hex => (luminance(hex) > 0.35 ? '#000000' : '#ffffff');
  const letter = k => String.fromCharCode(65 + k);

  /* ---------- voz ---------- */
  function speak(text) {
    const s = root.speechSynthesis;
    if (!s || !root.SpeechSynthesisUtterance) return;
    try {
      s.cancel();
      const u = new root.SpeechSynthesisUtterance(String(text));
      u.lang = I.flagInfo().speech;
      const voices = s.getVoices();
      const v = voices.find(x => x.lang === u.lang) || voices.find(x => x.lang && x.lang.slice(0, 2) === u.lang.slice(0, 2));
      if (v) u.voice = v;
      u.rate = 1;
      s.speak(u);
    } catch (e) { /* sin voz */ }
  }

  /* ---------- pantalla encendida ---------- */
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && root.navigator.wakeLock && !wakeLock && doc.visibilityState === 'visible') {
        wakeLock = await root.navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release(); wakeLock = null;
      }
    } catch (e) { wakeLock = null; }
  }

  function vibrate(p) { try { if (root.navigator.vibrate) root.navigator.vibrate(p); } catch (e) { /* nada */ } }

  function beep() {
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.08, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + 0.36);
      o.onended = () => ac.close();
    } catch (e) { /* nada */ }
  }

  function debounce(fn, ms) {
    let t = 0;
    const d = function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
    d.cancel = () => clearTimeout(t);
    return d;
  }

  root.HiloUI = Object.freeze({
    $, el, clear, icon, hydrateIcons, toast, modal, confirmBox, askPassword, askNumber,
    download, shareFile, canShareFiles, luminance, inkFor, letter, speak, keepAwake, vibrate, beep,
    debounce, scriptURL
  });
})(self);
