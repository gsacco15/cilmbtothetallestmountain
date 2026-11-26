// The two climbers, built from simple shapes so they animate smoothly.
//   Daddy: 6'2", bald Navy doctor. Black beanie with a headlamp, short beard,
//          black fleece, khaki pants, gray gloves and two blue trekking poles.
//   Dr. Rielle (a.k.a. Mrs. Rielle): doctor with long dark hair, a tan sherpa
//          jacket over a lavender layer and olive leggings.
import * as THREE from 'three';
import { clamp, damp, canvasTexture, FONT_STACK, toon } from './util.js';

export const SKIN_TONES = ['#f1cdb3', '#e2ad84', '#c68a5e', '#9a6440', '#6b4128'];
export const HAIR_COLORS = ['#33201a', '#5a3620', '#1e1a18', '#d4ad5e', '#9c3b1f'];

export const CHARACTERS = {
  daddy: {
    id: 'daddy',
    name: 'Daddy',
    role: 'Navy Doctor',
    blurb: '6\'2" Navy doctor',
    heightM: 1.88,
    perks: ['30% more health', 'Big pole swing', 'Longer stride'],
    stats: { maxHealth: 130, damage: 1.6, speed: 1.07, stamina: 1.0, heal: 1.0, hunger: 1.1, regen: 1.0 },
    colors: {
      skin: SKIN_TONES[0], top: '#1b1c20', sleeve: '#1b1c20', pants: '#c3b290', boots: '#3d332a', pack: '#d2561c',
      gloves: '#8d9196', beanie: '#16171a', collar: '#c3c8cd', beard: '#6e523e', pole: '#2456d6',
    },
  },
  rielle: {
    id: 'rielle',
    name: 'Dr. Rielle',
    aka: 'Mrs. Rielle',
    role: 'Doctor',
    blurb: 'a.k.a. Mrs. Rielle',
    heightM: 1.68,
    perks: ['First aid heals double', 'Extra stamina', 'Brings random stuff'],
    stats: { maxHealth: 100, damage: 1.0, speed: 1.0, stamina: 1.4, heal: 2.0, hunger: 1.0, regen: 2.0 },
    colors: {
      skin: SKIN_TONES[0], top: '#b59d76', sleeve: '#b59d76', pants: '#7b8366', boots: '#ece9e2', pack: '#8fb08a',
      hair: HAIR_COLORS[0], layer: '#c8b7e6', pocket: '#9a835f', pole: '#9b84d8',
    },
  },
};

function std(color, extra = {}) {
  return toon({ color, ...extra });
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
  return canvasTexture(128, 128, (ctx) => {
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

// Fluffy bumps for the sherpa jacket
let sherpaTex = null;
function sherpaBump() {
  if (sherpaTex) return sherpaTex;
  sherpaTex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 90 + Math.floor(Math.random() * 120);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  sherpaTex.colorSpace = THREE.NoColorSpace;
  sherpaTex.wrapS = sherpaTex.wrapT = THREE.RepeatWrapping;
  sherpaTex.repeat.set(3, 3);
  return sherpaTex;
}

let medalTex = null;
function medalFace() {
  if (medalTex) return medalTex;
  medalTex = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#c9ced4';
    ctx.beginPath();
    ctx.arc(64, 64, 63, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7d858e';
    ctx.beginPath();
    ctx.moveTo(18, 88); ctx.lineTo(52, 36); ctx.lineTo(68, 58); ctx.lineTo(82, 42); ctx.lineTo(110, 88);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(44, 48); ctx.lineTo(52, 36); ctx.lineTo(60, 48);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a4048';
    ctx.font = `900 17px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText('8,849 M', 64, 108);
  });
  return medalTex;
}

// A trekking pole held at the grip; the shaft points along the hand's -y
function makePole(color, u, parent) {
  const g = new THREE.Group();
  parent.add(g);
  const shaftMat = std(color, { metalness: 0.6, roughness: 0.35 });
  const dark = std('#1a1b1e', { roughness: 0.8 });
  mesh(new THREE.CylinderGeometry(0.022 * u, 0.02 * u, 0.13 * u, 10), dark, g, 0, 0.0, 0);
  mesh(new THREE.TorusGeometry(0.03 * u, 0.005 * u, 5, 12), dark, g, 0, 0.07 * u, 0).rotation.y = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.012 * u, 0.012 * u, 0.4 * u, 8), shaftMat, g, 0, -0.26 * u, 0);
  mesh(new THREE.CylinderGeometry(0.009 * u, 0.009 * u, 0.42 * u, 8), shaftMat, g, 0, -0.66 * u, 0);
  mesh(new THREE.CylinderGeometry(0.014 * u, 0.014 * u, 0.03 * u, 8), dark, g, 0, -0.46 * u, 0);
  mesh(new THREE.CylinderGeometry(0.035 * u, 0.035 * u, 0.006 * u, 12), dark, g, 0, -0.8 * u, 0);
  mesh(new THREE.ConeGeometry(0.008 * u, 0.04 * u, 6), std('#b9c0c8', { metalness: 0.9 }), g, 0, -0.89 * u, 0).rotation.x = Math.PI;
  return g;
}

export function buildCharacter(def, custom = {}) {
  const colors = { ...def.colors, ...custom };
  const u = def.heightM / 1.8;
  const isDaddy = def.id === 'daddy';
  const sw = isDaddy ? 1.38 : 1.12; // shoulder width factor

  const mats = {
    skin: std(colors.skin, { roughness: isDaddy ? 0.4 : 0.6 }),
    top: isDaddy ? std(colors.top, { roughness: 0.95 }) : std(colors.top, { roughness: 1, bumpMap: sherpaBump(), bumpScale: 3 }),
    pants: std(colors.pants, { roughness: isDaddy ? 0.85 : 0.6 }),
    boots: std(colors.boots, { roughness: 0.7 }),
    pack: std(colors.pack, { roughness: 0.7 }),
    hands: isDaddy ? std(colors.gloves, { roughness: 0.95 }) : null,
    dark: std('#1b1d21', { roughness: 0.5 }),
    eye: std('#2a1d14', { roughness: 0.3 }),
    metal: std('#9aa3ad', { metalness: 0.8, roughness: 0.3 }),
    white: std('#ffffff'),
    hair: std(colors.hair || colors.beard || '#333', { roughness: 0.75, side: THREE.DoubleSide }),
    cheek: std('#f08f8f', { roughness: 0.8 }),
    layer: std(colors.layer || colors.collar || '#cccccc', { roughness: 0.7 }),
  };
  if (!mats.hands) mats.hands = mats.skin;

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
  // Collar of the layer underneath (gray for Daddy, lavender for Rielle)
  mesh(new THREE.CylinderGeometry(0.068 * u, 0.078 * u, 0.06 * u, 14), mats.layer, spine, 0, 0.545 * u, 0);

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
    mesh(new THREE.SphereGeometry(0.016 * u, 10, 8), mats.eye, head, s * 0.042 * u, 0.02 * u, fz - 0.004 * u);
    mesh(new THREE.SphereGeometry(0.006 * u, 6, 4), mats.white, head, s * 0.038 * u, 0.026 * u, fz + 0.01 * u);
  }

  let hat = null;
  let lamp;
  if (isDaddy) {
    const beardMat = std(colors.beard, { roughness: 1 });
    for (const s of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.045 * u, 0.011 * u, 0.012 * u), beardMat, head, s * 0.044 * u, 0.053 * u, fz - 0.006 * u).rotation.z = s * -0.1;
    }
    // Short beard along the jaw and chin, plus a mustache
    const beard = mesh(new THREE.SphereGeometry(0.127 * u, 24, 10, 0, Math.PI, Math.PI * 0.56, Math.PI * 0.4), beardMat, head);
    beard.scale.set(0.95, 1.08, 1.04);
    const stache = mesh(new THREE.CapsuleGeometry(0.009 * u, 0.04 * u, 3, 8), beardMat, head, 0, -0.034 * u, 0.124 * u);
    stache.rotation.z = Math.PI / 2;
    const grin = mesh(new THREE.TorusGeometry(0.03 * u, 0.007 * u, 6, 14, Math.PI), std('#2a1a14'), head, 0, -0.05 * u, 0.126 * u);
    grin.rotation.z = Math.PI;

    // Black beanie with a headlamp on the front
    hat = new THREE.Group();
    hat.rotation.x = -0.25;
    head.add(hat);
    const beanieMat = std(colors.beanie, { roughness: 1 });
    const dome = mesh(new THREE.SphereGeometry(0.133 * u, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), beanieMat, hat);
    dome.scale.set(0.93, 1.08, 1.02);
    const cuff = mesh(new THREE.CylinderGeometry(0.132 * u, 0.136 * u, 0.05 * u, 24, 1, true), std(colors.beanie, { roughness: 1, side: THREE.DoubleSide }), hat, 0, 0.052 * u, 0);
    cuff.scale.set(0.93, 1, 1.02);
    const strap = mesh(new THREE.TorusGeometry(0.135 * u, 0.006 * u, 5, 28), std('#e0662a'), hat, 0, 0.052 * u, 0);
    strap.rotation.x = Math.PI / 2;
    strap.scale.set(0.93, 1.02, 1);
    const housing = mesh(new THREE.BoxGeometry(0.06 * u, 0.034 * u, 0.026 * u), std('#202226', { roughness: 0.5 }), hat, 0, 0.055 * u, 0.137 * u);
    housing.rotation.x = 0.1;
    lamp = mesh(new THREE.CylinderGeometry(0.012 * u, 0.012 * u, 0.006 * u, 14), std('#fff4cf', { emissive: '#000000' }), hat, 0, 0.055 * u, 0.152 * u);
    lamp.rotation.x = Math.PI / 2;
  } else {
    for (const s of [-1, 1]) {
      const ch = mesh(new THREE.SphereGeometry(0.02 * u, 10, 8), mats.cheek, head, s * 0.068 * u, -0.025 * u, fz - 0.025 * u);
      ch.scale.set(1, 0.6, 0.35);
      mesh(new THREE.BoxGeometry(0.035 * u, 0.008 * u, 0.01 * u), mats.hair, head, s * 0.043 * u, 0.055 * u, fz - 0.006 * u).rotation.z = s * -0.15;
    }
    const smile = mesh(new THREE.TorusGeometry(0.036 * u, 0.0075 * u, 6, 14, Math.PI), mats.dark, head, 0, -0.05 * u, fz - 0.001 * u);
    smile.rotation.z = Math.PI;
    // Long dark hair worn down
    const r = 0.133 * u;
    const cap = mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), mats.hair, head, 0, 0.004 * u, -0.004 * u);
    cap.scale.set(0.95, 1.1, 1.04);
    const back = mesh(new THREE.SphereGeometry(r, 24, 14, Math.PI, Math.PI, 0, Math.PI * 0.8), mats.hair, head, 0, 0.004 * u, -0.006 * u);
    back.scale.set(0.98, 1.1, 1.06);
    const bang = mesh(new THREE.SphereGeometry(0.07 * u, 14, 10), mats.hair, head, 0.035 * u, 0.088 * u, 0.072 * u);
    bang.scale.set(1.35, 0.5, 0.6);
    bang.rotation.z = -0.3;
    for (const s of [-1, 1]) {
      const side = mesh(new THREE.CapsuleGeometry(0.036 * u, 0.2 * u, 4, 10), mats.hair, head, s * 0.108 * u, -0.1 * u, -0.005 * u);
      side.scale.set(0.75, 1, 1.1);
      side.rotation.z = s * 0.1;
    }
    const flow = new THREE.Group();
    flow.position.set(0, -0.02 * u, -0.095 * u);
    head.add(flow);
    const long = mesh(new THREE.CapsuleGeometry(0.105 * u, 0.24 * u, 4, 12), mats.hair, flow, 0, -0.17 * u, -0.012 * u);
    long.scale.set(1.15, 1, 0.42);
    root.userData.ponytail = flow;
    lamp = mesh(new THREE.CylinderGeometry(0.014 * u, 0.014 * u, 0.012 * u, 12), std('#fff4cf', { emissive: '#000000' }), head, 0, 0.098 * u, 0.1 * u);
    lamp.rotation.x = Math.PI / 2 - 0.6;
  }

  // Chest details
  const chestZ = 0.16 * u * 0.72 + 0.004 * u;
  if (isDaddy) {
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.12 * u, 0.03 * u), toon({ map: nameTape('DADDY', '#14284a', '#f2c230') }));
    tape.position.set(-0.075 * u, 0.4 * u, chestZ);
    spine.add(tape);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.035 * u, 20), toon({ map: anchorPatch() }));
    patch.position.set(0.075 * u, 0.4 * u, chestZ);
    spine.add(patch);
    mesh(new THREE.BoxGeometry(0.008 * u, 0.46 * u, 0.006 * u), mats.metal, spine, 0, 0.27 * u, chestZ);
  } else {
    const pocket = new THREE.Mesh(new THREE.PlaneGeometry(0.075 * u, 0.085 * u), std(colors.pocket, { roughness: 0.5 }));
    pocket.position.set(0.065 * u, 0.37 * u, chestZ + 0.003 * u);
    spine.add(pocket);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.1 * u, 0.03 * u), toon({ map: nameTape('DR. RIELLE', '#ffffff', '#2a5e8c') }));
    badge.position.set(-0.07 * u, 0.42 * u, chestZ + 0.003 * u);
    spine.add(badge);
    for (let k = 0; k < 4; k++) mesh(new THREE.SphereGeometry(0.008 * u, 6, 5), std('#6f5f45'), spine, 0, (0.5 - k * 0.12) * u, chestZ + 0.002 * u);
    // Sherpa hem with the lavender layer peeking out underneath
    const hem = mesh(new THREE.CylinderGeometry(0.158 * u * sw, 0.165 * u * sw, 0.09 * u, 18, 1, true), std(colors.top, { roughness: 1, side: THREE.DoubleSide }), spine, 0, 0.0, 0);
    hem.scale.z = 0.76;
    const band = mesh(new THREE.CylinderGeometry(0.162 * u * sw, 0.164 * u * sw, 0.04 * u, 18, 1, true), std(colors.layer, { side: THREE.DoubleSide }), spine, 0, -0.06 * u, 0);
    band.scale.z = 0.76;
  }
  // Stethoscope around the neck: both are doctors
  const steth = mesh(new THREE.TorusGeometry(0.085 * u, 0.008 * u, 6, 20, Math.PI * 1.2), std('#2f6fb8', { roughness: 0.4 }), spine, 0, 0.5 * u, 0.03 * u);
  steth.rotation.set(Math.PI / 2 + 0.5, 0, Math.PI * 1.6 + 0.3);
  mesh(new THREE.CylinderGeometry(0.02 * u, 0.02 * u, 0.012 * u, 12), mats.metal, spine, 0.04 * u, 0.32 * u, chestZ + 0.008 * u).rotation.x = Math.PI / 2;

  // Summit medal (shown when you make it to the top)
  const medal = new THREE.Group();
  spine.add(medal);
  const ribbon = std('#f5b31b', { roughness: 0.6 });
  for (const s of [-1, 1]) {
    const strip = mesh(new THREE.BoxGeometry(0.03 * u, 0.2 * u, 0.006 * u), ribbon, medal, s * 0.04 * u, 0.44 * u, chestZ + 0.012 * u);
    strip.rotation.z = s * 0.35;
  }
  const disc = mesh(new THREE.CylinderGeometry(0.045 * u, 0.045 * u, 0.01 * u, 24), [std('#c9ced4', { metalness: 0.8, roughness: 0.3 }), toon({ map: medalFace(), metalness: 0.5, roughness: 0.35 }), std('#c9ced4')], medal, 0, 0.32 * u, chestZ + 0.02 * u);
  disc.rotation.x = Math.PI / 2;
  medal.visible = false;

  // Backpack with a bedroll
  const packH = isDaddy ? 0.42 : 0.32;
  const pack = mesh(new THREE.BoxGeometry(0.3 * u, packH * u, 0.17 * u), mats.pack, spine, 0, (isDaddy ? 0.3 : 0.25) * u, -0.19 * u);
  pack.receiveShadow = true;
  if (isDaddy) mesh(new THREE.CylinderGeometry(0.06 * u, 0.06 * u, 0.34 * u, 10), std('#3c5a40'), spine, 0, 0.55 * u, -0.19 * u).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.03 * u, 0.38 * u, 0.02 * u), isDaddy ? mats.dark : mats.pack, spine, s * 0.1 * u, 0.32 * u, chestZ);

  // Arms
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (0.16 * sw + 0.045) * u, 0.47 * u, 0);
    spine.add(shoulder);
    mesh(new THREE.CapsuleGeometry(0.056 * u, 0.2 * u, 4, 10), mats.top, shoulder, 0, -0.15 * u, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3 * u;
    shoulder.add(elbow);
    mesh(new THREE.CapsuleGeometry(0.05 * u, 0.18 * u, 4, 10), mats.top, elbow, 0, -0.12 * u, 0);
    if (!isDaddy) mesh(new THREE.CylinderGeometry(0.047 * u, 0.047 * u, 0.035 * u, 12), mats.layer, elbow, 0, -0.225 * u, 0);
    const hand = new THREE.Group();
    hand.position.y = -0.27 * u;
    elbow.add(hand);
    mesh(new THREE.SphereGeometry(0.055 * u, 12, 10), mats.hands, hand).scale.set(0.9, 1.1, 0.8);
    return { shoulder, elbow, hand };
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // Trekking poles: Daddy carries two blue ones, Rielle one lavender one
  const poleR = makePole(colors.pole, u, armR.hand);
  const poleL = isDaddy ? makePole(colors.pole, u, armL.hand) : null;

  // Silly gear from Rielle's random stuff (hidden until used)
  const pan = new THREE.Group();
  armR.hand.add(pan);
  mesh(new THREE.BoxGeometry(0.03 * u, 0.26 * u, 0.02 * u), std('#5b3d24'), pan, 0, -0.14 * u, 0);
  const panDisc = mesh(new THREE.CylinderGeometry(0.15 * u, 0.13 * u, 0.04 * u, 24), std('#2a2d32', { metalness: 0.7, roughness: 0.35 }), pan, 0, -0.42 * u, 0);
  panDisc.rotation.x = Math.PI / 2;
  pan.visible = false;

  const umbrella = new THREE.Group();
  umbrella.rotation.x = Math.PI / 2;
  armL.hand.add(umbrella);
  mesh(new THREE.CylinderGeometry(0.01 * u, 0.01 * u, 0.95 * u, 6), mats.dark, umbrella, 0, 0.45 * u, 0);
  const canopy = mesh(new THREE.ConeGeometry(0.55 * u, 0.22 * u, 10, 1, true), std('#ff4b8b', { side: THREE.DoubleSide, roughness: 0.6 }), umbrella, 0, 0.88 * u, 0);
  canopy.castShadow = true;
  umbrella.visible = false;

  // Legs
  const skates = [];
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
    const sk = new THREE.Group();
    knee.add(sk);
    mesh(new THREE.BoxGeometry(0.12 * u, 0.02 * u, 0.28 * u), std('#9b5cff'), sk, 0, -0.495 * u, 0.04 * u);
    const wheel = new THREE.CylinderGeometry(0.03 * u, 0.03 * u, 0.025 * u, 10);
    wheel.rotateZ(Math.PI / 2);
    for (const wz of [-0.06, 0.14]) for (const wx of [-0.045, 0.045]) mesh(wheel, std('#ffd23a'), sk, wx * u, -0.52 * u, wz * u);
    sk.visible = false;
    skates.push(sk);
    return { hip, knee };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const rig = {
    def, root, hips, spine, head, armL, armR, legL, legR, lamp, mats, u,
    hat, medal, poleR, poleL, pan, umbrella, skates,
    hipY: 0.95 * u,
    phase: 0,
    eyeHeight: 1.62 * u,
    setSkin(hex) { mats.skin.color.set(hex); },
    setHair(hex) { mats.hair.color.set(hex); },
    // Show or hide the silly gear
    setGear({ pan: hasPan = false, umbrella: hasUmbrella = false, skates: hasSkates = false } = {}) {
      pan.visible = hasPan;
      poleR.visible = !hasPan;
      umbrella.visible = hasUmbrella;
      if (poleL) poleL.visible = !hasUmbrella;
      for (const sk of skates) sk.visible = hasSkates;
    },
  };
  return rig;
}

const T = {
  hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
  shL: 0, shR: 0, shLz: 0, shRz: 0, elL: 0, elR: 0, elRz: 0,
  spineX: 0, spineY: 0, headX: 0, headY: 0, bob: 0, rootX: 0,
};

// state: { speed, grounded, attack (-1 or 0..1), wave, cheer, umbrella, use, dead (0..1), t }
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

  if (s.umbrella) {
    T.shL = -0.35;
    T.shLz = 0.15;
    T.elL = -1.3;
  }
  if (s.use > 0) {
    // Hold the item out in front
    T.shL = -1.35;
    T.shLz = 0.1;
    T.elL = -0.2;
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
  if (pony) pony.rotation.x = damp(pony.rotation.x, 0.06 + walk * 0.22 + Math.sin(p * 2) * 0.05 * walk, 8, dt);
}
