// Wild animals: wolves, bears, rattlesnakes, mountain goats, snow leopards
// and eagles. Each kind lives at its own altitude and attacks its own way.
import * as THREE from 'three';
import { clamp, damp, dampAngle, TAU, toon } from './util.js';
import { heightAt, WATER, inSafeZone, BOUND_R } from './heightfield.js';

export const ANIMALS = {
  wolf: { label: 'A wolf', walk: 2.6, run: 7.9, hp: 3, dmg: 9, range: 1.9, cd: 1.15, aggro: 22, aggroNight: 34, chaseTime: 14, radius: 0.7, minH: 8, maxH: 215, day: 0.9, night: 3.4 },
  bear: { label: 'A bear', walk: 1.7, run: 6.5, hp: 6, dmg: 18, range: 2.6, cd: 1.8, aggro: 15, aggroNight: 18, chaseTime: 10, radius: 1.1, minH: 4, maxH: 125, day: 1.0, night: 0.7 },
  snake: { label: 'A rattlesnake', walk: 0, run: 2.6, hp: 1, dmg: 8, range: 2.2, cd: 1.5, aggro: 6.5, aggroNight: 6.5, chaseTime: 7, radius: 0.5, minH: 2, maxH: 110, day: 1.8, night: 0.8 },
  goat: { label: 'A mountain goat', walk: 1.6, run: 10.5, hp: 3, dmg: 11, range: 1.8, cd: 3.5, aggro: 10, aggroNight: 8, chaseTime: 2.4, radius: 0.7, minH: 95, maxH: 240, day: 1.6, night: 0.5 },
  leopard: { label: 'A snow leopard', walk: 2.2, run: 8.8, hp: 4, dmg: 13, range: 2.0, cd: 1.35, aggro: 26, aggroNight: 34, chaseTime: 12, radius: 0.7, minH: 165, maxH: 400, day: 1.1, night: 1.8 },
  eagle: { label: 'An eagle', hp: 2, dmg: 8, cd: 6, aggro: 70, aggroNight: 0, radius: 0.9, minH: 130, maxH: 400, day: 0.9, night: 0 },
};

// ------------------------------------------------------------------ models
function makeKit() {
  const mats = [];
  const M = (color, extra = {}) => {
    const m = toon({ color, ...extra });
    m.userData.baseEmissive = m.emissive.clone();
    m.userData.baseIntensity = m.emissiveIntensity;
    mats.push(m);
    return m;
  };
  const add = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  return { mats, M, add };
}

function buildQuadruped(p) {
  const { mats, M, add } = makeKit();
  const main = M(p.color);
  const belly = M(p.belly ?? p.color);
  const dark = M(p.dark ?? '#222222');
  const nose = M('#161616', { roughness: 0.35 });
  const eye = M(p.eye ?? '#111111', { roughness: 0.25, emissive: p.eyeGlow ?? '#000000', emissiveIntensity: 0 });
  eye.userData.glow = !!p.eyeGlow;
  const wide = p.wide ?? 1, tall = p.tall ?? 1;

  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  body.position.y = p.legLen + p.girth * 0.5;
  root.add(body);
  const torso = add(new THREE.CapsuleGeometry(p.girth, p.len, 4, 12), main, body);
  torso.rotation.x = Math.PI / 2;
  torso.scale.set(wide, 1, tall);
  const under = add(new THREE.CapsuleGeometry(p.girth * 0.8, p.len * 0.75, 4, 10), belly, body, 0, -p.girth * 0.28, 0.02);
  under.rotation.x = Math.PI / 2;
  under.scale.set(wide * 0.95, 1, tall * 0.9);
  if (p.hump) add(new THREE.SphereGeometry(p.girth * 0.72, 12, 10), main, body, 0, p.girth * 0.5, p.len * 0.28);
  if (p.ruff) add(new THREE.SphereGeometry(p.girth * 0.9, 12, 10), belly, body, 0, 0.02, p.len * 0.45).scale.set(0.95, 1.05, 0.8);

  const head = new THREE.Group();
  head.position.set(0, p.girth * (p.headUp ?? 0.55), p.len / 2 + p.girth * 0.72);
  body.add(head);
  add(new THREE.SphereGeometry(p.headR, 14, 12), main, head).scale.set(0.92, 0.86, 1.05);
  const snout = add(new THREE.CapsuleGeometry(p.headR * 0.46, p.snout, 4, 8), p.muzzle ? M(p.muzzle) : main, head, 0, -p.headR * 0.22, p.headR * 0.72 + p.snout * 0.4);
  snout.rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(p.headR * 0.2, 8, 6), nose, head, 0, -p.headR * 0.12, p.headR * 0.95 + p.snout * 0.85);
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(p.headR * 0.13, 8, 6), eye, head, s * p.headR * 0.45, p.headR * 0.22, p.headR * 0.74);
    if (p.ears === 'pointy') {
      const ear = add(new THREE.ConeGeometry(p.headR * 0.3, p.headR * 0.7, 4), main, head, s * p.headR * 0.5, p.headR * 0.85, -p.headR * 0.1);
      ear.rotation.z = -s * 0.25;
    } else if (p.ears === 'round') {
      add(new THREE.SphereGeometry(p.headR * 0.28, 8, 6), main, head, s * p.headR * 0.62, p.headR * 0.72, -p.headR * 0.15).scale.set(1, 1, 0.5);
    } else {
      const ear = add(new THREE.ConeGeometry(p.headR * 0.18, p.headR * 0.55, 4), main, head, s * p.headR * 0.78, p.headR * 0.45, -p.headR * 0.1);
      ear.rotation.z = -s * 1.2;
    }
    if (p.horns) {
      const horn = add(new THREE.TorusGeometry(p.headR * 0.55, p.headR * 0.11, 6, 10, Math.PI * 1.15), dark, head, s * p.headR * 0.32, p.headR * 0.75, -p.headR * 0.45);
      horn.rotation.set(0, Math.PI / 2, 0.3);
    }
  }
  if (p.beard) {
    const b = add(new THREE.ConeGeometry(p.headR * 0.2, p.headR * 0.6, 6), belly, head, 0, -p.headR * 0.8, p.headR * 0.75);
    b.rotation.x = Math.PI;
  }

  const legs = [];
  const L = p.legLen + p.girth * 0.15;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * p.girth * 0.55 * wide, -p.girth * 0.35, sz * p.len * 0.42);
    body.add(pivot);
    add(new THREE.CapsuleGeometry(p.legR, Math.max(0.01, L - 2 * p.legR), 3, 8), main, pivot, 0, -L / 2, 0);
    add(new THREE.SphereGeometry(p.legR * 1.15, 8, 6), dark, pivot, 0, -L + p.legR * 0.9, p.legR * 0.3);
    legs.push(pivot);
  }

  const tail = new THREE.Group();
  tail.position.set(0, p.girth * 0.3, -p.len / 2 - p.girth * 0.6);
  body.add(tail);
  const tm = add(new THREE.CapsuleGeometry(p.tailR, p.tailLen, 4, 8), p.tailTip ? dark : main, tail, 0, 0, -p.tailLen / 2);
  tm.rotation.x = Math.PI / 2;
  tail.rotation.x = p.tailDroop ?? -0.5;

  if (p.spots) {
    const spot = M(p.dark);
    for (let k = 0; k < 26; k++) {
      const a = (k * 2.399) % TAU;
      const z = ((k * 0.618) % 1 - 0.5) * p.len * 1.1;
      if (Math.sin(a) < -0.3) continue;
      const s = add(new THREE.SphereGeometry(p.girth * 0.12, 6, 4), spot, body, Math.cos(a) * p.girth * wide * 0.98, Math.sin(a) * p.girth * tall * 0.98, z);
      s.scale.set(1, 1, 0.45);
      s.lookAt(new THREE.Vector3(0, 0, z));
      s.castShadow = false;
    }
  }
  return { root, body, head, legs, tail, mats, eye, len: p.len + p.girth * 2, bodyY: body.position.y };
}

const BUILD = {
  wolf: () => buildQuadruped({
    len: 0.75, girth: 0.27, legLen: 0.5, legR: 0.065, headR: 0.2, snout: 0.17, color: '#7f858c', belly: '#c7c8c3', dark: '#3a3d42',
    ears: 'pointy', tailR: 0.09, tailLen: 0.5, tailDroop: -0.55, ruff: true, eye: '#ffd23a', eyeGlow: '#ffc21a', muzzle: '#c7c8c3',
  }),
  bear: () => buildQuadruped({
    len: 1.0, girth: 0.56, wide: 1.1, legLen: 0.48, legR: 0.15, headR: 0.34, snout: 0.16, color: '#5b3a24', belly: '#6e4a2f', dark: '#2a1a10',
    ears: 'round', hump: true, tailR: 0.1, tailLen: 0.1, tailDroop: -0.2, muzzle: '#8a6544',
  }),
  goat: () => buildQuadruped({
    len: 0.6, girth: 0.28, legLen: 0.56, legR: 0.055, headR: 0.17, snout: 0.12, color: '#ebe6da', belly: '#f7f4ec', dark: '#3a342c',
    ears: 'small', horns: true, beard: true, tailR: 0.05, tailLen: 0.1, tailDroop: 0.5,
  }),
  leopard: () => buildQuadruped({
    len: 0.85, girth: 0.25, legLen: 0.42, legR: 0.07, headR: 0.19, snout: 0.05, color: '#d6d0bf', belly: '#eeeadf', dark: '#3b3a36',
    ears: 'round', spots: true, tailR: 0.085, tailLen: 0.95, tailDroop: -0.25, eye: '#9ad1ff', eyeGlow: '#7cc3ff', headUp: 0.4,
  }),
  snake: () => {
    const { mats, M, add } = makeKit();
    const tan = M('#9a7a44'), brown = M('#5a4222'), bellyM = M('#e2cf98');
    const eye = M('#ffd23a', { emissive: '#ffb000', emissiveIntensity: 0 });
    eye.userData.glow = true;
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const segs = [];
    const N = 18;
    for (let i = 0; i < N; i++) {
      const r = 0.12 * (1 - (i / N) * 0.65);
      segs.push({ m: add(new THREE.SphereGeometry(r, 10, 8), i % 3 === 1 ? brown : tan, root), r });
    }
    for (let k = 0; k < 3; k++) segs.push({ m: add(new THREE.SphereGeometry(0.045, 8, 6), bellyM, root), r: 0.045 });
    const head = new THREE.Group();
    root.add(head);
    add(new THREE.SphereGeometry(0.14, 12, 10), tan, head).scale.set(0.9, 0.62, 1.3);
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.03, 6, 6), eye, head, s * 0.08, 0.04, 0.08);
    const tongue = add(new THREE.BoxGeometry(0.02, 0.005, 0.14), M('#d8322b'), head, 0, -0.02, 0.2);
    return { root, segs, head, tongue, mats, eye, len: 2.4 };
  },
  eagle: () => {
    const { mats, M, add } = makeKit();
    const brown = M('#5a3a1e'), white = M('#f2efe6'), yellow = M('#f2b630'), tip = M('#2e2014');
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const body = new THREE.Group();
    root.add(body);
    const torso = add(new THREE.CapsuleGeometry(0.17, 0.45, 4, 10), brown, body);
    torso.rotation.x = Math.PI / 2;
    add(new THREE.SphereGeometry(0.15, 12, 10), white, body, 0, 0.06, 0.38);
    const beak = add(new THREE.ConeGeometry(0.05, 0.16, 6), yellow, body, 0, 0.03, 0.55);
    beak.rotation.x = Math.PI / 2 + 0.3;
    const tail = add(new THREE.BoxGeometry(0.3, 0.04, 0.32), white, body, 0, 0, -0.46);
    tail.rotation.x = 0.1;
    const wings = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(s * 0.12, 0.06, 0.05);
      body.add(w);
      add(new THREE.BoxGeometry(0.75, 0.04, 0.42), brown, w, s * 0.4, 0, 0);
      add(new THREE.BoxGeometry(0.45, 0.035, 0.34), tip, w, s * 0.98, 0, -0.03).rotation.y = s * 0.15;
      wings.push({ g: w, s });
    }
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 5), yellow, body, s * 0.06, -0.16, 0.05);
    return { root, body, wings, mats, len: 1 };
  },
};

// ------------------------------------------------------------------ behavior
const tmp = new THREE.Vector3();

// A red marker that floats over animals while you listen with the stethoscope
let markerMat = null;
function getMarkerMat() {
  if (markerMat) return markerMat;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff3b4b';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(10, 14); ctx.lineTo(54, 14); ctx.lineTo(32, 54); ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  markerMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  return markerMat;
}
const MARKER_Y = { bear: 2.7, wolf: 2.0, goat: 2.2, leopard: 1.9, snake: 1.3, eagle: 1.4 };

class Animal {
  constructor(type, x, z, scene) {
    this.type = type;
    this.cfg = ANIMALS[type];
    this.rig = BUILD[type]();
    this.root = this.rig.root;
    scene.add(this.root);
    this.pos = new THREE.Vector3(x, heightAt(x, z), z);
    this.home = { x, z };
    this.yaw = Math.random() * TAU;
    this.wanderYaw = this.yaw;
    this.speed = 0;
    this.knock = new THREE.Vector3();
    this.hp = this.cfg.hp;
    this.state = type === 'eagle' ? 'circle' : 'wander';
    this.stateT = 0;
    this.nextTurn = 1 + Math.random() * 3;
    this.cd = 0;
    this.calm = 0;
    this.flash = 0;
    this.gait = Math.random() * 10;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.removeT = -1;
    this.removed = false;
    this.windup = 0;
    this.vy = 0;
    this.lift = 0;
    this.orbit = Math.random() * TAU;
    if (type === 'eagle') {
      this.pos.y += 28;
      this.vel = new THREE.Vector3();
    }
    this.spin = 0;
    this.spinA = 0;
    this.laughT = 0;
    this.marker = new THREE.Sprite(getMarkerMat());
    this.marker.scale.setScalar(0.9);
    this.marker.position.y = MARKER_Y[type] || 2;
    this.marker.renderOrder = 999;
    this.marker.visible = false;
    this.root.add(this.marker);
  }

  // Floor cleaner or a banana peel: slip, spin and slide away
  slip(fromX, fromZ, ctx) {
    if (this.state === 'flee' || this.removeT >= 0) return false;
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.knock.set((dx / d) * 16, 0, (dz / d) * 16);
    this.spin = 1.6;
    this.hp = 0;
    this.set('flee');
    ctx.onScared(this, true);
    return true;
  }

  // Rubber chicken: run away
  scare(ctx) {
    if (this.state === 'flee' || this.removeT >= 0) return false;
    this.hp = 0;
    this.set(this.type === 'eagle' ? 'leave' : 'flee');
    ctx.onScared(this, true);
    return true;
  }

  // Whoopee cushion: too busy laughing to attack
  laugh(t) {
    if (this.state === 'flee' || this.removeT >= 0) return false;
    this.calm = t;
    this.laughT = t;
    if (this.type === 'eagle') this.set('leave');
    else if (this.state !== 'wander') this.set('wander');
    return true;
  }

  set(state) {
    this.state = state;
    this.stateT = 0;
  }

  hit(dmg, fromX, fromZ, ctx) {
    if (this.state === 'flee' || this.removeT >= 0) return false;
    this.hp -= dmg;
    this.flash = 0.18;
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.knock.set((dx / d) * 9, 0, (dz / d) * 9);
    if (this.hp <= 0) {
      this.set('flee');
      ctx.onScared(this);
    } else if (this.type === 'eagle') {
      this.set('climb');
    } else {
      this.set('stunned');
    }
    return true;
  }

  update(dt, ctx) {
    const P = ctx.playerPos;
    const cfg = this.cfg;
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toYaw = Math.atan2(dx, dz);
    const canHunt = ctx.playerAlive && !ctx.playerSafe && this.calm <= 0;
    const aggro = ctx.night > 0.5 ? cfg.aggroNight : cfg.aggro;
    this.stateT += dt;
    this.cd -= dt;
    this.calm -= dt;
    this.flash -= dt;
    this.laughT -= dt;
    this.marker.visible = ctx.reveal > 0 && this.removeT < 0;
    if (ctx.peels && this.type !== 'eagle' && this.state !== 'flee') {
      for (const pl of ctx.peels) {
        if (pl.used) continue;
        if (Math.abs(pl.x - this.pos.x) + Math.abs(pl.z - this.pos.z) < 1.8) {
          pl.used = true;
          ctx.onPeel(pl, this);
          this.slip(pl.x - Math.sin(this.yaw), pl.z - Math.cos(this.yaw), ctx);
          break;
        }
      }
    }

    if (this.type === 'eagle') {
      this.updateEagle(dt, ctx, P, canHunt);
    } else {
      let targetSpeed = 0;
      let targetYaw = this.yaw;
      let turn = 5;
      switch (this.state) {
        case 'wander': {
          if (this.stateT > this.nextTurn) {
            this.wanderYaw += (Math.random() - 0.5) * 2.4;
            this.nextTurn = this.stateT + 2 + Math.random() * 4;
            this.idle = Math.random() < 0.35;
          }
          if (Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 40) {
            this.wanderYaw = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z);
          }
          targetSpeed = this.idle ? 0 : cfg.walk;
          targetYaw = this.wanderYaw;
          turn = 2.5;
          if (canHunt && dist < aggro) {
            this.set(this.type === 'goat' ? 'charge' : 'chase');
            this.chargeYaw = toYaw;
            ctx.onAlert(this);
          }
          break;
        }
        case 'chase': {
          targetYaw = toYaw;
          targetSpeed = dist < cfg.range * 0.8 ? 0 : cfg.run;
          turn = 8;
          if (this.type === 'leopard' && dist < 7.5 && dist > 2.5 && this.cd <= 0) {
            this.set('pounce');
            this.pounceDir = { x: dx / dist, z: dz / dist };
            this.vy = 6.5;
            ctx.onSound('roar', this);
            break;
          }
          if (dist < cfg.range && this.cd <= 0) this.set('windup');
          else if (!canHunt || this.stateT > cfg.chaseTime || dist > aggro * 2.4) {
            this.set('wander');
            this.calm = 6;
          }
          break;
        }
        case 'charge': {
          // Mountain goat: head down, straight line, can't steer
          targetYaw = this.chargeYaw;
          targetSpeed = this.stateT < 0.45 ? 0 : cfg.run;
          turn = this.stateT < 0.45 ? 10 : 0.5;
          if (this.stateT < 0.45) this.chargeYaw = toYaw;
          if (this.stateT >= 0.45 && dist < cfg.range && this.cd <= 0) {
            ctx.hurtPlayer(cfg.dmg, this, dx / (dist || 1), dz / (dist || 1), 14);
            this.cd = cfg.cd;
            this.set('wander');
            this.wanderYaw = toYaw + Math.PI;
            this.calm = 5;
          } else if (this.stateT > cfg.chaseTime) {
            this.set('wander');
            this.calm = 3;
          }
          break;
        }
        case 'pounce': {
          this.pos.x += this.pounceDir.x * 12 * dt;
          this.pos.z += this.pounceDir.z * 12 * dt;
          targetYaw = Math.atan2(this.pounceDir.x, this.pounceDir.z);
          turn = 12;
          if (this.stateT > 0.2 && this.lift <= 0.01) {
            if (dist < cfg.range * 1.3 && canHunt) ctx.hurtPlayer(cfg.dmg, this, dx / (dist || 1), dz / (dist || 1), 8);
            this.cd = cfg.cd + 1;
            this.set('recover');
          }
          break;
        }
        case 'windup': {
          targetYaw = toYaw;
          turn = 10;
          this.windup = Math.min(1, this.stateT / 0.35);
          if (this.stateT > 0.35) {
            if (dist < cfg.range * 1.35 && canHunt) ctx.hurtPlayer(cfg.dmg, this, dx / (dist || 1), dz / (dist || 1), 7);
            this.cd = cfg.cd;
            this.set('recover');
          }
          break;
        }
        case 'recover': {
          targetYaw = toYaw + this.side * 1.9;
          targetSpeed = cfg.walk * 0.8;
          if (this.stateT > 0.7) this.set(canHunt ? 'chase' : 'wander');
          break;
        }
        case 'stunned': {
          targetSpeed = 0;
          if (this.stateT > 0.6) this.set(canHunt ? 'chase' : 'wander');
          break;
        }
        case 'flee': {
          targetYaw = toYaw + Math.PI;
          targetSpeed = (cfg.run || 6) * 1.2;
          turn = 8;
          if (this.stateT > 2.4 && this.removeT < 0) this.removeT = 0;
          break;
        }
      }
      if (this.state !== 'windup') this.windup = Math.max(0, this.windup - dt * 4);

      this.speed = damp(this.speed, targetSpeed, 6, dt);
      this.yaw = dampAngle(this.yaw, targetYaw, turn, dt);
      const step = this.speed * dt;
      let nx = this.pos.x + Math.sin(this.yaw) * step + this.knock.x * dt;
      let nz = this.pos.z + Math.cos(this.yaw) * step + this.knock.z * dt;
      this.knock.multiplyScalar(Math.exp(-dt * 6));

      // Fire keeps animals out of camps; deep water and the valley edge turn them back
      const blocked = inSafeZone(nx, nz, 1.5) || heightAt(nx, nz) < WATER - 0.4 || Math.hypot(nx, nz) > BOUND_R;
      if (blocked) {
        nx = this.pos.x;
        nz = this.pos.z;
        this.wanderYaw = this.yaw + Math.PI * (0.6 + Math.random() * 0.8);
        if (this.state === 'chase' || this.state === 'charge') { this.set('wander'); this.calm = 4; }
      }
      // Animals push apart from the player so they don't overlap
      if (dist < cfg.radius + 0.5 && dist > 0.01) {
        nx -= (dx / dist) * (cfg.radius + 0.5 - dist);
        nz -= (dz / dist) * (cfg.radius + 0.5 - dist);
      }
      const gh = heightAt(nx, nz);
      if (this.state === 'pounce' || this.lift > 0) {
        this.vy -= 22 * dt;
        this.lift = Math.max(0, this.lift + this.vy * dt);
      }
      this.pos.set(nx, gh, nz);
      this.animateGround(dt, ctx, gh);
    }

    if (this.removeT >= 0) {
      this.removeT += dt;
      const s = Math.max(0.001, 1 - this.removeT / 0.4);
      this.root.scale.setScalar(s);
      if (this.removeT > 0.4) this.removed = true;
    }

    // Hit flash and glowing eyes at night
    const glow = ctx.night;
    for (const m of this.rig.mats) {
      if (this.flash > 0) {
        m.emissive.set('#ff2a2a');
        m.emissiveIntensity = 0.7;
      } else if (m.userData.glow) {
        m.emissive.copy(m.userData.baseEmissive);
        m.emissiveIntensity = glow * 2.2;
      } else {
        m.emissive.copy(m.userData.baseEmissive);
        m.emissiveIntensity = m.userData.baseIntensity;
      }
    }
  }

  animateGround(dt, ctx, gh) {
    const r = this.rig;
    this.root.position.set(this.pos.x, gh + this.lift, this.pos.z);
    const half = r.len * 0.4;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hF = heightAt(this.pos.x + fx * half, this.pos.z + fz * half);
    const hB = heightAt(this.pos.x - fx * half, this.pos.z - fz * half);
    const pitch = -Math.atan2(hF - hB, half * 2);
    if (this.spin > 0) {
      this.spin -= dt;
      this.spinA += dt * 16;
    }
    this.root.rotation.y = this.yaw + this.spinA;
    this.root.rotation.x = damp(this.root.rotation.x, clamp(pitch, -0.6, 0.6) - (this.state === 'pounce' ? 0.3 : 0), 8, dt);
    if (this.laughT > 0) this.root.position.y += Math.abs(Math.sin(ctx.time * 14 + this.gait)) * 0.3;

    const sp = this.speed;
    this.gait += dt * (2 + sp * 2.1);
    if (this.type === 'snake') {
      const alert = this.state !== 'wander' ? 1 : 0;
      const wiggle = 0.12 + Math.min(sp, 3) * 0.06;
      const t = this.gait;
      const segs = r.segs;
      for (let i = 0; i < segs.length; i++) {
        const along = i * 0.13;
        const coil = 1 - alert;
        const ang = i * 0.55;
        const cx = Math.sin(t * 0.8 - i * 0.55) * wiggle * (0.3 + (i / segs.length));
        const sx = Math.cos(ang) * (0.15 + i * 0.018);
        const sz = Math.sin(ang) * (0.15 + i * 0.018) - 0.1;
        segs[i].m.position.set(cx * (1 - coil) + sx * coil, segs[i].r * 0.9, -along * (1 - coil) + sz * coil);
      }
      const strike = this.state === 'windup' ? Math.sin(Math.min(1, this.stateT / 0.35) * Math.PI) : 0;
      r.head.position.set(0, 0.12 + alert * 0.28, 0.12 + strike * 0.7);
      r.head.rotation.x = -alert * 0.3;
      r.tongue.visible = Math.sin(ctx.time * 9 + this.gait) > 0.4;
      // Rattle shakes when alert
      const tail = segs[segs.length - 1].m;
      tail.position.x += alert * Math.sin(ctx.time * 60) * 0.03;
      return;
    }
    const amp = clamp(sp / 4, 0, 1) * 0.75;
    const s = Math.sin(this.gait);
    r.legs[0].rotation.x = s * amp;
    r.legs[3].rotation.x = s * amp;
    r.legs[1].rotation.x = -s * amp;
    r.legs[2].rotation.x = -s * amp;
    r.body.position.y = r.bodyY + Math.abs(Math.cos(this.gait)) * 0.04 * amp;
    r.head.rotation.x = Math.sin(this.gait * 2) * 0.05 * amp + (this.state === 'charge' && this.stateT > 0.3 ? 0.45 : 0);
    r.tail.rotation.y = Math.sin(ctx.time * (this.state === 'wander' ? 3 : 8)) * 0.35;
    // Bears rear up on their hind legs before swiping
    if (this.type === 'bear') r.body.rotation.x = -this.windup * 0.75;
    else r.body.rotation.x = -this.windup * 0.25;
  }

  updateEagle(dt, ctx, P, canHunt) {
    const r = this.rig;
    let target;
    let speed = 10;
    switch (this.state) {
      case 'circle': {
        this.orbit += dt * 0.55;
        target = tmp.set(P.x + Math.cos(this.orbit) * 15, P.y + 16, P.z + Math.sin(this.orbit) * 15);
        if (this.stateT > 5 + Math.random() * 0.5 && canHunt && this.cd <= 0) {
          this.set('dive');
          ctx.onAlert(this);
        }
        if (!canHunt && this.stateT > 12) this.set('leave');
        break;
      }
      case 'dive': {
        target = tmp.set(P.x, P.y + 1.2, P.z);
        speed = 17;
        if (this.pos.distanceTo(target) < 1.6) {
          if (canHunt) ctx.hurtPlayer(this.cfg.dmg, this, 0, 0, 3);
          this.cd = this.cfg.cd;
          this.set('climb');
        } else if (this.stateT > 3.5 || !canHunt) {
          this.cd = 2;
          this.set('climb');
        }
        break;
      }
      case 'climb': {
        target = tmp.set(this.pos.x + Math.sin(this.yaw) * 20, P.y + 24, this.pos.z + Math.cos(this.yaw) * 20);
        speed = 12;
        if (this.stateT > 2.5) this.set('circle');
        break;
      }
      case 'flee':
      case 'leave': {
        target = tmp.set(this.pos.x + Math.sin(this.yaw) * 30, this.pos.y + 20, this.pos.z + Math.cos(this.yaw) * 30);
        speed = 14;
        if (this.stateT > 3 && this.removeT < 0) this.removeT = 0;
        break;
      }
      default:
        this.set('circle');
        target = tmp.copy(this.pos);
    }
    const desired = target.clone().sub(this.pos);
    const d = desired.length();
    if (d > 0.001) desired.multiplyScalar(speed / d);
    this.vel.lerp(desired, 1 - Math.exp(-dt * (this.state === 'dive' ? 3 : 2)));
    this.pos.addScaledVector(this.vel, dt);
    const ground = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < ground + 1.2) this.pos.y = ground + 1.2;
    this.yaw = Math.atan2(this.vel.x, this.vel.z);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    const hv = Math.hypot(this.vel.x, this.vel.z) || 1;
    this.root.rotation.x = damp(this.root.rotation.x, -Math.atan2(this.vel.y, hv) * 0.8, 5, dt);
    this.root.rotation.z = damp(this.root.rotation.z, this.state === 'circle' ? 0.45 : 0, 3, dt);
    const flap = this.state === 'dive' ? 0 : Math.sin(ctx.time * (this.state === 'climb' ? 12 : 4)) * 0.5;
    for (const w of r.wings) {
      w.g.rotation.z = w.s * (this.state === 'dive' ? 0.5 : flap);
      w.g.rotation.y = w.s * (this.state === 'dive' ? -0.7 : 0);
    }
  }

  dispose(scene) {
    scene.remove(this.root);
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.rig.mats) m.dispose();
  }
}

export class AnimalManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.spawnT = 3;
  }

  clear() {
    for (const a of this.list) a.dispose(this.scene);
    this.list = [];
    this.spawnT = 3;
  }

  count(type) {
    return this.list.filter((a) => a.type === type && a.removeT < 0).length;
  }

  spawn(type, x, z) {
    const a = new Animal(type, x, z, this.scene);
    this.list.push(a);
    return a;
  }

  pickType(h, night) {
    const opts = [];
    let total = 0;
    for (const [type, c] of Object.entries(ANIMALS)) {
      if (h < c.minH || h > c.maxH) continue;
      const w = night ? c.night : c.day;
      if (w <= 0) continue;
      if (type === 'eagle' && this.count('eagle') >= 1) continue;
      opts.push([type, w]);
      total += w;
    }
    let roll = Math.random() * total;
    for (const [type, w] of opts) {
      roll -= w;
      if (roll <= 0) return type;
    }
    return null;
  }

  trySpawn(ctx) {
    const night = ctx.night > 0.5;
    const max = (night ? 6 : 4) + Math.floor(ctx.progress * 3);
    const active = this.list.filter((a) => a.removeT < 0).length;
    if (active >= max) return;
    const P = ctx.playerPos;
    for (let attempt = 0; attempt < 8; attempt++) {
      const ang = Math.random() * TAU;
      const d = 60 + Math.random() * 55;
      const x = P.x + Math.cos(ang) * d, z = P.z + Math.sin(ang) * d;
      if (Math.hypot(x, z) > BOUND_R - 8) continue;
      const h = heightAt(x, z);
      if (h < WATER + 0.5) continue;
      if (inSafeZone(x, z, 26)) continue;
      const type = this.pickType(h, night);
      if (!type) continue;
      this.spawn(type, x, z);
      if (type === 'wolf' && night && Math.random() < 0.55) this.spawn('wolf', x + 3, z + 2);
      return;
    }
  }

  update(dt, ctx) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.6;
      if (ctx.spawning) this.trySpawn(ctx);
    }
    for (const a of this.list) a.update(dt, ctx);
    const P = ctx.playerPos;
    this.list = this.list.filter((a) => {
      const far = Math.hypot(a.pos.x - P.x, a.pos.z - P.z) > 190;
      if (a.removed || far) {
        a.dispose(this.scene);
        return false;
      }
      return true;
    });
  }

  // Swing of the trekking pole: hits everything in a cone in front of the player
  swing(origin, yaw, reach, dmg, ctx) {
    const hits = [];
    for (const a of this.list) {
      if (a.removeT >= 0 || a.state === 'flee') continue;
      const dx = a.pos.x - origin.x, dz = a.pos.z - origin.z;
      const dy = a.pos.y - origin.y;
      const d = Math.hypot(dx, dz);
      const r = reach + a.cfg.radius;
      if (d > r || Math.abs(dy) > (a.type === 'eagle' ? 3.2 : 2.2)) continue;
      const ang = Math.abs(((Math.atan2(dx, dz) - yaw + Math.PI * 3) % TAU) - Math.PI);
      if (d > 1.2 && ang > 1.25) continue;
      if (a.hit(dmg, origin.x, origin.z, ctx)) hits.push(a);
    }
    return hits;
  }

  // Run fn on every active animal within radius r (and optionally in a cone)
  near(P, r, fn, yaw = null, cone = Math.PI) {
    let n = 0;
    for (const a of this.list) {
      if (a.removeT >= 0) continue;
      const dx = a.pos.x - P.x, dz = a.pos.z - P.z;
      if (Math.hypot(dx, dz) > r) continue;
      if (yaw !== null) {
        const ang = Math.abs(((Math.atan2(dx, dz) - yaw + Math.PI * 3) % TAU) - Math.PI);
        if (ang > cone && Math.hypot(dx, dz) > 2) continue;
      }
      if (fn(a)) n++;
    }
    return n;
  }

  // Closest animal that is hunting the player (for HUD warnings)
  threats(P) {
    return this.list.filter((a) => ['chase', 'charge', 'windup', 'pounce', 'dive'].includes(a.state));
  }
}
