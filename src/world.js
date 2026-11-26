// Builds everything you can see on the mountain: terrain, lakes, forests,
// rocks, berry bushes, mushrooms, trail flags, camps, the summit and clouds.
import * as THREE from 'three';
import * as HF from './heightfield.js';
import { mulberry32, fbm } from './noise.js';
import { clamp, smoothstep, mergeColored, xf, canvasTexture, formatMeters, FONT_STACK, TAU, toon } from './util.js';
import { buildCar } from './car.js';

const { HALF, SEG, CELL, WATER, HEIGHTS, CAMPS, SUMMIT, PONDS, ROUTE, heightAt, normalYAt, snowLineAt } = HF;
const { nB, nC } = HF.noises;

// ---------------------------------------------------------------- colliders
class ColliderGrid {
  constructor(cell = 10) {
    this.cell = cell;
    this.map = new Map();
  }
  key(i, j) { return i * 100003 + j; }
  add(x, z, r) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let list = this.map.get(k);
    if (!list) { list = []; this.map.set(k, list); }
    list.push({ x, z, r });
  }
  // Push a position out of any trees or rocks it overlaps
  resolve(pos, radius) {
    const i0 = Math.floor(pos.x / this.cell), j0 = Math.floor(pos.z / this.cell);
    let hit = false;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const list = this.map.get(this.key(i0 + di, j0 + dj));
        if (!list) continue;
        for (const c of list) {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const min = c.r + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            const push = (min - d) / d;
            pos.x += dx * push;
            pos.z += dz * push;
            hit = true;
          }
        }
      }
    }
    return hit;
  }
}

// ---------------------------------------------------------------- terrain
// A colder, Himalayan palette: muted greens, blue-gray rock, blue-white snow
const PAL = {
  sand: new THREE.Color('#cdb88a'),
  mud: new THREE.Color('#6f6247'),
  grassA: new THREE.Color('#5a8744'),
  grassB: new THREE.Color('#7b9d52'),
  meadow: new THREE.Color('#9db067'),
  alpineA: new THREE.Color('#8a8b64'),
  alpineB: new THREE.Color('#766853'),
  rockA: new THREE.Color('#827e7c'),
  rockB: new THREE.Color('#57565d'),
  snow: new THREE.Color('#f3f7fc'),
  snowShade: new THREE.Color('#c4d4ea'),
};
const tA = new THREE.Color(), tB = new THREE.Color(), tC = new THREE.Color();

function terrainColor(x, y, z, ny, out) {
  const v = nC(x * 0.02, z * 0.02) * 0.5 + 0.5;
  const v2 = nB(x * 0.11, z * 0.11) * 0.5 + 0.5;
  if (y < WATER + 0.7) {
    out.lerpColors(PAL.sand, PAL.mud, y < WATER - 0.3 ? 0.65 : 0);
    return;
  }
  const snowLine = snowLineAt(x, z);
  if (y > snowLine && ny > 0.5) {
    out.lerpColors(PAL.snow, PAL.snowShade, v2 * 0.7);
    return;
  }
  tA.lerpColors(PAL.grassA, PAL.grassB, v);
  if (v2 > 0.74 && y < 70) tA.lerp(PAL.meadow, 0.55);
  tB.lerpColors(PAL.alpineA, PAL.alpineB, v);
  out.lerpColors(tA, tB, smoothstep(80, 135, y));
  const steep = smoothstep(0.8, 0.6, ny);
  const rocky = Math.max(steep, smoothstep(150, 188, y));
  tC.lerpColors(PAL.rockA, PAL.rockB, v2);
  out.lerp(tC, rocky);
  if (y > snowLine - 26 && ny > 0.72 && v2 > 0.56) out.lerp(PAL.snow, 0.85);
}

function buildTerrain(scene) {
  const W = SEG + 1;
  const tris = SEG * SEG * 2;
  const pos = new Float32Array(tris * 9);
  const col = new Float32Array(tris * 9);
  const c = new THREE.Color();
  const rnd = mulberry32(5);
  // Smooth normals from the height grid: the big landforms shade like a
  // painting while each triangle keeps its own color
  const N = new Float32Array(W * W * 3);
  for (let j = 0; j <= SEG; j++) {
    for (let i = 0; i <= SEG; i++) {
      const hl = HEIGHTS[j * W + Math.max(0, i - 1)], hr = HEIGHTS[j * W + Math.min(SEG, i + 1)];
      const hd = HEIGHTS[Math.max(0, j - 1) * W + i], hu = HEIGHTS[Math.min(SEG, j + 1) * W + i];
      const nx = -(hr - hl) / (2 * CELL), nz = -(hu - hd) / (2 * CELL);
      const len = Math.hypot(nx, 1, nz);
      const k = (j * W + i) * 3;
      N[k] = nx / len; N[k + 1] = 1 / len; N[k + 2] = nz / len;
    }
  }
  const nor = new Float32Array(tris * 9);
  let o = 0;
  const putN = (off, gi) => { nor[off] = N[gi * 3]; nor[off + 1] = N[gi * 3 + 1]; nor[off + 2] = N[gi * 3 + 2]; };
  const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, ga, gb, gc) => {
    putN(o, ga); putN(o + 3, gb); putN(o + 6, gc);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const ny1 = ny / Math.hypot(nx, ny, nz);
    terrainColor((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3, ny1, c);
    const j = 0.95 + rnd() * 0.08;
    pos[o] = ax; pos[o + 1] = ay; pos[o + 2] = az;
    pos[o + 3] = bx; pos[o + 4] = by; pos[o + 5] = bz;
    pos[o + 6] = cx; pos[o + 7] = cy; pos[o + 8] = cz;
    for (let k = 0; k < 3; k++) {
      col[o + k * 3] = c.r * j;
      col[o + k * 3 + 1] = c.g * j;
      col[o + k * 3 + 2] = c.b * j;
    }
    o += 9;
  };
  for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < SEG; i++) {
      const x0 = -HALF + i * CELL, x1 = x0 + CELL;
      const z0 = -HALF + j * CELL, z1 = z0 + CELL;
      const h00 = HEIGHTS[j * W + i], h10 = HEIGHTS[j * W + i + 1];
      const h01 = HEIGHTS[(j + 1) * W + i], h11 = HEIGHTS[(j + 1) * W + i + 1];
      const g00 = j * W + i, g10 = g00 + 1, g01 = g00 + W, g11 = g01 + 1;
      tri(x0, h00, z0, x0, h01, z1, x1, h10, z0, g00, g01, g10);
      tri(x1, h10, z0, x0, h01, z1, x1, h11, z1, g10, g01, g11);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.computeBoundingSphere();
  const mat = toon({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- water
function buildWater(scene, world, envMap) {
  const mat = toon({
    color: '#2b7fb6', roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.84, envMap, envMapIntensity: 0.9,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(HF.WORLD, HF.WORLD, 1, 1), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = WATER;
  plane.receiveShadow = true;
  scene.add(plane);

  const icy = toon({
    color: '#bfe5f4', roughness: 0.22, metalness: 0.1, transparent: true, opacity: 0.93, envMap, envMapIntensity: 0.8,
  });
  for (const p of PONDS) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.radius + 0.5, 28), p.icy ? icy : mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, p.waterY, p.z);
    m.receiveShadow = true;
    scene.add(m);
  }
  world.waterMat = mat;
}

// ---------------------------------------------------------------- scatter helpers
function chunkedInstances(scene, geometry, material, items, { castShadow = true, receiveShadow = false, chunk = 350 } = {}) {
  const buckets = new Map();
  for (const it of items) {
    const key = Math.floor((it.x + HALF) / chunk) + ',' + Math.floor((it.z + HALF) / chunk);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }
  const dummy = new THREE.Object3D();
  const meshes = [];
  const useColor = items.some((it) => it.color);
  for (const list of buckets.values()) {
    const m = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
      dummy.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (useColor) m.setColorAt(i, it.color || new THREE.Color(1, 1, 1));
      it.mesh = m;
      it.index = i;
      it.matrix = dummy.matrix.clone();
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    m.computeBoundingSphere();
    scene.add(m);
    meshes.push(m);
  }
  return meshes;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
export function setInstanceVisible(it, visible) {
  it.mesh.setMatrixAt(it.index, visible ? it.matrix : ZERO);
  it.mesh.instanceMatrix.needsUpdate = true;
}

function distToSegment(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

function nearTrail(x, z, d) {
  for (let s = 0; s < ROUTE.length - 1; s++) if (distToSegment(x, z, ROUTE[s], ROUTE[s + 1]) < d) return true;
  return false;
}

function inClearZone(x, z) {
  for (const c of CAMPS) if (Math.hypot(x - c.x, z - c.z) < 24) return true;
  for (const p of PONDS) if (Math.hypot(x - p.x, z - p.z) < 20) return true;
  if (Math.hypot(x, z) < 26) return true;
  return nearTrail(x, z, 3.2);
}

function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.78 + 0.42 * (Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 0.5 + 0.5);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- vegetation & rocks
function scatter(scene, world) {
  const rnd = mulberry32(2024);
  const pines = [], rounds = [], rocks = [], bushes = [], mushroomsGood = [], mushroomsBad = [];
  const step = 8.5;
  const colliders = world.colliders;

  const addBush = (x, z, s) => {
    const y = heightAt(x, z);
    bushes.push({ x, y: y - 0.1, z, ry: rnd() * TAU, s, kind: 'bush', has: true, regrowDay: 0 });
  };
  const addMushroom = (x, z, bad) => {
    const y = heightAt(x, z);
    const it = { x, y: y - 0.02, z, ry: rnd() * TAU, s: 1.2 + rnd() * 0.5, kind: 'mushroom', bad, has: true, regrowDay: 0 };
    (bad ? mushroomsBad : mushroomsGood).push(it);
  };

  for (let z = -HALF + 6; z < HALF - 6; z += step) {
    for (let x = -HALF + 6; x < HALF - 6; x += step) {
      const px = x + (rnd() - 0.5) * step * 0.9;
      const pz = z + (rnd() - 0.5) * step * 0.9;
      const r = Math.hypot(px, pz);
      if (r > 695) continue;
      const h = heightAt(px, pz);
      if (h < WATER + 0.9) continue;
      if (inClearZone(px, pz)) continue;
      const ny = normalYAt(px, pz);
      const forest = fbm(nB, px * 0.011 + 3, pz * 0.011 - 7, 3);
      const roll = rnd();
      let treeP = 0;
      if (h < 168 && ny > 0.72) {
        treeP = clamp(0.2 + forest * 0.95, 0, 0.82) * (1 - smoothstep(118, 168, h));
        if (r > 560) treeP *= 0.55;
      }
      if (roll < treeP) {
        const s = 0.85 + rnd() * 0.75;
        const tint = 0.82 + rnd() * 0.3;
        const color = new THREE.Color(tint, tint * (0.95 + rnd() * 0.1), tint * (0.9 + rnd() * 0.1));
        if (h < 60 && rnd() < 0.32) {
          rounds.push({ x: px, y: h - 0.2, z: pz, ry: rnd() * TAU, s, color });
          colliders.add(px, pz, 0.32 * s);
        } else {
          pines.push({ x: px, y: h - 0.2, z: pz, ry: rnd() * TAU, s, color });
          colliders.add(px, pz, 0.3 * s);
        }
        continue;
      }
      const roll2 = rnd();
      const rockP = 0.025 + smoothstep(100, 250, h) * 0.07 + (1 - ny) * 0.1;
      if (roll2 < rockP) {
        const s = 0.45 + rnd() * rnd() * 2.8;
        const grey = 0.75 + rnd() * 0.4;
        const snowy = h > snowLineAt(px, pz) - 10;
        const color = snowy ? new THREE.Color(1.15, 1.17, 1.2) : new THREE.Color(grey, grey * 0.97, grey * 0.94);
        rocks.push({
          x: px, y: h - s * 0.25, z: pz, rx: rnd() * 3, ry: rnd() * 3, rz: rnd() * 3,
          sx: s * (0.8 + rnd() * 0.6), sy: s * (0.55 + rnd() * 0.45), sz: s * (0.8 + rnd() * 0.6), color,
        });
        if (s > 0.9) colliders.add(px, pz, s * 0.8);
        continue;
      }
      if (r < 560 && h < 118 && ny > 0.8 && roll2 < rockP + 0.024) {
        addBush(px, pz, 0.9 + rnd() * 0.5);
        continue;
      }
      if (r < 560 && h < 112 && forest > 0.0 && ny > 0.8 && roll2 < rockP + 0.05) {
        addMushroom(px, pz, rnd() < 0.3);
      }
    }
  }

  // Guaranteed food near the first two camps and along the lower trail
  for (const c of [CAMPS[0], CAMPS[1]]) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.6;
      const x = c.x + Math.cos(a) * 27, z = c.z + Math.sin(a) * 27;
      if (heightAt(x, z) > WATER + 1) addBush(x, z, 1.1);
    }
  }
  for (let t = 0.2; t < 0.95; t += 0.25) {
    const a = ROUTE[0], b = ROUTE[1];
    const x = a.x + (b.x - a.x) * t + 7, z = a.z + (b.z - a.z) * t;
    if (heightAt(x, z) > WATER + 1) addBush(x, z, 1.05);
  }

  // Pine: trunk + three cones
  const pineGeo = mergeColored([
    { geo: new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6), color: '#6b4a2f', matrix: xf(0, 0.8, 0) },
    { geo: new THREE.ConeGeometry(1.55, 2.2, 7), color: '#2c6634', matrix: xf(0, 2.1, 0) },
    { geo: new THREE.ConeGeometry(1.2, 1.9, 7), color: '#33743a', matrix: xf(0, 3.2, 0, 0, 0.4, 0) },
    { geo: new THREE.ConeGeometry(0.8, 1.6, 7), color: '#3c8242', matrix: xf(0, 4.2, 0, 0, 0.8, 0) },
  ]);
  const roundGeo = mergeColored([
    { geo: new THREE.CylinderGeometry(0.18, 0.26, 2.0, 6), color: '#71502f', matrix: xf(0, 1.0, 0) },
    { geo: new THREE.IcosahedronGeometry(1.5, 0), color: '#4f9a3c', matrix: xf(0, 2.9, 0) },
    { geo: new THREE.IcosahedronGeometry(1.0, 0), color: '#5daa45', matrix: xf(0.75, 2.4, 0.3, 0.3, 0.2, 0) },
    { geo: new THREE.IcosahedronGeometry(0.9, 0), color: '#468d36', matrix: xf(-0.6, 3.6, -0.2, 0.1, 0.5, 0.2) },
  ]);
  const vegMat = toon({ vertexColors: true, roughness: 0.9, flatShading: true });
  chunkedInstances(scene, pineGeo, vegMat, pines);
  chunkedInstances(scene, roundGeo, vegMat, rounds);

  const rockMat = toon({ color: '#8a857f', roughness: 0.95, flatShading: true });
  chunkedInstances(scene, rockGeometry(), rockMat, rocks, { castShadow: true, receiveShadow: true });

  // Berry bushes (berries are separate instances so they can be picked)
  const bushGeo = mergeColored([
    { geo: new THREE.IcosahedronGeometry(0.85, 1), color: '#3a8538', matrix: xf(0, 0.55, 0, 0, 0, 0, [1.25, 0.8, 1.2]) },
    { geo: new THREE.IcosahedronGeometry(0.55, 1), color: '#46943f', matrix: xf(0.55, 0.45, 0.2, 0, 0, 0, [1, 0.8, 1]) },
  ]);
  const berryParts = [];
  const brnd = mulberry32(31);
  for (let k = 0; k < 12; k++) {
    const a = brnd() * TAU, e = 0.25 + brnd() * 0.9;
    const x = Math.cos(a) * Math.cos(e) * 1.04, y = 0.55 + Math.sin(e) * 0.66, z = Math.sin(a) * Math.cos(e) * 1.0;
    berryParts.push({ geo: new THREE.SphereGeometry(0.1, 7, 5), color: k % 3 ? '#d81e3a' : '#a0122a', matrix: xf(x, y, z) });
  }
  const berryGeo = mergeColored(berryParts);
  const berryMat = toon({ vertexColors: true, roughness: 0.35 });
  chunkedInstances(scene, bushGeo, vegMat, bushes, { castShadow: true });
  const berryItems = bushes.map((b) => ({ ...b }));
  chunkedInstances(scene, berryGeo, berryMat, berryItems, { castShadow: false });
  bushes.forEach((b, i) => { b.berries = berryItems[i]; });

  const stem = () => new THREE.CylinderGeometry(0.07, 0.1, 0.3, 7);
  const cap = () => new THREE.SphereGeometry(0.26, 10, 6, 0, TAU, 0, Math.PI / 2);
  const goodGeo = mergeColored([
    { geo: stem(), color: '#efe6d2', matrix: xf(0, 0.15, 0) },
    { geo: cap(), color: '#a86d3c', matrix: xf(0, 0.28, 0, 0, 0, 0, [1, 0.75, 1]) },
  ]);
  const spots = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU, e = k === 6 ? Math.PI / 2 : 0.7;
    spots.push({ geo: new THREE.SphereGeometry(0.045, 5, 4), color: '#ffffff', matrix: xf(Math.cos(a) * Math.cos(e) * 0.25, 0.28 + Math.sin(e) * 0.19, Math.sin(a) * Math.cos(e) * 0.25) });
  }
  const badGeo = mergeColored([
    { geo: stem(), color: '#efe6d2', matrix: xf(0, 0.15, 0) },
    { geo: cap(), color: '#d8322b', matrix: xf(0, 0.28, 0, 0, 0, 0, [1, 0.75, 1]) },
    ...spots,
  ]);
  const shroomMat = toon({ vertexColors: true, roughness: 0.6 });
  chunkedInstances(scene, goodGeo, shroomMat, mushroomsGood, { castShadow: false });
  chunkedInstances(scene, badGeo, shroomMat, mushroomsBad, { castShadow: false });

  world.bushes = bushes;
  world.mushrooms = [...mushroomsGood, ...mushroomsBad];
  world.counts = { pines: pines.length, rounds: rounds.length, rocks: rocks.length, bushes: bushes.length, mushrooms: world.mushrooms.length };
}

// ---------------------------------------------------------------- trail flags
function buildTrail(scene) {
  const markerGeo = mergeColored([
    { geo: new THREE.DodecahedronGeometry(0.45, 0), color: '#7d7770', matrix: xf(0, 0.22, 0, 0, 0, 0, [1, 0.6, 1]) },
    { geo: new THREE.DodecahedronGeometry(0.33, 0), color: '#8b857d', matrix: xf(0.05, 0.55, 0, 0, 0.5, 0, [1, 0.7, 1]) },
    { geo: new THREE.DodecahedronGeometry(0.22, 0), color: '#9a948b', matrix: xf(-0.03, 0.82, 0.02, 0, 1, 0, [1, 0.8, 1]) },
    { geo: new THREE.CylinderGeometry(0.035, 0.035, 2.0, 5), color: '#3b3b3b', matrix: xf(0, 1.5, 0) },
    { geo: new THREE.BoxGeometry(0.62, 0.38, 0.025), color: '#ff6b1f', matrix: xf(0.33, 2.28, 0) },
  ]);
  const items = [];
  const rnd = mulberry32(8);
  for (let s = 0; s < ROUTE.length - 1; s++) {
    const a = ROUTE[s], b = ROUTE[s + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 14; d < L; d += 14) {
      const t = d / L;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (s === ROUTE.length - 2 && Math.hypot(x, z) < 22) continue;
      if (CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 20)) continue;
      const side = (Math.floor(d / 14) % 2 ? 1 : -1) * 1.6;
      const nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
      const px = x + nx * side, pz = z + nz * side;
      const h = heightAt(px, pz);
      if (h < WATER) continue;
      items.push({ x: px, y: h - 0.05, z: pz, ry: rnd() * TAU, s: 1 });
    }
  }
  const mat = toon({ vertexColors: true, roughness: 0.8, flatShading: true });
  chunkedInstances(scene, markerGeo, mat, items, { castShadow: true });
}

// ---------------------------------------------------------------- camps
function tentGeometry(radius, length) {
  const g = new THREE.CylinderGeometry(radius, radius, length, 3, 1);
  g.rotateZ(Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  g.translate(0, radius * 0.5, 0);
  return flat(g);
}
function flat(g) {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
}

function signTexture(title, sub) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6e4a2a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a3b20';
    for (let y = 18; y < h; y += 34) ctx.fillRect(0, y, w, 4);
    ctx.strokeStyle = '#f4ead8';
    ctx.lineWidth = 8;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = '#fff7e8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 104px ${FONT_STACK}`;
    ctx.fillText(title.toUpperCase(), w / 2, h * 0.42);
    ctx.font = `800 58px ${FONT_STACK}`;
    ctx.fillStyle = '#ffb27a';
    ctx.fillText(sub, w / 2, h * 0.76);
  });
}

function makeSign(title, sub) {
  const g = new THREE.Group();
  const wood = toon({ color: '#5b3d22', roughness: 0.9 });
  for (const x of [-1.05, 1.05]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.2, 6), wood);
    post.position.set(x, 1.1, 0);
    post.castShadow = true;
    g.add(post);
  }
  const tex = signTexture(title, sub);
  const face = toon({ map: tex, roughness: 0.85 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.08), [wood, wood, wood, wood, face, face]);
  board.position.y = 1.75;
  board.castShadow = true;
  g.add(board);
  return g;
}

function makeFire() {
  const g = new THREE.Group();
  const stoneMat = toon({ color: '#6f6b66', roughness: 0.95, flatShading: true });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), stoneMat);
    s.position.set(Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75);
    s.rotation.set(k, k * 2, 0);
    g.add(s);
  }
  const logMat = toon({ color: '#5a3a21', roughness: 0.9 });
  for (let k = 0; k < 4; k++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), logMat);
    const a = (k / 4) * TAU;
    log.position.set(Math.cos(a) * 0.22, 0.32, Math.sin(a) * 0.22);
    log.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    g.add(log);
  }
  const flames = [];
  const fdefs = [[0.42, 1.15, '#ff6a14'], [0.3, 0.9, '#ffad2a'], [0.17, 0.6, '#fff0a6']];
  for (const [r, hgt, color] of fdefs) {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(r, hgt, 7),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, toneMapped: false, depthWrite: false }),
    );
    m.position.y = hgt / 2 + 0.12;
    m.userData.h = hgt;
    g.add(m);
    flames.push(m);
  }
  const light = new THREE.PointLight('#ff8a3d', 38, 28, 1.6);
  light.position.y = 1.3;
  g.add(light);
  return { group: g, flames, light };
}

function makeCrate() {
  const g = new THREE.Group();
  const wood = toon({ color: '#9b6b3b', roughness: 0.85 });
  const label = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9b6b3b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8202f';
    ctx.fillRect(18, 34, 60, 60);
    ctx.fillStyle = '#fff';
    ctx.fillRect(40, 42, 16, 44);
    ctx.fillRect(26, 56, 44, 16);
    ctx.fillStyle = '#2a1a0d';
    ctx.font = `900 44px ${FONT_STACK}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('SUPPLIES', 92, 66);
  });
  const face = toon({ map: label, roughness: 0.85 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.75), [wood, wood, wood, wood, face, wood]);
  box.position.y = 0.35;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.7, -0.375);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.1, 0.8), wood);
  lid.position.set(0, 0.05, 0.4);
  lid.castShadow = true;
  lidPivot.add(lid);
  g.add(lidPivot);
  return { group: g, lidPivot };
}

function buildCamp(scene, world, c, idx) {
  const g = new THREE.Group();
  g.position.set(c.x, c.h, c.z);
  const next = ROUTE[idx + 1];
  g.rotation.y = Math.atan2(next.x - c.x, next.z - c.z);
  scene.add(g);

  const fire = makeFire();
  g.add(fire.group);

  const tentColors = ['#ff6b1f', '#ffb21f'];
  const tents = [];
  const tentDefs = [[-4.2, -2.6, 0.5], [4.4, -3.4, -0.6]];
  tentDefs.forEach(([x, z, ry], k) => {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.rotation.y = ry;
    const body = new THREE.Mesh(tentGeometry(1.35, 2.7), toon({ color: tentColors[k], roughness: 0.7 }));
    body.castShadow = true;
    body.receiveShadow = true;
    t.add(body);
    const door = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 3, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#2a1508' }),
    );
    door.position.set(1.36, 0.42, 0);
    door.rotation.y = Math.PI / 2;
    t.add(door);
    g.add(t);
    tents.push(t);
  });

  const crate = makeCrate();
  crate.group.position.set(2.8, 0, 2.4);
  crate.group.rotation.y = -0.4;
  g.add(crate.group);

  const sign = makeSign(c.name, `${formatMeters(c.alt)} m`);
  sign.position.set(-3.2, 0, 4.6);
  sign.rotation.y = 0.35;
  g.add(sign);

  const logMat = toon({ color: '#6a4626', roughness: 0.9 });
  for (const [x, z, ry] of [[-1.9, 1.3, 0.9], [1.6, -1.9, 0.5]]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.7, 8), logMat);
    log.rotation.set(0, ry, Math.PI / 2);
    log.position.set(x, 0.22, z);
    log.castShadow = true;
    g.add(log);
  }

  // Tall flag so you can spot the camp from below
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 7, 6), toon({ color: '#c9ccd1', metalness: 0.6, roughness: 0.4 }));
  pole.position.set(0, 3.5, -6.5);
  pole.castShadow = true;
  g.add(pole);
  const flagMat = toon({ color: '#ff6b1f', roughness: 0.6, side: THREE.DoubleSide });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 8, 1), flagMat);
  flag.position.set(0.92, 6.4, -6.5);
  g.add(flag);

  g.updateMatrixWorld(true);
  const wp = (obj, ox = 0, oz = 0) => obj.localToWorld(new THREE.Vector3(ox, 0, oz));
  // Solid props: tents, crate, fire, sign posts
  for (const t of tents) {
    for (const ox of [-0.75, 0.75]) {
      const q = wp(t, ox, 0);
      world.colliders.add(q.x, q.z, 1.05);
    }
  }
  const cp = wp(crate.group);
  world.colliders.add(cp.x, cp.z, 0.6);
  const fp = wp(fire.group);
  world.colliders.add(fp.x, fp.z, 0.75);
  for (const ox of [-1.05, 1.05]) {
    const q = wp(sign, ox, 0);
    world.colliders.add(q.x, q.z, 0.15);
  }
  const pl = wp(pole);
  world.colliders.add(pl.x, pl.z, 0.15);
  const camp = {
    ...c,
    group: g,
    fire,
    flag,
    firePos: wp(fire.group),
    cratePos: wp(crate.group),
    crate,
    tents: tents.map((t) => wp(t)),
    crateDay: 0,
    visited: idx === 0,
    yaw: g.rotation.y,
    local: (lx, lz) => wp(g, lx, lz),
  };
  world.camps.push(camp);

  world.updaters.push((dt, t) => {
    fire.flames.forEach((f, k) => {
      const s = 1 + Math.sin(t * (11 + k * 3) + k) * 0.12 + Math.sin(t * 23 + k * 5) * 0.06;
      f.scale.set(1 - (s - 1) * 0.5, s, 1 - (s - 1) * 0.5);
      f.position.y = (f.userData.h * s) / 2 + 0.12;
      f.rotation.y = t * (1 + k);
    });
    fire.light.intensity = 38 * (0.85 + Math.sin(t * 17.3) * 0.08 + Math.sin(t * 7.1) * 0.07);
    const p = flag.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, Math.sin(x * 3 - t * 5) * 0.12 * (x + 0.9));
    }
    p.needsUpdate = true;
  });
}

// ---------------------------------------------------------------- summit
function buildSummit(scene, world, envMap) {
  const g = new THREE.Group();
  g.position.set(SUMMIT.x, SUMMIT.h, SUMMIT.z);
  scene.add(g);

  const granite = toon({ color: '#3b4048', roughness: 0.6, metalness: 0.1 });
  const gold = new THREE.MeshStandardMaterial({ color: '#ffc23d', roughness: 0.25, metalness: 1, envMap });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.9, 0.55, 48), granite);
  base.position.y = 0.25;
  base.receiveShadow = true;
  base.castShadow = true;
  g.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.45, 0.08, 8, 64), gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.53;
  g.add(rim);

  const turntable = new THREE.Group();
  turntable.position.y = 0.53;
  g.add(turntable);
  const car = buildCar(envMap);
  turntable.add(car);

  const sign = makeSign('Summit', '8,849 m');
  sign.position.set(-6.5, 0, 4.5);
  sign.rotation.y = 0.6;
  g.add(sign);

  // Summit flag pole and prayer flags strung to three short poles
  const poleMat = toon({ color: '#d3d6db', metalness: 0.6, roughness: 0.35 });
  const mainPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 8, 8), poleMat);
  mainPole.position.set(0, 4, -8);
  mainPole.castShadow = true;
  g.add(mainPole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.9, 14, 4),
    toon({ color: '#ff6b1f', roughness: 0.6, side: THREE.DoubleSide }),
  );
  flag.position.set(1.62, 7.0, -8);
  g.add(flag);

  const prayer = ['#2f6fd6', '#f4f4f4', '#d8322b', '#2f9a4a', '#f2c230'];
  const parts = [];
  const ends = [[-8.5, -2], [8.5, -1], [0.5, 8.5]];
  const top = new THREE.Vector3(0, 7.6, -8);
  ends.forEach(([ex, ez]) => {
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 6), poleMat);
    stub.position.set(ex, heightAt(ex, ez) - SUMMIT.h + 1.2, ez);
    g.add(stub);
    const end = new THREE.Vector3(ex, stub.position.y + 1.1, ez);
    const N = 16;
    for (let k = 1; k < N; k++) {
      const t = k / N;
      const p = new THREE.Vector3().lerpVectors(top, end, t);
      p.y -= Math.sin(t * Math.PI) * 1.2;
      const ang = Math.atan2(end.x - top.x, end.z - top.z);
      parts.push({ geo: new THREE.PlaneGeometry(0.42, 0.5), color: prayer[k % 5], matrix: xf(p.x, p.y - 0.25, p.z, 0, ang + Math.PI / 2, 0) });
    }
  });
  const pf = new THREE.Mesh(mergeColored(parts), toon({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }));
  g.add(pf);

  // A golden beam so you can always see where the top is
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.32 }, uColor: { value: new THREE.Color('#ffcf5a') } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float a = pow(1.0 - vUv.y, 1.5) * uOpacity;
        a *= 0.8 + 0.2 * sin(uTime * 2.0 - vUv.y * 18.0);
        float edge = 1.0 - abs(fract(vUv.x * 2.0) - 0.5) * 2.0;
        a *= 0.55 + 0.45 * edge;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 460, 24, 1, true), beamMat);
  beam.position.y = 230;
  beam.frustumCulled = false;
  g.add(beam);

  world.summit = { group: g, turntable, car, beam, flag };
  world.updaters.push((dt, t, env) => {
    turntable.rotation.y += dt * 0.35;
    beamMat.uniforms.uTime.value = t;
    const d = env.playerPos ? Math.hypot(env.playerPos.x, env.playerPos.z) : 999;
    beamMat.uniforms.uOpacity.value = 0.5 * smoothstep(20, 90, d) + 0.05;
    const p = flag.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, Math.sin(x * 2.2 - t * 6) * 0.22 * (x + 1.6));
    }
    p.needsUpdate = true;
  });
}


// ---------------------------------------------------------------- summit snow plume
// Wind tears a long plume of snow off the top, the classic big-mountain sight
function buildPlume(scene, world) {
  const N = 80;
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const alpha = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#eef3fb') }, uScale: { value: 500 }, uLight: { value: 1 } },
    vertexShader: `attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vA;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(aSize * uScale / -mv.z, 700.0); vA = aAlpha; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uLight; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(uColor * uLight, a * a * vA); }`,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  const rnd = mulberry32(12);
  const parts = Array.from({ length: N }, (_, i) => ({ t: i / N, jx: rnd() - 0.5, jy: rnd() - 0.5, jz: rnd() - 0.5, s: 0.7 + rnd() * 0.6 }));
  const wind = new THREE.Vector3(1, 0, 0.32).normalize();
  world.plume = { mat };
  world.updaters.push((dt, t, env) => {
    const d = env.playerPos ? Math.hypot(env.playerPos.x - SUMMIT.x, env.playerPos.z - SUMMIT.z) : 999;
    const fade = smoothstep(25, 90, d);
    mat.uniforms.uLight.value = 0.25 + (env.dayness ?? 1) * 0.8;
    parts.forEach((p, i) => {
      p.t += dt * 0.045;
      if (p.t > 1) p.t -= 1;
      const along = p.t * 150;
      const spread = 3 + p.t * 26;
      pos[i * 3] = SUMMIT.x + wind.x * along + p.jx * spread;
      pos[i * 3 + 1] = SUMMIT.h + 4 + p.jy * spread * 0.5 - p.t * 30;
      pos[i * 3 + 2] = SUMMIT.z + wind.z * along + p.jz * spread;
      size[i] = (10 + p.t * 55) * p.s;
      alpha[i] = Math.sin(Math.PI * p.t) * 0.42 * fade;
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  });
}

// ---------------------------------------------------------------- clouds
function buildClouds(scene, world) {
  const rnd = mulberry32(77);
  const parts = [];
  for (let k = 0; k < 48; k++) {
    const ang = rnd() * TAU;
    const r = 280 + rnd() * 320;
    const y = 150 + rnd() * 85;
    const cx = Math.cos(ang) * r, cz = Math.sin(ang) * r;
    const n = 4 + Math.floor(rnd() * 4);
    const sc = 7 + rnd() * 9;
    for (let i = 0; i < n; i++) {
      parts.push({
        geo: new THREE.IcosahedronGeometry(1, 1),
        color: '#ffffff',
        matrix: xf(cx + (rnd() - 0.5) * sc * 2.4, y + (rnd() - 0.3) * sc * 0.45, cz + (rnd() - 0.5) * sc * 1.3, 0, rnd() * 3, 0,
          [sc * (0.7 + rnd() * 0.6), sc * (0.42 + rnd() * 0.3), sc * (0.7 + rnd() * 0.5)]),
      });
    }
  }
  const mat = toon({ vertexColors: true, emissive: '#7d8796' });
  const mesh = new THREE.Mesh(mergeColored(parts), mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  world.clouds = { mesh, mat };
  world.updaters.push((dt, t, env) => {
    mesh.rotation.y += dt * 0.004;
    const day = env.dayness ?? 1;
    mat.emissive.setRGB(0.08 + 0.32 * day, 0.09 + 0.34 * day, 0.13 + 0.36 * day);
  });
}


// ---------------------------------------------------------------- Rielle's boxes
function boxTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#a46dff');
    g.addColorStop(1, '#6c3ad6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff7ab6';
    ctx.fillRect(w / 2 - 18, 0, 36, h);
    ctx.fillRect(0, h / 2 - 18, w, 36);
    ctx.strokeStyle = '#3d1f86';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6c3ad6';
    ctx.font = `900 104px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', w / 2, h / 2 + 6);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 30px ${FONT_STACK}`;
    ctx.fillText("RIELLE'S STUFF", w / 2, 34);
  });
}

function buildBoxes(scene, world) {
  const spots = [];
  for (let s = 0; s < ROUTE.length - 1; s++) {
    const a = ROUTE[s], b = ROUTE[s + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
    let k = 0;
    for (let d = 30; d < L - 12; d += 36) {
      const t = d / L;
      const side = (k++ % 2 ? 1 : -1) * 4.5;
      const x = a.x + (b.x - a.x) * t + nx * side, z = a.z + (b.z - a.z) * t + nz * side;
      if (CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 22)) continue;
      if (heightAt(x, z) < WATER + 0.5) continue;
      spots.push({ x, z });
    }
  }
  // One box at every camp
  for (const c of world.camps) {
    const p = c.local(0.4, 8.6);
    spots.push({ x: p.x, z: p.z });
  }
  const tex = boxTexture();
  const mat = toon({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.22, roughness: 0.5 });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, spots.length);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  world.boxes = spots.map((p, i) => ({ ...p, y: heightAt(p.x, p.z), has: true, regrowDay: 0, index: i, phase: i * 1.7 }));
  const dummy = new THREE.Object3D();
  const place = (t) => {
    for (const b of world.boxes) {
      dummy.position.set(b.x, b.y + 1.0 + Math.sin(t * 2 + b.phase) * 0.18, b.z);
      dummy.rotation.set(0.15, t * 1.2 + b.phase, 0.1);
      dummy.scale.setScalar(b.has ? 1 : 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(b.index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  place(0);
  world.updaters.push((dt, t) => place(t));
}

// ---------------------------------------------------------------- random stuff on the mountain
function buildProps(scene, world) {
  world.props = [];
  const bc = world.camps[0], c1 = world.camps[1], c2 = world.camps[2], c3 = world.camps[3];

  // A giant rubber duck floating in the big lake
  const L = HF.LAKES[1];
  const duck = new THREE.Group();
  const yellow = toon({ color: '#ffd23a', roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 16), yellow);
  body.scale.set(1.25, 0.8, 1);
  body.position.y = 1.2;
  const headM = new THREE.Mesh(new THREE.SphereGeometry(1.9, 24, 16), yellow);
  headM.position.set(2.2, 4.0, 0);
  const beak = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10), toon({ color: '#ff8a00', roughness: 0.4 }));
  beak.scale.set(1.3, 0.45, 0.9);
  beak.position.set(4.0, 3.7, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 12), yellow);
  tail.position.set(-3.9, 2.2, 0);
  tail.rotation.z = 1.0;
  duck.add(body, headM, beak, tail);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), toon({ color: '#111', roughness: 0.2 }));
    eye.position.set(3.4, 4.6, s * 0.95);
    duck.add(eye);
  }
  duck.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  duck.position.set(L.x, WATER - 0.4, L.z);
  scene.add(duck);
  world.updaters.push((dt, t) => {
    duck.position.y = WATER - 0.5 + Math.sin(t * 1.3) * 0.25;
    duck.rotation.y = t * 0.05;
    duck.rotation.z = Math.sin(t * 0.9) * 0.05;
  });

  // Pink lawn flamingos at Base Camp
  const pink = toon({ color: '#ff6fae', roughness: 0.5 });
  const black = toon({ color: '#202020', roughness: 0.6 });
  [[4.6, 7.4, 0.4], [5.6, 6.2, -0.5]].forEach(([lx, lz, ry]) => {
    const f = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), pink);
    b.scale.set(1, 0.75, 1.5);
    b.position.y = 0.95;
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 14, Math.PI * 1.25), pink);
    neck.rotation.y = Math.PI / 2;
    neck.position.set(0, 1.3, 0.25);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), pink);
    h.position.set(0, 1.62, 0.12);
    const bk = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 6), black);
    bk.rotation.x = Math.PI / 2 + 0.6;
    bk.position.set(0, 1.56, 0.22);
    f.add(b, neck, h, bk);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.75, 5), black);
      leg.position.set(s * 0.06, 0.38, 0);
      f.add(leg);
    }
    const p = bc.local(lx, lz);
    f.position.set(p.x, heightAt(p.x, p.z), p.z);
    f.rotation.y = bc.yaw + ry;
    f.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(f);
  });

  const addProp = (camp, lx, lz, ry, group, r, prop) => {
    const p = camp.local(lx, lz);
    group.position.set(p.x, heightAt(p.x, p.z), p.z);
    group.rotation.y = camp.yaw + ry;
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(group);
    world.colliders.add(p.x, p.z, r);
    world.props.push({ x: p.x, z: p.z, reach: r + 1.9, usedDay: 0, ...prop });
  };

  // A comfy couch at Camp 1
  const couch = new THREE.Group();
  const fabric = toon({ color: '#c98a2e', roughness: 0.95 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.9), fabric);
  seat.position.y = 0.35;
  const backR = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 0.25), fabric);
  backR.position.set(0, 0.85, -0.35);
  couch.add(seat, backR);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.9), fabric);
    arm.position.set(s * 1.1, 0.55, 0);
    couch.add(arm);
    const cush = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.15, 0.75), toon({ color: '#e0a548', roughness: 0.95 }));
    cush.position.set(s * 0.5, 0.64, 0.05);
    couch.add(cush);
  }
  addProp(c1, -5.2, 3.2, 1.2, couch, 1.1, { kind: 'couch', text: 'Sit on the couch' });

  // A snack machine at Camp 2
  const vend = new THREE.Group();
  const boxM = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.8), toon({ color: '#d8322b', roughness: 0.5 }));
  boxM.position.y = 1.05;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.3), toon({ color: '#bfe6ff', emissive: '#9fd8ff', emissiveIntensity: 0.6, roughness: 0.2 }));
  glass.position.set(-0.12, 1.25, 0.41);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#fff3c4'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d8322b'; ctx.font = `900 40px ${FONT_STACK}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SNACKS', w / 2, h / 2 + 2);
  }) }));
  sign.position.set(0, 1.98, 0.41);
  vend.add(boxM, glass, sign);
  addProp(c2, -5.4, 3.0, 1.0, vend, 0.75, { kind: 'snacks', text: 'Get free snacks' });

  // A toilet way up at Camp 3. Nobody knows why.
  const toilet = new THREE.Group();
  const porcelain = toon({ color: '#f7f8fa', roughness: 0.25 });
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.45, 18), porcelain);
  bowl.position.set(0, 0.23, 0.12);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 20), porcelain);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 0.47, 0.12);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.24), porcelain);
  tank.position.set(0, 0.7, -0.25);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 18), porcelain);
  lid.position.set(0, 0.62, -0.12);
  lid.rotation.x = -1.3;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), toon({ color: '#c0c7cf', metalness: 0.8, roughness: 0.3 }));
  handle.position.set(-0.22, 0.88, -0.12);
  toilet.add(bowl, rim, tank, lid, handle);
  addProp(c3, -6.4, 0.8, 1.3, toilet, 0.45, { kind: 'toilet', text: 'Flush the toilet' });
}

// ---------------------------------------------------------------- build
export function buildWorld(scene, envMap) {
  const world = {
    colliders: new ColliderGrid(),
    bushes: [],
    mushrooms: [],
    camps: [],
    updaters: [],
  };
  world.terrain = buildTerrain(scene);
  buildWater(scene, world, envMap);
  scatter(scene, world);
  buildTrail(scene);
  CAMPS.forEach((c, i) => buildCamp(scene, world, c, i));
  buildSummit(scene, world, envMap);
  buildClouds(scene, world);
  buildPlume(scene, world);
  buildBoxes(scene, world);
  buildProps(scene, world);
  world.update = (dt, t, env) => {
    for (const u of world.updaters) u(dt, t, env);
  };
  // New day: bushes and mushrooms grow back, crates restock
  world.regrow = (day) => {
    for (const b of world.bushes) {
      if (!b.has && day >= b.regrowDay) { b.has = true; setInstanceVisible(b.berries, true); }
    }
    for (const m of world.mushrooms) {
      if (!m.has && day >= m.regrowDay) { m.has = true; setInstanceVisible(m, true); }
    }
    for (const b of world.boxes) if (!b.has && day >= b.regrowDay) b.has = true;
  };
  world.resetAll = () => {
    for (const b of world.bushes) { b.has = true; setInstanceVisible(b.berries, true); }
    for (const m of world.mushrooms) { m.has = true; setInstanceVisible(m, true); }
    for (const c of world.camps) { c.crateDay = 0; c.crate.lidPivot.rotation.x = 0; c.visited = c.id === 0; }
    for (const b of world.boxes) b.has = true;
    for (const p of world.props) p.usedDay = 0;
  };
  return world;
}
