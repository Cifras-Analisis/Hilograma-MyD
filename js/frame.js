/* Hilograma MyD - guia para armar el marco: medidas, materiales, pasos,
 * comprobacion, esquemas y plantilla imprimible a escala real.
 *
 * La plantilla PDF se genera aqui mismo (sin bibliotecas): se divide en hojas
 * Carta o A4 que se unen con cruces de registro, con una barra de 10 cm en cada
 * hoja para comprobar que se imprimio al 100 %. */
(function (root) {
  'use strict';
  const E = root.HiloEngine, I = root.HiloI18n, U = root.HiloUI, St = root.HiloStore;
  const { $, el, clear, icon } = U;
  const t = (k, v) => I.t(k, v);

  const K = 72 / 25.4;              // puntos PDF por mm
  const TPL_MARGIN = 25;            // mm alrededor del circulo en la plantilla
  const PAPERS = { letter: [215.9, 279.4], a4: [210, 297] };
  const NAILS = [12, 15, 18, 20, 25, 30, 35, 40, 45, 50, 60];

  let current = null, lastFocus = null;
  let paper = null;

  /* ================= calculos ================= */
  function compute(sp) {
    const N = sp.nPins, D = sp.diameterCm, r = D / 2;
    const chordCm = D * Math.sin(Math.PI / N);
    const arcCm = Math.PI * D / N;
    const angle = 360 / N;
    const freeMm = chordCm * 10 - sp.pegMm;
    const boardCm = Math.ceil((D + 10) / 5) * 5;
    const thickMm = D >= 80 ? 18 : D >= 45 ? 15 : 12;
    let maxVisits = 0, lines = 0;
    if (sp.blocks && sp.blocks.length) {
      const v = new Uint32Array(N);
      for (const b of sp.blocks) { for (let j = 1; j < b.length; j++) v[b[j]]++; lines += b.length - 2; }
      for (let i = 0; i < N; i++) if (v[i] > maxVisits) maxVisits = v[i];
    } else {
      lines = sp.lines || 4000;
      maxVisits = Math.ceil(lines / N * 2.5);
    }
    const heightMm = Math.min(30, Math.max(8, Math.round(maxVisits * sp.threadMm * 1.3 + 6)));
    // el clavo debe entrar al menos ~60 % del grosor y nunca atravesar el tablero (deja 2 mm)
    const embedMin = Math.round(thickMm * 0.6), maxLen = heightMm + thickMm - 2;
    const nailMm = NAILS.find(x => x >= heightMm + embedMin && x <= maxLen) || (heightMm + embedMin);
    const embedMm = nailMm - heightMm;      // lo que queda dentro al clavar hasta la altura del bloque
    const spares = Math.ceil(N * 0.05) + 2;
    const bottom = Math.round(N / 4) % N, left = Math.round(N / 2) % N, top = Math.round(3 * N / 4) % N;
    const js = [1, 10, Math.round(N / 6), Math.round(N / 4), Math.round(N / 3), Math.floor(N / 2)]
      .filter((j, i, a) => j >= 1 && j <= N / 2 && a.indexOf(j) === i).sort((a, b) => a - b);
    const checks = js.map(j => ({ a: 0, b: j, cm: D * Math.abs(Math.sin(Math.PI * j / N)) }));
    let threads = null;
    if (sp.blocks && sp.blocks.length && sp.colors) {
      const st = E.threadStats(sp);
      threads = sp.colors.map((c, k) => ({ k, hex: c.hex, name: c.name || I.colorName(c.hex), m: Math.ceil(st[k].totalM) }))
        .filter(x => st[x.k].lines > 0);
    }
    const start = sp.blocks && sp.blocks.length ? sp.blocks[0][1] : 0;
    return {
      N, D, r, chordCm, arcCm, angle, freeMm, boardCm, thickMm, maxVisits, lines, heightMm, embedMm, nailMm,
      spares, bottom, left, top, checks, threads, start, quarter: N % 4 === 0,
      tight: freeMm < Math.max(1, sp.threadMm * 4), perQuarter: N / 4
    };
  }

  function tiling(sp, pp) {
    const [pw, ph] = PAPERS[pp] || PAPERS.letter;
    const M = 10, FOOT = 13, OV = 12;
    const S = sp.diameterCm * 10 + 2 * TPL_MARGIN;
    const tw = pw - 2 * M, th = ph - 2 * M - FOOT;
    const sx = tw - OV, sy = th - OV;
    const cols = Math.max(1, Math.ceil((S - OV) / sx)), rows = Math.max(1, Math.ceil((S - OV) / sy));
    return {
      pw, ph, M, FOOT, OV, S, tw, th, sx, sy, cols, rows, pages: cols * rows,
      gx: (cols * sx + OV - S) / 2, gy: (rows * sy + OV - S) / 2
    };
  }

  function defaultPaper() {
    if (paper) return paper;
    const f = I.flagInfo().id;
    return I.lang === 'es' || f === 'us' || f === 'ca' ? 'letter' : 'a4';
  }
  const paperName = pp => (pp === 'a4' ? t('fr_a4') : t('fr_letter'));
  const nice = x => I.fmt(x, Math.abs(x * 10 - Math.round(x * 10)) < 1e-9 ? (Number.isInteger(x) ? 0 : 1) : 2);
  const colorWord = hex => I.colorName(hex).toLowerCase();

  function vars(sp, c, pp) {
    const T = tiling(sp, pp);
    return {
      name: sp.name, N: c.N, n: c.N + c.spares, s: c.spares, L: c.boardCm, t: c.thickMm, D: nice(c.D),
      r: nice(c.r), d: nice(sp.pegMm), l: c.nailMm, h: c.heightMm, v: c.maxVisits, e: c.embedMm,
      c: I.fmt(c.chordCm, 2), arc: I.fmt(c.arcCm, 2), free: I.fmt(Math.max(0, c.freeMm), 1),
      a: I.fmt(c.angle, 3), q: I.fmt(c.perQuarter, c.quarter ? 0 : 1), top: c.top, b: c.bottom, l2: c.left,
      color: colorWord(sp.bg), pages: T.pages, paper: paperName(pp), S: I.fmt(T.S / 10, 1), start: c.start,
      m: nice((c.boardCm - c.D) / 2), half: Math.floor(c.N / 2),
      q4: nice(c.D * Math.abs(Math.sin(Math.PI * Math.round(c.N / 4) / c.N)))
    };
  }
  // {l} es el largo del clavo en casi todos los textos; en los pasos es el clavo de la izquierda
  function stepsList(v) {
    return t('fr_steps_list', Object.assign({}, v, { l: v.l2 }));
  }

  /* ================= pantalla (hoja) ================= */
  function card(value, label, detail, accent) {
    return el('div', { class: 'fr-card' + (accent ? ' accent' : '') }, [
      el('div', { class: 'fr-v', text: value }),
      el('div', { class: 'fr-l', text: label }),
      detail ? el('div', { class: 'fr-d mono', text: detail }) : null
    ]);
  }

  function section(title, iconName, kids) {
    return el('section', { class: 'panel fr-sec' }, [
      el('h3', { class: 'panel-t' }, [icon(iconName), el('span', { text: title })])
    ].concat(kids));
  }

  function render() {
    const sp = current;
    if (!sp) return;
    const c = compute(sp), pp = defaultPaper(), v = vars(sp, c, pp), T = tiling(sp, pp);
    const body = clear($('frBody'));
    $('frTitle').textContent = t('fr_title');
    body.appendChild(el('p', { class: 'mono small muted', text: sp.fromDesign ? t('fr_lead_design') : t('fr_lead', { name: sp.name }) }));

    body.appendChild(el('div', { class: 'fr-cards' }, [
      card(I.fmt(c.N), t('fr_k_pegs'), t('fr_k_pegs_d', { n: v.n }), true),
      card(v.D + ' cm', t('fr_k_diam'), t('fr_k_diam_d', { r: v.r })),
      card(v.c + ' cm', t('fr_k_gap'), t('fr_k_gap_d', { arc: v.arc, free: v.free }), true),
      card(v.a + '°', t('fr_k_angle'), t('fr_k_angle_d', { q: v.q })),
      card(v.L + ' × ' + v.L + ' cm', t('fr_k_board'), t('fr_k_board_d', { t: v.t })),
      card('Ø ' + v.d + ' × ' + v.l + ' mm', t('fr_k_nail'), t('fr_k_nail_d', { e: v.e })),
      card(v.h + ' mm', t('fr_k_height'), t('fr_k_height_d', { v: v.v })),
      card(String(c.top), t('fr_k_top'), t('fr_k_top_d', { b: c.bottom, l: c.left }), true)
    ]));
    if (c.tight) body.appendChild(el('p', { class: 'note warn', text: t('s_spacing_warn') }));
    if (!c.quarter) body.appendChild(el('p', { class: 'note warn', text: t('fr_quarter_warn', { b: c.bottom, l: c.left, top: c.top }) }));

    // ilustraciones animadas: armar el marco paso a paso y como medir cada distancia
    if (root.HiloFrameAnim) {
      const sec = section(t('fa_title'), 'play', [root.HiloFrameAnim.player(sp, c, v)]);
      sec.classList.add('fr-anim');
      body.appendChild(sec);
    }

    const front = el('canvas', { class: 'fr-canvas', 'aria-label': t('fr_d_front') });
    const side = el('canvas', { class: 'fr-canvas side', 'aria-label': t('fr_d_side') });
    body.appendChild(section(t('fr_diagram'), 'template', [el('div', { class: 'fr-diagrams' }, [front, side])]));

    const mats = [t('fr_m_board', v), t('fr_m_paint', v), t('fr_m_nails', v)];
    if (c.threads) c.threads.forEach(x => mats.push(t('fr_m_thread', { name: x.name, letter: U.letter(x.k), m: I.fmt(x.m) })));
    else mats.push(t('fr_m_thread_none'));
    mats.push(t('fr_m_glue'), t('fr_m_template', v), t('fr_m_hang'));
    body.appendChild(section(t('fr_materials'), 'list', [el('ul', { class: 'fr-list mono' }, mats.map(s => el('li', { text: s })))]));
    body.appendChild(section(t('fr_tools'), 'wand', [el('ul', { class: 'fr-list mono' }, t('fr_tools_list', v).map(s => el('li', { text: s })))]));
    body.appendChild(section(t('fr_steps'), 'check', [el('ol', { class: 'fr-steps mono' }, stepsList(v).map(s => el('li', { text: s })))]));

    const rows = c.checks.map(ch => el('tr', null, [
      el('td', { text: ch.a + ' ↔ ' + ch.b + (ch.b * 2 === c.N ? ' (' + t('fr_c_diam') + ')' : '') }),
      el('td', { class: 'big', text: I.fmt(ch.cm, 2) + ' cm' })
    ]));
    body.appendChild(section(t('fr_check'), 'target', [
      el('p', { class: 'note', text: t('fr_check_d') }),
      el('table', { class: 'tbl' }, [el('thead', null, el('tr', null, [el('th', { text: t('fr_c_pegs') }), el('th', { text: t('fr_c_dist') })])), el('tbody', null, rows)])
    ]));

    // descargas
    const sel = el('select', { class: 'inp short', 'aria-label': t('fr_paper') }, [
      el('option', { value: 'letter', text: t('fr_letter'), selected: pp === 'letter' }),
      el('option', { value: 'a4', text: t('fr_a4'), selected: pp === 'a4' })
    ]);
    sel.addEventListener('change', () => { paper = sel.value; render(); });
    const dl = (label, desc, ic, fn) => {
      const b = el('button', { type: 'button', class: 'btn small' }, [icon(ic), el('span', { text: label })]);
      b.addEventListener('click', fn);
      return el('div', { class: 'fr-dl' }, [b, el('span', { class: 'mono small muted', text: desc })]);
    };
    const fn = St.safeFileName(sp.name);
    body.appendChild(section(t('fr_print_t'), 'download', [
      el('div', { class: 'row' }, [el('label', { class: 'lbl', text: t('fr_paper') }), sel]),
      dl(t('fr_pdf'), t('fr_pdf_d', { pages: T.pages, paper: paperName(pp) }), 'file', () => {
        U.download(fn + '-' + (I.lang === 'es' ? 'plantilla' : 'template') + '-' + c.N + '-' + pp + '.pdf', new Blob([pdf(sp, pp)], { type: 'application/pdf' }));
      }),
      dl(t('fr_svg'), t('fr_svg_d', { S: v.S }), 'template', () => {
        U.download(fn + '-' + (I.lang === 'es' ? 'plantilla' : 'template') + '-' + c.N + '.svg', svg(sp), 'image/svg+xml');
      }),
      dl(t('fr_csv'), t('fr_csv_d'), 'list', () => {
        U.download(fn + '-' + (I.lang === 'es' ? 'coordenadas' : 'coordinates') + '-' + c.N + '.csv', csv(sp), 'text/csv');
      }),
      dl(t('fr_print'), '', 'save', () => root.print())
    ]));

    root.requestAnimationFrame(() => { drawFront(front, sp, c); drawSide(side, sp, c); });
  }

  /* ---------- esquemas ---------- */
  function sizeCanvas(cv, ratio) {
    const css = Math.max(220, cv.clientWidth || 300);
    const k = Math.min(2, root.devicePixelRatio || 1);
    cv.width = Math.round(css * k); cv.height = Math.round(css * ratio * k);
    return { W: cv.width, H: cv.height, k };
  }
  function arrowHead(ctx, x, y, ang, s) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - s * Math.cos(ang - 0.45), y - s * Math.sin(ang - 0.45));
    ctx.moveTo(x, y);
    ctx.lineTo(x - s * Math.cos(ang + 0.45), y - s * Math.sin(ang + 0.45));
    ctx.stroke();
  }
  function lbl(ctx, s, x, y, col, size, k, align) {
    ctx.font = 'bold ' + Math.round(size * k) + 'px ui-monospace, Consolas, monospace';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(s).width;
    const bx = ctx.textAlign === 'left' ? x - 3 * k : ctx.textAlign === 'right' ? x - w - 3 * k : x - w / 2 - 3 * k;
    ctx.fillStyle = 'rgba(1,5,3,0.82)'; ctx.fillRect(bx, y - size * 0.75 * k, w + 6 * k, size * 1.5 * k);
    ctx.fillStyle = col; ctx.fillText(s, x, y);
  }

  function drawFront(cv, sp, c) {
    const { W, H, k } = sizeCanvas(cv, 1);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#010503'; ctx.fillRect(0, 0, W, H);
    const Sb = W * 0.7, bx = (W - Sb) / 2, by = H * 0.13;
    ctx.fillStyle = sp.bg; ctx.fillRect(bx, by, Sb, Sb);
    ctx.strokeStyle = '#15633f'; ctx.lineWidth = 1.5 * k; ctx.strokeRect(bx, by, Sb, Sb);
    const cx = bx + Sb / 2, cy = by + Sb / 2, r = Sb / 2 * (c.D / c.boardCm);
    const ink = U.inkFor(sp.bg);
    ctx.strokeStyle = ink === '#000000' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1 * k;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = ink === '#000000' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.8)';
    const pr = Math.max(0.9 * k, Math.min(2.2 * k, Math.PI * r / c.N * 0.3));
    for (let i = 0; i < c.N; i++) { const a = 2 * Math.PI * i / c.N; ctx.beginPath(); ctx.arc(cx + r * Math.cos(a), cy + r * Math.sin(a), pr, 0, Math.PI * 2); ctx.fill(); }
    // diametro
    ctx.strokeStyle = '#29e7ff'; ctx.lineWidth = 1.5 * k; ctx.setLineDash([5 * k, 4 * k]);
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); ctx.setLineDash([]);
    arrowHead(ctx, cx + r, cy, 0, 8 * k); arrowHead(ctx, cx - r, cy, Math.PI, 8 * k);
    lbl(ctx, 'Ø ' + I.fmt(c.D, 1) + ' cm', cx, cy - 12 * k, '#29e7ff', 12, k);
    // centro
    ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 1.5 * k;
    ctx.beginPath(); ctx.moveTo(cx - 7 * k, cy + 16 * k); ctx.lineTo(cx + 7 * k, cy + 16 * k); ctx.moveTo(cx, cy + 9 * k); ctx.lineTo(cx, cy + 23 * k); ctx.stroke();
    // clavos de referencia
    const dot = (i, col) => {
      const a = 2 * Math.PI * i / c.N, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8 * k;
      ctx.beginPath(); ctx.arc(x, y, 4.5 * k, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      return [x, y];
    };
    let p = dot(0, '#29e7ff'); lbl(ctx, '0', p[0] + 16 * k, p[1], '#29e7ff', 13, k);
    p = dot(c.top, '#00ff88'); lbl(ctx, String(c.top), p[0], p[1] + 16 * k, '#00ff88', 12, k);
    p = dot(c.bottom, '#c9ffe3'); lbl(ctx, String(c.bottom), p[0], p[1] - 15 * k, '#c9ffe3', 12, k);
    p = dot(c.left, '#c9ffe3'); lbl(ctx, String(c.left), p[0] + 18 * k, p[1] - 14 * k, '#c9ffe3', 12, k);
    // sentido horario
    ctx.strokeStyle = '#29e7ff'; ctx.lineWidth = 2 * k;
    const ra = r + Sb * 0.07;
    ctx.beginPath(); ctx.arc(cx, cy, ra, -0.35, 0.35); ctx.stroke();
    arrowHead(ctx, cx + ra * Math.cos(0.35), cy + ra * Math.sin(0.35), 0.35 + Math.PI / 2, 9 * k);
    lbl(ctx, t('fr_d_cw'), Math.min(W - 6 * k, cx + ra + 4 * k), cy + ra * Math.sin(0.35) + 18 * k, '#29e7ff', 10, k, 'right');
    // arriba y medidas del tablero
    lbl(ctx, '▲ ' + t('fr_d_top') + ' · ' + c.top, cx, by * 0.5, '#00ff88', 13, k);
    ctx.strokeStyle = '#6fa58a'; ctx.lineWidth = 1 * k;
    const yb = by + Sb + 16 * k;
    ctx.beginPath(); ctx.moveTo(bx, yb); ctx.lineTo(bx + Sb, yb); ctx.stroke();
    arrowHead(ctx, bx + Sb, yb, 0, 7 * k); arrowHead(ctx, bx, yb, Math.PI, 7 * k);
    lbl(ctx, t('fr_d_board') + ' ' + c.boardCm + ' cm', cx, yb, '#c9ffe3', 11, k);
    lbl(ctx, t('fr_d_front'), 6 * k, H - 10 * k, '#6fa58a', 10, k, 'left');
  }

  function drawSide(cv, sp, c) {
    const { W, H, k } = sizeCanvas(cv, 1);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#010503'; ctx.fillRect(0, 0, W, H);
    const total = c.heightMm + c.thickMm;
    const pxmm = (H * 0.62) / total;
    const topY = H * 0.16 + c.heightMm * pxmm;           // superficie del tablero
    const botY = topY + c.thickMm * pxmm;
    const bL = W * 0.06, bR = W * 0.68;
    ctx.fillStyle = sp.bg; ctx.fillRect(bL, topY, bR - bL, botY - topY);
    ctx.strokeStyle = '#15633f'; ctx.lineWidth = 1.5 * k; ctx.strokeRect(bL, topY, bR - bL, botY - topY);
    // clavo inclinado hacia afuera (derecha = borde del tablero)
    const tilt = 8 * Math.PI / 180;
    const x0 = W * 0.38, yTip = topY + c.embedMm * pxmm;
    const len = c.nailMm * pxmm;
    const xTop = x0 + Math.sin(tilt) * len, yTop = yTip - Math.cos(tilt) * len;
    ctx.strokeStyle = '#c0c8c4'; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3 * k, sp.pegMm * pxmm);
    ctx.beginPath(); ctx.moveTo(x0, yTip); ctx.lineTo(xTop, yTop); ctx.stroke(); ctx.lineCap = 'butt';
    // vueltas de hilo
    const hex = sp.colors && sp.colors[0] ? sp.colors[0].hex : '#000000';
    ctx.strokeStyle = U.luminance(hex) < 0.05 ? '#00ff88' : hex; ctx.lineWidth = 1.4 * k;
    const uS = (yTip - topY) / (Math.cos(tilt) * len);   // punto donde el clavo sale del tablero
    for (let i = 0; i < 6; i++) {
      const u = uS + (1 - uS) * (0.12 + i * 0.09);
      const xx = x0 + Math.sin(tilt) * len * u, yy = yTip - Math.cos(tilt) * len * u;
      ctx.beginPath(); ctx.moveTo(xx - 26 * k, yy + 3 * k); ctx.lineTo(xx + 26 * k, yy - 3 * k); ctx.stroke();
    }
    // cotas
    const dim = (x, y1, y2, txt, col, side) => {
      ctx.strokeStyle = col; ctx.lineWidth = 1.2 * k;
      ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
      arrowHead(ctx, x, y1, -Math.PI / 2, 6 * k); arrowHead(ctx, x, y2, Math.PI / 2, 6 * k);
      lbl(ctx, txt, x + (side === 'left' ? -6 : 6) * k, (y1 + y2) / 2, col, 11, k, side === 'left' ? 'right' : 'left');
    };
    ctx.strokeStyle = 'rgba(111,165,138,0.5)'; ctx.lineWidth = 1 * k; ctx.setLineDash([3 * k, 3 * k]);
    ctx.beginPath(); ctx.moveTo(bR, topY); ctx.lineTo(W * 0.8, topY); ctx.moveTo(bR, botY); ctx.lineTo(W * 0.8, botY); ctx.moveTo(xTop, yTop); ctx.lineTo(W * 0.8, yTop); ctx.stroke(); ctx.setLineDash([]);
    dim(W * 0.78, yTop, topY, c.heightMm + ' mm', '#00ff88', 'right');
    dim(W * 0.78, topY, botY, c.thickMm + ' mm', '#c9ffe3', 'right');
    dim(W * 0.1, yTop, yTip, t('fr_d_nail') + ' ' + c.nailMm + ' mm', '#ffb000', 'right');
    lbl(ctx, t('fr_d_tilt'), xTop + 8 * k, yTop - 12 * k, '#29e7ff', 10, k, 'left');
    lbl(ctx, '← ' + t('fr_d_center'), bL, botY + 15 * k, '#6fa58a', 10, k, 'left');
    lbl(ctx, t('fr_d_edge') + ' →', bR, botY + 15 * k, '#6fa58a', 10, k, 'right');
    lbl(ctx, t('fr_d_side'), 6 * k, H - 10 * k, '#6fa58a', 10, k, 'left');
  }

  /* ================= PDF (sin bibliotecas) ================= */
  // Anchos de Helvetica (AFM) para centrar y partir lineas.
  const HW = (function () {
    const w = {};
    const set = (chars, v) => { for (const ch of chars) w[ch] = v; };
    set(' !,./:;I[]\\fijlt|', 278); set('()-`r{}', 333); set('"', 355); set("'", 191); set('*', 389);
    set('0123456789#$_?aLbdeghnopqu', 556); set('ckszvxyJ', 500); set('+<=>~', 584); set('%', 889);
    set('&ABEKPSVXY', 667); set('CDHNRUw', 722); set('FTZ', 611); set('GOQ', 778); set('M', 833); set('m', 833);
    set('W', 944); set('@', 1015); set('°', 400); set('×', 584); set('·', 278); set('«»', 556); set('¿', 611); set('¡', 333);
    set('–', 556); set('—', 1000); set('…', 1000); set('↔', 1000);
    return w;
  })();
  function base(ch) { return ch.normalize('NFD')[0]; }
  function textW(s, size, bold) {
    let w = 0;
    for (const ch of String(s)) w += HW[ch] || HW[base(ch)] || 556;
    return w * size / 1000 * (bold ? 1.06 : 1);
  }
  const CP1252 = { '€': 128, '‚': 130, '„': 132, '…': 133, '•': 149, '–': 150, '—': 151, '‘': 145, '’': 146, '“': 147, '”': 148 };
  function pdfStr(s) {
    let out = '(';
    for (const ch of String(s).replace(/↔/g, '-').replace(/▲ ?/g, '')) {
      const cc = ch.codePointAt(0);
      let b;
      if (ch === '(' || ch === ')' || ch === '\\') { out += '\\' + ch; continue; }
      if (cc >= 32 && cc < 127) { out += ch; continue; }
      if (cc === 0x202F || cc === 0x2009) b = 32;
      else if (cc >= 0xA0 && cc <= 0xFF) b = cc;
      else if (CP1252[ch]) b = CP1252[ch];
      else b = 63;
      out += '\\' + b.toString(8).padStart(3, '0');
    }
    return out + ')';
  }
  const f2 = v => (Math.round(v * 100) / 100).toString();

  function circlePath(x, y, r) {
    const q = 0.5523 * r;
    return [f2(x + r), f2(y), 'm', f2(x + r), f2(y + q), f2(x + q), f2(y + r), f2(x), f2(y + r), 'c',
      f2(x - q), f2(y + r), f2(x - r), f2(y + q), f2(x - r), f2(y), 'c',
      f2(x - r), f2(y - q), f2(x - q), f2(y - r), f2(x), f2(y - r), 'c',
      f2(x + q), f2(y - r), f2(x + r), f2(y - q), f2(x + r), f2(y), 'c'].join(' ');
  }

  // Lienzo de pagina en mm (origen arriba a la izquierda)
  function Page(wmm, hmm) {
    const H = hmm * K, ops = [];
    const X = x => f2(x * K), Y = y => f2(H - y * K);
    return {
      w: wmm * K, h: H, ops,
      raw(s) { ops.push(s); },
      gray(g, fill) { ops.push(f2(g) + (fill ? ' g' : ' G')); },
      rgb(hex, fill) { const c = E.hexToRgb(hex); ops.push(c.map(v => f2(v / 255)).join(' ') + (fill ? ' rg' : ' RG')); },
      lw(mm) { ops.push(f2(mm * K) + ' w'); },
      dash(on, off) { ops.push(on ? '[' + f2(on * K) + ' ' + f2(off * K) + '] 0 d' : '[] 0 d'); },
      line(x1, y1, x2, y2) { ops.push(X(x1) + ' ' + Y(y1) + ' m ' + X(x2) + ' ' + Y(y2) + ' l S'); },
      rect(x, y, w, h, fill) { ops.push(X(x) + ' ' + Y(y + h) + ' ' + f2(w * K) + ' ' + f2(h * K) + ' re ' + (fill ? 'f' : 'S')); },
      circle(x, y, r, fill) { ops.push(circlePath(x * K, H - y * K, r * K) + (fill ? ' f' : ' S')); },
      clip(x, y, w, h) { ops.push('q ' + X(x) + ' ' + Y(y + h) + ' ' + f2(w * K) + ' ' + f2(h * K) + ' re W n'); },
      unclip() { ops.push('Q'); },
      text(s, x, y, size, opts) {
        opts = opts || {};
        const w = textW(s, size, opts.bold) / K;
        const xx = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
        ops.push('BT /' + (opts.bold ? 'F2' : 'F1') + ' ' + f2(size) + ' Tf ' + X(xx) + ' ' + Y(y) + ' Td ' + pdfStr(s) + ' Tj ET');
        return w;
      }
    };
  }

  function buildPdf(pages, title) {
    const objs = [];
    const add = s => { objs.push(s); return objs.length; };
    const catalog = add(''), pagesObj = add('');
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fb = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const pg of pages) {
      const content = pg.ops.join('\n');
      const cs = add('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      kids.push(add('<< /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 ' + f2(pg.w) + ' ' + f2(pg.h) + '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + fb + ' 0 R >> >> /Contents ' + cs + ' 0 R >>'));
    }
    objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesObj + ' 0 R >>';
    objs[pagesObj - 1] = '<< /Type /Pages /Kids [' + kids.map(k => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
    const info = add('<< /Title ' + pdfStr(title) + ' /Producer (Hilograma MyD) /Creator (Hilograma MyD) >>');
    let out = '%PDF-1.4\n%' + String.fromCharCode(226, 227, 207, 211) + '\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }

  // Paginas de texto de la guia
  function guidePages(sp, c, T, pp) {
    const v = vars(sp, c, pp);
    const pages = [];
    const M = 15, W = T.pw - 2 * M;
    let pg = null, y = 0;
    const mm = pt => pt * 25.4 / 72;
    const newPage = () => { pg = Page(T.pw, T.ph); pages.push(pg); y = M; };
    const ensure = h => { if (!pg || y + h > T.ph - M) newPage(); };
    const wrap = (s, size, width, bold) => {
      const words = String(s).split(' '), lines = [];
      let cur = '';
      for (const w of words) {
        const tryS = cur ? cur + ' ' + w : w;
        if (textW(tryS, size, bold) / K > width && cur) { lines.push(cur); cur = w; } else cur = tryS;
      }
      if (cur) lines.push(cur);
      return lines;
    };
    const para = (s, size, opts) => {
      opts = opts || {};
      const ind = opts.indent || 0, lh = mm(size) * 1.38;
      const lines = wrap(s, size, W - ind, opts.bold);
      lines.forEach((ln, i) => {
        ensure(lh);
        if (i === 0 && opts.bullet) pg.text(opts.bullet, M + ind - 5, y + mm(size), size, { bold: true });
        pg.gray(opts.gray || 0, true);
        pg.text(ln, M + ind, y + mm(size), size, { bold: opts.bold });
        y += lh;
      });
      y += opts.after || 1;
    };
    const heading = s => { ensure(14); y += 3; pg.rgb('#00a35a', true); pg.text(s, M, y + mm(13), 13, { bold: true }); y += mm(13) * 1.5; pg.gray(0, true); };

    newPage();
    pg.rgb('#00a35a', true); pg.text('HILOGRAMA MyD', M, y + mm(10), 10, { bold: true }); y += 6;
    pg.gray(0, true); para(t('fr_title'), 20, { bold: true, after: 1 });
    para(t('fr_lead', { name: sp.name }), 10, { gray: 0.3, after: 3 });

    heading(t('fr_key'));
    const kv = [
      [t('fr_k_pegs'), I.fmt(c.N) + '  (' + t('fr_k_pegs_d', { n: v.n }) + ')'],
      [t('fr_k_diam'), v.D + ' cm  (' + t('fr_k_diam_d', { r: v.r }) + ')'],
      [t('fr_k_gap'), v.c + ' cm  (' + t('fr_k_gap_d', { arc: v.arc, free: v.free }) + ')'],
      [t('fr_k_angle'), v.a + '°  (' + t('fr_k_angle_d', { q: v.q }) + ')'],
      [t('fr_k_board'), v.L + ' × ' + v.L + ' cm  (' + t('fr_k_board_d', { t: v.t }) + ')'],
      [t('fr_k_nail'), 'Ø ' + v.d + ' × ' + v.l + ' mm  (' + t('fr_k_nail_d', { e: v.e }) + ')'],
      [t('fr_k_height'), v.h + ' mm  (' + t('fr_k_height_d', { v: v.v }) + ')'],
      [t('fr_k_top'), c.top + '  (' + t('fr_k_top_d', { b: c.bottom, l: c.left }) + ')']
    ];
    kv.forEach(([k, val]) => {
      ensure(6);
      pg.gray(0.35, true); pg.text(k, M, y + mm(10), 10, { bold: true });
      pg.gray(0, true);
      const lines = wrap(val, 10, W - 58);
      lines.forEach((ln, i) => { if (i) ensure(5); pg.text(ln, M + 58, y + mm(10), 10); y += mm(10) * 1.38; });
      y += 0.8;
    });

    heading(t('fr_materials'));
    const mats = [t('fr_m_board', v), t('fr_m_paint', v), t('fr_m_nails', v)];
    if (c.threads) c.threads.forEach(x => mats.push(t('fr_m_thread', { name: x.name, letter: U.letter(x.k), m: I.fmt(x.m) })));
    else mats.push(t('fr_m_thread_none'));
    mats.push(t('fr_m_glue'), t('fr_m_template', v), t('fr_m_hang'));
    mats.forEach(s => para(s, 10, { indent: 5, bullet: '•' }));
    heading(t('fr_tools'));
    t('fr_tools_list', v).forEach(s => para(s, 10, { indent: 5, bullet: '•' }));
    heading(t('fr_steps'));
    stepsList(v).forEach((s, i) => para(s, 10, { indent: 7, bullet: (i + 1) + '.', after: 1.6 }));
    heading(t('fr_check'));
    para(t('fr_check_d'), 9.5, { gray: 0.3 });
    c.checks.forEach(ch => {
      ensure(6);
      pg.text(ch.a + ' - ' + ch.b + (ch.b * 2 === c.N ? ' (' + t('fr_c_diam') + ')' : ''), M + 5, y + mm(10), 10);
      pg.text(I.fmt(ch.cm, 2) + ' cm', M + 80, y + mm(10), 10, { bold: true, align: 'right' });
      y += 5.4;
    });

    // mapa de hojas
    heading(t('fr_pdf_map'));
    para(t('fr_pdf_map_d'), 9.5, { gray: 0.3, after: 2 });
    const cell = Math.min(18, (W * 0.6) / T.cols, 60 / T.rows);
    ensure(cell * T.rows + 6);
    pg.gray(0, false); pg.lw(0.3);
    let n = 0;
    for (let r = 0; r < T.rows; r++) for (let cc = 0; cc < T.cols; cc++) {
      n++;
      pg.rect(M + cc * cell, y + r * cell, cell, cell);
      pg.text(String(n), M + cc * cell + cell / 2, y + r * cell + cell / 2 + 1.2, Math.min(10, cell * 1.5), { align: 'center', bold: true });
    }
    pg.gray(0.5, false);
    pg.circle(M + T.cols * cell / 2, y + T.rows * cell / 2, Math.min(T.cols * cell, T.rows * cell) / 2 * (c.D * 10 / T.S));
    y += cell * T.rows + 4;
    pg.gray(0.45, true);
    para(t('fr_made') + ' · ' + new Date().toLocaleDateString(I.flagInfo().num), 8, { gray: 0.5 });
    return pages;
  }

  function templatePages(sp, c, T) {
    const pages = [];
    const N = c.N, r = c.D * 5, S = T.S, cx = S / 2, cy = S / 2;
    const chordMm = c.chordCm * 10;
    const every = chordMm >= 9 ? 1 : chordMm >= 4.5 ? 2 : chordMm >= 2 ? 5 : 10;
    const fs = Math.min(8, Math.max(4.5, chordMm * every * 1.2));
    const pegR = Math.max(0.35, sp.pegMm / 2);
    const total = T.cols * T.rows;
    let n = 0;
    for (let j = 0; j < T.rows; j++) for (let i = 0; i < T.cols; i++) {
      n++;
      const pg = Page(T.pw, T.ph);
      const ox = i * T.sx - T.gx, oy = j * T.sy - T.gy;
      const X = x => T.M + x - ox, Y = y => T.M + y - oy;
      const inTile = (x, y, pad) => x >= ox - pad && x <= ox + T.tw + pad && y >= oy - pad && y <= oy + T.th + pad;
      pg.clip(T.M, T.M, T.tw, T.th);
      // diametros y centro
      pg.gray(0.7, false); pg.lw(0.2); pg.dash(2, 2);
      pg.line(X(cx - r - 8), Y(cy), X(cx + r + 8), Y(cy));
      pg.line(X(cx), Y(cy - r - 8), X(cx), Y(cy + r + 8));
      pg.dash(0);
      pg.gray(0, false); pg.lw(0.3);
      pg.line(X(cx - 8), Y(cy), X(cx + 8), Y(cy)); pg.line(X(cx), Y(cy - 8), X(cx), Y(cy + 8));
      pg.circle(X(cx), Y(cy), 2);
      // circulo
      pg.gray(0.55, false); pg.lw(0.25);
      pg.circle(X(cx), Y(cy), r);
      // clavos
      for (let p = 0; p < N; p++) {
        const a = 2 * Math.PI * p / N, ca = Math.cos(a), sa = Math.sin(a);
        const x = cx + r * ca, y = cy + r * sa;
        if (!inTile(x, y, 12)) continue;
        const special = p === 0 || p === c.top || p === c.bottom || p === c.left;
        pg.gray(0, true);
        pg.circle(X(x), Y(y), pegR, true);
        pg.gray(0, false); pg.lw(0.15);
        pg.line(X(cx + (r + pegR + 0.8) * ca), Y(cy + (r + pegR + 0.8) * sa), X(cx + (r + 3.6) * ca), Y(cy + (r + 3.6) * sa));
        if (p % every === 0 || special) {
          const lr = r + 4.6 + fs * 0.35 * 1.6;
          if (special) pg.rgb('#0070c0', true); else pg.gray(0, true);
          pg.text(String(p), X(cx + lr * ca), Y(cy + lr * sa) + fs * 0.35 * 0.36, special ? fs + 1 : fs, { align: 'center', bold: special });
        }
      }
      // textos de orientacion
      pg.rgb('#00a35a', true);
      if (inTile(cx, cy - r - 17, 30)) pg.text(t('fr_d_top') + ' · ' + c.top, X(cx), Y(cy - r - 15), 11, { align: 'center', bold: true });
      pg.gray(0.3, true);
      if (inTile(cx, cy + 14, 40)) {
        pg.text(sp.name + ' · ' + N + ' ' + t('fr_pdf_pegs') + ' · Ø ' + I.fmt(c.D, 1) + ' cm', X(cx), Y(cy + 16), 8, { align: 'center', bold: true });
        pg.text(t('fr_pdf_cw', { top: c.top }), X(cx), Y(cy + 21), 7, { align: 'center' });
        pg.text(t('s_spacing', { cm: I.fmt(c.chordCm, 2), deg: I.fmt(c.angle, 3) }), X(cx), Y(cy + 25.5), 7, { align: 'center' });
      }
      // cruces de registro en las zonas de union
      pg.gray(0, false); pg.lw(0.2);
      const cross = (x, y) => { pg.line(X(x - 3), Y(y), X(x + 3), Y(y)); pg.line(X(x), Y(y - 3), X(x), Y(y + 3)); };
      for (let b = 1; b < T.cols; b++) {
        const xs = b * T.sx - T.gx + T.OV / 2;
        for (let yy = oy + 15; yy < oy + T.th - 5; yy += 35) cross(xs, Math.round(yy / 35) * 35);
      }
      for (let b = 1; b < T.rows; b++) {
        const ys = b * T.sy - T.gy + T.OV / 2;
        for (let xx = ox + 15; xx < ox + T.tw - 5; xx += 35) cross(Math.round(xx / 35) * 35, ys);
      }
      // lineas de corte (bordes izquierdo y superior de esta hoja)
      pg.rgb('#c00000', false); pg.lw(0.25); pg.dash(1.5, 1.2);
      if (i > 0) pg.line(X(ox + T.OV / 2), Y(oy), X(ox + T.OV / 2), Y(oy + T.th));
      if (j > 0) pg.line(X(ox), Y(oy + T.OV / 2), X(ox + T.tw), Y(oy + T.OV / 2));
      pg.dash(0);
      pg.unclip();
      // borde de la zona impresa
      pg.gray(0.75, false); pg.lw(0.15); pg.rect(T.M, T.M, T.tw, T.th);
      // pie: hoja, mapa y barra de 10 cm
      const fy = T.M + T.th + 3;
      pg.gray(0, true);
      pg.text(t('fr_pdf_sheet', { n, t: total, r: j + 1, c: i + 1 }), T.M, fy + 3.5, 8, { bold: true });
      pg.gray(0.35, true);
      pg.text(sp.name, T.M, fy + 7.5, 7);
      const cell = Math.min(3.2, 9 / T.rows), mx = T.M + 62;
      pg.lw(0.15);
      for (let rr = 0; rr < T.rows; rr++) for (let cc2 = 0; cc2 < T.cols; cc2++) {
        if (rr === j && cc2 === i) { pg.rgb('#00a35a', true); pg.rect(mx + cc2 * cell, fy + rr * cell, cell, cell, true); }
        pg.gray(0.3, false); pg.rect(mx + cc2 * cell, fy + rr * cell, cell, cell);
      }
      const bx = T.M + T.tw - 100;
      pg.gray(0, false); pg.lw(0.3);
      pg.line(bx, fy + 3, bx + 100, fy + 3);
      for (let q = 0; q <= 10; q++) pg.line(bx + q * 10, fy + 3, bx + q * 10, fy + (q % 5 === 0 ? 6 : 4.8));
      pg.gray(0, true);
      pg.text('0', bx, fy + 9.2, 6.5, { align: 'center' });
      pg.text('10 cm', bx + 100, fy + 9.2, 6.5, { align: 'center', bold: true });
      pg.text(t('fr_pdf_scale'), bx + 50, fy + 9.2, 6.5, { align: 'center' });
      pages.push(pg);
    }
    return pages;
  }

  function pdf(sp, pp) {
    const c = compute(sp), T = tiling(sp, pp);
    return buildPdf(guidePages(sp, c, T, pp).concat(templatePages(sp, c, T)), sp.name + ' - ' + t('fr_title'));
  }

  /* ================= SVG de una pieza y CSV ================= */
  function xmlEsc(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
  }

  function svg(sp) {
    const c = compute(sp);
    const Dm = c.D * 10, S = Dm + 2 * TPL_MARGIN, cx = S / 2, r = Dm / 2, n = c.N;
    const chordMm = c.chordCm * 10;
    const every = chordMm >= 9 ? 1 : chordMm >= 4.5 ? 2 : chordMm >= 2 ? 5 : 10;
    const fs = Math.max(1.8, Math.min(3.2, chordMm * every * 0.42));
    const f = v => v.toFixed(2);
    const out = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + f(S) + 'mm" height="' + f(S) + 'mm" viewBox="0 0 ' + f(S) + ' ' + f(S) + '">',
      '<rect width="100%" height="100%" fill="#ffffff"/>',
      '<path d="M' + f(cx - r - 8) + ' ' + f(cx) + 'H' + f(cx + r + 8) + 'M' + f(cx) + ' ' + f(cx - r - 8) + 'V' + f(cx + r + 8) + '" stroke="#bbb" stroke-width="0.2" stroke-dasharray="2 2"/>',
      '<circle cx="' + f(cx) + '" cy="' + f(cx) + '" r="' + f(r) + '" fill="none" stroke="#999" stroke-width="0.25"/>',
      '<path d="M' + f(cx - 8) + ' ' + f(cx) + 'h16M' + f(cx) + ' ' + f(cx - 8) + 'v16" stroke="#000" stroke-width="0.3"/>'];
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n, ca = Math.cos(a), sa = Math.sin(a);
      const special = i === 0 || i === c.top || i === c.bottom || i === c.left;
      out.push('<circle cx="' + f(cx + r * ca) + '" cy="' + f(cx + r * sa) + '" r="' + f(Math.max(0.35, sp.pegMm / 2)) + '"/>');
      out.push('<path d="M' + f(cx + (r + 1.2) * ca) + ' ' + f(cx + (r + 1.2) * sa) + 'L' + f(cx + (r + 3.6) * ca) + ' ' + f(cx + (r + 3.6) * sa) + '" stroke="#000" stroke-width="0.15"/>');
      if (i % every === 0 || special) {
        const lr = r + 4.6 + fs * 0.8;
        out.push('<text x="' + f(cx + lr * ca) + '" y="' + f(cx + lr * sa) + '" font-family="Helvetica, Arial, sans-serif" font-size="' + f(special ? fs * 1.2 : fs) + '" text-anchor="middle" dominant-baseline="central"' + (special ? ' fill="#0070c0" font-weight="bold"' : '') + '>' + i + '</text>');
      }
    }
    out.push('<text x="' + f(cx) + '" y="' + f(cx - r - 15) + '" font-family="Helvetica, Arial, sans-serif" font-size="4" font-weight="bold" text-anchor="middle" fill="#00a35a">' + xmlEsc(t('fr_d_top') + ' · ' + c.top) + '</text>');
    out.push('<text x="' + f(cx) + '" y="' + f(cx + 16) + '" font-family="Helvetica, Arial, sans-serif" font-size="3" font-weight="bold" text-anchor="middle" fill="#444">' + xmlEsc(sp.name + ' · ' + n + ' ' + t('fr_pdf_pegs') + ' · Ø ' + I.fmt(c.D, 1) + ' cm') + '</text>');
    out.push('<text x="' + f(cx) + '" y="' + f(cx + 21) + '" font-family="Helvetica, Arial, sans-serif" font-size="2.5" text-anchor="middle" fill="#666">' + xmlEsc(t('fr_pdf_cw', { top: c.top })) + '</text>');
    out.push('<text x="' + f(cx) + '" y="' + f(cx + 25.5) + '" font-family="Helvetica, Arial, sans-serif" font-size="2.5" text-anchor="middle" fill="#666">' + xmlEsc(t('s_spacing', { cm: I.fmt(c.chordCm, 2), deg: I.fmt(c.angle, 3) })) + '</text>');
    // barra de 10 cm
    const by = S - 8, bx = cx - 50;
    out.push('<path d="M' + f(bx) + ' ' + f(by) + 'h100' + Array.from({ length: 11 }, (_, q) => 'M' + f(bx + q * 10) + ' ' + f(by) + 'v' + (q % 5 ? 1.8 : 3)).join('') + '" stroke="#000" stroke-width="0.3"/>');
    out.push('<text x="' + f(cx) + '" y="' + f(by + 5.5) + '" font-family="Helvetica, Arial, sans-serif" font-size="2.6" text-anchor="middle">' + xmlEsc(t('fr_pdf_scale')) + '</text>');
    out.push('</svg>');
    return out.join('\n');
  }

  function csv(sp) {
    const c = compute(sp);
    const es = I.lang === 'es', sep = es ? ';' : ',';
    const num = (v, d) => (es ? v.toFixed(d).replace('.', ',') : v.toFixed(d));
    const lines = [t('fr_csv_head').join(sep)];
    for (let i = 0; i < c.N; i++) {
      const a = 2 * Math.PI * i / c.N;
      lines.push([i, num(360 * i / c.N, 4), num(c.r * Math.cos(a), 3), num(-c.r * Math.sin(a), 3), num(i ? c.chordCm : 0, 3)].join(sep));
    }
    return String.fromCharCode(0xFEFF) + lines.join('\r\n') + '\r\n';
  }

  /* ================= abrir / cerrar ================= */
  function specFromProject(p) {
    return {
      name: p.name, nPins: p.nPins, diameterCm: p.diameterCm, pegMm: p.pegMm, threadMm: p.threadMm, bg: p.bg,
      colors: p.colors, blocks: p.blocks, marginPct: p.marginPct, tieCm: p.tieCm, spoolM: p.spoolM, size: p.size
    };
  }

  function open(sp) {
    current = sp;
    lastFocus = root.document.activeElement;
    $('frameSheet').hidden = false;
    root.document.body.classList.add('sheet-open');
    $('frameSheet').scrollTop = 0;
    render();
    setTimeout(() => $('frClose').focus(), 30);
  }
  function close() {
    $('frameSheet').hidden = true;
    root.document.body.classList.remove('sheet-open');
    current = null;
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) { /* nada */ }
  }
  function init() {
    $('frClose').addEventListener('click', close);
    root.document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && current && $('modal').hidden) { e.preventDefault(); close(); }
    });
    root.addEventListener('resize', U.debounce(() => { if (current) render(); }, 250));
  }

  root.HiloFrame = Object.freeze({
    init, open, close, compute, tiling, pdf, svg, csv, specFromProject,
    isOpen: () => !!current,
    refresh: () => { if (current) render(); }
  });
})(self);
