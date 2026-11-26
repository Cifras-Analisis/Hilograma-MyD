#!/usr/bin/env node
/* Genera los iconos de Hilograma MyD (SVG y PNG) sin dependencias externas.
 * Motivo: un aro de clavos con la cardioide clasica del string art (i -> 2i mod N).
 * Uso: node tools/make-icons.js */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');
const N = 60;
const BG = [2, 8, 6], NEON = [0, 255, 136], PEG = [201, 255, 227], CYAN = [41, 231, 255];

function design(ringR) {
  const pegs = [], chords = [];
  for (let i = 0; i < N; i++) {
    const a = 2 * Math.PI * i / N - Math.PI / 2;
    pegs.push([0.5 + ringR * Math.cos(a), 0.5 + ringR * Math.sin(a)]);
  }
  for (let i = 0; i < N; i++) chords.push([pegs[i], pegs[(2 * i) % N]]);
  return { pegs, chords };
}

/* ---------- SVG ---------- */
function svg() {
  const { pegs, chords } = design(0.36);
  const f = v => (v * 512).toFixed(1);
  const out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    '<rect width="512" height="512" rx="92" fill="#020806"/>',
    '<circle cx="256" cy="256" r="' + f(0.36) + '" fill="none" stroke="#0c3a25" stroke-width="3"/>',
    '<g stroke="#00ff88" stroke-opacity="0.6" stroke-width="3" stroke-linecap="round">'];
  for (const [a, b] of chords) out.push('<line x1="' + f(a[0]) + '" y1="' + f(a[1]) + '" x2="' + f(b[0]) + '" y2="' + f(b[1]) + '"/>');
  out.push('</g><g fill="#c9ffe3">');
  for (const p of pegs) out.push('<circle cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="5"/>');
  out.push('</g><circle cx="' + f(pegs[0][0]) + '" cy="' + f(pegs[0][1]) + '" r="9" fill="#29e7ff"/></svg>');
  return out.join('\n');
}

/* ---------- rasterizador simple con antialias ---------- */
function raster(size, opts) {
  const px = new Float32Array(size * size * 4);
  const radius = opts.rounded ? 0.18 * size : 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let cov = 1;
    if (radius) {
      const cx = Math.min(Math.max(x + 0.5, radius), size - radius), cy = Math.min(Math.max(y + 0.5, radius), size - radius);
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      cov = Math.min(1, Math.max(0, radius - d + 0.5));
    }
    const i = (y * size + x) * 4;
    px[i] = BG[0]; px[i + 1] = BG[1]; px[i + 2] = BG[2]; px[i + 3] = cov;
  }
  const blend = (x, y, c, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
    const i = (y * size + x) * 4;
    if (px[i + 3] <= 0) return;
    px[i] += (c[0] - px[i]) * a; px[i + 1] += (c[1] - px[i + 1]) * a; px[i + 2] += (c[2] - px[i + 2]) * a;
  };
  const seg = (ax, ay, bx, by, w, c, alpha) => {
    const x0 = Math.floor(Math.min(ax, bx) - w - 1), x1 = Math.ceil(Math.max(ax, bx) + w + 1);
    const y0 = Math.floor(Math.min(ay, by) - w - 1), y1 = Math.ceil(Math.max(ay, by) + w + 1);
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const qx = x + 0.5, qy = y + 0.5;
      const tt = Math.max(0, Math.min(1, ((qx - ax) * dx + (qy - ay) * dy) / L2));
      const d = Math.hypot(qx - (ax + tt * dx), qy - (ay + tt * dy));
      const cov = Math.max(0, Math.min(1, w / 2 + 0.5 - d));
      if (cov > 0) blend(x, y, c, cov * alpha);
    }
  };
  const disc = (cx, cy, r, c) => {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const cov = Math.max(0, Math.min(1, r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
      if (cov > 0) blend(x, y, c, cov);
    }
  };
  const { pegs, chords } = design(opts.ring);
  const s = size, lw = Math.max(1, s * 0.006);
  const ringPts = [];
  for (let i = 0; i <= 180; i++) { const a = 2 * Math.PI * i / 180; ringPts.push([0.5 + opts.ring * Math.cos(a), 0.5 + opts.ring * Math.sin(a)]); }
  for (let i = 0; i < 180; i++) seg(ringPts[i][0] * s, ringPts[i][1] * s, ringPts[i + 1][0] * s, ringPts[i + 1][1] * s, lw, [12, 58, 37], 1);
  for (const [a, b] of chords) seg(a[0] * s, a[1] * s, b[0] * s, b[1] * s, lw, NEON, 0.6);
  for (const p of pegs) disc(p[0] * s, p[1] * s, s * 0.0098, PEG);
  disc(pegs[0][0] * s, pegs[0][1] * s, s * 0.0176, CYAN);
  return px;
}

/* ---------- codificador PNG ---------- */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(px[i]); raw[o + 1] = Math.round(px[i + 1]); raw[o + 2] = Math.round(px[i + 2]); raw[o + 3] = Math.round(px[i + 3] * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg());
fs.writeFileSync(path.join(OUT, 'icon-192.png'), png(192, raster(192, { rounded: true, ring: 0.36 })));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), png(512, raster(512, { rounded: true, ring: 0.36 })));
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), png(512, raster(512, { rounded: false, ring: 0.3 })));
console.log('iconos generados en', OUT);
