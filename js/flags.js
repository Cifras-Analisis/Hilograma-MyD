/* Hilograma MyD - banderas en SVG construidas con el DOM (sin innerHTML).
 * Colombia (español) y países de habla principalmente inglesa (inglés). */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let uid = 0;

  function mk(tag, attrs, kids) {
    const e = root.document.createElementNS(NS, tag);
    if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
    if (kids) kids.forEach(c => e.appendChild(c));
    return e;
  }
  const rect = (x, y, w, h, fill) => mk('rect', { x, y, width: w, height: h, fill });
  const poly = (pts, fill, extra) => mk('polygon', Object.assign({ points: pts.map(p => p.join(',')).join(' '), fill }, extra || {}));

  function star(cx, cy, R, n, ratio, fill, extra) {
    const pts = [];
    const r = R * (ratio || 0.4);
    for (let i = 0; i < 2 * n; i++) {
      const a = -Math.PI / 2 + i * Math.PI / n;
      const rr = i % 2 ? r : R;
      pts.push([+(cx + rr * Math.cos(a)).toFixed(3), +(cy + rr * Math.sin(a)).toFixed(3)]);
    }
    return poly(pts, fill, extra);
  }

  // Union Jack en coordenadas 60x30
  function unionJack() {
    const id = ++uid;
    const s = 'uj-s-' + id, tclip = 'uj-t-' + id;
    return [
      mk('defs', null, [
        mk('clipPath', { id: s }, [mk('path', { d: 'M0,0 v30 h60 v-30 z' })]),
        mk('clipPath', { id: tclip }, [mk('path', { d: 'M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z' })])
      ]),
      mk('g', { 'clip-path': 'url(#' + s + ')' }, [
        mk('path', { d: 'M0,0 v30 h60 v-30 z', fill: '#012169' }),
        mk('path', { d: 'M0,0 L60,30 M60,0 L0,30', stroke: '#fff', 'stroke-width': 6 }),
        mk('path', { d: 'M0,0 L60,30 M60,0 L0,30', 'clip-path': 'url(#' + tclip + ')', stroke: '#C8102E', 'stroke-width': 4 }),
        mk('path', { d: 'M30,0 v30 M0,15 h60', stroke: '#fff', 'stroke-width': 10 }),
        mk('path', { d: 'M30,0 v30 M0,15 h60', stroke: '#C8102E', 'stroke-width': 6 })
      ])
    ];
  }

  function mapleLeaf(cx, cy, h, fill) {
    const half = [[0, -1], [0.12, -0.78], [0.25, -0.86], [0.2, -0.42], [0.42, -0.62], [0.5, -0.5],
      [0.72, -0.6], [0.62, -0.3], [0.74, -0.2], [0.38, 0.06], [0.45, 0.22], [0.08, 0.15], [0.06, 0.55]];
    const pts = half.map(p => [cx + p[0] * h, cy + p[1] * h]);
    const mirror = half.slice().reverse().map(p => [cx - p[0] * h, cy + p[1] * h]);
    return poly(pts.concat(mirror).map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]), fill);
  }

  const BUILD = {
    co: () => ({ vb: '0 0 30 20', kids: [rect(0, 0, 30, 10, '#FCD116'), rect(0, 10, 30, 5, '#003893'), rect(0, 15, 30, 5, '#CE1126')] }),
    us: () => {
      const kids = [];
      for (let i = 0; i < 13; i++) kids.push(rect(0, i * 100 / 13, 190, 100 / 13 + 0.05, i % 2 ? '#FFFFFF' : '#B22234'));
      kids.push(rect(0, 0, 76, 700 / 13, '#3C3B6E'));
      const hx = 76 / 12, vy = (700 / 13) / 10;
      for (let r = 0; r < 9; r++) {
        const n = r % 2 ? 5 : 6;
        for (let j = 0; j < n; j++) kids.push(star(hx * (r % 2 ? 2 * j + 2 : 2 * j + 1), vy * (r + 1), 2.6, 5, 0.38, '#FFFFFF'));
      }
      return { vb: '0 0 190 100', kids };
    },
    gb: () => ({ vb: '0 0 60 30', kids: unionJack() }),
    au: () => ({
      vb: '0 0 60 30',
      kids: [rect(0, 0, 60, 30, '#012169'), mk('g', { transform: 'scale(0.5)' }, unionJack()),
        star(15, 22.5, 4.2, 7, 0.45, '#FFFFFF'),
        star(45, 25.5, 2.1, 7, 0.45, '#FFFFFF'), star(37.5, 14.2, 2.1, 7, 0.45, '#FFFFFF'),
        star(45, 4.6, 2.1, 7, 0.45, '#FFFFFF'), star(51.6, 11.9, 2.1, 7, 0.45, '#FFFFFF'),
        star(47.6, 16.4, 1.2, 5, 0.42, '#FFFFFF')]
    }),
    nz: () => ({
      vb: '0 0 60 30',
      kids: [rect(0, 0, 60, 30, '#012169'), mk('g', { transform: 'scale(0.5)' }, unionJack()),
        star(45, 6.2, 2.0, 5, 0.42, '#C8102E', { stroke: '#fff', 'stroke-width': 0.6 }),
        star(39.4, 13.9, 2.1, 5, 0.42, '#C8102E', { stroke: '#fff', 'stroke-width': 0.6 }),
        star(50.4, 12.6, 1.8, 5, 0.42, '#C8102E', { stroke: '#fff', 'stroke-width': 0.6 }),
        star(45, 24.2, 2.3, 5, 0.42, '#C8102E', { stroke: '#fff', 'stroke-width': 0.6 })]
    }),
    ca: () => ({ vb: '0 0 40 20', kids: [rect(0, 0, 40, 20, '#FFFFFF'), rect(0, 0, 10, 20, '#D52B1E'), rect(30, 0, 10, 20, '#D52B1E'), mapleLeaf(20, 9.4, 7.4, '#D52B1E')] }),
    ie: () => ({ vb: '0 0 60 30', kids: [rect(0, 0, 20, 30, '#169B62'), rect(20, 0, 20, 30, '#FFFFFF'), rect(40, 0, 20, 30, '#FF883E')] }),
    jm: () => ({
      vb: '0 0 60 30',
      kids: [rect(0, 0, 60, 30, '#009B3A'), poly([[0, 0], [30, 15], [0, 30]], '#000000'), poly([[60, 0], [30, 15], [60, 30]], '#000000'),
        mk('path', { d: 'M0,0 L60,30 M60,0 L0,30', stroke: '#FED100', 'stroke-width': 4 })]
    }),
    bs: () => ({ vb: '0 0 60 30', kids: [rect(0, 0, 60, 30, '#00778B'), rect(0, 10, 60, 10, '#FFC72C'), poly([[0, 0], [26, 15], [0, 30]], '#000000')] }),
    tt: () => ({
      vb: '0 0 50 30',
      kids: [rect(0, 0, 50, 30, '#DA1A35'), mk('path', { d: 'M-4,-3 L54,33', stroke: '#FFFFFF', 'stroke-width': 13 }),
        mk('path', { d: 'M-4,-3 L54,33', stroke: '#000000', 'stroke-width': 9 })]
    }),
    gy: () => ({
      vb: '0 0 50 30',
      kids: [rect(0, 0, 50, 30, '#009E49'), poly([[0, 0], [50, 15], [0, 30]], '#FFFFFF'), poly([[0, 1.8], [45.5, 15], [0, 28.2]], '#FCD116'),
        poly([[0, 0], [25, 15], [0, 30]], '#000000'), poly([[0, 2.2], [21.4, 15], [0, 27.8]], '#CE1126')]
    })
  };

  function make(id, label) {
    const b = (BUILD[id] || BUILD.co)();
    const svg = mk('svg', { viewBox: b.vb, class: 'flag flag-' + id, role: 'img', 'aria-label': label || id, focusable: 'false' }, b.kids);
    if (label) svg.appendChild(mk('title', null, [root.document.createTextNode(label)]));
    return svg;
  }

  root.HiloFlags = Object.freeze({ make, ids: Object.keys(BUILD) });
})(self);
