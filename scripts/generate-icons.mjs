/*
  Erzeugt die App-Icons assets/icons/icon-180.png und icon-512.png.
  Motiv: Off-White (Creme) mit einem Sonnenkreis im Verlauf von Butter über Mandarine
  zu Koralle, darum ein weicher Schein. Kein Text. Der Kreis bleibt in der sicheren
  Zone für maskierbare Icons (Radius unter 40 Prozent).
  Ohne Abhängigkeiten: PNG wird direkt mit zlib geschrieben.
  Aufruf: node scripts/generate-icons.mjs
*/

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
const CREME = hex('#F4EFE6');
const STOPS = [
  [0, hex('#F5D96B')],
  [0.55, hex('#F49A5A')],
  [1, hex('#F27A6B')],
];

const SUN_RADIUS = 0.3;
const GLOW_RADIUS = 0.44;
const GLOW_ALPHA = 0.22;

const mix = (a, b, t) => a.map((channel, i) => channel + (b[i] - channel) * t);
const clamp = (value) => Math.min(1, Math.max(0, value));

function gradient(t) {
  for (let i = 1; i < STOPS.length; i += 1) {
    const [end, color] = STOPS[i];
    const [start, previous] = STOPS[i - 1];
    if (t <= end) return mix(previous, color, (t - start) / (end - start));
  }
  return STOPS.at(-1)[1];
}

function pixel(x, y, size) {
  const center = size / 2;
  const dx = x + 0.5 - center;
  const dy = y + 0.5 - center;
  const distance = Math.hypot(dx, dy);
  const radius = SUN_RADIUS * size;

  // Weicher Schein in Butter, läuft nach außen in Creme aus
  const glowT = clamp((distance - radius) / (GLOW_RADIUS * size - radius));
  let color = mix(CREME, STOPS[0][1], GLOW_ALPHA * (1 - glowT) ** 2);

  // Sonnenkreis: Verlauf diagonal von oben links nach unten rechts, Kante geglättet
  const t = clamp(((dx + dy) / Math.SQRT2 / radius + 1) / 2);
  const coverage = clamp(radius - distance + 0.5);
  color = mix(color, gradient(t), coverage);
  return color.map((channel) => Math.round(channel));
}

// PNG-Grundbausteine
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function png(size) {
  const stride = size * 3;
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < size; x += 1) row.set(pixel(x, y, size), x * 3);
    rows.push(row);
  }
  // Paeth-Filter je Zeile, Verläufe komprimieren damit deutlich besser
  const raw = Buffer.alloc((stride + 1) * size);
  rows.forEach((row, y) => {
    const offset = y * (stride + 1);
    raw[offset] = 4;
    const above = rows[y - 1];
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 3 ? row[i - 3] : 0;
      const up = above ? above[i] : 0;
      const upLeft = above && i >= 3 ? above[i - 3] : 0;
      raw[offset + 1 + i] = (row[i] - paeth(left, up, upLeft)) & 0xff;
    }
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 512]) {
  const file = new URL(`../assets/icons/icon-${size}.png`, import.meta.url);
  const data = png(size);
  writeFileSync(file, data);
  console.log(`icon-${size}.png: ${(data.length / 1024).toFixed(1)} KB`);
}
