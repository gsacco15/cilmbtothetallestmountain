import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// Build a transform matrix: position, euler rotation, scale (number or [x,y,z])
export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  _p.set(x, y, z);
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  if (Array.isArray(s)) _s.set(s[0], s[1], s[2]);
  else _s.set(s, s, s);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Merge several geometries into one non-indexed geometry with baked vertex
// colors. parts: [{ geo, color, matrix }]
export function mergeColored(parts) {
  let total = 0;
  const prepared = parts.map((p) => {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.matrix) g.applyMatrix4(p.matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    total += g.attributes.position.count;
    return { g, color: new THREE.Color(p.color) };
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const { g, color } of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < n; i++) {
      col[(o + i) * 3] = color.r;
      col[(o + i) * 3 + 1] = color.g;
      col[(o + i) * 3 + 2] = color.b;
    }
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Flat-shade a geometry (each triangle gets its own normal)
export function flat(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

// Draw onto a canvas and return a texture (for signs, name tapes, patches)
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function formatMeters(m) {
  return Math.round(m).toLocaleString('en-US');
}

export const FONT_STACK = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';

// Cel shading: three flat bands of light, like a hand-painted film
let gradient = null;
export function toonGradient() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([72, 160, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

// Drop-in for MeshStandardMaterial options; ignores the shiny-metal settings
export function toon(params = {}) {
  const { roughness, metalness, envMap, envMapIntensity, flatShading, clearcoat, clearcoatRoughness, ...rest } = params;
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...rest });
}
