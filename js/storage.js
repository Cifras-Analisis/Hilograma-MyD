/* Hilograma MyD - formato de archivo, cifrado y almacenamiento local.
 *
 * Reglas de privacidad:
 *  - La imagen NUNCA se guarda: ni en archivos, ni en localStorage, ni en cache.
 *  - Solo se guarda la secuencia de clavos, los colores y las medidas.
 *  - Con contrasena: AES-256-GCM con clave PBKDF2-SHA256 (600 000 iteraciones),
 *    tanto en el archivo .hilo como en el almacenamiento del dispositivo.
 *  - Todo archivo importado se valida campo por campo antes de usarse.
 */
(function (root) {
  'use strict';

  const FORMAT = 'hilograma-myd';
  const VERSION = 1;
  const KDF_ITER = 600000;
  const PREFIX = 'hmyd.';
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_TOTAL_STEPS = 50000;
  const MAX_BLOCKS = 5000;
  const te = new TextEncoder(), td = new TextDecoder('utf-8', { fatal: true });
  const AAD = te.encode(FORMAT + '/v' + VERSION);

  class HiloError extends Error {
    constructor(code) { super(code); this.code = code; }
  }

  /* ---------- utilidades ---------- */
  function b64(buf) {
    const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str, maxLen) {
    if (typeof str !== 'string' || str.length > maxLen * 1.4 + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(str)) throw new HiloError('bad_file');
    const s = atob(str);
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function toHex(buf) {
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  }
  function cryptoOK() {
    return !!(root.crypto && root.crypto.subtle && root.isSecureContext !== false);
  }
  function randomId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return toHex(root.crypto.getRandomValues(new Uint8Array(16)));
  }
  // Quita caracteres de control y de control bidireccional (evita suplantacion tipo RTLO).
  function cleanText(s, max) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '')
      .trim().slice(0, max);
  }
  function safeFileName(name) {
    const s = cleanText(name, 60).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return s.slice(0, 40) || 'hilograma';
  }
  function num(v, lo, hi, def) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }
  function int(v, lo, hi) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) throw new HiloError('bad_file');
    return v;
  }
  const HEX_RE = /^#[0-9a-f]{6}$/i;

  /* ---------- validacion estricta del proyecto ---------- */
  function sanitizeProject(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new HiloError('bad_file');
    const L = root.HiloEngine.LIMITS;
    const nPins = int(o.nPins, L.minPins, L.maxPins);
    if (!Array.isArray(o.colors) || o.colors.length < 1 || o.colors.length > L.maxColors) throw new HiloError('bad_file');
    const colors = o.colors.map(c => {
      if (!c || typeof c !== 'object' || !HEX_RE.test(c.hex)) throw new HiloError('bad_file');
      return { hex: c.hex.toLowerCase(), name: cleanText(c.name, 40) };
    });
    const bg = HEX_RE.test(o.bg) ? o.bg.toLowerCase() : '#ffffff';
    if (!Array.isArray(o.blocks) || o.blocks.length < 1 || o.blocks.length > MAX_BLOCKS) throw new HiloError('bad_file');
    let total = 0;
    const blocks = o.blocks.map(b => {
      if (!Array.isArray(b) || b.length < 3) throw new HiloError('bad_file');
      total += b.length - 2;
      if (total > MAX_TOTAL_STEPS) throw new HiloError('too_big');
      const out = new Array(b.length);
      out[0] = int(b[0], 0, colors.length - 1);
      for (let j = 1; j < b.length; j++) out[j] = int(b[j], 0, nPins - 1);
      return out;
    });
    const id = typeof o.id === 'string' && /^[0-9a-f-]{8,64}$/i.test(o.id) ? o.id.toLowerCase() : randomId();
    const p = o.params && typeof o.params === 'object' ? o.params : {};
    return {
      id,
      name: cleanText(o.name, 60) || 'Hilograma',
      created: num(o.created, 0, 4102444800000, Date.now()),
      surprise: o.surprise === true,
      nPins,
      size: num(o.size, L.minSize, L.maxSize, 500),
      diameterCm: num(o.diameterCm, 5, 500, 60),
      pegMm: num(o.pegMm, 0.1, 20, 1.5),
      threadMm: num(o.threadMm, 0.02, 5, 0.2),
      opacity: num(o.opacity, 0.01, 1, 0.85),
      marginPct: num(o.marginPct, 0, 100, 10),
      tieCm: num(o.tieCm, 0, 200, 15),
      spoolM: num(o.spoolM, 0, 100000, 0),
      bg, colors, blocks,
      step: Math.round(num(o.step, 0, total, 0)),
      params: {
        lines: Math.round(num(p.lines, 0, L.maxLines, total)),
        weight: num(p.weight, 0, 255, 20),
        minDist: Math.round(num(p.minDist, 0, L.maxPins, 20)),
        minLoop: Math.round(num(p.minLoop, 0, L.maxPins, 20)),
        rounds: Math.round(num(p.rounds, 1, L.maxRounds, 1))
      }
    };
  }

  function payloadOf(p) {
    return {
      id: p.id, name: p.name, created: p.created, surprise: !!p.surprise,
      nPins: p.nPins, size: p.size, diameterCm: p.diameterCm, pegMm: p.pegMm,
      threadMm: p.threadMm, opacity: p.opacity, marginPct: p.marginPct, tieCm: p.tieCm, spoolM: p.spoolM,
      bg: p.bg, colors: p.colors.map(c => ({ hex: c.hex, name: c.name })),
      blocks: p.blocks, step: p.step, params: p.params
    };
  }

  /* ---------- cifrado ---------- */
  async function makeKey(password, salt, iter) {
    if (!cryptoOK()) throw new HiloError('no_crypto');
    salt = salt || root.crypto.getRandomValues(new Uint8Array(16));
    iter = iter || KDF_ITER;
    const base = await root.crypto.subtle.importKey('raw', te.encode(String(password).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    const key = await root.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return { key, salt, iter };
  }

  async function seal(obj, ki) {
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const ct = await root.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, ki.key, te.encode(JSON.stringify(obj)));
    return { alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter: ki.iter, salt: b64(ki.salt), iv: b64(iv), ct: b64(ct) };
  }

  function checkEnvelope(env) {
    if (!env || typeof env !== 'object' || env.alg !== 'AES-256-GCM' || env.kdf !== 'PBKDF2-SHA256') throw new HiloError('bad_file');
    if (!Number.isInteger(env.iter) || env.iter < 100000 || env.iter > 10000000) throw new HiloError('bad_file');
    const salt = unb64(env.salt, 64), iv = unb64(env.iv, 16), ct = unb64(env.ct, MAX_FILE_BYTES);
    if (salt.length < 16 || iv.length !== 12) throw new HiloError('bad_file');
    return { salt, iv, ct };
  }

  async function unseal(env, passwordOrKey) {
    const { salt, iv, ct } = checkEnvelope(env);
    const ki = typeof passwordOrKey === 'string' ? await makeKey(passwordOrKey, salt, env.iter) : passwordOrKey;
    let pt;
    try {
      pt = await root.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: AAD }, ki.key, ct);
    } catch (e) { throw new HiloError('bad_password'); }
    let obj;
    try { obj = JSON.parse(td.decode(pt)); } catch (e) { throw new HiloError('bad_file'); }
    return { obj, keyInfo: ki };
  }

  /* ---------- archivo .hilo ---------- */
  async function buildFile(project, keyInfo) {
    const payload = payloadOf(project);
    if (keyInfo) {
      return JSON.stringify({ format: FORMAT, version: VERSION, kind: 'instructions', enc: await seal(payload, keyInfo) });
    }
    const out = { format: FORMAT, version: VERSION, kind: 'instructions', data: payload };
    if (cryptoOK()) out.sha256 = toHex(await root.crypto.subtle.digest('SHA-256', te.encode(JSON.stringify(payload))));
    return JSON.stringify(out);
  }

  // askPassword(attempt) -> Promise<string|null>
  async function parseFile(text, askPassword) {
    if (typeof text !== 'string' || text.length > MAX_FILE_BYTES) throw new HiloError('too_big');
    let o;
    try { o = JSON.parse(text); } catch (e) { throw new HiloError('bad_file'); }
    if (!o || o.format !== FORMAT || o.version !== VERSION) throw new HiloError('bad_file');
    if (o.enc) {
      if (!cryptoOK()) throw new HiloError('no_crypto');
      checkEnvelope(o.enc);
      for (let attempt = 0; ; attempt++) {
        const pw = await askPassword(attempt);
        if (pw == null) throw new HiloError('cancelled');
        try {
          const r = await unseal(o.enc, pw);
          return { project: sanitizeProject(r.obj), keyInfo: r.keyInfo };
        } catch (e) {
          if (e.code !== 'bad_password' || attempt >= 4) throw e;
        }
      }
    }
    const project = sanitizeProject(o.data);
    if (typeof o.sha256 === 'string' && cryptoOK()) {
      const h = toHex(await root.crypto.subtle.digest('SHA-256', te.encode(JSON.stringify(o.data))));
      if (h !== o.sha256.toLowerCase()) throw new HiloError('corrupt');
    }
    return { project, keyInfo: null };
  }

  /* ---------- almacenamiento local (sin imagen) ---------- */
  function lsGet(k) {
    try { return JSON.parse(root.localStorage.getItem(PREFIX + k)); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { root.localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }
  function lsDel(k) { try { root.localStorage.removeItem(PREFIX + k); } catch (e) { /* nada */ } }

  function list() {
    const a = lsGet('projects');
    return Array.isArray(a) ? a.filter(x => x && typeof x.id === 'string') : [];
  }
  function writeIndexEntry(entry) {
    const a = list().filter(x => x.id !== entry.id);
    a.unshift(entry);
    return lsSet('projects', a);
  }
  function totalSteps(p) { return p.blocks.reduce((s, b) => s + b.length - 2, 0); }

  async function saveProject(project, keyInfo) {
    const total = totalSteps(project);
    let rec;
    if (keyInfo) rec = { v: 1, enc: await seal(payloadOf(project), keyInfo) };
    else rec = { v: 1, data: payloadOf(project) };
    if (!lsSet('p.' + project.id, rec)) throw new HiloError('quota');
    lsSet('step.' + project.id, project.step);
    writeIndexEntry({
      id: project.id, name: project.name, created: project.created, updated: Date.now(),
      total, step: project.step, surprise: !!project.surprise, enc: !!keyInfo,
      colors: keyInfo ? [] : project.colors.map(c => c.hex)
    });
  }

  async function loadProject(id, askPassword) {
    const rec = lsGet('p.' + id);
    if (!rec || typeof rec !== 'object') throw new HiloError('not_found');
    let project, keyInfo = null;
    if (rec.enc) {
      for (let attempt = 0; ; attempt++) {
        const pw = await askPassword(attempt);
        if (pw == null) throw new HiloError('cancelled');
        try {
          const r = await unseal(rec.enc, pw);
          project = sanitizeProject(r.obj); keyInfo = r.keyInfo; break;
        } catch (e) { if (e.code !== 'bad_password' || attempt >= 4) throw e; }
      }
    } else {
      project = sanitizeProject(rec.data);
    }
    const st = lsGet('step.' + id);
    const total = totalSteps(project);
    if (Number.isInteger(st) && st >= 0 && st <= total) project.step = st;
    return { project, keyInfo };
  }

  function saveStep(id, step) {
    const ok = lsSet('step.' + id, step) && lsGet('step.' + id) === step;
    const a = list();
    const e = a.find(x => x.id === id);
    if (e) { e.step = step; e.updated = Date.now(); lsSet('projects', a); }
    return ok;
  }

  function exists(id) { return list().some(x => x.id === id); }

  function deleteProject(id) {
    lsDel('p.' + id); lsDel('step.' + id);
    lsSet('projects', list().filter(x => x.id !== id));
  }

  function getSettings() { const s = lsGet('settings'); return s && typeof s === 'object' ? s : {}; }
  function setSettings(s) { lsSet('settings', s); }

  function wipeAll() {
    try {
      const keys = [];
      for (let i = 0; i < root.localStorage.length; i++) {
        const k = root.localStorage.key(i);
        if (k && k.startsWith(PREFIX)) keys.push(k);
      }
      keys.forEach(k => root.localStorage.removeItem(k));
    } catch (e) { /* nada */ }
    try { root.sessionStorage.clear(); } catch (e) { /* nada */ }
  }

  root.HiloStore = Object.freeze({
    FORMAT, VERSION, HiloError, cryptoOK, randomId, cleanText, safeFileName,
    sanitizeProject, payloadOf, makeKey, buildFile, parseFile, totalSteps,
    list, saveProject, loadProject, saveStep, exists, deleteProject,
    getSettings, setSettings, wipeAll
  });
})(self);
