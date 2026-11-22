// news-image-20261122 — "Sum up 22 November's world news in one image"
//
// A Node 22 program (standard library only) that draws one editorial
// front-page image of the world's news of Sunday 22 November 2026 and
// writes it as a PNG to /output/entry.png (MAKEFUN_OUTPUT_DIR stands in
// for /output outside the grader's container).
//
// Everything is drawn by code: a small rasterizer, a stroke font, and
// flat editorial scenes. No network, no assets, no randomness beyond a
// fixed-seed jitter, so two runs write the same bytes.
//
// The day's news, as reported on 22 November 2026:
//   LEAD  COP31, the UN climate summit in Antalya, Turkiye, collapsed on
//         Sunday after two weeks and record overtime: the draft deal was
//         rejected by the EU and others because it dropped every mention
//         of fossil fuels. First COP breakdown since Copenhagen 2009.
//   GULF  Iran struck a civilian industrial site in Bahrain (fire, two
//         injured) and at least three tankers were hit in and around the
//         Strait of Hormuz; Tehran said it hit US Patriot radars.
//   UKR.  Russian strikes hit homes in the Kyiv region (dead and missing)
//         and Kryvyi Rih, where a 7-year-old boy was among the killed.
//   MEX.  Cartel leader "El Chapo Isidro" was captured by Mexican special
//         forces in Sinaloa; 11 people died in the raid.
//   IND.  A fire at a candy factory in Cikande, Indonesia, killed 3
//         workers and left dozens missing.
//   ALSO  A boat capsized in Nigeria killing at least 24 people on their
//         way to a funeral; Okinawa's Shuri Castle hall reopened seven
//         years after a fire; an Israeli opposition leader condemned
//         suspected settler arson attacks in the West Bank as terrorism.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------- PNG out

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- canvas

type RGB = [number, number, number];

const SS = 2; // supersample factor
const W = 1024;
const H = 1024;
const CW = W * SS;
const CH = H * SS;
const buf = new Uint8Array(CW * CH * 3);

let clipX0 = 0;
let clipY0 = 0;
let clipX1 = CW;
let clipY1 = CH;

function setClip(x: number, y: number, w: number, h: number): void {
  clipX0 = Math.max(0, Math.floor(x * SS));
  clipY0 = Math.max(0, Math.floor(y * SS));
  clipX1 = Math.min(CW, Math.ceil((x + w) * SS));
  clipY1 = Math.min(CH, Math.ceil((y + h) * SS));
}
function fullClip(): void {
  clipX0 = 0; clipY0 = 0; clipX1 = CW; clipY1 = CH;
}

function px(x: number, y: number, c: RGB, a: number): void {
  if (x < clipX0 || x >= clipX1 || y < clipY0 || y >= clipY1) return;
  const i = (y * CW + x) * 3;
  if (a >= 1) {
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
  } else if (a > 0) {
    buf[i] = Math.round(buf[i] * (1 - a) + c[0] * a);
    buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + c[1] * a);
    buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + c[2] * a);
  }
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
  const x0 = Math.max(clipX0, Math.floor(x * SS));
  const y0 = Math.max(clipY0, Math.floor(y * SS));
  const x1 = Math.min(clipX1, Math.ceil((x + w) * SS));
  const y1 = Math.min(clipY1, Math.ceil((y + h) * SS));
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) px(xx, yy, c, a);
}

function fillCircle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const R = r * SS;
  const x0 = Math.max(clipX0, Math.floor((cx - r) * SS));
  const x1 = Math.min(clipX1, Math.ceil((cx + r) * SS));
  const y0 = Math.max(clipY0, Math.floor((cy - r) * SS));
  const y1 = Math.min(clipY1, Math.ceil((cy + r) * SS));
  const ccx = cx * SS;
  const ccy = cy * SS;
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) {
      const dx = xx - ccx;
      const dy = yy - ccy;
      if (dx * dx + dy * dy <= R * R) px(xx, yy, c, a);
    }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const x0 = Math.max(clipX0, Math.floor((cx - rx) * SS));
  const x1 = Math.min(clipX1, Math.ceil((cx + rx) * SS));
  const y0 = Math.max(clipY0, Math.floor((cy - ry) * SS));
  const y1 = Math.min(clipY1, Math.ceil((cy + ry) * SS));
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) {
      const dx = (xx / SS - cx) / rx;
      const dy = (yy / SS - cy) / ry;
      if (dx * dx + dy * dy <= 1) px(xx, yy, c, a);
    }
}

type Pt = [number, number];

function fillPoly(pts: Pt[], c: RGB, a = 1): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const y0 = Math.max(clipY0, Math.floor(minY * SS));
  const y1 = Math.min(clipY1, Math.ceil(maxY * SS));
  const n = pts.length;
  for (let yy = y0; yy < y1; yy++) {
    const y = yy / SS;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % n];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(clipX0, Math.floor(xs[i] * SS));
      const xb = Math.min(clipX1, Math.ceil(xs[i + 1] * SS));
      for (let xx = xa; xx < xb; xx++) px(xx, yy, c, a);
    }
  }
}

function strokeLine(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB, a = 1): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) { fillCircle(x1, y1, w / 2, c, a); return; }
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  fillPoly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], c, a);
  fillCircle(x1, y1, w / 2, c, a);
  fillCircle(x2, y2, w / 2, c, a);
}

function strokePath(pts: Pt[], w: number, c: RGB, a = 1): void {
  for (let i = 0; i + 1 < pts.length; i++) strokeLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c, a);
  if (pts.length === 1) fillCircle(pts[0][0], pts[0][1], w * 0.72, c, a);
}

function vGrad(x: number, y: number, w: number, h: number, top: RGB, bot: RGB): void {
  const y0 = Math.max(clipY0, Math.floor(y * SS));
  const y1 = Math.min(clipY1, Math.ceil((y + h) * SS));
  const x0 = Math.max(clipX0, Math.floor(x * SS));
  const x1 = Math.min(clipX1, Math.ceil((x + w) * SS));
  for (let yy = y0; yy < y1; yy++) {
    const t = (yy / SS - y) / h;
    const c: RGB = [
      Math.round(top[0] + (bot[0] - top[0]) * t),
      Math.round(top[1] + (bot[1] - top[1]) * t),
      Math.round(top[2] + (bot[2] - top[2]) * t),
    ];
    for (let xx = x0; xx < x1; xx++) px(xx, yy, c, 1);
  }
}

function downsample(): Uint8Array {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SS; dy++)
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * CW + (x * SS + dx)) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      const o = (y * W + x) * 3;
      const n = SS * SS;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  return out;
}

// deterministic jitter for smoke, crowds, texture
let seed = 20261122;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

// ---------------------------------------------------------------- font
// A stroke font on a 6 x 8 grid (x right, y down). Each glyph is a list of
// strokes; each stroke is a list of points. A one-point stroke is a dot.

const G: Record<string, Pt[][]> = {
  A: [[[0, 8], [3, 0], [6, 8]], [[1.3, 5.2], [4.7, 5.2]]],
  B: [[[0, 0], [0, 8]], [[0, 0], [3.6, 0], [4.9, 1.3], [4.9, 2.7], [3.6, 4], [0, 4]], [[0, 4], [3.9, 4], [5.3, 5.3], [5.3, 6.7], [3.9, 8], [0, 8]]],
  C: [[[5.7, 1.7], [4.2, 0.3], [2, 0], [0.7, 1.1], [0, 3], [0, 5], [0.7, 6.9], [2, 8], [4.2, 8], [5.7, 6.3]]],
  D: [[[0, 0], [0, 8]], [[0, 0], [3.3, 0], [5.1, 1.8], [5.6, 4], [5.1, 6.2], [3.3, 8], [0, 8]]],
  E: [[[5.4, 0], [0, 0], [0, 8], [5.4, 8]], [[0, 4], [4.3, 4]]],
  F: [[[5.4, 0], [0, 0], [0, 8]], [[0, 4], [4.2, 4]]],
  G: [[[5.7, 1.7], [4.2, 0.3], [2, 0], [0.7, 1.1], [0, 3], [0, 5], [0.7, 6.9], [2, 8], [4.4, 8], [5.9, 6.9], [5.9, 4.7], [3.4, 4.7]]],
  H: [[[0, 0], [0, 8]], [[6, 0], [6, 8]], [[0, 4], [6, 4]]],
  I: [[[3, 0], [3, 8]], [[1.1, 0], [4.9, 0]], [[1.1, 8], [4.9, 8]]],
  J: [[[3.7, 0], [5.7, 0]], [[5.7, 0], [5.7, 6], [4.5, 7.6], [2.5, 8], [0.9, 7.1], [0.1, 5.4]]],
  K: [[[0, 0], [0, 8]], [[5.7, 0], [0.7, 4.1]], [[1.8, 5.1], [5.9, 8]]],
  L: [[[0, 0], [0, 8], [5.4, 8]]],
  M: [[[0, 8], [0, 0], [3, 4.8], [6, 0], [6, 8]]],
  N: [[[0, 8], [0, 0], [6, 8], [6, 0]]],
  O: [[[2, 0], [4, 0], [5.6, 1.6], [6, 4], [5.6, 6.4], [4, 8], [2, 8], [0.4, 6.4], [0, 4], [0.4, 1.6], [2, 0]]],
  P: [[[0, 8], [0, 0]], [[0, 0], [3.8, 0], [5.2, 1.4], [5.2, 2.9], [3.8, 4.2], [0, 4.2]]],
  Q: [[[2, 0], [4, 0], [5.6, 1.6], [6, 4], [5.6, 6.4], [4, 8], [2, 8], [0.4, 6.4], [0, 4], [0.4, 1.6], [2, 0]], [[3.7, 5.7], [6.3, 8.5]]],
  R: [[[0, 8], [0, 0]], [[0, 0], [3.8, 0], [5.2, 1.4], [5.2, 2.9], [3.8, 4.2], [0, 4.2]], [[2.9, 4.2], [5.8, 8]]],
  S: [[[5.4, 1.6], [4.2, 0.3], [1.9, 0], [0.6, 1.3], [0.6, 2.7], [1.9, 3.9], [4.2, 4.7], [5.4, 5.9], [5.4, 6.9], [4.2, 8], [1.9, 8], [0.6, 6.7]]],
  T: [[[0, 0], [6, 0]], [[3, 0], [3, 8]]],
  U: [[[0, 0], [0, 5.7], [1.1, 7.4], [3, 8], [4.9, 7.4], [6, 5.7], [6, 0]]],
  V: [[[0, 0], [3, 8], [6, 0]]],
  W: [[[0, 0], [1.4, 8], [3, 3.2], [4.6, 8], [6, 0]]],
  X: [[[0, 0], [6, 8]], [[6, 0], [0, 8]]],
  Y: [[[0, 0], [3, 3.7], [6, 0]], [[3, 3.7], [3, 8]]],
  Z: [[[0, 0], [6, 0], [0, 8], [6, 8]]],
  '0': [[[1.9, 0], [4.1, 0], [5.7, 1.8], [5.7, 6.2], [4.1, 8], [1.9, 8], [0.3, 6.2], [0.3, 1.8], [1.9, 0]]],
  '1': [[[1.5, 1.7], [3.4, 0], [3.4, 8]], [[1.3, 8], [5.1, 8]]],
  '2': [[[0.6, 1.9], [1.9, 0.3], [4.1, 0], [5.4, 1.6], [5.4, 3.1], [0.4, 8], [5.6, 8]]],
  '3': [[[0.6, 1.5], [2, 0.2], [4, 0], [5.2, 1.4], [5.2, 2.7], [3.9, 4], [2.1, 4]], [[3.9, 4], [5.4, 5.3], [5.4, 6.7], [4, 8], [1.9, 8], [0.6, 6.6]]],
  '4': [[[3.9, 8], [3.9, 0], [0.3, 5.7], [6, 5.7]]],
  '5': [[[5.4, 0], [0.6, 0], [0.6, 3.5], [2.1, 2.8], [4.1, 3.1], [5.3, 4.7], [5.3, 6.6], [4.1, 8], [1.8, 8], [0.4, 6.7]]],
  '6': [[[5.1, 1.5], [3.5, 0.2], [1.7, 0.9], [0.6, 3.2], [0.6, 5.6], [1.6, 7.4], [3.2, 8], [4.8, 7.3], [5.4, 5.5], [4.8, 3.9], [3.2, 3.3], [1.7, 3.7], [0.6, 5.2]]],
  '7': [[[0.4, 0], [5.6, 0], [2.7, 8]]],
  '8': [[[2, 0], [4, 0], [5, 1.2], [5, 2.6], [4, 3.8], [2, 4], [1, 2.6], [1, 1.2], [2, 0]], [[2, 4], [4.1, 4], [5.4, 5.4], [5.4, 6.8], [4.1, 8], [1.9, 8], [0.6, 6.8], [0.6, 5.4], [2, 4]]],
  '9': [[[0.9, 6.5], [2.5, 7.9], [4.3, 7.7], [5.4, 5.1], [5.4, 2.5], [4.4, 0.7], [2.8, 0], [1.2, 0.8], [0.6, 2.5], [1.2, 4.1], [2.8, 4.7], [4.3, 4.3], [5.4, 2.7]]],
  '.': [[[3, 7.5]]],
  ',': [[[3, 7.3]], [[3.4, 7.5], [2.5, 8.8]]],
  ':': [[[3, 2]], [[3, 6.3]]],
  ';': [[[3, 2]], [[3, 6.3]], [[3.4, 6.5], [2.5, 8.6]]],
  '!': [[[3, 0], [3, 5.3]], [[3, 7.5]]],
  '?': [[[0.8, 1.7], [2, 0.3], [4.1, 0], [5.2, 1.4], [5.2, 2.7], [3.2, 4.3], [3.2, 5.4]], [[3.2, 7.5]]],
  "'": [[[3.5, 0], [3, 1.9]]],
  '-': [[[1.2, 4], [4.8, 4]]],
  ':mdash:': [[[0.3, 4], [5.7, 4]]],
  '•': [[[3, 4]]],
  '+': [[[3, 1.7], [3, 6.3]], [[0.9, 4], [5.1, 4]]],
  '/': [[[5.2, 0], [0.8, 8]]],
  '(': [[[4.5, 0], [2.5, 2], [1.9, 4], [2.5, 6], [4.5, 8]]],
  ')': [[[1.5, 0], [3.5, 2], [4.1, 4], [3.5, 6], [1.5, 8]]],
  '"': [[[1.7, 0], [1.4, 1.8]], [[4.3, 0], [4, 1.8]]],
  '%': [[[5.4, 0], [0.6, 8]]],
};

const ADV = 7.0; // glyph advance in grid units
const SPACE_ADV = 4.0;

function charAdvance(ch: string): number {
  return ch === ' ' ? SPACE_ADV : ADV;
}

function textWidth(s: string, size: number): number {
  const scale = size / 8;
  let w = 0;
  for (const ch of s.toUpperCase()) w += charAdvance(ch) * scale;
  return w - 1.0 * scale; // last glyph needs no trailing gap
}

function drawGlyph(ch: string, x: number, y: number, size: number, c: RGB, bold: boolean): void {
  const glyph = G[ch] ?? (ch === '—' ? G[':mdash:'] : ch === '’' ? G["'"] : ch === '“' || ch === '”' ? G['"'] : undefined);
  if (!glyph) return;
  const scale = size / 8;
  const lw = Math.max(1.5, size * (bold ? 0.155 : 0.115));
  for (const stroke of glyph) {
    const pts: Pt[] = stroke.map(([gx, gy]) => [x + gx * scale, y + gy * scale]);
    strokePath(pts, lw, c);
  }
}

function drawText(s: string, x: number, y: number, size: number, c: RGB, bold = false): void {
  const scale = size / 8;
  let cx = x;
  for (const ch of s.toUpperCase()) {
    if (ch !== ' ') drawGlyph(ch, cx, y, size, c, bold);
    cx += charAdvance(ch) * scale;
  }
}

function drawTextC(s: string, cx: number, y: number, size: number, c: RGB, bold = false): void {
  drawText(s, cx - textWidth(s, size) / 2, y, size, c, bold);
}

function drawTextR(s: string, rx: number, y: number, size: number, c: RGB, bold = false): void {
  drawText(s, rx - textWidth(s, size), y, size, c, bold);
}

// Shrink size until the line fits maxW; returns the size used.
function fitSize(s: string, size: number, maxW: number): number {
  let sz = size;
  while (sz > 8 && textWidth(s, sz) > maxW) sz -= 1;
  return sz;
}

function drawTextFitC(s: string, cx: number, y: number, size: number, maxW: number, c: RGB, bold = false): number {
  const sz = fitSize(s, size, maxW);
  drawTextC(s, cx, y, sz, c, bold);
  return sz;
}

function wrapText(s: string, size: number, maxW: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? cur + ' ' + word : word;
    if (textWidth(next, size) <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw wrapped text, shrinking the size until it fits maxLines lines.
// Returns the total height drawn.
function drawWrappedFit(s: string, x: number, y: number, size: number, maxW: number, maxLines: number, lh: number, c: RGB, bold = false): number {
  let sz = size;
  let lines = wrapText(s, sz, maxW);
  while (lines.length > maxLines && sz > 9) {
    sz -= 0.5;
    lines = wrapText(s, sz, maxW);
  }
  for (let i = 0; i < lines.length; i++) drawText(lines[i], x, y + i * lh * (sz / size), sz, c, bold);
  return lines.length * lh * (sz / size);
}

function ring(cx: number, cy: number, r: number, w: number, c: RGB): void {
  const pts: Pt[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  strokePath(pts, w, c);
}

// ---------------------------------------------------------------- palette

const PAPER: RGB = [246, 242, 230];
const INK: RGB = [33, 35, 44];
const RED: RGB = [178, 44, 36];
const DARKRED: RGB = [138, 30, 26];
const TEAL: RGB = [17, 99, 114];
const SEA: RGB = [34, 86, 122];
const SEALIGHT: RGB = [86, 138, 168];
const AMBER: RGB = [233, 158, 52];
const ORANGE: RGB = [216, 110, 38];
const SMOKE: RGB = [96, 97, 103];
const GREY: RGB = [122, 123, 129];
const LIGHT: RGB = [208, 205, 196];
const GREEN: RGB = [58, 122, 74];
const SAND: RGB = [228, 206, 158];
const BROWN: RGB = [122, 84, 50];
const NAVY: RGB = [38, 54, 86];
const SKY: RGB = [203, 224, 233];
const CREAM: RGB = [252, 249, 240];

// ---------------------------------------------------------------- helpers

function panelFrame(x: number, y: number, w: number, h: number, lw = 3): void {
  fillRect(x, y, w, lw, INK);
  fillRect(x, y + h - lw, w, lw, INK);
  fillRect(x, y, lw, h, INK);
  fillRect(x + w - lw, y, lw, h, INK);
}

function smoke(x: number, y: number, n: number, spread: number, r0: number, rise: number, alpha: number): void {
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const cx = x + (rnd() - 0.5) * spread * (0.4 + t) + t * spread * 0.5;
    const cy = y - t * rise;
    const r = r0 * (0.7 + t * 1.5) * (0.8 + rnd() * 0.5);
    fillCircle(cx, cy, r, SMOKE, alpha * (1 - t * 0.45));
  }
}

function flame(x: number, y: number, w: number, h: number): void {
  // layered teardrop flames, base at (x, y)
  const layers: [RGB, number][] = [[DARKRED, 1], [ORANGE, 0.78], [AMBER, 0.52]];
  for (const [c, s] of layers) {
    const bw = w * s;
    const bh = h * s;
    const bx = x + (w - bw) / 2;
    const by = y;
    fillPoly([
      [bx, by], [bx + bw * 0.16, by - bh * 0.42], [bx + bw * 0.36, by - bh * 0.2],
      [bx + bw * 0.5, by - bh], [bx + bw * 0.66, by - bh * 0.3],
      [bx + bw * 0.85, by - bh * 0.5], [bx + bw, by],
    ], c);
  }
}

function person(x: number, y: number, h: number, suit: RGB, skin: RGB): void {
  // standing figure, feet at y
  const headR = h * 0.11;
  fillCircle(x, y - h + headR, headR, skin);
  fillPoly([
    [x - h * 0.16, y], [x - h * 0.13, y - h * 0.62], [x - h * 0.05, y - h * 0.74],
    [x + h * 0.05, y - h * 0.74], [x + h * 0.13, y - h * 0.62], [x + h * 0.16, y],
  ], suit);
}

function seatedFigure(x: number, y: number, s: number, suit: RGB, skin: RGB): void {
  // delegate seen from the front, seated at a table edge; head + shoulders
  fillCircle(x, y - s * 0.52, s * 0.30, skin);
  fillPoly([
    [x - s * 0.62, y], [x - s * 0.55, y - s * 0.34], [x - s * 0.2, y - s * 0.44],
    [x + s * 0.2, y - s * 0.44], [x + s * 0.55, y - s * 0.34], [x + s * 0.62, y],
  ], suit);
}

// ---------------------------------------------------------------- header

function drawHeader(): void {
  fillRect(0, 0, W, H, PAPER);
  drawTextC('SUNDAY — THE DAY IN ONE IMAGE', W / 2, 26, 27, TEAL, true);
  drawTextFitC('22 NOVEMBER 2026', W / 2, 62, 88, 940, INK, true);
  fillRect(36, 168, 952, 7, RED);
  fillRect(36, 181, 952, 2.5, INK);
}

// ---------------------------------------------------------------- lead: COP31

function drawLead(): void {
  const X = 36, Y = 198, Wd = 952, Ht = 396;
  setClip(X, Y, Wd, Ht);
  vGrad(X, Y, Wd, Ht, [219, 232, 226], [240, 231, 205]);

  // headline block
  drawText('COP31 COLLAPSES', X + 26, Y + 16, 60, INK, true);
  drawText('CLIMATE SUMMIT ENDS WITH NO DEAL', X + 28, Y + 86, 26, DARKRED, true);
  fillRect(X + 26, Y + 124, 600, 3, INK, 0.55);

  // flags of many nations along the back wall
  const flagCols: RGB[] = [
    [38, 84, 150], [178, 44, 36], [58, 122, 74], [233, 158, 52], [17, 99, 114],
    [240, 238, 230], [120, 60, 130], [30, 30, 34], [86, 138, 168], [196, 90, 40],
    [44, 110, 60], [150, 40, 60], [70, 70, 140], [210, 170, 60], [90, 140, 90],
    [160, 60, 90], [50, 110, 150], [200, 120, 50],
  ];
  for (let i = 0; i < flagCols.length; i++) {
    const fx = X + 26 + i * 51;
    fillRect(fx, Y + 140, 34, 21, flagCols[i], 0.85);
    fillRect(fx, Y + 140, 34, 3, PAPER, 0.5);
  }

  // the rejected draft, held up centre-left: two torn halves, the words
  // FOSSIL FUELS struck through in red
  const docCx = X + 336, docY = Y + 178;
  fillPoly([[docCx - 152, docY], [docCx - 10, docY - 10], [docCx - 20, docY + 26], [docCx - 6, docY + 48], [docCx - 18, docY + 80], [docCx - 144, docY + 72]], CREAM);
  fillPoly([[docCx + 18, docY - 20], [docCx + 158, docY - 12], [docCx + 152, docY + 70], [docCx + 14, docY + 60], [docCx + 26, docY + 34], [docCx + 12, docY + 8]], CREAM);
  strokePath([[docCx - 152, docY], [docCx - 10, docY - 10], [docCx - 20, docY + 26], [docCx - 6, docY + 48], [docCx - 18, docY + 80], [docCx - 144, docY + 72], [docCx - 152, docY]], 2, GREY);
  strokePath([[docCx + 18, docY - 20], [docCx + 158, docY - 12], [docCx + 152, docY + 70], [docCx + 14, docY + 60], [docCx + 26, docY + 34], [docCx + 12, docY + 8], [docCx + 18, docY - 20]], 2, GREY);
  for (let i = 0; i < 2; i++) {
    fillRect(docCx - 128, docY + 44 + i * 13, 96, 5, GREY, 0.75);
    fillRect(docCx + 42, docY + 34 + i * 13, 96, 5, GREY, 0.75);
  }
  const ff = 'FOSSIL FUELS';
  const ffSize = 30;
  const ffW = textWidth(ff, ffSize);
  drawText(ff, docCx - ffW / 2, docY + 2, ffSize, RED, true);
  strokeLine(docCx - ffW / 2 - 10, docY + 16, docCx + ffW / 2 + 10, docY + 11, 5.5, RED);

  // the globe, right side, with a thermometer against it
  const gx = X + 788, gy = Y + 252, gr = 88;
  fillCircle(gx, gy, gr + 7, CREAM);
  fillCircle(gx, gy, gr, [52, 116, 148]);
  setClip(gx - gr, gy - gr, gr * 2, gr * 2);
  fillPoly([[gx - 58, gy - 52], [gx - 18, gy - 68], [gx - 4, gy - 40], [gx - 24, gy - 16], [gx - 48, gy - 24]], GREEN);
  fillPoly([[gx - 28, gy + 2], [gx - 2, gy - 6], [gx + 4, gy + 24], [gx - 8, gy + 48], [gx - 22, gy + 28]], GREEN);
  fillPoly([[gx + 20, gy - 56], [gx + 56, gy - 48], [gx + 64, gy - 18], [gx + 36, gy - 24], [gx + 22, gy - 36]], SAND);
  fillPoly([[gx + 28, gy + 8], [gx + 52, gy + 2], [gx + 58, gy + 28], [gx + 34, gy + 40], [gx + 24, gy + 22]], GREEN);
  fillEllipse(gx + 52, gy + 60, 15, 8, SAND);
  setClip(X, Y, Wd, Ht);
  ring(gx, gy, gr - 1, 2, [30, 80, 104]);
  // thermometer
  const tx = X + 906;
  strokeLine(tx, Y + 158, tx, Y + 268, 15, INK);
  strokeLine(tx, Y + 158, tx, Y + 268, 9, CREAM);
  fillCircle(tx, Y + 282, 18, INK);
  fillCircle(tx, Y + 282, 13.5, RED);
  strokeLine(tx, Y + 176, tx, Y + 276, 7, RED);
  for (let i = 0; i < 4; i++) strokeLine(tx + 11, Y + 168 + i * 24, tx + 20, Y + 168 + i * 24, 2.4, INK);

  // conference table with delegates on both sides
  const tableY = Y + 268;
  const suits: RGB[] = [NAVY, [70, 72, 80], [86, 54, 44], [44, 74, 60], [96, 84, 110], [60, 60, 66]];
  const skins: RGB[] = [[232, 190, 150], [168, 118, 82], [240, 205, 168], [120, 82, 56], [214, 164, 120]];
  for (let i = 0; i < 6; i++) {
    seatedFigure(X + 108 + i * 86, tableY + 40, 38, suits[i % suits.length], skins[i % skins.length]);
  }
  fillPoly([[X + 56, tableY + 38], [X + 616, tableY + 38], [X + 656, tableY + 84], [X + 24, tableY + 84]], BROWN);
  fillPoly([[X + 56, tableY + 38], [X + 616, tableY + 38], [X + 628, tableY + 52], [X + 44, tableY + 52]], [158, 114, 70]);
  // gavel resting on the table, left end
  strokeLine(X + 92, tableY + 44, X + 138, tableY + 28, 8, [84, 56, 32]);
  fillPoly([[X + 130, tableY + 6], [X + 156, tableY + 14], [X + 148, tableY + 38], [X + 122, tableY + 30]], [104, 70, 38]);
  // near-side delegates, backs to the viewer along the bottom edge
  for (let i = 0; i < 6; i++) {
    seatedFigure(X + 128 + i * 88, tableY + 132, 46, suits[(i + 3) % suits.length], skins[(i + 2) % skins.length]);
  }

  fullClip();
  panelFrame(X, Y, Wd, Ht);
  // location tag, sized to its text
  const tag = 'ANTALYA, TURKIYE';
  const tagW = textWidth(tag, 21) + 30;
  fillRect(X + Wd - tagW, Y + Ht - 38, tagW, 38, INK);
  drawTextC(tag, X + Wd - tagW / 2, Y + Ht - 29, 21, PAPER, true);
}

// ---------------------------------------------------------------- panels

function storyPanel(x: number, scene: (x: number, y: number, w: number, h: number) => void, headline: string, sub: string): void {
  const Y0 = 614, Wd = 227, Ht = 272, sceneH = 140;
  setClip(x, Y0, Wd, sceneH);
  scene(x, Y0, Wd, sceneH);
  fullClip();
  fillRect(x, Y0 + sceneH, Wd, Ht - sceneH, PAPER);
  fillRect(x, Y0 + sceneH, Wd, 2.5, INK);
  let cy = Y0 + sceneH + 12;
  cy += drawWrappedFit(headline, x + 10, cy, 21, Wd - 20, 2, 26, INK, true);
  drawWrappedFit(sub, x + 10, cy + 3, 16, Wd - 20, 3, 20, [70, 70, 78]);
  panelFrame(x, Y0, Wd, Ht);
}

function tanker(x: number, y: number, s: number): void {
  fillPoly([[x, y], [x + 118 * s, y], [x + 105 * s, y + 14 * s], [x + 13 * s, y + 14 * s]], [38, 42, 52]);
  fillRect(x + 10 * s, y - 8 * s, 78 * s, 8 * s, [186, 92, 44]);
  fillRect(x + 30 * s, y - 13 * s, 30 * s, 5 * s, [96, 120, 140]);
  fillRect(x + 92 * s, y - 24 * s, 16 * s, 24 * s, [226, 226, 221]);
  fillRect(x + 96 * s, y - 19 * s, 8 * s, 4 * s, SEA);
  fillRect(x + 99 * s, y - 30 * s, 3 * s, 7 * s, [60, 62, 68]);
}

function sceneHormuz(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, [168, 200, 214], SEA);
  fillCircle(x + 30, y + 24, 13, [250, 226, 160], 0.9);
  tanker(x + 78, y + 52, 0.78);
  tanker(x + 14, y + 106, 1.28);
  // the near tanker is hit amidships: flame and smoke
  flame(x + 66, y + 96, 30, 46);
  smoke(x + 84, y + 62, 7, 26, 9, 44, 0.5);
  // an incoming missile and its trail
  for (let i = 0; i < 9; i++) {
    const t = i / 9;
    fillCircle(x + 208 - t * 62, y + 8 + t * 40, 3.4 - t * 1.6, [240, 240, 238], 0.75 - t * 0.4);
  }
  fillPoly([[x + 138, y + 52], [x + 152, y + 44], [x + 156, y + 52], [x + 152, y + 60]], [226, 226, 221]);
  fillPoly([[x + 138, y + 52], [x + 130, y + 47], [x + 131, y + 57]], ORANGE);
  // water lines
  for (let i = 0; i < 5; i++) {
    strokeLine(x + 14 + rnd() * 30, y + 122 + i * 4, x + 60 + rnd() * 120, y + 122 + i * 4, 1.6, [210, 228, 238], 0.5);
  }
}

function sceneUkraine(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, [66, 70, 94], [148, 106, 86]);
  // apartment block with a notched, broken roofline
  const bx = x + 52, bw = 126, by = y + 26, bh = 114;
  fillPoly([
    [bx, y + h], [bx, by + 16], [bx + 18, by + 16], [bx + 26, by], [bx + 62, by],
    [bx + 70, by + 10], [bx + bw, by + 6], [bx + bw, y + h],
  ], [92, 90, 98]);
  // windows
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 5; c++) {
      const wx = bx + 10 + c * 23, wy = by + 14 + r * 17;
      const k = (r * 5 + c) % 7;
      if (k === 3 || k === 5) {
        fillRect(wx, wy, 12, 9, [36, 38, 48]);
        strokeLine(wx, wy, wx + 12, wy + 9, 1.6, [170, 170, 175]);
        strokeLine(wx + 12, wy, wx, wy + 9, 1.6, [170, 170, 175]);
      } else if (k === 1 || k === 4) {
        fillRect(wx, wy, 12, 9, AMBER, 0.92);
      } else {
        fillRect(wx, wy, 12, 9, [48, 50, 62]);
      }
    }
  }
  // one flat burns
  fillEllipse(bx + 56, by + 48, 15, 10, ORANGE, 0.85);
  flame(bx + 46, by + 50, 20, 30);
  smoke(bx + 128, by + 2, 8, 30, 10, 30, 0.55);
  // missile trail arcing in
  for (let i = 0; i < 10; i++) {
    const t = i / 10;
    fillCircle(x + 8 + t * 96, y + 4 + t * t * 44, 3.2 - t * 1.4, [238, 236, 232], 0.8 - t * 0.45);
  }
  fillRect(x, y + h - 10, w, 10, [40, 38, 44]);
}

function sceneMexico(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, [243, 224, 172], [230, 192, 132]);
  fillCircle(x + w - 34, y + 26, 15, AMBER);
  fillPoly([[x, y + 92], [x + 52, y + 58], [x + 104, y + 92]], [168, 128, 84]);
  fillPoly([[x + 76, y + 92], [x + 140, y + 52], [x + w, y + 92]], [146, 108, 70]);
  fillRect(x, y + 92, w, h - 92, [216, 178, 120]);
  // cactus
  fillRect(x + 16, y + 76, 9, 40, GREEN);
  fillRect(x + 6, y + 88, 6, 16, GREEN);
  fillRect(x + 6, y + 88, 16, 6, GREEN);
  fillRect(x + 26, y + 82, 6, 18, GREEN);
  fillRect(x + 19, y + 94, 13, 6, GREEN);
  // two officers
  person(x + 44, y + 132, 62, NAVY, [214, 164, 120]);
  fillRect(x + 36, y + 66, 17, 5, NAVY);
  person(x + w - 44, y + 132, 62, NAVY, [168, 118, 82]);
  fillRect(x + w - 52, y + 66, 17, 5, NAVY);
  // big handcuffs in the middle
  const cy = y + 92;
  ring(x + w / 2 - 24, cy, 20, 7.5, [52, 54, 60]);
  ring(x + w / 2 + 24, cy, 20, 7.5, [52, 54, 60]);
  ring(x + w / 2 - 6, cy - 16, 6, 4.5, [52, 54, 60]);
  ring(x + w / 2 + 6, cy - 16, 6, 4.5, [52, 54, 60]);
  ring(x + w / 2, cy - 20, 6, 4.5, [52, 54, 60]);
}

function sceneIndonesia(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, [206, 224, 230], [240, 234, 218]);
  // factory block with a sawtooth roof
  const bx = x + 14, bw = 186, by = y + 66;
  fillRect(bx, by, bw, y + h - by, [110, 102, 96]);
  for (let i = 0; i < 4; i++) {
    const tx0 = bx + i * 46;
    fillPoly([[tx0, by], [tx0 + 22, by - 18], [tx0 + 46, by]], [88, 80, 76]);
  }
  fillRect(bx + 26, by - 40, 13, 42, [96, 88, 84]);
  fillRect(bx + 148, by - 34, 13, 36, [96, 88, 84]);
  for (let i = 0; i < 6; i++) fillRect(bx + 12 + i * 30, by + 16, 16, 12, [52, 54, 60]);
  // the roof is alight
  flame(bx + 30, by - 2, 30, 46);
  flame(bx + 82, by - 4, 36, 54);
  flame(bx + 138, by - 2, 28, 42);
  smoke(bx + 96, by - 46, 8, 44, 11, 26, 0.5);
  // fire truck
  fillRect(x + 122, y + 114, 56, 17, [188, 44, 36]);
  fillRect(x + 172, y + 120, 24, 11, [188, 44, 36]);
  fillRect(x + 176, y + 113, 14, 8, [188, 44, 36]);
  fillRect(x + 179, y + 115, 8, 5, SKY);
  fillRect(x + 122, y + 121, 56, 3.5, CREAM);
  fillCircle(x + 136, y + 132, 6.5, [40, 40, 44]);
  fillCircle(x + 184, y + 132, 6.5, [40, 40, 44]);
  strokeLine(x + 130, y + 112, x + 84, y + 74, 3.5, [210, 210, 206]);
  fillCircle(x + 183, y + 110, 3.4, AMBER);
  fillCircle(x + 189, y + 110, 3.4, RED);
}

function drawPanels(): void {
  storyPanel(36, sceneHormuz, 'HORMUZ TANKERS HIT', 'IRAN STRIKES BAHRAIN. TANKERS HIT IN THE STRAIT');
  storyPanel(277, sceneUkraine, 'RUSSIA HITS UKRAINE', 'KYIV HOMES STRUCK. CHILD AMONG DEAD IN KRYVYI RIH');
  storyPanel(518, sceneMexico, 'CARTEL BOSS CAUGHT', "'EL CHAPO ISIDRO' HELD IN SINALOA. 11 DIE IN RAID");
  storyPanel(759, sceneIndonesia, 'FACTORY FIRE KILLS 3', 'DOZENS MISSING AT CIKANDE CANDY FACTORY');
}

// ---------------------------------------------------------------- strip

function drawStrip(): void {
  const Y0 = 902, Ht = 86;
  fillRect(36, Y0, 952, Ht, INK);
  fillRect(36, Y0, 148, 25, RED);
  drawTextC('ALSO TODAY', 36 + 74, Y0 + 5, 15.5, PAPER, true);
  const items = [
    'NIGERIA: 24 DIE AS BOAT CAPSIZES',
    'SHURI CASTLE REOPENS IN OKINAWA',
    'WEST BANK ARSON CALLED TERRORISM',
  ];
  const cols = [36, 352, 668];
  for (let i = 0; i < 3; i++) {
    if (i > 0) fillRect(cols[i] - 18, Y0 + 36, 2, 42, PAPER, 0.35);
    drawWrappedFit(items[i], cols[i] + 4, Y0 + 38, 19, 294, 2, 24, PAPER, true);
  }
}

// ---------------------------------------------------------------- main

drawHeader();
drawLead();
drawPanels();
drawStrip();

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePNG(W, H, downsample()));
