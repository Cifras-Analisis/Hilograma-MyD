/* Hilograma MyD - ilustraciones animadas: como armar el marco y como medir.
 * Todo se dibuja en un <canvas> con las medidas reales del proyecto.
 * Nunca se dibuja la imagen ni la secuencia real (sirve tambien en modo sorpresa). */
(function (root) {
  'use strict';
  const I = root.HiloI18n, U = root.HiloUI;
  const { el, clear, icon } = U;
  const t = (k, v) => I.t(k, v);

  const DUR = 4600;                     // ms por ciclo de cada escena
  const C = {
    neon: '#00ff88', cyan: '#29e7ff', amber: '#ffb000', red: '#ff3b5c', fg: '#c9ffe3', dim: '#6fa58a',
    paper: '#f4f1e8', ink: '#1b1b1b', bg: '#010503', wood: '#c9a46a', grain: 'rgba(110,70,30,0.35)',
    metal: '#c9d1cd', tape: '#ffd34d', ruler: '#e8c65a'
  };
  const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const seg = (tt, a, b) => ease((tt - a) / (b - a));
  const TAU = Math.PI * 2;

  /* ================= primitivas de dibujo ================= */
  function label(g, s, x, y, col, size, align) {
    const ctx = g.x, k = g.k;
    ctx.save();
    ctx.font = 'bold ' + Math.round((size || 12) * k) + 'px ui-monospace, Consolas, monospace';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(s).width, h = (size || 12) * 1.55 * k;
    let bx = ctx.textAlign === 'left' ? x - 4 * k : ctx.textAlign === 'right' ? x - w - 4 * k : x - w / 2 - 4 * k;
    bx = Math.max(2 * k, Math.min(g.W - w - 10 * k, bx));
    const tx = ctx.textAlign === 'left' ? bx + 4 * k : ctx.textAlign === 'right' ? bx + w + 4 * k : bx + w / 2 + 4 * k;
    ctx.fillStyle = 'rgba(1,5,3,0.86)';
    ctx.fillRect(bx, y - h / 2, w + 8 * k, h);
    ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.lineWidth = 1 * k; ctx.strokeRect(bx, y - h / 2, w + 8 * k, h); ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.fillText(s, tx, y);
    ctx.restore();
  }
  function head(ctx, x, y, ang, s) {
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - s * Math.cos(ang - 0.42), y - s * Math.sin(ang - 0.42));
    ctx.moveTo(x, y); ctx.lineTo(x - s * Math.cos(ang + 0.42), y - s * Math.sin(ang + 0.42));
    ctx.stroke();
  }
  // cota con flechas en los dos extremos (prog = cuanto se ha dibujado)
  function dim(g, x1, y1, x2, y2, col, txt, prog, lx, ly) {
    const ctx = g.x, k = g.k;
    const p = prog == null ? 1 : prog;
    if (p <= 0) return;
    const ex = x1 + (x2 - x1) * p, ey = y1 + (y2 - y1) * p;
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 1.8 * k;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(ex, ey); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    head(ctx, x1, y1, a + Math.PI, 7 * k);
    if (p >= 1) head(ctx, x2, y2, a, 7 * k);
    ctx.restore();
    if (txt && p >= 1) label(g, txt, lx != null ? lx : (x1 + x2) / 2, ly != null ? ly : (y1 + y2) / 2, col, 12);
  }
  // regla o cinta metrica a lo largo de una linea
  function ruler(g, x1, y1, x2, y2, width, prog, color) {
    const ctx = g.x, k = g.k, p = prog == null ? 1 : prog;
    if (p <= 0) return;
    const len = Math.hypot(x2 - x1, y2 - y1) * p, a = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.translate(x1, y1); ctx.rotate(a);
    ctx.fillStyle = color || C.ruler; ctx.globalAlpha = 0.92;
    ctx.fillRect(0, -width / 2, len, width);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(40,30,0,0.8)'; ctx.lineWidth = 1 * k;
    const step = 6 * k;
    for (let i = 0; i * step <= len; i++) {
      const tl = i % 10 === 0 ? width * 0.55 : i % 5 === 0 ? width * 0.4 : width * 0.25;
      ctx.beginPath(); ctx.moveTo(i * step, -width / 2); ctx.lineTo(i * step, -width / 2 + tl); ctx.stroke();
    }
    ctx.restore();
  }
  function boardRect(g, x0, y0, side, painted) {
    const ctx = g.x, k = g.k;
    ctx.save();
    ctx.fillStyle = C.wood; ctx.fillRect(x0, y0, side, side);
    ctx.strokeStyle = C.grain; ctx.lineWidth = 1.2 * k;
    for (let i = 1; i < 8; i++) {
      const y = y0 + side * i / 8;
      ctx.beginPath(); ctx.moveTo(x0, y);
      ctx.bezierCurveTo(x0 + side * 0.3, y - 6 * k, x0 + side * 0.6, y + 6 * k, x0 + side, y);
      ctx.stroke();
    }
    if (painted > 0) {
      ctx.beginPath(); ctx.rect(x0, y0, side * painted, side); ctx.clip();
      ctx.fillStyle = g.sp.bg; ctx.fillRect(x0, y0, side, side);
    }
    ctx.restore();
    ctx.save(); ctx.strokeStyle = '#15633f'; ctx.lineWidth = 1.5 * k; ctx.strokeRect(x0, y0, side, side); ctx.restore();
  }
  function inkOn(g) { return U.luminance(g.sp.bg) > 0.45 ? 'rgba(0,0,0,0.78)' : 'rgba(255,255,255,0.85)'; }
  function ringPegs(g, cx, cy, R, n, upTo, col, rad) {
    const ctx = g.x, k = g.k;
    ctx.save(); ctx.fillStyle = col || inkOn(g);
    const m = upTo == null ? n : Math.floor(upTo);
    for (let i = 0; i < m; i++) {
      const a = TAU * i / n;
      ctx.beginPath(); ctx.arc(cx + R * Math.cos(a), cy + R * Math.sin(a), (rad || 2.2) * k, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function circleLine(g, cx, cy, R, col, prog, w) {
    const ctx = g.x, p = prog == null ? 1 : prog;
    if (p <= 0) return;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = (w || 1.2) * g.k;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU * p); ctx.stroke(); ctx.restore();
  }
  function cross(g, x, y, s, col, w) {
    const ctx = g.x;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = (w || 1.5) * g.k;
    ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
    ctx.restore();
  }
  function check(g, x, y, s, prog) {
    const ctx = g.x, p = prog == null ? 1 : prog;
    if (p <= 0) return;
    ctx.save(); ctx.strokeStyle = C.neon; ctx.lineWidth = 3 * g.k; ctx.lineCap = 'round';
    ctx.shadowColor = C.neon; ctx.shadowBlur = 8 * g.k;
    ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.35, y + s * 0.6);
    if (p > 0.5) ctx.lineTo(x - s * 0.35 + (s * 1.35) * (p - 0.5) * 2, y + s * 0.6 - (s * 1.5) * (p - 0.5) * 2);
    ctx.stroke(); ctx.restore();
  }
  function nail(g, x, yTip, len, tilt, w) {
    const ctx = g.x, k = g.k;
    const xt = x + Math.sin(tilt) * len, yt = yTip - Math.cos(tilt) * len;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = C.metal; ctx.lineWidth = Math.max(3 * k, w || 4 * k);
    ctx.beginPath(); ctx.moveTo(x, yTip); ctx.lineTo(xt, yt); ctx.stroke();
    ctx.restore();
    return [xt, yt];
  }
  function hammer(g, x, y, ang) {
    const ctx = g.x, k = g.k;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-4 * k, -60 * k, 8 * k, 60 * k);
    ctx.fillStyle = '#9aa4a0'; ctx.fillRect(-18 * k, -72 * k, 36 * k, 16 * k);
    ctx.restore();
  }
  function paper(g, x, y, w, h, rot) {
    const ctx = g.x;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot || 0);
    ctx.fillStyle = C.paper; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8 * g.k;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
  function geo(g) {
    const side = Math.min(g.W * 0.72, g.H * 0.78);
    const x0 = (g.W - side) / 2, y0 = (g.H - side) / 2 + 6 * g.k;
    const R = side / 2 * Math.min(0.92, g.c.D / g.c.boardCm);
    return { side, x0, y0, cx: x0 + side / 2, cy: y0 + side / 2, R };
  }

  /* ================= escenas: armar el marco ================= */
  const STEPS = [
    // 1. cortar, lijar y pintar
    function (g, tt) {
      const o = geo(g), ctx = g.x, k = g.k;
      const pCut = seg(tt, 0.02, 0.3), pPaint = seg(tt, 0.33, 0.66), pDim = seg(tt, 0.7, 0.85);
      boardRect(g, o.x0, o.y0, o.side, pPaint);
      if (pCut < 1) {
        const y = o.y0 + o.side * pCut;
        ctx.save(); ctx.strokeStyle = C.red; ctx.setLineDash([5 * k, 4 * k]); ctx.lineWidth = 2 * k;
        ctx.beginPath(); ctx.moveTo(o.x0 + o.side, o.y0); ctx.lineTo(o.x0 + o.side, y); ctx.stroke(); ctx.restore();
        ctx.fillStyle = C.metal; ctx.fillRect(o.x0 + o.side - 3 * k, y - 10 * k, 22 * k, 20 * k);
        label(g, t('fa_w_cut'), o.x0 + o.side + 30 * k, y, C.red, 11);
      }
      if (pPaint > 0 && pPaint < 1) {
        const bx = o.x0 + o.side * pPaint;
        ctx.fillStyle = '#5a3a1a'; ctx.fillRect(bx - 4 * k, o.y0 - 26 * k, 8 * k, 30 * k);
        ctx.fillStyle = g.sp.bg; ctx.fillRect(bx - 12 * k, o.y0 - 2 * k, 24 * k, 10 * k);
      }
      dim(g, o.x0, o.y0 + o.side + 14 * k, o.x0 + o.side, o.y0 + o.side + 14 * k, C.cyan, g.v.L + ' cm', pDim);
      dim(g, o.x0 - 14 * k, o.y0, o.x0 - 14 * k, o.y0 + o.side, C.cyan, null, pDim);
      if (pDim >= 1) label(g, t('fa_w_board') + ' ≥ ' + g.v.t + ' mm', g.W / 2, o.y0 - 14 * k, C.fg, 11);
    },
    // 2. centro con las diagonales
    function (g, tt) {
      const o = geo(g), ctx = g.x, k = g.k;
      boardRect(g, o.x0, o.y0, o.side, 1);
      const p1 = seg(tt, 0.05, 0.38), p2 = seg(tt, 0.42, 0.75);
      ruler(g, o.x0, o.y0, o.x0 + o.side, o.y0 + o.side, 14 * k, p1 < 1 ? p1 : 0);
      ruler(g, o.x0 + o.side, o.y0, o.x0, o.y0 + o.side, 14 * k, p1 >= 1 && p2 < 1 ? p2 : 0);
      ctx.save(); ctx.strokeStyle = C.amber; ctx.lineWidth = 1.6 * k;
      ctx.beginPath(); ctx.moveTo(o.x0, o.y0); ctx.lineTo(o.x0 + o.side * p1, o.y0 + o.side * p1);
      ctx.moveTo(o.x0 + o.side, o.y0); ctx.lineTo(o.x0 + o.side * (1 - p2), o.y0 + o.side * p2); ctx.stroke(); ctx.restore();
      if (tt > 0.78) {
        const pulse = 4 + 3 * Math.sin(tt * 40);
        ctx.save(); ctx.fillStyle = C.neon; ctx.shadowColor = C.neon; ctx.shadowBlur = 12 * k;
        ctx.beginPath(); ctx.arc(o.cx, o.cy, pulse * k, 0, TAU); ctx.fill(); ctx.restore();
        label(g, t('fa_w_center'), o.cx, o.cy + 22 * k, C.neon, 12);
      }
    },
    // 3. imprimir al 100 % y medir la barra de 10 cm
    printCheck,
    // 4. unir las hojas
    function (g, tt) {
      const ctx = g.x, k = g.k;
      const w = g.W * 0.36, h = g.H * 0.62, y = (g.H - h) / 2, ov = w * 0.12;
      const xL = g.W / 2 - w + ov / 2;
      const pCut = seg(tt, 0.02, 0.28), pFall = seg(tt, 0.3, 0.45), pSlide = seg(tt, 0.47, 0.78), pTape = seg(tt, 0.8, 0.95);
      const xR0 = g.W / 2 + 18 * k, xR1 = xL + w - ov;
      const xR = xR0 + (xR1 - xR0) * pSlide;
      paper(g, xL, y, w, h);
      // cruces de registro en la franja de union
      for (let i = 1; i <= 3; i++) cross(g, xL + w - ov / 2, y + h * i / 4, 6 * k, C.ink, 1.2);
      // tira que se recorta
      if (pFall < 1) {
        ctx.save(); ctx.globalAlpha = 1 - pFall;
        paper(g, xR - ov / 2, y + pFall * 40 * k, ov / 2, h);
        ctx.restore();
      }
      paper(g, xR, y, w - ov / 2, h);
      for (let i = 1; i <= 3; i++) cross(g, xR, y + h * i / 4, 6 * k, C.ink, 1.2);
      ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1 * k;
      ctx.beginPath(); ctx.arc(g.W / 2, y + h * 1.25, h * 0.95, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke(); ctx.restore();
      if (pCut < 1 || pFall < 1) {
        ctx.save(); ctx.strokeStyle = C.red; ctx.setLineDash([4 * k, 3 * k]); ctx.lineWidth = 2 * k;
        ctx.beginPath(); ctx.moveTo(xR, y); ctx.lineTo(xR, y + h * Math.max(pCut, 0.01)); ctx.stroke(); ctx.restore();
        if (pCut < 1) label(g, t('fa_w_cut'), xR + 30 * k, y + h * pCut, C.red, 11);
      }
      if (pTape > 0) {
        ctx.save(); ctx.globalAlpha = pTape; ctx.fillStyle = 'rgba(255,240,170,0.75)';
        [0.2, 0.5, 0.8].forEach(f => ctx.fillRect(xR - 12 * k, y + h * f - 5 * k, 24 * k, 10 * k)); ctx.restore();
      }
      if (pSlide >= 1) label(g, '+ = +', g.W / 2, y - 14 * k, C.neon, 12);
    },
    // 5. pegar la plantilla centrada con ARRIBA hacia arriba
    function (g, tt) {
      const o = geo(g), ctx = g.x, k = g.k;
      boardRect(g, o.x0, o.y0, o.side, 1);
      cross(g, o.cx, o.cy, 10 * k, C.amber, 2);
      const p = seg(tt, 0.05, 0.6), dy = (1 - p) * -g.H;
      ctx.save(); ctx.translate(0, dy);
      ctx.fillStyle = 'rgba(244,241,232,0.93)'; ctx.beginPath(); ctx.arc(o.cx, o.cy, o.R + 10 * k, 0, TAU); ctx.fill();
      circleLine(g, o.cx, o.cy, o.R, 'rgba(0,0,0,0.5)');
      ringPegs(g, o.cx, o.cy, o.R, 48, null, C.ink, 1.8);
      cross(g, o.cx, o.cy, 10 * k, C.ink, 1.2);
      ctx.font = 'bold ' + Math.round(10 * k) + 'px ui-monospace, monospace'; ctx.fillStyle = '#00a35a'; ctx.textAlign = 'center';
      ctx.fillText(t('fa_w_top'), o.cx, o.cy - o.R + 16 * k);
      ctx.restore();
      if (tt > 0.62) {
        const a = seg(tt, 0.62, 0.8);
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(255,240,170,0.8)';
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => ctx.fillRect(o.cx + sx * (o.R * 0.75) - 9 * k, o.cy + sy * (o.R * 0.75) - 4 * k, 18 * k, 8 * k));
        ctx.restore();
        label(g, '↑ ' + t('fa_w_top') + ' · ' + g.v.top, o.cx, o.y0 - 12 * k, C.neon, 12);
      }
    },
    // 6. sin impresora: compas, puntos cardinales y transportador
    function (g, tt) {
      const o = geo(g), ctx = g.x, k = g.k;
      boardRect(g, o.x0, o.y0, o.side, 1);
      const pArc = seg(tt, 0.04, 0.4), pCard = seg(tt, 0.42, 0.6), pProt = seg(tt, 0.62, 0.98);
      circleLine(g, o.cx, o.cy, o.R, inkOn(g), pArc, 1.4);
      if (pArc < 1) {
        const a = TAU * pArc;
        ctx.save(); ctx.strokeStyle = C.cyan; ctx.lineWidth = 2 * k;
        ctx.beginPath(); ctx.moveTo(o.cx, o.cy); ctx.lineTo(o.cx + o.R * Math.cos(a), o.cy + o.R * Math.sin(a)); ctx.stroke(); ctx.restore();
        ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(o.cx + o.R * Math.cos(a), o.cy + o.R * Math.sin(a), 4 * k, 0, TAU); ctx.fill();
        label(g, t('fa_w_radius') + ' ' + g.v.r + ' cm', o.cx, o.cy - 14 * k, C.cyan, 11);
      }
      cross(g, o.cx, o.cy, 6 * k, C.amber, 2);
      const cards = [[0, '0'], [0.25, String(g.c.bottom)], [0.5, String(g.c.left)], [0.75, String(g.c.top)]];
      cards.forEach(([f, s], i) => {
        if (pCard * 4 < i + 0.5) return;
        const a = TAU * f, x = o.cx + o.R * Math.cos(a), y = o.cy + o.R * Math.sin(a);
        ctx.fillStyle = C.neon; ctx.beginPath(); ctx.arc(x, y, 4.5 * k, 0, TAU); ctx.fill();
        label(g, s, o.cx + (o.R + 18 * k) * Math.cos(a), o.cy + (o.R + 14 * k) * Math.sin(a), C.neon, 11);
      });
      if (pProt > 0) {
        ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = C.cyan;
        ctx.beginPath(); ctx.moveTo(o.cx, o.cy); ctx.arc(o.cx, o.cy, o.R * 0.45, -Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.restore();
        ringPegs(g, o.cx, o.cy, o.R, 48, 48 * pProt, inkOn(g), 2);
        label(g, g.v.a + '° · ' + g.v.q + ' ' + t('fa_w_per_quarter'), o.cx, o.cy + o.R * 0.3, C.cyan, 11);
      }
    },
    // 7. marcar cada punto con el punzon
    function (g, tt) {
      const o = geo(g), ctx = g.x, k = g.k, n = 36;
      boardRect(g, o.x0, o.y0, o.side, 1);
      ctx.fillStyle = 'rgba(244,241,232,0.9)'; ctx.beginPath(); ctx.arc(o.cx, o.cy, o.R + 8 * k, 0, TAU); ctx.fill();
      circleLine(g, o.cx, o.cy, o.R, 'rgba(0,0,0,0.45)');
      const done = Math.floor(seg(tt, 0.02, 0.92) * n);
      for (let i = 0; i < n; i++) {
        const a = TAU * i / n, x = o.cx + o.R * Math.cos(a), y = o.cy + o.R * Math.sin(a);
        ctx.fillStyle = i < done ? '#000' : 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.arc(x, y, (i < done ? 2.6 : 1.6) * k, 0, TAU); ctx.fill();
      }
      const i = Math.min(n - 1, done), a = TAU * i / n;
      const x = o.cx + o.R * Math.cos(a), y = o.cy + o.R * Math.sin(a), bob = Math.abs(Math.sin(tt * n * Math.PI)) * 8 * k;
      ctx.save(); ctx.strokeStyle = C.metal; ctx.lineWidth = 2.5 * k;
      ctx.beginPath(); ctx.moveTo(x, y - bob); ctx.lineTo(x + 10 * k, y - 26 * k - bob); ctx.stroke();
      ctx.fillStyle = C.amber; ctx.fillRect(x + 8 * k, y - 46 * k - bob, 8 * k, 22 * k); ctx.restore();
    },
    // 8. clavar a la misma altura con el bloque separador, un poco inclinados
    function (g, tt) {
      const ctx = g.x, k = g.k, c = g.c;
      const pxmm = (g.H * 0.55) / (c.heightMm + c.thickMm);
      const top = g.H * 0.3 + c.heightMm * pxmm, bot = top + c.thickMm * pxmm;
      ctx.fillStyle = g.sp.bg; ctx.fillRect(g.W * 0.08, top, g.W * 0.84, bot - top);
      ctx.strokeStyle = '#15633f'; ctx.lineWidth = 1.5 * k; ctx.strokeRect(g.W * 0.08, top, g.W * 0.84, bot - top);
      const tilt = 8 * Math.PI / 180, x0 = g.W * 0.42, len = c.nailMm * pxmm;
      // el clavo baja en tres golpes hasta la altura del bloque
      const strikes = seg(tt, 0.05, 0.72), depth = c.embedMm * pxmm * strikes;
      const yTip = top + depth - 2 * k;
      const [xt, yt] = nail(g, x0, yTip, len, tilt, c.pegMm * pxmm);
      const phase = (strikes * 3) % 1, hy = yt - 6 * k - Math.sin(phase * Math.PI) * 40 * k;
      if (tt < 0.74) hammer(g, xt + 2 * k, hy, -0.15);
      // bloque separador
      ctx.save(); ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5 * k; ctx.setLineDash([4 * k, 3 * k]);
      ctx.strokeRect(g.W * 0.58, top - c.heightMm * pxmm, g.W * 0.12, c.heightMm * pxmm); ctx.restore();
      label(g, t('fa_w_block') + ' ' + c.heightMm + ' mm', g.W * 0.64, top - c.heightMm * pxmm - 12 * k, C.cyan, 10);
      if (tt > 0.75) {
        dim(g, g.W * 0.82, top - c.heightMm * pxmm, g.W * 0.82, top, C.neon, c.heightMm + ' mm', seg(tt, 0.75, 0.88), g.W * 0.86, top - c.heightMm * pxmm / 2);
        label(g, '5°–10° →', xt - 12 * k, yt - 14 * k, C.amber, 10, 'right');
      }
    },
    // 9. numerar cada 10 clavos en sentido horario
    function (g, tt) {
      const o = geo(g), ctx = g.x, k = g.k, N = g.c.N;
      boardRect(g, o.x0, o.y0, o.side, 1);
      ringPegs(g, o.cx, o.cy, o.R, 48, null, inkOn(g), 1.8);
      const every = N <= 400 ? 10 : 50, total = Math.floor((N - 1) / every) + 1;
      const shown = Math.floor(seg(tt, 0.02, 0.9) * total);
      ctx.save(); ctx.font = 'bold ' + Math.round(9 * k) + 'px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < shown; i++) {
        const p = i * every, a = TAU * p / N, rr = o.R - 13 * k;
        ctx.fillStyle = i === 0 ? '#0070c0' : inkOn(g);
        ctx.fillText(String(p), o.cx + rr * Math.cos(a), o.cy + rr * Math.sin(a));
      }
      ctx.restore();
      const a = TAU * Math.min(shown, total - 1) * every / N;
      ctx.fillStyle = C.amber; ctx.fillRect(o.cx + (o.R - 26 * k) * Math.cos(a) - 3 * k, o.cy + (o.R - 26 * k) * Math.sin(a) - 14 * k, 6 * k, 20 * k);
      ctx.save(); ctx.strokeStyle = C.cyan; ctx.lineWidth = 2 * k;
      const ra = o.R + 14 * k; ctx.beginPath(); ctx.arc(o.cx, o.cy, ra, -0.3, 0.3); ctx.stroke();
      head(ctx, o.cx + ra * Math.cos(0.3), o.cy + ra * Math.sin(0.3), 0.3 + Math.PI / 2, 7 * k); ctx.restore();
    },
    // 10. comprobar medidas
    checkScene,
    // 11. atar el primer hilo y tejer (patron generico, nunca el diseño real)
    function (g, tt) {
      const o = geo(g), ctx = g.x, k = g.k, n = 48;
      boardRect(g, o.x0, o.y0, o.side, 1);
      ringPegs(g, o.cx, o.cy, o.R, n, null, inkOn(g), 2);
      const lines = Math.floor(seg(tt, 0.18, 0.95) * 70);
      const col = g.sp.colors && g.sp.colors[0] ? g.sp.colors[0].hex : '#000000';
      ctx.save(); ctx.strokeStyle = U.luminance(col) < 0.05 && U.luminance(g.sp.bg) < 0.3 ? C.neon : col;
      ctx.globalAlpha = 0.75; ctx.lineWidth = 0.9 * k;
      let p = 0;
      ctx.beginPath(); ctx.moveTo(o.cx + o.R, o.cy);
      for (let i = 0; i < lines; i++) { p = (p + 17) % n; const a = TAU * p / n; ctx.lineTo(o.cx + o.R * Math.cos(a), o.cy + o.R * Math.sin(a)); }
      ctx.stroke(); ctx.restore();
      const pulse = 6 + 3 * Math.sin(tt * 30);
      ctx.save(); ctx.strokeStyle = C.amber; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(o.cx + o.R, o.cy, pulse * k, 0, TAU); ctx.stroke(); ctx.restore();
      label(g, t('fa_w_peg') + ' ' + g.c.start, o.cx + o.R - 8 * k, o.cy + 24 * k, C.amber, 11, 'right');
    },
    // 12. colgar con el clavo de arriba arriba
    function (g, tt) {
      const ctx = g.x, k = g.k;
      ctx.fillStyle = '#0b1a13'; ctx.fillRect(0, 0, g.W, g.H);
      const side = Math.min(g.W, g.H) * 0.58, hookY = g.H * 0.14;
      const pUp = seg(tt, 0.02, 0.45), swing = tt < 0.45 ? 0.18 : 0.18 * Math.exp(-(tt - 0.45) * 9) * Math.cos((tt - 0.45) * 40);
      const y = hookY + 16 * k + (1 - pUp) * g.H * 0.5;
      ctx.fillStyle = C.metal; ctx.beginPath(); ctx.arc(g.W / 2, hookY, 4 * k, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(g.W / 2, hookY); ctx.rotate(swing); ctx.translate(-g.W / 2, -hookY);
      ctx.strokeStyle = C.metal; ctx.lineWidth = 1.2 * k;
      ctx.beginPath(); ctx.moveTo(g.W / 2 - side * 0.35, y + 8 * k); ctx.lineTo(g.W / 2, hookY); ctx.lineTo(g.W / 2 + side * 0.35, y + 8 * k); ctx.stroke();
      const x0 = g.W / 2 - side / 2;
      boardRect(g, x0, y, side, 1);
      const R = side * 0.42, cx = g.W / 2, cy = y + side / 2;
      ringPegs(g, cx, cy, R, 40, null, inkOn(g), 1.6);
      ctx.strokeStyle = inkOn(g); ctx.globalAlpha = 0.5; ctx.lineWidth = 0.7 * k;
      ctx.beginPath(); let p = 0; ctx.moveTo(cx + R, cy);
      for (let i = 0; i < 40; i++) { p = (p + 13) % 40; ctx.lineTo(cx + R * Math.cos(TAU * p / 40), cy + R * Math.sin(TAU * p / 40)); }
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = C.neon; ctx.beginPath(); ctx.arc(cx, cy - R, 4 * k, 0, TAU); ctx.fill();
      ctx.restore();
      if (tt > 0.75) label(g, '↑ ' + t('fa_w_top') + ' · ' + t('fa_w_peg') + ' ' + g.c.top, g.W / 2, g.H - 16 * k, C.neon, 12);
    }
  ];

  function printCheck(g, tt) {
    const ctx = g.x, k = g.k;
    const w = Math.min(g.W * 0.6, g.H * 0.62), h = w * 1.29, x = (g.W - w) / 2, y = (g.H - h) / 2;
    paper(g, x, y, w, h);
    ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1 * k;
    ctx.beginPath(); ctx.arc(x + w * 0.2, y + h * 0.2, w * 0.9, 0.05, 1.25); ctx.stroke(); ctx.restore();
    const bx = x + w * 0.15, bw = w * 0.7, by = y + h * 0.82;
    ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5 * k;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by);
    for (let i = 0; i <= 10; i++) { ctx.moveTo(bx + bw * i / 10, by); ctx.lineTo(bx + bw * i / 10, by + (i % 5 ? 4 : 7) * k); }
    ctx.stroke();
    ctx.font = Math.round(8 * k) + 'px ui-monospace, monospace'; ctx.fillStyle = C.ink; ctx.textAlign = 'center';
    ctx.fillText('0', bx, by + 15 * k); ctx.fillText('10 cm', bx + bw, by + 15 * k);
    ctx.restore();
    const p = seg(tt, 0.05, 0.55), ry = g.H + 20 * k - (g.H + 20 * k - (by - 12 * k)) * p;
    ruler(g, bx - 10 * k, ry, bx + bw + 30 * k, ry, 18 * k, 1);
    if (tt > 0.6) {
      ctx.save(); ctx.strokeStyle = C.neon; ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.moveTo(bx, by - 22 * k); ctx.lineTo(bx, by + 4 * k); ctx.moveTo(bx + bw, by - 22 * k); ctx.lineTo(bx + bw, by + 4 * k); ctx.stroke(); ctx.restore();
      check(g, x + w / 2, y + h * 0.45, 22 * k, seg(tt, 0.62, 0.8));
      label(g, '10 cm = 10 cm', g.W / 2, y - 14 * k, C.neon, 12);
    }
  }

  function checkScene(g, tt) {
    const o = geo(g), ctx = g.x, k = g.k;
    boardRect(g, o.x0, o.y0, o.side, 1);
    ringPegs(g, o.cx, o.cy, o.R, 48, null, inkOn(g), 2);
    const p1 = seg(tt, 0.05, 0.4), p2 = seg(tt, 0.48, 0.82);
    const a0 = [o.cx + o.R, o.cy], aHalf = [o.cx - o.R, o.cy], aQ = [o.cx, o.cy + o.R];
    ruler(g, a0[0], a0[1], aHalf[0], aHalf[1], 12 * k, p1);
    if (p1 >= 1) label(g, '0 → ' + g.v.half + ': ' + g.v.D + ' cm', o.cx, o.cy - 18 * k, C.neon, 12);
    if (p2 > 0) ruler(g, a0[0], a0[1], aQ[0], aQ[1], 12 * k, p2);
    if (p2 >= 1) label(g, '0 → ' + g.c.bottom + ': ' + g.v.q4 + ' cm', o.cx + o.R * 0.55, o.cy + o.R * 0.62, C.cyan, 11);
    [a0, aHalf, aQ].forEach((pt, i) => {
      if ((i === 1 && p1 < 1) || (i === 2 && p2 < 1)) return;
      ctx.fillStyle = C.neon; ctx.beginPath(); ctx.arc(pt[0], pt[1], 4.5 * k, 0, TAU); ctx.fill();
    });
    if (tt > 0.85) check(g, o.x0 + o.side - 20 * k, o.y0 + 22 * k, 14 * k, seg(tt, 0.85, 0.97));
  }

  /* ================= escenas: como medir ================= */
  // vista ampliada de unos clavos sobre el arco
  function zoomPegs(g) {
    const k = g.k, R = g.W * 1.6, cx = g.W / 2, cy = g.H * 0.36 + R;
    const pegR = Math.max(5 * k, Math.min(16 * k, 46 * k * g.sp.pegMm / Math.max(1, g.c.chordCm * 10)));
    const da = (g.W * 0.32) / R;
    return { R, cx, cy, pegR, da, at: i => [cx + R * Math.cos(-Math.PI / 2 + i * da), cy + R * Math.sin(-Math.PI / 2 + i * da)] };
  }
  function drawZoomPegs(g, z) {
    const ctx = g.x, k = g.k;
    ctx.fillStyle = g.sp.bg; ctx.fillRect(0, 0, g.W, g.H);
    ctx.save(); ctx.strokeStyle = 'rgba(128,128,128,0.6)'; ctx.setLineDash([5 * k, 4 * k]); ctx.lineWidth = 1 * k;
    ctx.beginPath(); ctx.arc(z.cx, z.cy, z.R, -Math.PI / 2 - 3 * z.da, -Math.PI / 2 + 3 * z.da); ctx.stroke(); ctx.restore();
    [-1, 0, 1].forEach(i => {
      const [x, y] = z.at(i);
      ctx.fillStyle = C.metal; ctx.strokeStyle = '#555'; ctx.lineWidth = 1 * k;
      ctx.beginPath(); ctx.arc(x, y, z.pegR, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(x, y, 1.6 * k, 0, TAU); ctx.fill();
    });
  }

  const MEASURES = [
    // diametro y radio
    function (g, tt) {
      const o = geo(g), ctx = g.x, k = g.k;
      boardRect(g, o.x0, o.y0, o.side, 1);
      ringPegs(g, o.cx, o.cy, o.R, 48, null, inkOn(g), 2);
      cross(g, o.cx, o.cy, 7 * k, C.amber, 2);
      const p1 = seg(tt, 0.05, 0.38), p2 = seg(tt, 0.48, 0.82);
      ruler(g, o.cx, o.cy, o.cx + o.R, o.cy, 12 * k, p1, C.tape);
      if (p1 >= 1) label(g, t('fa_w_radius') + ' ' + g.v.r + ' cm', o.cx + o.R / 2, o.cy - 18 * k, C.amber, 11);
      ruler(g, o.cx - o.R, o.cy + o.R * 0.02 + 20 * k, o.cx + o.R, o.cy + o.R * 0.02 + 20 * k, 12 * k, p2, C.tape);
      if (p2 > 0) { ctx.save(); ctx.strokeStyle = C.cyan; ctx.setLineDash([3 * k, 3 * k]); ctx.beginPath(); ctx.moveTo(o.cx - o.R, o.cy); ctx.lineTo(o.cx - o.R, o.cy + 30 * k); ctx.stroke(); ctx.restore(); }
      if (p2 >= 1) label(g, 'Ø ' + g.v.D + ' cm', o.cx, o.cy + 44 * k, C.cyan, 12);
    },
    // entre clavos vecinos (recta, centro a centro) y espacio libre
    function (g, tt) {
      const z = zoomPegs(g), ctx = g.x, k = g.k;
      drawZoomPegs(g, z);
      const [x1, y1] = z.at(0), [x2, y2] = z.at(1);
      const p1 = seg(tt, 0.06, 0.42), p2 = seg(tt, 0.52, 0.85);
      ruler(g, x1, y1 + 26 * k, x2, y2 + 26 * k, 14 * k, p1);
      if (p1 > 0) {
        ctx.save(); ctx.strokeStyle = C.cyan; ctx.setLineDash([3 * k, 3 * k]); ctx.lineWidth = 1 * k;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1, y1 + 34 * k); ctx.moveTo(x2, y2); ctx.lineTo(x2, y2 + 34 * k); ctx.stroke(); ctx.restore();
      }
      if (p1 >= 1) label(g, g.v.c + ' cm · ' + t('fa_w_c2c'), (x1 + x2) / 2, y1 + 58 * k, C.cyan, 11);
      if (p2 > 0) {
        const a = Math.atan2(y2 - y1, x2 - x1), ex1 = x1 + Math.cos(a) * z.pegR, ey1 = y1 + Math.sin(a) * z.pegR;
        const ex2 = x2 - Math.cos(a) * z.pegR, ey2 = y2 - Math.sin(a) * z.pegR;
        dim(g, ex1, ey1, ex2, ey2, C.neon, null, p2);
        if (p2 >= 1) label(g, g.v.free + ' mm ' + t('fa_w_free'), (x1 + x2) / 2, y1 - 30 * k, C.neon, 11);
      }
    },
    // por el arco (cinta flexible)
    function (g, tt) {
      const z = zoomPegs(g), ctx = g.x, k = g.k;
      drawZoomPegs(g, z);
      const p = seg(tt, 0.08, 0.6);
      ctx.save(); ctx.strokeStyle = C.tape; ctx.lineWidth = 12 * k; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(z.cx, z.cy, z.R - 18 * k, -Math.PI / 2, -Math.PI / 2 + z.da * p); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.strokeStyle = 'rgba(40,30,0,0.8)'; ctx.lineWidth = 1 * k;
      for (let i = 0; i <= 12 * p; i++) { const a = -Math.PI / 2 + z.da * i / 12; ctx.beginPath(); ctx.moveTo(z.cx + (z.R - 24 * k) * Math.cos(a), z.cy + (z.R - 24 * k) * Math.sin(a)); ctx.lineTo(z.cx + (z.R - 18 * k) * Math.cos(a), z.cy + (z.R - 18 * k) * Math.sin(a)); ctx.stroke(); }
      ctx.restore();
      if (p >= 1) {
        const [x1, y1] = z.at(0), [x2] = z.at(1);
        label(g, g.v.arc + ' cm ' + t('fa_w_arc'), (x1 + x2) / 2, y1 + 44 * k, C.amber, 11);
        label(g, '≈ ' + g.v.c + ' cm ' + t('fa_w_straight'), (x1 + x2) / 2, y1 + 68 * k, C.cyan, 10);
      }
    },
    // angulo entre clavos con transportador
    function (g, tt) {
      const o = geo(g), ctx = g.x, k = g.k;
      boardRect(g, o.x0, o.y0, o.side, 1);
      ringPegs(g, o.cx, o.cy, o.R, 48, null, inkOn(g), 2);
      const vis = 22 * Math.PI / 180;           // angulo ampliado para que se vea
      const p1 = seg(tt, 0.05, 0.32), p2 = seg(tt, 0.35, 0.55), p3 = seg(tt, 0.58, 0.82);
      ctx.save(); ctx.strokeStyle = C.amber; ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.moveTo(o.cx, o.cy); ctx.lineTo(o.cx + o.R * p1, o.cy);
      ctx.moveTo(o.cx, o.cy); ctx.lineTo(o.cx + o.R * p1 * Math.cos(vis), o.cy + o.R * p1 * Math.sin(vis)); ctx.stroke(); ctx.restore();
      if (p2 > 0) {
        ctx.save(); ctx.globalAlpha = 0.5 * p2; ctx.fillStyle = C.cyan;
        ctx.beginPath(); ctx.moveTo(o.cx, o.cy); ctx.arc(o.cx, o.cy, o.R * 0.42, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.save(); ctx.strokeStyle = C.cyan; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(o.cx, o.cy, o.R * 0.3, 0, vis); ctx.stroke(); ctx.restore();
        if (p2 >= 1) label(g, g.v.a + '°', o.cx + o.R * 0.48, o.cy + o.R * 0.14, C.cyan, 12);
      }
      if (p3 > 0) {
        ctx.save(); ctx.globalAlpha = 0.18 + 0.12 * p3; ctx.fillStyle = C.neon;
        ctx.beginPath(); ctx.moveTo(o.cx, o.cy); ctx.arc(o.cx, o.cy, o.R, 0, Math.PI / 2 * p3); ctx.closePath(); ctx.fill(); ctx.restore();
        if (p3 >= 1) label(g, g.v.q + ' ' + t('fa_w_per_quarter'), o.cx + o.R * 0.45, o.cy + o.R * 0.7, C.neon, 11);
      }
    },
    // altura sobre el tablero
    function (g, tt) {
      const ctx = g.x, k = g.k, c = g.c;
      const pxmm = (g.H * 0.6) / (c.heightMm + c.thickMm);
      const top = g.H * 0.22 + c.heightMm * pxmm, bot = top + c.thickMm * pxmm;
      ctx.fillStyle = g.sp.bg; ctx.fillRect(g.W * 0.06, top, g.W * 0.7, bot - top);
      ctx.strokeStyle = '#15633f'; ctx.lineWidth = 1.5 * k; ctx.strokeRect(g.W * 0.06, top, g.W * 0.7, bot - top);
      const [xt, yt] = nail(g, g.W * 0.34, top + c.embedMm * pxmm, c.nailMm * pxmm, 0, c.pegMm * pxmm);
      const p1 = seg(tt, 0.05, 0.42), p2 = seg(tt, 0.5, 0.82);
      const rx = g.W * 0.44;
      ruler(g, rx, top, rx, top - (top - yt + 12 * k), 16 * k, p1);
      if (p1 >= 1) dim(g, g.W * 0.84, yt, g.W * 0.84, top, C.neon, c.heightMm + ' mm', 1, g.W * 0.88, (yt + top) / 2);
      if (p2 > 0) {
        const bx = g.W * 0.58 + (1 - p2) * g.W * 0.3;
        ctx.save(); ctx.fillStyle = 'rgba(41,231,255,0.25)'; ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5 * k;
        ctx.fillRect(bx, top - c.heightMm * pxmm, g.W * 0.12, c.heightMm * pxmm); ctx.strokeRect(bx, top - c.heightMm * pxmm, g.W * 0.12, c.heightMm * pxmm); ctx.restore();
        if (p2 >= 1) label(g, t('fa_w_block') + ' ' + c.heightMm + ' mm', bx + g.W * 0.06, top - c.heightMm * pxmm - 12 * k, C.cyan, 10);
      }
    },
    // grosor del tablero, largo del clavo y cuanto se entierra
    function (g, tt) {
      const ctx = g.x, k = g.k, c = g.c;
      const pxmm = (g.H * 0.66) / (c.nailMm + 6);
      const top = g.H * 0.16 + c.heightMm * pxmm, bot = top + c.thickMm * pxmm;
      ctx.fillStyle = g.sp.bg; ctx.fillRect(g.W * 0.06, top, g.W * 0.6, bot - top);
      ctx.strokeStyle = '#15633f'; ctx.lineWidth = 1.5 * k; ctx.strokeRect(g.W * 0.06, top, g.W * 0.6, bot - top);
      const x = g.W * 0.34, yTip = top + c.embedMm * pxmm;
      nail(g, x, yTip, c.nailMm * pxmm, 0, c.pegMm * pxmm);
      ctx.save(); ctx.strokeStyle = 'rgba(201,209,205,0.5)'; ctx.setLineDash([3 * k, 3 * k]); ctx.lineWidth = 1 * k;
      ctx.strokeRect(x - 4 * k, top, 8 * k, c.embedMm * pxmm); ctx.restore();
      const p1 = seg(tt, 0.04, 0.28), p2 = seg(tt, 0.32, 0.56), p3 = seg(tt, 0.6, 0.86);
      dim(g, g.W * 0.72, top, g.W * 0.72, bot, C.fg, t('fa_w_board') + ' ' + c.thickMm + ' mm', p1, g.W * 0.84, (top + bot) / 2);
      dim(g, g.W * 0.16, yTip - c.nailMm * pxmm, g.W * 0.16, yTip, C.amber, t('fa_w_nail') + ' ' + c.nailMm + ' mm', p2, g.W * 0.18, yTip - c.nailMm * pxmm - 12 * k);
      if (p3 > 0) {
        dim(g, g.W * 0.5, top, g.W * 0.5, yTip, C.red, null, p3);
        dim(g, g.W * 0.5, yTip - c.nailMm * pxmm, g.W * 0.5, top, C.neon, null, p3);
        if (p3 >= 1) {
          label(g, t('fa_w_inside') + ' ' + c.embedMm + ' mm', g.W * 0.53, top + c.embedMm * pxmm / 2, C.red, 10, 'left');
          label(g, c.heightMm + ' mm', g.W * 0.53, top - c.heightMm * pxmm / 2, C.neon, 10, 'left');
        }
      }
    },
    // tamaño del tablero y margen
    function (g, tt) {
      const o = geo(g), ctx = g.x, k = g.k;
      boardRect(g, o.x0, o.y0, o.side, 1);
      ringPegs(g, o.cx, o.cy, o.R, 48, null, inkOn(g), 2);
      const p1 = seg(tt, 0.05, 0.42), p2 = seg(tt, 0.5, 0.82);
      ruler(g, o.x0, o.y0 - 10 * k, o.x0 + o.side, o.y0 - 10 * k, 12 * k, p1, C.tape);
      if (p1 >= 1) label(g, g.v.L + ' cm', o.cx, o.y0 - 26 * k, C.amber, 12);
      dim(g, o.cx + o.R, o.cy, o.x0 + o.side, o.cy, C.neon, null, p2);
      if (p2 >= 1) label(g, t('fa_w_margin') + ' ' + g.v.m + ' cm', o.cx + o.R - 4 * k, o.cy - 18 * k, C.neon, 11, 'right');
    },
    checkScene,
    printCheck
  ];

  /* ================= reproductor ================= */
  function player(sp, c, v) {
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let kind = 'build', idx = 0, playing = !reduce, t0 = 0, frozen = 0.999, raf = 0;
    const cv = el('canvas', { class: 'anim-cv', role: 'img' });
    const titleEl = el('h4', { class: 'anim-t' });
    const textEl = el('p', { class: 'anim-d mono' });
    const count = el('span', { class: 'anim-count mono' });
    const dots = el('div', { class: 'anim-dots' });
    const btn = (ic, aria, fn, cls) => { const b = el('button', { type: 'button', class: 'btn small ' + (cls || ''), 'aria-label': t(aria), title: t(aria) }, icon(ic)); b.addEventListener('click', fn); return b; };
    const playBtn = btn(playing ? 'pause' : 'play', playing ? 'fa_pause' : 'fa_play', () => setPlaying(!playing), 'anim-play');
    const kinds = el('div', { class: 'seg anim-kind', role: 'tablist' });
    [['build', 'fa_build'], ['measure', 'fa_measure']].forEach(([id, key]) => {
      const b = el('button', { type: 'button', role: 'tab', 'data-kind': id, i18n: key });
      b.addEventListener('click', () => { kind = id; idx = 0; restart(); });
      kinds.appendChild(b);
    });
    const list = () => (kind === 'build' ? STEPS : MEASURES);
    const titles = () => (kind === 'build' ? t('fa_steps_t') : t('fm_t'));
    const texts = () => (kind === 'build' ? t('fr_steps_list', Object.assign({}, v, { l: v.l2 })) : t('fm_list', v));

    function setPlaying(p) {
      if (p && !playing) t0 = root.performance.now() - frozen * DUR;
      if (!p) frozen = curT();
      playing = p;
      clear(playBtn).appendChild(icon(playing ? 'pause' : 'play'));
      playBtn.setAttribute('aria-label', t(playing ? 'fa_pause' : 'fa_play'));
      if (playing) loop();
      else draw(frozen);
    }
    function curT() { return ((root.performance.now() - t0) % DUR) / DUR; }
    function go(d) { const n = list().length; idx = (idx + d + n) % n; restart(); }
    function restart() {
      t0 = root.performance.now();
      frozen = reduce ? 0.999 : 0;
      kinds.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.getAttribute('data-kind') === kind));
      clear(dots);
      list().forEach((_, i) => {
        const d = el('button', { type: 'button', class: 'anim-dot' + (i === idx ? ' on' : ''), 'aria-label': (i + 1) + '. ' + titles()[i], title: titles()[i] });
        d.addEventListener('click', () => { idx = i; restart(); });
        dots.appendChild(d);
      });
      count.textContent = (idx + 1) + ' / ' + list().length;
      titleEl.textContent = (idx + 1) + '. ' + titles()[idx];
      textEl.textContent = texts()[idx];
      cv.setAttribute('aria-label', titles()[idx]);
      if (playing) loop(); else draw(frozen);
    }
    function size() {
      const css = Math.max(260, cv.clientWidth || 340);
      const r = Math.min(2, root.devicePixelRatio || 1);
      const W = Math.round(css * r), H = Math.round(css * 0.72 * r);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      return { W, H, k: W / 400 };
    }
    function draw(tt) {
      const { W, H, k } = size();
      const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      const g = { x: ctx, W, H, k, sp, c, v };
      try { list()[idx](g, tt); } catch (e) { if (root.console) root.console.error('escena', kind, idx, e); }   // una escena no debe romper la guia
    }
    function loop() {
      root.cancelAnimationFrame(raf);
      const step = () => {
        if (!playing || !cv.isConnected || cv.offsetParent === null) { raf = 0; return; }
        draw(curT());
        raf = root.requestAnimationFrame(step);
      };
      raf = root.requestAnimationFrame(step);
    }

    const box = el('div', { class: 'anim' }, [
      kinds, cv,
      el('div', { class: 'anim-ctrl' }, [btn('left', 'fa_prev', () => go(-1)), playBtn, btn('right', 'fa_next', () => go(1)), count]),
      dots, titleEl, textEl
    ]);
    setTimeout(restart, 0);   // tras insertarse en la pagina (tamano del lienzo)
    return box;
  }

  root.HiloFrameAnim = Object.freeze({ player });
})(self);
