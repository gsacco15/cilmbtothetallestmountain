// The climber you control: movement on the mountain, survival stats and the
// backpack.
import * as THREE from 'three';
import { heightAt, gradientAt, WATER, BOUND_R } from './heightfield.js';
import { clamp, damp, dampAngle } from './util.js';
import { animateCharacter } from './characters.js';

export const ITEMS = {
  ration: { name: 'Soup', max: 5 },
  water: { name: 'Water bottle', max: 5 },
  firstaid: { name: 'First aid kit', max: 3 },
  warmer: { name: 'Hand warmer', max: 4 },
};

const WALK = 5.0;
const RUN = 9.2;
const tmp = new THREE.Vector3();

export class Player {
  constructor(rig, def) {
    this.rig = rig;
    this.def = def;
    this.s = def.stats;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.grounded = true;
    this.radius = 0.38;
    this.stats = {};
    this.inv = {};
    this.reset(0, 0, 0);
  }

  get maxHealth() {
    return this.s.maxHealth;
  }

  reset(x, z, yaw) {
    this.pos.set(x, heightAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.vy = 0;
    this.yaw = yaw;
    this.grounded = true;
    this.stats = { health: this.maxHealth, food: 100, water: 100, warmth: 100, stamina: 100 };
    this.inv = { ration: 1, water: 1, firstaid: 0, warmer: 0 };
    this.alive = true;
    this.dead = 0;
    this.attackT = -1;
    this.attackCD = 0;
    this.hitMoment = false;
    this.hitDone = false;
    this.invuln = 0;
    this.exhausted = false;
    this.uphill = 0;
    this.lastCause = null;
    this.stepSign = 1;
    this.cheer = false;
    this.wave = false;
    this.stuff = null;
    this.buffs = { skates: 0, pan: 0, bubble: 0, umbrella: 0, umbrellaT: 0, use: 0 };
    this.rig.setGear({});
    if (this.rig.hat) this.rig.hat.visible = true;
    this.rig.medal.visible = false;
    this.rig.root.rotation.set(0, yaw, 0);
    this.rig.root.position.copy(this.pos);
  }

  addItem(key, n) {
    const before = this.inv[key] || 0;
    this.inv[key] = Math.min(ITEMS[key].max, before + n);
    return this.inv[key] - before;
  }

  tryAttack() {
    if (!this.alive || this.attackCD > 0 || this.stats.stamina < 4) return false;
    this.attackT = 0;
    this.attackCD = 0.55;
    this.hitDone = false;
    this.stats.stamina -= 5;
    return true;
  }

  hurt(dmg, cause, kx = 0, kz = 0, knock = 0) {
    if (!this.alive || this.invuln > 0) return false;
    this.stats.health -= dmg;
    this.invuln = 0.6;
    this.knock.set(kx * knock, 0, kz * knock);
    if (knock > 6) { this.vy = Math.max(this.vy, 4.5); this.grounded = false; }
    this.lastCause = cause;
    return true;
  }

  // mv: { x: right, z: forward, len }
  update(dt, mv, sprintHeld, jumpPressed, camYaw, colliders, events) {
    const st = this.stats;
    const b = this.buffs;
    this.hitMoment = false;
    this.attackCD -= dt;
    this.invuln -= dt;
    b.skates = Math.max(0, b.skates - dt);
    b.pan = Math.max(0, b.pan - dt);
    b.bubble = Math.max(0, b.bubble - dt);
    b.use = Math.max(0, b.use - dt);
    b.umbrellaT = Math.max(0, b.umbrellaT - dt);
    if (b.umbrellaT <= 0) b.umbrella = 0;

    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let dx = fx * mv.z + rx * mv.x;
    let dz = fz * mv.z + rz * mv.x;
    const moving = this.alive && mv.len > 0.05;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;

    if (st.stamina <= 0.5) this.exhausted = true;
    if (this.exhausted && st.stamina > 25) this.exhausted = false;
    this.sprinting = sprintHeld && moving && !this.exhausted;

    let speed = (this.sprinting ? RUN : WALK) * this.s.speed * mv.len;
    this.uphill = 0;
    if (moving) {
      const g = gradientAt(this.pos.x, this.pos.z);
      this.uphill = g.x * dx + g.z * dz;
      speed *= this.uphill > 0 ? clamp(1 - this.uphill * 0.55, 0.36, 1) : clamp(1 - this.uphill * 0.12, 1, 1.12);
    }
    if (st.food < 12 || st.water < 12 || st.warmth < 12) speed *= 0.8;
    if (b.skates > 0) speed *= 1.65;
    const ground0 = heightAt(this.pos.x, this.pos.z);
    this.wading = ground0 < WATER - 0.15;
    if (this.wading) speed *= 0.6;

    const k = this.grounded ? 12 : 3;
    this.vel.x = damp(this.vel.x, moving ? dx * speed : 0, k, dt);
    this.vel.z = damp(this.vel.z, moving ? dz * speed : 0, k, dt);

    let nx = this.pos.x + (this.vel.x + this.knock.x) * dt;
    let nz = this.pos.z + (this.vel.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.exp(-dt * 7));

    // Deep water is too cold to swim in: slide along the shore instead
    const deep = (x, z) => heightAt(x, z) < WATER - 0.8;
    if (deep(nx, nz)) {
      if (!deep(nx, this.pos.z)) nz = this.pos.z;
      else if (!deep(this.pos.x, nz)) nx = this.pos.x;
      else { nx = this.pos.x; nz = this.pos.z; }
    }
    const r = Math.hypot(nx, nz);
    if (r > BOUND_R) { nx *= BOUND_R / r; nz *= BOUND_R / r; }
    tmp.set(nx, 0, nz);
    colliders.resolve(tmp, this.radius);
    this.pos.x = tmp.x;
    this.pos.z = tmp.z;

    const ground = heightAt(this.pos.x, this.pos.z);
    if (jumpPressed && this.alive && this.grounded && st.stamina > 6) {
      this.vy = 7.2;
      this.grounded = false;
      st.stamina -= 6;
      events.push('jump');
    }
    this.vy -= 22 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vy = 0;
      this.grounded = true;
    } else if (this.grounded && this.vy <= 0 && this.pos.y - ground < 0.7) {
      this.pos.y = ground; // stick to the slope when walking downhill
      this.vy = 0;
    } else {
      this.grounded = false;
    }

    // Face where you're going (or where you're swinging)
    if (this.attackT >= 0) this.yaw = dampAngle(this.yaw, camYaw, 16, dt);
    else if (moving) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 11, dt);

    if (this.attackT >= 0) {
      this.attackT += dt / 0.5;
      if (!this.hitDone && this.attackT > 0.45) {
        this.hitDone = true;
        this.hitMoment = true;
      }
      if (this.attackT >= 1) this.attackT = -1;
    }

    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.speed = sp;
    if (!this.alive) this.dead = Math.min(1, this.dead + dt * 1.4);
    animateCharacter(this.rig, dt, {
      speed: this.alive ? sp : 0,
      grounded: this.grounded,
      attack: this.attackT,
      dead: this.dead,
      t: performance.now() / 1000,
      climb: clamp(this.uphill, 0, 1),
      cheer: this.cheer,
      wave: this.wave,
      umbrella: b.umbrella > 0 && this.alive,
      use: b.use,
    });
    this.rig.setGear({ pan: b.pan > 0, umbrella: b.umbrella > 0 && this.alive, skates: b.skates > 0 });
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;

    // Footsteps follow the walk cycle
    const s = Math.sign(Math.sin(this.rig.phase));
    if (this.grounded && sp > 1 && s !== this.stepSign) events.push('step');
    this.stepSign = s;
  }

  // env: { altitude01, night, sun, nearFire, air, inTent }
  updateStats(dt, env) {
    const st = this.stats;
    const moving = this.speed > 0.5;
    const running = this.sprinting && this.speed > 6;
    if (this.buffs.bubble > 0) st.stamina = 100;
    else if (running) st.stamina -= (21 / this.s.stamina) * dt;
    else st.stamina += 15 * env.air * (this.grounded ? 1 : 0.3) * (moving ? 0.75 : 1.2) * dt;
    st.stamina = clamp(st.stamina, 0, 100);

    const effort = 1 + (running ? 1.1 : 0) + Math.max(0, this.uphill) * 0.6;
    st.food -= 0.24 * this.s.hunger * effort * dt;
    st.water -= 0.32 * effort * (1 + env.altitude01 * 0.3) * dt;

    const cold = env.altitude01 * 1.15 + env.night * 0.65 + (this.wading ? 0.5 : 0) - env.sun * 0.25;
    if (env.nearFire) st.warmth += 14 * dt;
    else if (cold > 0.32) st.warmth -= (cold - 0.32) * 1.2 * dt;
    else st.warmth += 2 * dt;

    st.food = clamp(st.food, 0, 100);
    st.water = clamp(st.water, 0, 100);
    st.warmth = clamp(st.warmth, 0, 100);

    let dmg = 0;
    let cause = null;
    if (st.food <= 0) { dmg += 1.1; cause = 'starve'; }
    if (st.water <= 0) { dmg += 1.5; cause = 'thirst'; }
    if (st.warmth <= 0) { dmg += 1.8; cause = 'cold'; }
    if (dmg > 0) {
      st.health -= dmg * dt;
      this.lastCause = cause;
    } else if (st.health > 0 && st.food > 35 && st.water > 35 && st.warmth > 25) {
      st.health += 0.55 * this.s.regen * dt;
    }
    st.health = Math.min(this.maxHealth, st.health);
  }
}
