// The mountain itself: a height function, the camps along the route, the
// ponds, and fast height lookups that match the rendered triangles exactly.
// Pure JavaScript (no three.js) so it can be tested in Node.

import { makeNoise2D, fbm, ridged } from './noise.js';

export const WORLD = 1400;
export const HALF = WORLD / 2;
export const SEG = 256;
export const CELL = WORLD / SEG;
export const WATER = 1.2;
export const BOUND_R = 628;
export const ALT_BASE = 1350;
export const ALT_SUMMIT = 8849;

const PEAK = 300;
const SIG = 170;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (dx, dz, s) => Math.exp(-(dx * dx + dz * dz) / (2 * s * s));

const nA = makeNoise2D(1337);
const nB = makeNoise2D(4242);
const nC = makeNoise2D(777);
const nD = makeNoise2D(9001);

export const noises = { nA, nB, nC, nD };

export const LAKES = [
  { x: 135, z: 395, s: 36, depth: 27 },
  { x: -285, z: 390, s: 42, depth: 20 },
  { x: 375, z: 255, s: 38, depth: 21 },
];

function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  const g = Math.exp(-(r * r) / (2 * SIG * SIG));
  const near = smoothstep(4, 120, r);
  const rid = ridged(nA, x * 0.0045, z * 0.0045, 4);
  // Gullies carved between ridges that run down from the summit
  let h = PEAK * g * (1 - near * clamp(1 - rid, 0, 1) * 0.38);
  // Shoulder peaks on the far side of the massif
  h += 60 * gauss(x - 160, z + 130, 70) + 45 * gauss(x + 175, z + 40, 55) + 50 * gauss(x - 40, z - 210, 70);
  // Valley floor: rolling meadows and lakes
  const valley = 1 - g;
  h += 4 + fbm(nB, x * 0.008, z * 0.008, 4) * 10 * valley;
  // Rocky detail, rougher higher up
  h += fbm(nC, x * 0.045, z * 0.045, 3) * (0.6 + 1.8 * g);
  // Lake basins in the valley
  for (let k = 0; k < LAKES.length; k++) {
    const L = LAKES[k];
    h -= L.depth * gauss(x - L.x, z - L.z, L.s);
  }
  // A ring of mountains that closes the valley in
  const ring = smoothstep(520, 700, r);
  h += ring * (100 + 110 * ridged(nD, x * 0.005 + 9, z * 0.005 - 4, 4));
  return h;
}

// ---- Route: camps placed along a spiral that climbs to the summit ----

function findRadius(theta, target) {
  for (let r = 500; r > 12; r -= 0.5) {
    if (rawHeight(r * Math.cos(theta), r * Math.sin(theta)) >= target) return r;
  }
  return 12;
}

const T0 = Math.PI / 2;
const campDefs = [
  { id: 0, name: 'Base Camp', short: 'BC', theta: T0, r: 470 },
  { id: 1, name: 'Camp 1', short: 'C1', theta: T0 + 0.8, target: 70 },
  { id: 2, name: 'Camp 2', short: 'C2', theta: T0 + 1.7, target: 140 },
  { id: 3, name: 'Camp 3', short: 'C3', theta: T0 + 2.6, target: 215 },
];

export const CAMPS = campDefs.map((c) => {
  const r = c.r ?? findRadius(c.theta, c.target);
  const x = r * Math.cos(c.theta);
  const z = r * Math.sin(c.theta);
  const h = Math.max(rawHeight(x, z), WATER + 2.6);
  return { ...c, x, z, h, safeR: 17 };
});

const summitH = rawHeight(0, 0) + 1.5;
export const SUMMIT = { x: 0, z: 0, h: summitH, name: 'Summit', short: 'Top' };

// The route the trail flags follow
export const ROUTE = [...CAMPS.map((c) => ({ x: c.x, z: c.z })), { x: 0, z: 0 }];

function between(a, b, t, side) {
  const x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
  return { x: x + (-dz / L) * side, z: z + (dx / L) * side };
}

export const PONDS = [
  { ...between(CAMPS[0], CAMPS[1], 0.47, 30), icy: false },
  { ...between(CAMPS[1], CAMPS[2], 0.5, -28), icy: false },
  { ...between(CAMPS[2], CAMPS[3], 0.52, 24), icy: true },
].map((p) => {
  const h = rawHeight(p.x, p.z);
  return { ...p, h, radius: 13, waterY: h - 0.5 };
});

const FLATS = [
  ...CAMPS.map((c) => ({ x: c.x, z: c.z, h: c.h, r0: 12, r1: 32 })),
  ...PONDS.map((p) => ({ x: p.x, z: p.z, h: p.h, r0: 16, r1: 34, bowl: 14, depth: 3.2 })),
  { x: 0, z: 0, h: summitH, r0: 9, r1: 21 },
];

export function finalHeight(x, z) {
  let h = rawHeight(x, z);
  for (let k = 0; k < FLATS.length; k++) {
    const f = FLATS[k];
    const dx = x - f.x, dz = z - f.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > f.r1 * f.r1) continue;
    const d = Math.sqrt(d2);
    h = lerp(h, f.h, 1 - smoothstep(f.r0, f.r1, d));
    if (f.bowl && d < f.bowl) {
      const b = 1 - d / f.bowl;
      h -= f.depth * b * b * (3 - 2 * b);
    }
  }
  return h;
}

// ---- Grid sampled once, queried many times ----

const W = SEG + 1;
export const HEIGHTS = new Float32Array(W * W);
for (let j = 0; j <= SEG; j++) {
  for (let i = 0; i <= SEG; i++) {
    HEIGHTS[j * W + i] = finalHeight(-HALF + i * CELL, -HALF + j * CELL);
  }
}

// Matches the triangle split used by the terrain mesh
export function heightAt(x, z) {
  let fx = (x + HALF) / CELL;
  let fz = (z + HALF) / CELL;
  fx = clamp(fx, 0, SEG - 1e-4);
  fz = clamp(fz, 0, SEG - 1e-4);
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const h00 = HEIGHTS[j * W + i];
  const h10 = HEIGHTS[j * W + i + 1];
  const h01 = HEIGHTS[(j + 1) * W + i];
  const h11 = HEIGHTS[(j + 1) * W + i + 1];
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

// Returns {x, z} slope (dh/dx, dh/dz)
export function gradientAt(x, z, e = 1.2) {
  return {
    x: (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e),
    z: (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e),
  };
}

export function normalYAt(x, z) {
  const g = gradientAt(x, z);
  return 1 / Math.sqrt(g.x * g.x + 1 + g.z * g.z);
}

export function snowLineAt(x, z) {
  return 200 + nB(x * 0.012, z * 0.012) * 16;
}

export function isSnowAt(x, z) {
  const h = heightAt(x, z);
  return h > snowLineAt(x, z) && normalYAt(x, z) > 0.5;
}

export function altitudeMeters(h) {
  const base = CAMPS[0].h;
  return ALT_BASE + ((h - base) / (SUMMIT.h - base)) * (ALT_SUMMIT - ALT_BASE);
}

export function progressFromHeight(h) {
  return clamp((h - CAMPS[0].h) / (SUMMIT.h - CAMPS[0].h), 0, 1);
}

for (const c of CAMPS) c.alt = Math.round(altitudeMeters(c.h) / 10) * 10;
SUMMIT.alt = ALT_SUMMIT;

export function nearestPond(x, z) {
  let best = null, bd = Infinity;
  for (const p of PONDS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < bd) { bd = d; best = p; }
  }
  return { pond: best, dist: bd };
}

export function inSafeZone(x, z, pad = 0) {
  for (const c of CAMPS) {
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < (c.safeR + pad) * (c.safeR + pad)) return c;
  }
  return null;
}
