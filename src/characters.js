// The two climbers, built from simple shapes so they animate smoothly.
//   Daddy: 6'2", bald, Navy doctor in a navy jacket with aviators.
//   Dr. Rielle (a.k.a. Mrs. Rielle): doctor in a white coat with a ponytail.
import * as THREE from 'three';
import { clamp, damp, canvasTexture, FONT_STACK } from './util.js';

export const SKIN_TONES = ['#f3cfb3', '#e2ad84', '#c68a5e', '#9a6440', '#6b4128'];
export const HAIR_COLORS = ['#5a3620', '#1e1a18', '#d4ad5e', '#9c3b1f'];

export const CHARACTERS = {
  daddy: {
    id: 'daddy',
    name: 'Daddy',
    role: 'Navy Doctor',
    blurb: '6\'2" Navy doctor',
    heightM: 1.88,
    perks: ['30% more health', 'Big ice-axe swing', 'Longer stride'],
    stats: { maxHealth: 130, damage: 1.6, speed: 1.07, stamina: 1.0, heal: 1.0, hunger: 1.1, regen: 1.0 },
    colors: { skin: SKIN_TONES[1], top: '#1d3557', sleeve: '#1d3557', pants: '#3b4049', boots: '#5a3b22', pack: '#d2561c', trim: '#f2c230' },
  },
  rielle: {
    id: 'rielle',
    name: 'Dr. Rielle',
    aka: 'Mrs. Rielle',
    role: 'Doctor',
    blurb: 'a.k.a. Mrs. Rielle',
    heightM: 1.68,
    perks: ['First aid heals double', 'Extra stamina', 'Heals faster on the move'],
    stats: { maxHealth: 100, damage: 1.0, speed: 1.0, stamina: 1.4, heal: 2.0, hunger: 1.0, regen: 2.0 },
    colors: { skin: SKIN_TONES[0], top: '#f4f6f8', sleeve: '#f4f6f8', pants: '#2aa79b', boots: '#7a4a2a', pack: '#d63a4a', hair: HAIR_COLORS[0], scrubs: '#2aa79b' },
  },
};

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
}

function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function nameTape(text, bg, fg) {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.font = `900 44px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

function anchorPatch() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#14284a';
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f2c230';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(64, 26); ctx.lineTo(64, 100);
    ctx.moveTo(42, 42); ctx.lineTo(86, 42);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 70, 30, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 22, 8, 0, Math.PI * 2);
    ctx.stroke();
  });
}

export function buildCharacter(def, custom = {}) {
  const colors = { ...def.colors, ...custom };
  const u = def.heightM / 1.8;
  const isDaddy = def.id === 'daddy';
  const sw = isDaddy ? 1.38 : 1.12; // shoulder width factor

  const mats = {
    skin: std(colors.skin, { roughness: isDaddy ? 0.38 : 0.6 }),
    top: std(colors.top, { roughness: 0.8 }),
    sleeve: std(colors.sleeve, { roughness: 0.8 }),
    pants: std(colors.pants, { roughness: 0.85 }),
    boots: std(colors.boots, { roughness: 0.7 }),
    pack: std(colors.pack, { roughness: 0.7 }),
    dark: std('#1b1d21', { roughness: 0.5 }),
    eye: std('#2a1d14', { roughness: 0.3 }),
    metal: std('#9aa3ad', { metalness: 0.8, roughness: 0.3 }),
    gold: std('#f2c230', { metalness: 0.9, roughness: 0.3 }),
    white: std('#ffffff'),
    hair: std(colors.hair || '#333', { roughness: 0.7, side: THREE.DoubleSide }),
    lens: std('#121417', { metalness: 0.9, roughness: 0.08 }),
    cheek: std('#f08f8f', { roughness: 0.8 }),
    scrubs: std(colors.scrubs || '#2aa79b'),
    axe: std('#1f4fb0', { roughness: 0.5 }),
  };

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95 * u;
  root.add(hips);
  mesh(new THREE.CapsuleGeometry(0.14 * u, 0.12 * u * sw, 4, 10), mats.pants, hips).rotation.z = Math.PI / 2;

  const spine = new THREE.Group();
  spine.position.y = 0.04 * u;
  hips.add(spine);
  const torso = mesh(new THREE.CapsuleGeometry(0.16 * u, 0.26 * u, 4, 14), mats.top, spine, 0, 0.27 * u, 0);
  torso.scale.set(sw, 1, 0.72);

  mesh(new THREE.CylinderGeometry(0.055 * u, 0.062 * u, 0.12 * u, 10), mats.skin, spine, 0, 0.58 * u, 0);

  // Head
  const head = new THREE.Group();
  head.position.y = 0.665 * u;
  spine.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.125 * u, 24, 18), mats.skin, head);
  skull.scale.set(0.92, 1.08, 1);
  const fz = 0.113 * u; // face depth
  mesh(new THREE.SphereGeometry(0.022 * u, 10, 8), mats.skin, head, 0, -0.012 * u, fz + 0.012 * u).scale.set(0.8, 1, 1);
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.03 * u, 10, 8), mats.skin, head, s * 0.112 * u, 0, 0).scale.set(0.45, 1, 0.75);
  }
  const smile = mesh(new THREE.TorusGeometry(0.032 * u, 0.0065 * u, 6, 14, Math.PI), mats.dark, head, 0, -0.052 * u, fz - 0.002 * u);
  smile.rotation.z = Math.PI;

  if (isDaddy) {
    // Aviator sunglasses and a gold bridge
    for (const s of [-1, 1]) {
      const lens = mesh(new THREE.SphereGeometry(0.034 * u, 14, 10), mats.lens, head, s * 0.045 * u, 0.02 * u, fz - 0.004 * u);
      lens.scale.set(1.15, 0.85, 0.35);
      const arm = mesh(new THREE.BoxGeometry(0.006 * u, 0.006 * u, 0.1 * u), mats.gold, head, s * 0.09 * u, 0.028 * u, 0.06 * u);
      arm.rotation.y = s * 0.1;
    }
    mesh(new THREE.BoxGeometry(0.03 * u, 0.006 * u, 0.006 * u), mats.gold, head, 0, 0.038 * u, fz + 0.004 * u);
    for (const s of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.045 * u, 0.01 * u, 0.012 * u), mats.dark, head, s * 0.045 * u, 0.065 * u, fz - 0.01 * u).rotation.z = s * -0.12;
    }
  } else {
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.016 * u, 10, 8), mats.eye, head, s * 0.042 * u, 0.02 * u, fz - 0.004 * u);
      mesh(new THREE.SphereGeometry(0.006 * u, 6, 4), mats.white, head, s * 0.038 * u, 0.026 * u, fz + 0.01 * u);
      const ch = mesh(new THREE.SphereGeometry(0.02 * u, 10, 8), mats.cheek, head, s * 0.068 * u, -0.025 * u, fz - 0.025 * u);
      ch.scale.set(1, 0.6, 0.35);
      mesh(new THREE.BoxGeometry(0.035 * u, 0.008 * u, 0.01 * u), mats.hair, head, s * 0.043 * u, 0.055 * u, fz - 0.006 * u).rotation.z = s * -0.15;
    }
    // Hair: top cap, back, side-swept bangs and a ponytail
    const r = 0.133 * u;
    const cap = mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), mats.hair, head, 0, 0.004 * u, -0.004 * u);
    cap.scale.set(0.95, 1.1, 1.04);
    const back = mesh(new THREE.SphereGeometry(r, 24, 14, Math.PI, Math.PI, 0, Math.PI * 0.78), mats.hair, head, 0, 0.004 * u, -0.006 * u);
    back.scale.set(0.97, 1.1, 1.05);
    const bang = mesh(new THREE.SphereGeometry(0.07 * u, 14, 10), mats.hair, head, -0.035 * u, 0.085 * u, 0.075 * u);
    bang.scale.set(1.3, 0.55, 0.6);
    bang.rotation.z = 0.3;
    mesh(new THREE.TorusGeometry(0.03 * u, 0.012 * u, 8, 14), mats.scrubs, head, 0, 0.05 * u, -0.13 * u);
    const tail = new THREE.Group();
    tail.position.set(0, 0.05 * u, -0.14 * u);
    head.add(tail);
    const pony = mesh(new THREE.CapsuleGeometry(0.042 * u, 0.2 * u, 4, 10), mats.hair, tail, 0, -0.12 * u, -0.02 * u);
    pony.rotation.x = 0.25;
    root.userData.ponytail = tail;
  }

  // Outfit details on the chest
  const chestZ = 0.16 * u * 0.72 + 0.004 * u;
  if (isDaddy) {
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.12 * u, 0.03 * u), new THREE.MeshStandardMaterial({ map: nameTape('DADDY', '#14284a', '#f2c230') }));
    tape.position.set(-0.075 * u, 0.4 * u, chestZ);
    spine.add(tape);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.035 * u, 20), new THREE.MeshStandardMaterial({ map: anchorPatch() }));
    patch.position.set(0.075 * u, 0.4 * u, chestZ);
    spine.add(patch);
    // Gold shoulder boards
    for (const s of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.09 * u, 0.015 * u, 0.07 * u), mats.gold, spine, s * 0.17 * u * sw * 0.86, 0.52 * u, 0);
    }
    // Zipper
    mesh(new THREE.BoxGeometry(0.008 * u, 0.4 * u, 0.006 * u), mats.metal, spine, 0, 0.27 * u, chestZ);
  } else {
    // Teal scrubs showing at the V of the white coat
    const v = new THREE.Shape();
    v.moveTo(-0.06 * u, 0);
    v.lineTo(0.06 * u, 0);
    v.lineTo(0, -0.13 * u);
    v.lineTo(-0.06 * u, 0);
    const vneck = new THREE.Mesh(new THREE.ShapeGeometry(v), mats.scrubs);
    vneck.position.set(0, 0.53 * u, chestZ - 0.003 * u);
    spine.add(vneck);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.1 * u, 0.03 * u), new THREE.MeshStandardMaterial({ map: nameTape('DR. RIELLE', '#ffffff', '#2a5e8c') }));
    badge.position.set(0.07 * u, 0.4 * u, chestZ);
    spine.add(badge);
    // Coat tails
    const coat = mesh(new THREE.CylinderGeometry(0.17 * u * sw, 0.2 * u * sw, 0.3 * u, 16, 1, true), std(colors.top, { side: THREE.DoubleSide }), spine, 0, -0.1 * u, 0);
    coat.scale.z = 0.78;
  }
  // Stethoscope around the neck: both are doctors
  const steth = mesh(new THREE.TorusGeometry(0.085 * u, 0.008 * u, 6, 20, Math.PI * 1.2), mats.dark, spine, 0, 0.5 * u, 0.03 * u);
  steth.rotation.set(Math.PI / 2 + 0.5, 0, Math.PI * 1.6 + 0.3);
  mesh(new THREE.CylinderGeometry(0.02 * u, 0.02 * u, 0.012 * u, 12), mats.metal, spine, 0.04 * u, 0.34 * u, chestZ + 0.008 * u).rotation.x = Math.PI / 2;

  // Backpack with a bedroll
  const pack = mesh(new THREE.BoxGeometry(0.3 * u, 0.42 * u, 0.17 * u), mats.pack, spine, 0, 0.3 * u, -0.19 * u);
  pack.receiveShadow = true;
  mesh(new THREE.CylinderGeometry(0.06 * u, 0.06 * u, 0.34 * u, 10), std('#3c5a40'), spine, 0, 0.55 * u, -0.19 * u).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.03 * u, 0.38 * u, 0.02 * u), mats.dark, spine, s * 0.1 * u, 0.32 * u, chestZ);

  // Arms
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (0.16 * sw + 0.045) * u, 0.47 * u, 0);
    spine.add(shoulder);
    mesh(new THREE.CapsuleGeometry(0.056 * u, 0.2 * u, 4, 10), mats.sleeve, shoulder, 0, -0.15 * u, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3 * u;
    shoulder.add(elbow);
    mesh(new THREE.CapsuleGeometry(0.05 * u, 0.18 * u, 4, 10), mats.sleeve, elbow, 0, -0.12 * u, 0);
    const hand = new THREE.Group();
    hand.position.y = -0.27 * u;
    elbow.add(hand);
    mesh(new THREE.SphereGeometry(0.055 * u, 12, 10), mats.skin, hand).scale.set(0.9, 1.1, 0.8);
    return { shoulder, elbow, hand };
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // Ice axe in the right hand: head in the hand, spike down
  const axe = new THREE.Group();
  armR.hand.add(axe);
  mesh(new THREE.CylinderGeometry(0.016 * u, 0.018 * u, 0.62 * u, 8), mats.axe, axe, 0, -0.3 * u, 0);
  mesh(new THREE.ConeGeometry(0.02 * u, 0.06 * u, 8), mats.metal, axe, 0, -0.64 * u, 0).rotation.x = Math.PI;
  const pick = mesh(new THREE.BoxGeometry(0.03 * u, 0.04 * u, 0.32 * u), mats.metal, axe, 0, 0.02 * u, 0.04 * u);
  pick.rotation.x = 0.12;
  mesh(new THREE.BoxGeometry(0.06 * u, 0.025 * u, 0.06 * u), mats.metal, axe, 0, 0.02 * u, -0.13 * u);

  // Legs
  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.095 * u * (sw * 0.85), -0.02 * u, 0);
    hips.add(hip);
    mesh(new THREE.CapsuleGeometry(0.08 * u, 0.28 * u, 4, 10), mats.pants, hip, 0, -0.21 * u, 0);
    const knee = new THREE.Group();
    knee.position.y = -0.44 * u;
    hip.add(knee);
    mesh(new THREE.CapsuleGeometry(0.066 * u, 0.28 * u, 4, 10), mats.pants, knee, 0, -0.2 * u, 0);
    const boot = mesh(new THREE.BoxGeometry(0.13 * u, 0.11 * u, 0.26 * u), mats.boots, knee, 0, -0.43 * u, 0.04 * u);
    boot.receiveShadow = true;
    return { hip, knee };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // Headlamp (the light itself is added by the game)
  const lamp = mesh(new THREE.CylinderGeometry(0.02 * u, 0.02 * u, 0.018 * u, 12), std('#ffe9a8', { emissive: '#000000' }), head, 0, 0.075 * u, 0.112 * u);
  lamp.rotation.x = Math.PI / 2 - 0.45;

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const rig = {
    def, root, hips, spine, head, armL, armR, legL, legR, axe, lamp, mats, u,
    hipY: 0.95 * u,
    phase: 0,
    eyeHeight: 1.62 * u,
    setSkin(hex) { mats.skin.color.set(hex); },
    setHair(hex) { mats.hair.color.set(hex); },
  };
  return rig;
}

const T = {
  hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
  shL: 0, shR: 0, shLz: 0, shRz: 0, elL: 0, elR: 0, elRz: 0,
  spineX: 0, spineY: 0, headX: 0, headY: 0, bob: 0, rootX: 0,
};

// state: { speed, sprint, grounded, attack (-1 or 0..1), wave, cheer, dead (0..1), t }
export function animateCharacter(rig, dt, s) {
  const walk = clamp(s.speed / 5, 0, 1.7);
  if (walk > 0.04) rig.phase += dt * (4 + s.speed * 1.15);
  else rig.phase += dt * 1.2;
  const p = rig.phase;
  const sin = Math.sin(p), cos = Math.cos(p);
  const amp = 0.6 * Math.min(walk, 1.25);

  T.hipL = -sin * amp;
  T.hipR = sin * amp;
  T.kneeL = Math.max(0, cos) * amp * 1.5 + 0.05;
  T.kneeR = Math.max(0, -cos) * amp * 1.5 + 0.05;
  T.shL = sin * amp * 0.85;
  T.shR = -sin * amp * 0.85;
  T.shLz = 0.06;
  T.shRz = -0.06;
  T.elL = -0.25 - walk * 0.35;
  T.elR = -0.25 - walk * 0.35;
  T.elRz = 0;
  T.spineX = 0.06 + walk * 0.12 + (s.climb || 0) * 0.15;
  T.spineY = sin * 0.08 * walk;
  T.headX = -T.spineX * 0.6;
  T.headY = 0;
  T.bob = (Math.abs(cos) - 0.5) * 0.06 * Math.min(walk, 1.2) * rig.u;
  T.rootX = 0;

  if (walk <= 0.04) {
    // Idle breathing and a slow look around
    const t = s.t || 0;
    T.spineX = 0.03 + Math.sin(t * 1.6) * 0.015;
    T.headY = Math.sin(t * 0.37) * 0.35;
    T.headX = Math.sin(t * 0.5) * 0.06;
    T.bob = Math.sin(t * 1.6) * 0.006 * rig.u;
  }

  if (!s.grounded) {
    T.hipL = -0.6; T.kneeL = 1.0; T.hipR = 0.25; T.kneeR = 0.5;
    T.shL = -0.5; T.shR = -0.5; T.shLz = 0.5; T.shRz = -0.5;
  }

  if (s.wave) {
    const t = s.t || 0;
    T.shRz = -2.5;
    T.shR = -0.2;
    T.elRz = Math.sin(t * 9) * 0.45;
    T.elR = -0.2;
  }
  if (s.cheer) {
    const t = s.t || 0;
    T.shLz = 2.7 + Math.sin(t * 8) * 0.15;
    T.shRz = -2.7 - Math.sin(t * 8) * 0.15;
    T.shL = 0; T.shR = 0; T.elL = -0.2; T.elR = -0.2;
    T.bob = Math.abs(Math.sin(t * 6)) * 0.25 * rig.u;
    T.hipL = -0.2; T.hipR = -0.2; T.kneeL = 0.4; T.kneeR = 0.4;
  }

  if (s.attack >= 0) {
    // Wind up overhead, chop forward, recover
    const a = s.attack;
    let sh;
    if (a < 0.35) sh = -0.5 - (a / 0.35) * 2.9;
    else if (a < 0.55) sh = -3.4 + ((a - 0.35) / 0.2) * 3.0;
    else sh = -0.4 + ((a - 0.55) / 0.45) * 0.1;
    T.shR = sh;
    T.shRz = -0.15;
    T.elR = a < 0.35 ? -0.9 : -0.15;
    T.spineY = a < 0.35 ? 0.35 : -0.25;
    T.spineX += a > 0.35 && a < 0.7 ? 0.2 : 0;
  }

  if (s.dead > 0) {
    T.rootX = -s.dead * Math.PI * 0.48;
    T.shLz = 1.2; T.shRz = -1.2;
  }

  const k = s.attack >= 0 ? 30 : 14;
  rig.legL.hip.rotation.x = damp(rig.legL.hip.rotation.x, T.hipL, 14, dt);
  rig.legR.hip.rotation.x = damp(rig.legR.hip.rotation.x, T.hipR, 14, dt);
  rig.legL.knee.rotation.x = damp(rig.legL.knee.rotation.x, T.kneeL, 14, dt);
  rig.legR.knee.rotation.x = damp(rig.legR.knee.rotation.x, T.kneeR, 14, dt);
  rig.armL.shoulder.rotation.x = damp(rig.armL.shoulder.rotation.x, T.shL, 12, dt);
  rig.armR.shoulder.rotation.x = damp(rig.armR.shoulder.rotation.x, T.shR, k, dt);
  rig.armL.shoulder.rotation.z = damp(rig.armL.shoulder.rotation.z, T.shLz, 10, dt);
  rig.armR.shoulder.rotation.z = damp(rig.armR.shoulder.rotation.z, T.shRz, 10, dt);
  rig.armL.elbow.rotation.x = damp(rig.armL.elbow.rotation.x, T.elL, 12, dt);
  rig.armR.elbow.rotation.x = damp(rig.armR.elbow.rotation.x, T.elR, k, dt);
  rig.armR.elbow.rotation.z = damp(rig.armR.elbow.rotation.z, T.elRz, 14, dt);
  rig.spine.rotation.x = damp(rig.spine.rotation.x, T.spineX, 10, dt);
  rig.spine.rotation.y = damp(rig.spine.rotation.y, T.spineY, s.attack >= 0 ? 24 : 10, dt);
  rig.head.rotation.x = damp(rig.head.rotation.x, T.headX, 6, dt);
  rig.head.rotation.y = damp(rig.head.rotation.y, T.headY, 4, dt);
  rig.hips.position.y = damp(rig.hips.position.y, rig.hipY + T.bob, 18, dt);
  rig.root.rotation.x = damp(rig.root.rotation.x, T.rootX, 6, dt);
  const pony = rig.root.userData.ponytail;
  if (pony) pony.rotation.x = damp(pony.rotation.x, 0.2 + walk * 0.5 + Math.sin(p * 2) * 0.12 * walk, 8, dt);
}
