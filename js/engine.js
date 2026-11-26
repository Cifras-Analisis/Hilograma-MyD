/*!
 * Hilograma MyD - motor de generacion de hilogramas (string art)
 *
 * El algoritmo voraz (greedy) proviene de halfmonty/StringArtGenerator
 * (MIT, Copyright (c) 2019 halfmonty), que a su vez se basa en el trabajo
 * de /u/kmmeerts. Aqui se reescribe en JavaScript puro, sin OpenCV ni numjs,
 * y se amplia con soporte multicolor y medicion de hilo.
 *
 * Este archivo se carga tanto en el hilo principal como en el Web Worker.
 * No toca el DOM ni la red.
 */
(function (root) {
  'use strict';

  const LIMITS = Object.freeze({
    minPins: 24, maxPins: 1000,
    minLines: 1, maxLines: 20000,
    minSize: 200, maxSize: 1000,
    maxColors: 6, maxRounds: 12
  });

  /* ---------- geometria (identica a la del original) ---------- */
  function pinCoords(n, size) {
    const c = size / 2, r = size / 2 - 0.5;
    const xs = new Int32Array(n), ys = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n;
      xs[i] = Math.floor(c + r * Math.cos(a));
      ys[i] = Math.floor(c + r * Math.sin(a));
    }
    return { xs, ys };
  }

  // Suma del "error" (necesidad de hilo) a lo largo de la linea.
  // Reproduce linspace() del original: floor(dist) puntos interpolados.
  function lineScore(map, W, x0, y0, x1, y1) {
    const d = Math.floor(Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)));
    if (d < 2) return d === 1 ? map[y0 * W + x0] : 0;
    // numerador entero exacto: i*x1 + (m-i)*x0 = m*x0 + i*(x1-x0)
    const m = d - 1, inv = 1 / m, dx = x1 - x0, dy = y1 - y0;
    let nx = m * x0, ny = m * y0, s = 0;
    for (let i = 0; i < d; i++, nx += dx, ny += dy) {
      s += map[((ny * inv + 1e-9) | 0) * W + ((nx * inv + 1e-9) | 0)];
    }
    return s;
  }

  // Resta el peso de linea una vez por pixel (como la mascara del original).
  function lineApply(map, W, x0, y0, x1, y1, w) {
    const d = Math.floor(Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)));
    if (d < 1) return;
    const m = Math.max(1, d - 1), inv = 1 / m;
    const dx = d === 1 ? 0 : x1 - x0, dy = d === 1 ? 0 : y1 - y0;
    let nx = m * x0, ny = m * y0, last = -1;
    for (let i = 0; i < d; i++, nx += dx, ny += dy) {
      const idx = ((ny * inv + 1e-9) | 0) * W + ((nx * inv + 1e-9) | 0);
      if (idx !== last) {
        const v = map[idx] - w;
        map[idx] = v < 0 ? 0 : (v > 255 ? 255 : v);
        last = idx;
      }
    }
  }

  /* ---------- color ---------- */
  function hexToRgb(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
    if (!m) throw new Error('bad color');
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function isBlackOnWhite(bg, colors) {
    return colors.length === 1 &&
      bg[0] === 255 && bg[1] === 255 && bg[2] === 255 &&
      colors[0][0] === 0 && colors[0][1] === 0 && colors[0][2] === 0;
  }

  // Proyeccion sobre {w >= 0, sum(w) <= 1}
  function projectCapped(w, K, tmp) {
    let s = 0;
    for (let k = 0; k < K; k++) { if (w[k] < 0) w[k] = 0; s += w[k]; }
    if (s <= 1) return;
    for (let k = 0; k < K; k++) tmp[k] = w[k];
    tmp.subarray(0, K).sort().reverse();
    let cum = 0, theta = 0;
    for (let k = 0; k < K; k++) {
      cum += tmp[k];
      const t = (cum - 1) / (k + 1);
      if (tmp[k] - t > 0) theta = t;
    }
    for (let k = 0; k < K; k++) { const v = w[k] - theta; w[k] = v > 0 ? v : 0; }
  }

  // Descompone la imagen en un "mapa de necesidad" (0..255) por color de hilo,
  // resolviendo por pixel: min |fondo + sum w_k (hilo_k - fondo) - pixel|^2
  // con w_k >= 0 y sum w_k <= 1 (gradiente proyectado).
  function* decompose(rgba, size, bg, colors) {
    const P = size * size, K = colors.length;
    const needs = [];
    for (let k = 0; k < K; k++) needs.push(new Float32Array(P));

    if (isBlackOnWhite(bg, colors)) {
      // Caso original exacto: error = 255 - gris promedio
      const n0 = needs[0];
      for (let p = 0, i = 0; p < P; p++, i += 4) {
        n0[p] = 255 - Math.floor((rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3);
      }
      return needs;
    }

    const D = colors.map(c => [(c[0] - bg[0]) / 255, (c[1] - bg[1]) / 255, (c[2] - bg[2]) / 255]);
    const G = new Float64Array(K * K);
    for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
      G[a * K + b] = D[a][0] * D[b][0] + D[a][1] * D[b][1] + D[a][2] * D[b][2];
    }
    let L = 1e-9;
    for (let a = 0; a < K; a++) {
      let row = 0;
      for (let b = 0; b < K; b++) row += Math.abs(G[a * K + b]);
      if (row > L) L = row;
    }
    const step = 1 / L;
    const w = new Float64Array(K), bvec = new Float64Array(K), g = new Float64Array(K), tmp = new Float64Array(K);
    const iters = K === 1 ? 1 : 40;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = y * size + x, i = p * 4;
        const r0 = (rgba[i] - bg[0]) / 255, r1 = (rgba[i + 1] - bg[1]) / 255, r2 = (rgba[i + 2] - bg[2]) / 255;
        for (let k = 0; k < K; k++) bvec[k] = D[k][0] * r0 + D[k][1] * r1 + D[k][2] * r2;
        if (K === 1) {
          const v = G[0] > 1e-9 ? bvec[0] / G[0] : 0;
          w[0] = v < 0 ? 0 : (v > 1 ? 1 : v);
        } else {
          for (let it = 0; it < iters; it++) {
            for (let a = 0; a < K; a++) {
              let s = -bvec[a];
              for (let b = 0; b < K; b++) s += G[a * K + b] * w[b];
              g[a] = s;
            }
            for (let a = 0; a < K; a++) w[a] -= step * g[a];
            projectCapped(w, K, tmp);
          }
        }
        for (let k = 0; k < K; k++) needs[k][p] = 255 * w[k];
      }
      if ((y & 31) === 31) yield { phase: 'colors', done: y + 1, total: size };
    }
    return needs;
  }

  function clampInt(v, lo, hi, def) {
    v = Math.round(Number(v));
    if (!Number.isFinite(v)) return def;
    return Math.min(hi, Math.max(lo, v));
  }

  /* ---------- generador principal ---------- */
  // inp: { rgba: Uint8ClampedArray(size*size*4), size, nPins, lines, weight,
  //        minDist, minLoop, rounds, bg: '#rrggbb', colors: ['#rrggbb', ...] }
  function* generate(inp) {
    const size = clampInt(inp.size, LIMITS.minSize, LIMITS.maxSize, 500);
    const N = clampInt(inp.nPins, LIMITS.minPins, LIMITS.maxPins, 288);
    const L = clampInt(inp.lines, LIMITS.minLines, LIMITS.maxLines, 4000);
    const weight = Math.min(255, Math.max(1, Number(inp.weight) || 20));
    const minDist = clampInt(inp.minDist, 1, Math.floor(N / 2) - 1, 20);
    const minLoop = clampInt(inp.minLoop, 0, Math.max(0, N - 2 * minDist - 1), 20);
    if (!inp.rgba || inp.rgba.length !== size * size * 4) throw new Error('bad image buffer');
    if (!Array.isArray(inp.colors) || inp.colors.length < 1 || inp.colors.length > LIMITS.maxColors) throw new Error('bad colors');
    const bg = hexToRgb(inp.bg);
    const colors = inp.colors.map(hexToRgb);
    const K = colors.length;
    const R = K === 1 ? 1 : clampInt(inp.rounds, 1, LIMITS.maxRounds, 3);

    yield { phase: 'pins', done: 0, total: L };
    const { xs, ys } = pinCoords(N, size);

    const needs = yield* decompose(inp.rgba, size, bg, colors);

    // reparto de lineas proporcional a la necesidad total de cada color
    const totals = needs.map(a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; });
    const sumT = totals.reduce((a, b) => a + b, 0);
    const alloc = new Array(K).fill(0);
    if (sumT <= 0) {
      alloc[0] = L;
    } else {
      const raw = totals.map(t => L * t / sumT);
      let used = 0;
      for (let k = 0; k < K; k++) { alloc[k] = Math.floor(raw[k]); used += alloc[k]; }
      const order = raw.map((v, k) => [v - Math.floor(v), k]).sort((a, b) => b[0] - a[0]);
      for (let i = 0; used < L; i++, used++) alloc[order[i % K][1]]++;
    }

    // orden de capas: primero los colores de menor contraste con el fondo,
    // al final (encima) los de mayor contraste.
    const contrast = colors.map(c => (c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2);
    const layer = colors.map((_, k) => k).sort((a, b) => contrast[a] - contrast[b]);

    const states = colors.map(() => ({ pin: 0, recent: [], mark: new Uint16Array(N) }));
    const blocks = [];
    let done = 0, pend = [];

    for (let r = 0; r < R; r++) {
      for (const k of layer) {
        const cnt = Math.floor(alloc[k] * (r + 1) / R) - Math.floor(alloc[k] * r / R);
        if (cnt <= 0) continue;
        const st = states[k], map = needs[k];
        const block = [k, st.pin];
        for (let l = 0; l < cnt; l++) {
          let best = -1, maxErr = -1;
          const x0 = xs[st.pin], y0 = ys[st.pin];
          for (let off = minDist; off < N - minDist; off++) {
            const tp = (st.pin + off) % N;
            if (st.mark[tp]) continue;
            const e = lineScore(map, size, x0, y0, xs[tp], ys[tp]);
            if (e > maxErr) { maxErr = e; best = tp; }
          }
          if (best < 0) break;
          lineApply(map, size, x0, y0, xs[best], ys[best], weight);
          if (minLoop > 0) {
            st.recent.push(best); st.mark[best]++;
            if (st.recent.length > minLoop) st.mark[st.recent.shift()]--;
          }
          pend.push(k, st.pin, best);
          block.push(best);
          st.pin = best;
          done++;
          if (done % 20 === 0) { yield { phase: 'lines', done, total: L, seg: pend }; pend = []; }
        }
        if (block.length >= 3) {
          const prev = blocks[blocks.length - 1];
          if (prev && prev[0] === k) { for (let j = 2; j < block.length; j++) prev.push(block[j]); }
          else blocks.push(block);
        }
      }
    }
    if (pend.length) yield { phase: 'lines', done, total: L, seg: pend };
    return { nPins: N, size, lines: done, blocks };
  }

  /* ---------- medidas fisicas ---------- */
  // Longitud de cuerda (cm) entre dos clavos de un marco circular de diametro D cm.
  function chordCm(a, b, N, D) {
    return D * Math.abs(Math.sin(Math.PI * (a - b) / N));
  }

  // blocks: [[c, p0, p1, ...], ...]
  function threadStats(p) {
    const K = p.colors.length;
    const out = [];
    for (let k = 0; k < K; k++) out.push({ lines: 0, chordCm: 0, blocks: 0 });
    for (const b of p.blocks) {
      const st = out[b[0]];
      st.blocks++;
      for (let j = 2; j < b.length; j++) {
        st.chordCm += chordCm(b[j - 1], b[j], p.nPins, p.diameterCm);
        st.lines++;
      }
    }
    const wrapPerLine = Math.PI * (p.pegMm / 10) / 2; // media vuelta al clavo
    for (const st of out) {
      st.wrapCm = st.lines * wrapPerLine;
      st.tieCm = st.blocks * 2 * p.tieCm;              // amarre inicial y final por tramo
      st.netM = st.chordCm / 100;
      st.totalM = (st.chordCm + st.wrapCm + st.tieCm) * (1 + p.marginPct / 100) / 100;
    }
    return out;
  }

  // Estructura de pasos para navegar rapido.
  function indexSteps(p) {
    const nb = p.blocks.length;
    const start = new Int32Array(nb + 1);
    for (let b = 0; b < nb; b++) start[b + 1] = start[b] + (p.blocks[b].length - 2);
    const total = start[nb];
    const cum = new Float64Array(total + 1); // cm acumulados globales
    let s = 0;
    for (let b = 0; b < nb; b++) {
      const bl = p.blocks[b];
      for (let j = 2; j < bl.length; j++, s++) cum[s + 1] = cum[s] + chordCm(bl[j - 1], bl[j], p.nPins, p.diameterCm);
    }
    return { start, total, cum };
  }

  function locate(idx, s) {
    // devuelve el bloque que contiene el paso s (0-based)
    let lo = 0, hi = idx.start.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (idx.start[mid] <= s) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  root.HiloEngine = Object.freeze({
    LIMITS, pinCoords, lineScore, lineApply, hexToRgb, decompose, generate,
    chordCm, threadStats, indexSteps, locate
  });
})(typeof self !== 'undefined' ? self : globalThis);
