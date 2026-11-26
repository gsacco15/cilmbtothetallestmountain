// Climb the Tallest Mountain: game setup and the main loop.
import * as THREE from 'three';
import * as HF from './heightfield.js';
import { buildWorld, setInstanceVisible } from './world.js';
import { Sky, makeEnvMap } from './sky.js';
import { CHARACTERS, SKIN_TONES, HAIR_COLORS, buildCharacter, animateCharacter } from './characters.js';
import { AnimalManager, ANIMALS } from './animals.js';
import { AudioFX } from './audio.js';
import { Input, LOOK_SPEED, clampPitch } from './input.js';
import { UI } from './ui.js';
import { Player } from './player.js';
import { STUFF, randomStuff } from './stuff.js';
import { InkPass } from './ink.js';
import { Dialog } from './dialog.js';
import { clamp, lerp, damp, smoothstep, formatMeters, TAU, toon } from './util.js';

const { CAMPS, SUMMIT, heightAt, inSafeZone, nearestPond, isSnowAt, altitudeMeters, progressFromHeight, WATER } = HF;

const STORE_KEY = 'climb-tallest-mountain-v1';
function loadSave() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; }
}
function writeSave(d) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch { /* storage is optional */ }
}

const CAUSES = {
  wolf: 'A wolf got you!',
  bear: 'A bear got you!',
  snake: 'A rattlesnake bit you!',
  goat: 'A mountain goat knocked you out!',
  leopard: 'A snow leopard got you!',
  eagle: 'An eagle got you!',
  starve: 'You ran out of food.',
  thirst: 'You ran out of water.',
  cold: 'You froze in the cold.',
  sick: 'Too many bad mushrooms!',
};

const ALERT_SOUND = { wolf: 'howl', bear: 'growl', snake: 'rattle', goat: 'bleat', leopard: 'roar', eagle: 'screech' };

const CRATE_LOOT = [
  { ration: 3, water: 3, firstaid: 1, warmer: 1 },
  { ration: 2, water: 2, firstaid: 1, warmer: 2 },
  { ration: 2, water: 2, firstaid: 1, warmer: 2 },
  { ration: 2, water: 3, firstaid: 1, warmer: 3 },
];
const ITEM_NAMES = { ration: 'soup', water: 'water', firstaid: 'first aid', warmer: 'warmer' };

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.25, 3200);
    this.clock = new THREE.Clock();
    this.time = 0;
    this.save = loadSave();
    this.choice = this.save.choice === 'rielle' ? 'rielle' : 'daddy';
    this.custom = {
      daddy: { skin: CHARACTERS.daddy.colors.skin, ...(this.save.looks?.daddy || {}) },
      rielle: { skin: CHARACTERS.rielle.colors.skin, hair: CHARACTERS.rielle.colors.hair, ...(this.save.looks?.rielle || {}) },
    };
    this.state = 'loading';
    this.hour = 17.4;
    this.day = 1;
    this.camYaw = Math.PI;
    this.camPitch = 0.22;
    this.camDist = 6.2;
    this.camDistNow = 6.2;
    this.shake = 0;
    this.useCD = 0;
    this.grace = 0;
    this.run = this.freshRun();
  }

  freshRun() {
    return { scared: 0, best: HF.ALT_BASE, start: performance.now(), days: 1, sick: 0 };
  }

  async init() {
    // Let the display font load so signs and name tapes use it
    if (document.fonts && document.fonts.ready) {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1800))]);
    }
    await new Promise((r) => setTimeout(r, 30));

    this.envMap = makeEnvMap(this.renderer);
    this.sky = new Sky(this.scene);
    this.world = buildWorld(this.scene, this.envMap);

    this.rigs = {
      daddy: buildCharacter(CHARACTERS.daddy, this.custom.daddy),
      rielle: buildCharacter(CHARACTERS.rielle, this.custom.rielle),
    };
    for (const r of Object.values(this.rigs)) this.scene.add(r.root);

    this.headlamp = new THREE.SpotLight('#fff1d6', 0, 48, 0.6, 0.55, 1.3);
    this.headlamp.target = new THREE.Object3D();
    this.scene.add(this.headlamp, this.headlamp.target);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.72, 40),
      new THREE.MeshBasicMaterial({ color: '#ff6b1f', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    this.selectRing = ring;
    this.scene.add(ring);

    this.buildConfetti();
    this.buildPuffs();
    this.peels = [];
    this.reveal = 0;
    this.confettiT = 0;
    this.flushes = 0;
    this.hooks = {
      hurtPlayer: (dmg, a, kx, kz, knock) => this.onHurt(dmg, a, kx, kz, knock),
      onAlert: (a) => {
        this.audio.play(ALERT_SOUND[a.type], { dist: this.player ? a.pos.distanceTo(this.player.pos) : 30 });
        this.ui.toast(`${a.cfg.label} spotted you!`, 'danger', `alert-${a.type}`, 9);
        this.dialog.trigger('animal');
      },
      onScared: (a, silly) => {
        this.run.scared += 1;
        if (silly) return;
        this.audio.play('scared');
        this.ui.toast(`You scared off ${a.cfg.label.toLowerCase()}!`, 'good', 'scared', 0.5);
      },
      onPeel: (pl, a) => {
        this.scene.remove(pl.mesh);
        this.audio.play('slip');
        this.ui.toast(`${a.cfg.label} slipped on the banana peel!`, 'stuff');
      },
      onSound: (n) => this.audio.play(n),
    };

    this.animals = new AnimalManager(this.scene);
    this.audio = new AudioFX();
    this.audio.prefetch();
    this.dialog = new Dialog(this.audio);
    this.ink = new InkPass(this.renderer);
    this.input = new Input(this.canvas);
    this.input.onLockLost = () => { if (this.state === 'playing') this.pause(); };
    this.ui = new UI();
    this.bindUI();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });

    this.enterTitle();
    // Warm up shaders so the first frames don't stutter
    this.sky.update(this.hour, this.camera.position, this.camera.position, 0);
    this.renderer.compile(this.scene, this.camera);
    document.getElementById('loading').classList.add('done');
    setTimeout(() => { document.getElementById('loading').hidden = true; }, 700);
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ---------------------------------------------------------------- UI wiring
  bindUI() {
    const $ = (id) => document.getElementById(id);
    for (const btn of document.querySelectorAll('.climber')) {
      btn.addEventListener('click', () => this.pick(btn.dataset.char));
    }
    this.renderSwatches();
    $('start-btn').addEventListener('click', () => this.startGame());
    $('howto-btn').addEventListener('click', () => this.ui.show('screen-howto'));
    $('howto-close').addEventListener('click', () => this.ui.show('screen-howto', false));
    $('pause-btn').addEventListener('click', () => this.pause());
    $('resume-btn').addEventListener('click', () => this.resume());
    $('pause-howto-btn').addEventListener('click', () => this.ui.show('screen-howto'));
    $('giveup-btn').addEventListener('click', () => { this.ui.show('screen-pause', false); this.ui.show('screen-confirm'); });
    $('confirm-no').addEventListener('click', () => { this.ui.show('screen-confirm', false); this.resume(); });
    $('confirm-yes').addEventListener('click', () => { this.ui.show('screen-confirm', false); this.giveUp(); });
    $('end-primary').addEventListener('click', () => { this.ui.show('screen-end', false); this.startRun(true); });
    $('end-secondary').addEventListener('click', () => { this.ui.show('screen-end', false); this.enterTitle(); });
    $('honk-btn').addEventListener('click', () => this.honk());
    $('mute-btn').addEventListener('click', () => this.toggleMute());
    for (const slot of document.querySelectorAll('.slot')) {
      slot.addEventListener('click', () => (slot.dataset.item === 'stuff' ? this.useStuff() : this.useItem(slot.dataset.item)));
    }
    this.input.bindTouch({
      joyZone: $('joy-zone'),
      joyBase: $('joy-base'),
      joyKnob: $('joy-knob'),
      lookZone: $('look-zone'),
      buttons: document.querySelectorAll('.tbtn'),
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'paused' && !document.getElementById('screen-pause').hidden && performance.now() - this.pausedAt > 450) this.resume();
    });
    if (this.save.best) {
      $('record').hidden = false;
      $('record').textContent = `Your highest climb: ${formatMeters(this.save.best)} m${this.save.wins ? ` · Summits: ${this.save.wins}` : ''}`;
    }
  }

  renderSwatches() {
    const make = (containerId, colors, key) => {
      const box = document.getElementById(containerId);
      box.innerHTML = '';
      box.setAttribute('role', 'radiogroup');
      colors.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.id = `${containerId}-${i}`;
        b.style.background = c;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-label', `${key === 'skin' ? 'Skin tone' : 'Hair color'} ${i + 1}`);
        b.setAttribute('aria-checked', String(this.custom[this.choice][key] === c));
        b.addEventListener('click', () => {
          this.custom[this.choice][key] = c;
          if (key === 'skin') this.rigs[this.choice].setSkin(c);
          else this.rigs[this.choice].setHair(c);
          this.persist();
          this.renderSwatches();
        });
        box.appendChild(b);
      });
    };
    make('skin-swatches', SKIN_TONES, 'skin');
    document.getElementById('hair-row').hidden = this.choice !== 'rielle';
    if (this.choice === 'rielle') make('hair-swatches', HAIR_COLORS, 'hair');
  }

  pick(id) {
    this.choice = id;
    for (const btn of document.querySelectorAll('.climber')) btn.setAttribute('aria-checked', String(btn.dataset.char === id));
    this.renderSwatches();
    this.persist();
    if (this.audio.ready) this.audio.play('click');
  }

  persist() {
    this.save.choice = this.choice;
    this.save.looks = this.custom;
    delete this.save.custom;
    writeSave(this.save);
  }

  toggleMute() {
    const m = !this.audio.muted;
    this.audio.setMuted(m);
    const b = document.getElementById('mute-btn');
    b.setAttribute('aria-pressed', String(m));
    b.setAttribute('aria-label', m ? 'Sound on' : 'Sound off');
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones get a wider view so you can see around you
    this.camera.fov = w / h < 0.8 ? 70 : 58;
    this.applyViewOffset();
    if (this.ink) this.ink.setSize();
    if (this.world && this.world.plume) {
      this.world.plume.mat.uniforms.uScale.value = this.renderer.getDrawingBufferSize(v1).y / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    }
  }

  applyViewOffset() {
    const w = window.innerWidth, h = window.innerHeight;
    if (this.state === 'title') {
      if (w > 760) this.camera.setViewOffset(w, h, -Math.min(470, w * 0.45) * 0.5, 0, w, h);
      else this.camera.setViewOffset(w, h, 0, h * 0.2, w, h);
    } else if (['won', 'ended-win', 'ended', 'dying'].includes(this.state)) {
      // Keep the car (or the climber) above the end card
      this.camera.setViewOffset(w, h, 0, h * 0.22, w, h);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- title
  basePoint(dist, side = 0) {
    // Points south of Base Camp (away from the mountain), side is +x
    const bc = CAMPS[0];
    const x = bc.x + side, z = bc.z + dist;
    return new THREE.Vector3(x, heightAt(x, z), z);
  }

  enterTitle() {
    this.state = 'title';
    this.input.enabled = false;
    this.input.releaseLock();
    this.animals.clear();
    this.world.resetAll();
    this.hideConfetti();
    this.ui.show('hud', false);
    this.ui.show('touch', false);
    this.ui.show('screen-pause', false);
    this.ui.show('screen-end', false);
    this.ui.show('screen-title', true);
    this.ui.clearToasts();
    this.dialog.stop();
    this.hour = 17.4;
    this.clearPeels();
    for (const [id, rig] of Object.entries(this.rigs)) {
      rig.root.visible = true;
      rig.root.rotation.set(0, 0, 0);
      rig.setGear({});
      rig.medal.visible = false;
      if (rig.hat) rig.hat.visible = true;
      const p = this.basePoint(9.5, id === 'daddy' ? 0.6 : 2.5);
      rig.root.position.copy(p);
    }
    this.selectRing.visible = true;
    this.applyViewOffset();
  }

  updateTitle(dt) {
    const t = this.time;
    for (const [id, rig] of Object.entries(this.rigs)) {
      const sel = id === this.choice;
      animateCharacter(rig, dt, { speed: 0, grounded: true, attack: -1, dead: 0, t: t + (sel ? 0 : 2), wave: sel });
      rig.root.rotation.y = damp(rig.root.rotation.y, sel ? 0 : (id === 'daddy' ? 0.35 : -0.35), 4, dt);
      const target = this.basePoint(sel ? 10.1 : 9.5, id === 'daddy' ? 0.6 : 2.5);
      rig.root.position.lerp(target, 1 - Math.exp(-dt * 6));
    }
    const sel = this.rigs[this.choice].root.position;
    this.selectRing.position.set(sel.x, sel.y + 0.03, sel.z);
    this.selectRing.scale.setScalar(1 + Math.sin(t * 3) * 0.05);

    const portrait = this.camera.aspect < 0.8;
    const cam = this.basePoint(portrait ? 18.5 : 15, 1.55 + Math.sin(t * 0.15) * 0.4);
    this.camera.position.set(cam.x, cam.y + (portrait ? 1.5 : 1.05), cam.z);
    v1.set(CAMPS[0].x + 1.4, cam.y + 2.1, CAMPS[0].z + 4);
    this.camera.lookAt(v1);
    this.updateWorld(dt, this.rigs[this.choice].root.position, 0.0);
  }

  // ---------------------------------------------------------------- run lifecycle
  startGame() {
    this.audio.init();
    this.audio.play('click');
    this.ui.show('screen-title', false);
    this.ui.show('screen-howto', false);
    this.def = CHARACTERS[this.choice];
    this.player = new Player(this.rigs[this.choice], this.def);
    this.npc = this.rigs[this.choice === 'daddy' ? 'rielle' : 'daddy'];
    this.ui.setCharacter(this.def);
    this.attempts = 0;
    this.startRun(false);
    this.input.requestLock();
  }

  startRun(again) {
    this.attempts = (this.attempts || 0) + 1;
    this.run = this.freshRun();
    this.state = 'intro';
    this.introT = 0;
    this.selectRing.visible = false;
    this.hideConfetti();
    this.animals.clear();
    this.world.resetAll();
    this.day = 1;
    this.hour = 7;
    this.grace = 22;
    this.maxCamp = 0;
    const bc = this.world.camps[0];
    const start = bc.local(-0.6, 3.6);
    this.player.reset(start.x, start.z, bc.yaw);
    this.player.rig.root.visible = true;
    this.player.cheer = false;
    this.player.wave = false;
    this.clearPeels();
    this.reveal = 0;
    this.confettiT = 0;
    this.flushes = 0;
    if (this.def.id === 'rielle') this.player.stuff = randomStuff();
    // The other climber stays at Base Camp to cheer you on
    const n = bc.local(1.5, 6.6);
    n.y = heightAt(n.x, n.z);
    this.npc.root.position.copy(n);
    this.npc.root.rotation.set(0, bc.yaw + Math.PI - 0.3, 0);
    this.npc.root.visible = true;
    this.camYaw = bc.yaw;
    this.camPitch = 0.2;
    this.camDistNow = this.camDist;
    this.introFrom = this.camera.position.clone();
    this.introFromQ = this.camera.quaternion.clone();
    this.applyViewOffset();
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.ui.show('hud', true);
    this.ui.show('touch', true);
    this.ui.clearToasts();
    this.input.enabled = true;
    const other = this.npc === this.rigs.daddy ? 'Daddy' : 'Dr. Rielle';
    const tips = [
      [0.4, again ? 'Back at the bottom. Try again!' : `Good luck! ${other} will wait at Base Camp.`, 'gold'],
      [3.2, 'Open the supply crate before you leave.', ''],
      [9, 'Follow the orange flags. The gold light is the summit.', ''],
      [14, "Purple boxes are full of Rielle's random stuff. Somehow it all helps!", 'stuff'],
    ];
    this.dialog.newRun();
    this.dialog.stop();
    setTimeout(() => { if (this.state === 'playing' || this.state === 'intro') this.dialog.trigger('start'); }, 1400);
    if (this.player.stuff) tips.splice(1, 0, [1.8, `You packed: ${STUFF[this.player.stuff].name}. Trust me, it'll help. (Press 5)`, 'stuff']);
    if (this.tipTimers) this.tipTimers.forEach(clearTimeout);
    this.tipTimers = tips.map(([d, text, kind]) => setTimeout(() => { if (this.state === 'playing' || this.state === 'intro') this.ui.toast(text, kind); }, d * 1000));
    if (again) this.input.requestLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pausedAt = performance.now();
    this.input.releaseLock();
    const alt = altitudeMeters(this.player.pos.y);
    document.getElementById('pause-sub').textContent = `Day ${this.day} · ${formatMeters(alt)} m`;
    this.ui.show('screen-pause', true);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ui.show('screen-pause', false);
    this.ui.show('screen-howto', false);
    this.state = 'playing';
    this.clock.getDelta();
    this.audio.init();
    this.input.requestLock();
  }

  giveUp() {
    this.state = 'ended';
    this.applyViewOffset();
    this.input.enabled = false;
    this.input.releaseLock();
    this.ui.show('hud', false);
    this.ui.show('touch', false);
    this.recordBest();
    this.ui.showEnd({
      kind: 'lose',
      eyebrow: 'Expedition over',
      title: 'You gave up',
      sub: 'No Lamborghini this time.',
      stats: this.endStats(),
      primary: 'Try again',
      secondary: 'Main menu',
    });
  }

  recordBest() {
    const best = Math.max(this.save.best || 0, this.run.best);
    this.save.best = Math.round(best);
    writeSave(this.save);
  }

  endStats() {
    const mins = Math.max(1, Math.round((performance.now() - this.run.start) / 60000));
    return [
      ['Highest point', `${formatMeters(this.run.best)} m`],
      ['Days', `${this.day}`],
      ['Scared off', `${this.run.scared}`],
      ['Time', `${mins} min`],
      ['Attempt', `#${this.attempts}`],
    ];
  }

  die() {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.applyViewOffset();
    this.dyingT = 0;
    this.player.alive = false;
    this.input.enabled = false;
    this.input.releaseLock();
    this.audio.play('death');
    this.dialog.stop();
    if (this.choice === 'daddy') setTimeout(() => this.dialog.trigger('death'), 1300);
    this.ui.setPrompt(null);
    this.ui.setThreat(null);
    this.recordBest();
  }

  showDeath() {
    this.state = 'ended';
    this.ui.show('hud', false);
    this.ui.show('touch', false);
    const cause = CAUSES[this.player.lastCause] || 'You got knocked out!';
    this.ui.showEnd({
      kind: 'lose',
      eyebrow: 'You got knocked out',
      title: cause,
      sub: "You're done. Back to the bottom of the mountain.",
      stats: this.endStats(),
      primary: 'Start over from the bottom',
      secondary: 'Main menu',
    });
  }

  win() {
    this.state = 'won';
    this.applyViewOffset();
    this.winT = 0;
    this.input.enabled = false;
    this.input.releaseLock();
    this.animals.clear();
    this.ui.setPrompt(null);
    this.ui.setThreat(null);
    this.ui.show('touch', false);
    this.run.best = HF.ALT_SUMMIT;
    this.save.wins = (this.save.wins || 0) + 1;
    this.recordBest();
    this.audio.play('win');
    this.dialog.stop();
    setTimeout(() => this.dialog.trigger('win'), 1600);
    // Stand next to the car
    const car = this.world.summit.group.position;
    this.player.pos.set(car.x + 5.6, 0, car.z + 1.5);
    this.player.pos.y = heightAt(this.player.pos.x, this.player.pos.z);
    this.player.yaw = -Math.PI / 2;
    this.player.cheer = true;
    this.player.vel.set(0, 0, 0);
    for (const k of Object.keys(this.player.buffs)) this.player.buffs[k] = 0;
    this.player.rig.medal.visible = true;
    // Hat off at the top
    if (this.player.rig.hat) this.player.rig.hat.visible = false;
    this.clearPeels();
    this.reveal = 0;
    this.showConfetti(car);
  }

  showWin() {
    this.state = 'ended-win';
    this.ui.show('hud', false);
    this.ui.showEnd({
      kind: 'win',
      eyebrow: 'Summit · 8,849 m',
      title: 'You made it to the top!',
      sub: `The Lamborghini is yours, ${this.def.name}! And the summit medal too.`,
      stats: this.endStats().filter(([k]) => k !== 'Highest point'),
      primary: 'Play again',
      secondary: 'Main menu',
      honk: true,
    });
  }

  honk() {
    this.audio.init();
    this.audio.play('honk');
    this.honkT = 0.6;
  }

  sleep() {
    if (this.state !== 'playing') return;
    this.state = 'sleeping';
    this.sleepT = 0;
    this.ui.fade(true);
    this.ui.setPrompt(null);
    this.audio.play('sleep');
    setTimeout(() => { document.getElementById('zzz').hidden = false; }, 500);
  }

  finishSleep() {
    if (this.hour >= 12) this.day += 1;
    this.hour = 6.5;
    const st = this.player.stats;
    st.food = Math.max(5, st.food - 18);
    st.water = Math.max(5, st.water - 18);
    st.warmth = 100;
    st.stamina = 100;
    st.health = Math.min(this.player.maxHealth, st.health + 30);
    this.animals.clear();
    this.world.regrow(this.day);
    this.closeLids();
    this.grace = 8;
    this.run.days = this.day;
    document.getElementById('zzz').hidden = true;
    this.ui.fade(false);
    this.ui.toast(`Good morning! Day ${this.day}`, 'gold');
    this.state = 'playing';
  }

  closeLids() {
    for (const c of this.world.camps) if (c.crateDay !== this.day) c.crate.lidPivot.rotation.x = 0;
  }

  // ---------------------------------------------------------------- time
  advanceTime(dt) {
    const wasNight = this.isNight();
    const secPerHour = wasNight ? 9 : 14;
    this.hour += dt / secPerHour;
    if (this.hour >= 24) {
      this.hour -= 24;
      this.day += 1;
      this.run.days = this.day;
      this.world.regrow(this.day);
      this.closeLids();
      this.ui.toast(`Day ${this.day}`, 'gold');
    }
    const night = this.isNight();
    if (night && !wasNight) {
      this.ui.toast('Night is falling. Wolves come out at night. Get to a camp!', 'danger');
      this.dialog.trigger('night');
    }
    if (!night && wasNight) this.ui.toast('The sun is up!', 'good');
  }

  isNight() {
    return this.hour >= 18.5 || this.hour < 5.75;
  }

  // ---------------------------------------------------------------- interactions
  findInteraction() {
    const p = this.player.pos;
    const d2 = (a) => Math.hypot(p.x - a.x, p.z - a.z);
    for (const pr of this.world.props) {
      if (d2(pr) > pr.reach) continue;
      if (pr.kind === 'snacks' && pr.usedDay === this.day) return { text: 'Snack machine is empty until tomorrow', enabled: false };
      return { text: pr.text, enabled: true, act: () => this.useProp(pr) };
    }
    for (const c of this.world.camps) {
      if (d2(c) > 30) continue;
      if (d2(c.cratePos) < 2.3) {
        if (c.crateDay === this.day) return { text: 'Crate is empty until tomorrow', enabled: false };
        return { text: 'Open the supply crate', enabled: true, act: () => this.openCrate(c) };
      }
      for (const t of c.tents) {
        if (d2(t) < 2.9) {
          if (this.isNight()) return { text: 'Sleep in the tent until morning', enabled: true, act: () => this.sleep() };
          return { text: 'Tents are for sleeping at night', enabled: false };
        }
      }
    }
    let best = null, bd = 2.4;
    for (const b of this.world.bushes) {
      if (!b.has) continue;
      const d = Math.abs(p.x - b.x) + Math.abs(p.z - b.z);
      if (d > 4) continue;
      const dd = d2(b);
      if (dd < bd) { bd = dd; best = b; }
    }
    if (best) return { text: 'Eat berries', enabled: true, act: () => this.eatBush(best) };
    best = null; bd = 1.9;
    for (const m of this.world.mushrooms) {
      if (!m.has) continue;
      const d = Math.abs(p.x - m.x) + Math.abs(p.z - m.z);
      if (d > 3) continue;
      const dd = d2(m);
      if (dd < bd) { bd = dd; best = m; }
    }
    if (best) {
      const m = best;
      return { text: m.bad ? 'Eat the spotted red mushroom?' : 'Eat mushroom', enabled: true, act: () => this.eatMushroom(m) };
    }
    const { pond, dist } = nearestPond(p.x, p.z);
    if (pond && dist < pond.radius - 2) {
      return { text: pond.icy ? 'Drink icy pond water' : 'Drink pond water', enabled: true, act: () => this.drink(pond.icy ? 6 : 0) };
    }
    if (p.y < WATER + 2) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        if (heightAt(p.x + Math.cos(a) * 2.2, p.z + Math.sin(a) * 2.2) < WATER - 0.15) {
          return { text: 'Drink lake water', enabled: true, act: () => this.drink(0) };
        }
      }
    }
    if (isSnowAt(p.x, p.z)) return { text: 'Scoop snow to drink (brr!)', enabled: true, act: () => this.scoopSnow() };
    return null;
  }

  openCrate(c) {
    c.crateDay = this.day;
    c.crate.lidPivot.rotation.x = -1.9;
    const loot = CRATE_LOOT[c.id] || CRATE_LOOT[1];
    const got = [];
    for (const [k, n] of Object.entries(loot)) {
      const added = this.player.addItem(k, n);
      if (added > 0) got.push(`${added} ${ITEM_NAMES[k]}`);
    }
    this.audio.play('crate');
    this.ui.toast(got.length ? `Got ${got.join(', ')}` : 'Your backpack is already full', 'good');
  }

  eatBush(b) {
    b.has = false;
    b.regrowDay = this.day + 1;
    setInstanceVisible(b.berries, false);
    const st = this.player.stats;
    st.food = Math.min(100, st.food + 18);
    st.water = Math.min(100, st.water + 4);
    this.audio.play('eat');
    this.ui.toast('Yum, berries! +18 food', 'good', 'berries', 1.2);
    this.dialog.trigger('berries');
  }

  eatMushroom(m) {
    m.has = false;
    m.regrowDay = this.day + 1;
    setInstanceVisible(m, false);
    const st = this.player.stats;
    if (m.bad) {
      this.player.hurt(9, 'sick');
      this.player.invuln = 0;
      st.food = Math.min(100, st.food + 2);
      this.run.sick += 1;
      this.audio.play('sick');
      this.ui.hurt(0.5);
      this.ui.toast('Yuck! That spotted mushroom made you sick.', 'danger');
    } else {
      st.food = Math.min(100, st.food + 13);
      this.audio.play('eat');
      this.ui.toast('Tasty mushroom. +13 food', 'good', 'mush', 1.2);
    }
  }

  drink(chill) {
    const st = this.player.stats;
    st.water = Math.min(100, st.water + 28);
    if (chill) st.warmth = Math.max(0, st.warmth - chill);
    this.audio.play('drink');
    this.ui.toast(chill ? 'Icy water! +28 water, a bit colder' : 'Fresh water. +28 water', 'good', 'drink', 1.2);
  }

  scoopSnow() {
    const st = this.player.stats;
    st.water = Math.min(100, st.water + 12);
    st.warmth = Math.max(0, st.warmth - 6);
    this.audio.play('snow');
    this.ui.toast('Snow melts in your mouth. +12 water, -6 warmth', '', 'snow', 1.5);
  }

  useProp(pr) {
    const p = this.player;
    const st = p.stats;
    if (pr.kind === 'couch') {
      st.stamina = 100;
      st.warmth = Math.min(100, st.warmth + 15);
      this.audio.play('pickup');
      this.ui.toast('So comfy. Who carried a couch up here? Probably Rielle.', 'stuff', 'couch', 3);
    } else if (pr.kind === 'snacks') {
      pr.usedDay = this.day;
      st.food = Math.min(100, st.food + 25);
      st.water = Math.min(100, st.water + 15);
      this.audio.play('crate');
      this.ui.toast('Free snacks! +25 food, +15 water', 'good');
    } else if (pr.kind === 'toilet') {
      this.flushes += 1;
      this.audio.play('flush');
      this.dialog.trigger('toilet');
      if (this.flushes % 3 === 0 && !p.stuff) {
        p.stuff = randomStuff(this.lastStuffKey);
        this.lastStuffKey = p.stuff;
        setTimeout(() => this.audio.play('box'), 900);
        this.ui.toast(`The toilet gurgles... and spits out ${STUFF[p.stuff].name.toLowerCase()}!`, 'stuff');
      } else {
        const lines = [
          'Flushed. Nothing happened. Why is there a toilet up here?',
          'Flushed again. Still a mystery.',
          'Rielle said the toilet would help. Keep flushing?',
        ];
        this.ui.toast(lines[(this.flushes - 1) % lines.length], 'stuff');
      }
    }
  }

  pickUpBoxes() {
    const p = this.player;
    for (const b of this.world.boxes) {
      if (!b.has) continue;
      if (Math.abs(b.x - p.pos.x) > 2 || Math.abs(b.z - p.pos.z) > 2) continue;
      if (Math.hypot(b.x - p.pos.x, b.z - p.pos.z) > 1.7 || Math.abs(b.y - p.pos.y) > 3) continue;
      if (p.stuff) {
        this.ui.toast(`Hands full! Use your ${STUFF[p.stuff].name.toLowerCase()} first (press 5).`, '', 'full', 4);
        continue;
      }
      b.has = false;
      b.regrowDay = this.day + 1;
      p.stuff = randomStuff(this.lastStuffKey);
      this.lastStuffKey = p.stuff;
      this.audio.play('box');
      const name = STUFF[p.stuff].name;
      this.ui.toast(this.def.id === 'rielle' ? `Found: ${name}. Told you it would help!` : `From Rielle's box: ${name}! Rielle says it will help.`, 'stuff');
    }
  }

  useStuff() {
    if (this.state !== 'playing') return;
    const p = this.player;
    const key = p.stuff;
    if (!key) {
      this.ui.toast("No random stuff yet. Walk into one of Rielle's purple boxes.", '', 'nostuff', 3);
      return;
    }
    p.stuff = null;
    p.buffs.use = 0.6;
    const pos = p.pos;
    const st = p.stats;
    const hooks = this.hooks;
    let msg = STUFF[key].use;
    switch (key) {
      case 'cleaner': {
        this.audio.play('spray');
        this.spawnPuffs(pos, p.yaw, '#e6f8ff', 30, 9);
        const n = this.animals.near(pos, 12, (a) => a.slip(pos.x, pos.z, hooks), p.yaw, 1.3);
        if (n) setTimeout(() => this.audio.play('slip'), 200);
        else msg = 'Psssht! Lemon fresh! The mountain has never been this clean.';
        this.dialog.trigger('cleaner');
        break;
      }
      case 'stethoscope':
        this.reveal = 30;
        st.health = Math.min(p.maxHealth, st.health + 10);
        this.audio.play('heartbeat');
        break;
      case 'chicken': {
        this.audio.play('squawk');
        const n = this.animals.near(pos, 24, (a) => a.scare(hooks));
        if (!n) msg = 'SQUAWK! Nothing was around, but you feel braver.';
        break;
      }
      case 'banana':
        st.food = Math.min(100, st.food + 15);
        this.dropPeel(pos, p.yaw);
        this.audio.play('eat');
        break;
      case 'hotsauce':
        st.warmth = Math.min(100, st.warmth + 60);
        this.audio.play('sizzle');
        this.spawnPuffs(pos, p.yaw, '#ff7a2a', 18, 6);
        break;
      case 'umbrella':
        p.buffs.umbrella = 2;
        p.buffs.umbrellaT = 90;
        this.audio.play('umbrella');
        break;
      case 'bubblewrap':
        p.buffs.bubble = 25;
        st.stamina = 100;
        this.audio.play('bubble');
        break;
      case 'pizza':
        st.food = Math.min(100, st.food + 40);
        st.warmth = Math.min(100, st.warmth + 5);
        this.audio.play('eat');
        break;
      case 'whoopee': {
        this.audio.play('pfft');
        const n = this.animals.near(pos, 32, (a) => a.laugh(25));
        if (!n) msg = 'PFFFT! Nobody heard it. Probably for the best.';
        break;
      }
      case 'skates':
        p.buffs.skates = 20;
        this.audio.play('whee');
        break;
      case 'pan':
        p.buffs.pan = 30;
        this.audio.play('bonk');
        break;
      case 'popper':
        this.audio.play('pop');
        this.showConfetti(v1.set(pos.x, pos.y + 1, pos.z), 6, 5);
        this.confettiT = 3.5;
        break;
      default:
        break;
    }
    this.ui.toast(msg, 'stuff');
  }

  dropPeel(pos, yaw) {
    const g = new THREE.Group();
    const yellow = toon({ color: '#ffd93b' });
    for (let k = 0; k < 4; k++) {
      const strip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6), yellow);
      strip.scale.set(0.45, 0.18, 1.4);
      const a = (k / 4) * TAU + 0.4;
      strip.position.set(Math.cos(a) * 0.22, 0.05, Math.sin(a) * 0.22);
      strip.rotation.y = -a + Math.PI / 2;
      g.add(strip);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon({ color: '#6b4a2f' }));
    top.position.y = 0.08;
    g.add(top);
    const x = pos.x - Math.sin(yaw) * 1.2, z = pos.z - Math.cos(yaw) * 1.2;
    g.position.set(x, heightAt(x, z), z);
    g.scale.setScalar(1.4);
    this.scene.add(g);
    this.peels.push({ x, z, mesh: g, t: 150, used: false });
  }

  clearPeels() {
    for (const pl of this.peels || []) this.scene.remove(pl.mesh);
    this.peels = [];
  }

  // Little puffs for floor cleaner spray and hot sauce breath
  buildPuffs() {
    const n = 64;
    this.puffs = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }),
      n,
    );
    this.puffs.frustumCulled = false;
    this.puffData = [];
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) {
      this.puffs.setColorAt(i, c);
      this.puffData.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1 });
    }
    this.scene.add(this.puffs);
    this.puffNext = 0;
    this.updatePuffs(0);
  }

  spawnPuffs(pos, yaw, color, count, speed) {
    const c = new THREE.Color(color);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (let k = 0; k < count; k++) {
      const i = this.puffNext;
      this.puffNext = (this.puffNext + 1) % this.puffData.length;
      const d = this.puffData[i];
      d.p.set(pos.x + fx * 0.7, pos.y + 1.35, pos.z + fz * 0.7);
      const spread = (Math.random() - 0.5) * 0.9;
      const s = speed * (0.6 + Math.random() * 0.6);
      d.v.set((fx * Math.cos(spread) - fz * Math.sin(spread)) * s, (Math.random() - 0.3) * 2, (fz * Math.cos(spread) + fx * Math.sin(spread)) * s);
      d.max = d.life = 0.6 + Math.random() * 0.5;
      this.puffs.setColorAt(i, c);
    }
    this.puffs.instanceColor.needsUpdate = true;
  }

  updatePuffs(dt) {
    const m = this.puffDummy || (this.puffDummy = new THREE.Object3D());
    this.puffData.forEach((d, i) => {
      if (d.life > 0) {
        d.life -= dt;
        d.p.addScaledVector(d.v, dt);
        d.v.multiplyScalar(Math.exp(-dt * 2.5));
      }
      const k = d.life > 0 ? 0.25 + (1 - d.life / d.max) * 1.3 : 0;
      m.position.copy(d.p);
      m.scale.setScalar(k);
      m.updateMatrix();
      this.puffs.setMatrixAt(i, m.matrix);
    });
    this.puffs.instanceMatrix.needsUpdate = true;
  }

  useItem(key) {
    if (this.state !== 'playing') return;
    const p = this.player;
    if (!p.inv[key]) {
      this.ui.toast(`No ${ITEM_NAMES[key]} left. Check a camp's supply crate.`, '', `none-${key}`, 2);
      return;
    }
    const st = p.stats;
    p.inv[key] -= 1;
    if (key === 'ration') {
      st.food = Math.min(100, st.food + 35);
      st.warmth = Math.min(100, st.warmth + 10);
      this.audio.play('eat');
      this.ui.toast('Hot soup! +35 food', 'good');
    } else if (key === 'water') {
      st.water = Math.min(100, st.water + 40);
      this.audio.play('drink');
      this.ui.toast('Water bottle. +40 water', 'good');
    } else if (key === 'firstaid') {
      const heal = Math.round(35 * p.s.heal);
      st.health = Math.min(p.maxHealth, st.health + heal);
      this.audio.play('pickup');
      this.ui.toast(p.s.heal > 1 ? `Doctor's touch: +${heal} health` : `First aid: +${heal} health`, 'good');
    } else if (key === 'warmer') {
      st.warmth = Math.min(100, st.warmth + 50);
      this.audio.play('pickup');
      this.ui.toast('Hand warmer. +50 warmth', 'good');
    }
  }

  // ---------------------------------------------------------------- frame updates
  // Lower the resolution on slower devices so the game stays smooth
  adaptQuality(rawDt) {
    this.perf = this.perf || { t: 0, frames: 0, ratio: this.renderer.getPixelRatio(), max: this.renderer.getPixelRatio() };
    const q = this.perf;
    q.t += rawDt;
    q.frames += 1;
    if (q.t < 2.5) return;
    const ms = (q.t / q.frames) * 1000;
    q.t = 0;
    q.frames = 0;
    let next = q.ratio;
    if (ms > 24 && q.ratio > 0.75) next = Math.max(0.75, q.ratio - 0.25);
    else if (ms < 13 && q.ratio < q.max) next = Math.min(q.max, q.ratio + 0.25);
    if (next !== q.ratio) {
      q.ratio = next;
      this.renderer.setPixelRatio(next);
      this.resize();
    }
  }

  tick() {
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
    if (!document.hidden && raw < 0.5) this.adaptQuality(raw);
    this.time += dt;
    const inp = this.input;
    switch (this.state) {
      case 'title':
        this.updateTitle(dt);
        break;
      case 'intro':
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'paused':
        this.updateWorld(0, this.player.pos, progressFromHeight(this.player.pos.y));
        this.audio.update(dt, { ...(this.lastAudioEnv || { altitude01: 0, night: 0 }), paused: true });
        break;
      case 'sleeping':
        this.sleepT += dt;
        this.updateWorld(dt, this.player.pos, progressFromHeight(this.player.pos.y));
        if (this.sleepT > 2.2) this.finishSleep();
        break;
      case 'dying':
        this.updateDying(dt);
        break;
      case 'won':
      case 'ended-win':
        this.updateWin(dt);
        break;
      case 'ended':
        this.updateEnded(dt);
        break;
      default:
        break;
    }
    if (this.state !== 'title' && this.state !== 'loading') {
      this.dialog.update({
        player: this.choice,
        farFromPartner: !this.npc || !this.player || this.player.pos.distanceTo(this.npc.root.position) > 22,
        top: ['won', 'ended-win', 'ended', 'dying'].includes(this.state),
      });
    }
    this.ink.render(this.scene, this.camera, { time: this.time, night: this.sky.night });
    inp.endFrame();
  }

  updatePlaying(dt) {
    const inp = this.input;
    const p = this.player;
    const intro = this.state === 'intro';
    if (!intro) {
      if (inp.consume('Escape') || inp.consume('KeyP')) { this.pause(); return; }
      if (inp.consume('KeyM')) this.toggleMute();
      this.camYaw -= inp.look.dx * LOOK_SPEED;
      this.camPitch = clampPitch(this.camPitch + inp.look.dy * LOOK_SPEED);
      this.camDist = clamp(this.camDist + inp.wheel * 0.7, 3, 13);
      this.advanceTime(dt);
    }

    const events = [];
    const mv = intro ? { x: 0, z: 0, len: 0 } : inp.moveVector();
    const jump = !intro && inp.consume('Space');
    const swing = !intro && (inp.consume('Attack') || inp.consume('KeyF'));
    if (swing && p.tryAttack()) this.audio.play('swing');
    p.update(dt, mv, !intro && inp.sprinting(), jump, this.camYaw, this.world.colliders, events);
    for (const e of events) {
      if (e === 'step') this.audio.play('step', { surface: isSnowAt(p.pos.x, p.pos.z) ? 'snow' : p.pos.y > 150 ? 'rock' : 'grass' });
      if (e === 'jump') this.audio.play('jump');
    }

    const safe = inSafeZone(p.pos.x, p.pos.z);
    const prog = progressFromHeight(p.pos.y);
    const env = this.updateWorld(dt, p.pos, prog);
    const alt = altitudeMeters(p.pos.y);
    this.run.best = Math.max(this.run.best, alt);
    const air = Math.exp(-alt / 8000);
    let nearFire = false;
    let fireDist = 999;
    for (const c of this.world.camps) {
      const fd = Math.hypot(p.pos.x - c.firePos.x, p.pos.z - c.firePos.z);
      fireDist = Math.min(fireDist, fd);
      if (fd < 7.5) nearFire = true;
    }

    const ctx = {
      playerPos: p.pos,
      playerAlive: p.alive && !intro,
      playerSafe: !!safe,
      night: env.night,
      progress: prog,
      time: this.time,
      spawning: !intro && this.grace <= 0,
      reveal: this.reveal,
      peels: this.peels,
      ...this.hooks,
    };
    this.grace -= dt;
    this.reveal = Math.max(0, this.reveal - dt);

    if (!intro) {
      if (p.hitMoment) {
        const pan = p.buffs.pan > 0;
        const hits = this.animals.swing(p.pos, p.yaw, pan ? 2.6 : 2.3, p.s.damage * (pan ? 3 : 1), ctx);
        if (hits.length) {
          this.audio.play(pan ? 'bonk' : 'thwack');
          this.shake = Math.max(this.shake, 0.15);
        }
      }

      p.updateStats(dt, { altitude01: prog, night: env.night, sun: env.dayness * (1 - prog * 0.5), nearFire, air: clamp(air * 1.25, 0.45, 1) });

      // Interactions and backpack
      this.useCD -= dt;
      const it = this.findInteraction();
      this.ui.setPrompt(it ? it.text : null, it ? it.enabled : true);
      if (inp.consume('KeyE') && it && it.enabled && this.useCD <= 0) {
        this.useCD = 0.35;
        it.act();
      }
      const keys = [['Digit1', 'ration'], ['Digit2', 'water'], ['Digit3', 'firstaid'], ['Digit4', 'warmer']];
      for (const [code, item] of keys) if (inp.consume(code)) this.useItem(item);
      if (inp.consume('Digit5') || inp.consume('KeyG')) this.useStuff();
      this.pickUpBoxes();

      // Camps
      const camp = safe ? this.world.camps[safe.id] : null;
      if (camp && !camp.visited) {
        camp.visited = true;
        this.maxCamp = Math.max(this.maxCamp, safe.id);
        this.audio.play('camp');
        this.ui.toast(`${safe.name} reached! ${formatMeters(safe.alt)} m`, 'gold');
        this.dialog.trigger('camp');
        setTimeout(() => this.ui.toast('Animals stay away from the campfire.', ''), 1400);
      }

      // Summit!
      if (Math.hypot(p.pos.x - SUMMIT.x, p.pos.z - SUMMIT.z) < 10 && p.pos.y > SUMMIT.h - 3) {
        this.win();
        return;
      }
      if (p.stats.health <= 0) this.die();
    }

    this.animals.update(dt, ctx);
    this.updateNPC(dt);
    for (const pl of this.peels) {
      pl.t -= dt;
      if (pl.t <= 0 && !pl.used) { pl.used = true; this.scene.remove(pl.mesh); }
    }
    this.peels = this.peels.filter((pl) => !pl.used);
    this.updatePuffs(dt);
    if (this.confettiT > 0) {
      this.confettiT -= dt;
      this.updateConfetti(dt);
      if (this.confettiT <= 0) this.hideConfetti();
    }

    // HUD
    const threats = this.animals.threats(p.pos).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos));
    this.ui.setThreat(threats.length ? `${threats[0].cfg.label} is after you!` : null);
    const next = this.nextTarget();
    this.ui.updateBars(p.stats, p.maxHealth);
    this.ui.updateInventory(p.inv);
    this.ui.updateStuff(p.stuff);
    const b = p.buffs;
    const buffs = [];
    if (b.skates > 0) buffs.push({ key: 'skates', label: 'Skates', t: b.skates });
    if (b.pan > 0) buffs.push({ key: 'pan', label: 'Pan', t: b.pan });
    if (b.bubble > 0) buffs.push({ key: 'bubblewrap', label: 'No tired', t: b.bubble });
    if (b.umbrella > 0) buffs.push({ key: 'umbrella', label: `Umbrella \u00D7${b.umbrella}`, t: null });
    if (this.reveal > 0) buffs.push({ key: 'stethoscope', label: 'Listening', t: this.reveal });
    this.ui.updateBuffs(buffs);
    this.ui.updateClock(this.day, this.hour, this.isNight());
    this.ui.updateAltitude(alt, air * 100, next, Math.hypot(next.x - p.pos.x, next.z - p.pos.z));
    const heard = this.reveal > 0
      ? this.animals.list.filter((a) => a.removeT < 0).sort((a, c) => a.pos.distanceTo(p.pos) - c.pos.distanceTo(p.pos))
      : threats;
    this.ui.updateCompass(this.camYaw, p.pos, next, heard);
    this.ui.updateGauge(alt, this.run.best, this.world.camps.map((c) => c.visited));
    this.ui.updateEffects(dt, p.stats.health / p.maxHealth, p.stats.warmth < 25 ? (25 - p.stats.warmth) / 25 * 0.8 : 0);

    this.lastAudioEnv = {
      altitude01: prog,
      night: env.night,
      moving: p.speed > 1,
      nearFire,
      fire: clamp(1 - (fireDist - 3) / 14, 0, 1),
      lowHealth: p.stats.health / p.maxHealth < 0.25 && p.alive,
      paused: false,
    };
    this.audio.update(dt, this.lastAudioEnv);
    if (!intro && prog > 0.7) this.dialog.trigger('high');

    if (intro) this.updateIntroCamera(dt);
    else this.updateCamera(dt);
  }

  nextTarget() {
    for (const c of CAMPS) if (c.id > this.maxCamp) return c;
    return SUMMIT;
  }

  onHurt(dmg, animal, kx, kz, knock) {
    if (this.state !== 'playing') return;
    const pb = this.player.buffs;
    if (pb.umbrella > 0 && this.player.invuln <= 0) {
      pb.umbrella -= 1;
      if (pb.umbrella <= 0) pb.umbrellaT = 0;
      this.player.invuln = 0.6;
      animal.knock.set(-kx * 10, 0, -kz * 10);
      this.audio.play('block');
      this.ui.toast(pb.umbrella > 0 ? 'The umbrella blocked it! 1 block left.' : 'The umbrella blocked it! Now it is all bent.', 'stuff');
      return;
    }
    if (this.player.hurt(dmg, animal.type, kx, kz, knock)) {
      this.audio.play('hurt');
      this.ui.hurt(0.65);
      this.shake = Math.max(this.shake, 0.35);
    }
  }

  updateNPC(dt) {
    const n = this.npc;
    if (!n || !n.root.visible) return;
    const p = this.player.pos;
    const d = Math.hypot(p.x - n.root.position.x, p.z - n.root.position.z);
    const near = d < 14;
    animateCharacter(n, dt, { speed: 0, grounded: true, attack: -1, dead: 0, t: this.time + 3, wave: near });
    if (near) {
      const yaw = Math.atan2(p.x - n.root.position.x, p.z - n.root.position.z);
      n.root.rotation.y = damp(n.root.rotation.y, yaw, 4, dt);
    }
  }

  // Sky, lights, world animation; returns the lighting environment
  updateWorld(dt, focus, prog) {
    const env = this.sky.update(this.hour, focus, this.camera.position, prog);
    this.scene.fog.color.copy(this.sky.fogColor);
    this.scene.fog.near = 160 + prog * 260;
    this.scene.fog.far = 1350 + prog * 1100;
    this.renderer.toneMappingExposure = 0.92 + env.night * 0.35;
    this.world.update(dt, this.time, { playerPos: focus, dayness: env.dayness });
    // Headlamp at night
    if (this.player && this.player.rig.root.visible && this.state !== 'title') {
      const r = this.player.rig;
      const head = v1.set(0, r.eyeHeight + 0.1, 0.15);
      r.root.localToWorld(head);
      this.headlamp.position.copy(head);
      const yaw = this.player.yaw;
      this.headlamp.target.position.set(head.x + Math.sin(yaw) * 12, head.y - 3, head.z + Math.cos(yaw) * 12);
      this.headlamp.target.updateMatrixWorld();
      this.headlamp.intensity = env.night * 60;
      r.lamp.material.emissive.setRGB(env.night, env.night * 0.9, env.night * 0.6);
    } else {
      this.headlamp.intensity = 0;
    }
    return env;
  }

  updateCamera(dt) {
    const p = this.player;
    const yaw = this.camYaw, pitch = this.camPitch;
    const dir = v1.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const look = v2.set(p.pos.x + rx * 0.55, p.pos.y + p.rig.eyeHeight * 0.95, p.pos.z + rz * 0.55);
    let dist = this.camDist;
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      const x = look.x - dir.x * dist * t, y = look.y - dir.y * dist * t, z = look.z - dir.z * dist * t;
      if (y < heightAt(x, z) + 0.45) { dist = Math.max(1.4, dist * t - 0.4); break; }
    }
    this.camDistNow = dist < this.camDistNow ? dist : damp(this.camDistNow, dist, 3, dt);
    const cam = this.camera.position;
    cam.set(look.x - dir.x * this.camDistNow, look.y - dir.y * this.camDistNow, look.z - dir.z * this.camDistNow);
    const g = heightAt(cam.x, cam.z) + 0.4;
    if (cam.y < g) cam.y = g;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    if (this.shake > 0) {
      const s = this.shake * 0.35;
      cam.x += (Math.random() - 0.5) * s;
      cam.y += (Math.random() - 0.5) * s;
      cam.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(look);
  }

  updateIntroCamera(dt) {
    this.introT += dt / 1.6;
    const t = smoothstep(0, 1, this.introT);
    const from = this.introFrom.clone();
    const fromQ = this.introFromQ.clone();
    this.updateCamera(dt);
    const toPos = this.camera.position.clone();
    const toQ = this.camera.quaternion.clone();
    this.camera.position.lerpVectors(from, toPos, t);
    this.camera.quaternion.slerpQuaternions(fromQ, toQ, t);
    if (this.introT >= 1) {
      this.state = 'playing';
      this.clock.getDelta();
    }
  }

  updateDying(dt) {
    this.dyingT += dt;
    const p = this.player;
    p.update(dt, { x: 0, z: 0, len: 0 }, false, false, this.camYaw, this.world.colliders, []);
    this.animals.update(dt, {
      playerPos: p.pos, playerAlive: false, playerSafe: true, night: this.sky.night, progress: 0, time: this.time,
      spawning: false, reveal: 0, peels: [], hurtPlayer: () => {}, onAlert: () => {}, onScared: () => {}, onPeel: () => {}, onSound: () => {},
    });
    this.updateWorld(dt, p.pos, progressFromHeight(p.pos.y));
    this.camPitch = damp(this.camPitch, 0.9, 1.5, dt);
    this.camDist = damp(this.camDist, 8, 1.5, dt);
    this.updateCamera(dt);
    this.ui.updateEffects(dt, 0, 0);
    if (this.dyingT > 2.2) this.showDeath();
  }

  updateEnded(dt) {
    const p = this.player;
    if (!p) return;
    this.camYaw += dt * 0.08;
    p.update(dt, { x: 0, z: 0, len: 0 }, false, false, this.camYaw, this.world.colliders, []);
    this.updateWorld(dt, p.pos, progressFromHeight(p.pos.y));
    this.updateCamera(dt);
  }

  updateWin(dt) {
    this.winT += dt;
    const p = this.player;
    p.update(dt, { x: 0, z: 0, len: 0 }, false, false, this.camYaw, this.world.colliders, []);
    p.yaw = -Math.PI / 2;
    p.rig.root.rotation.y = p.yaw;
    this.hour = damp(this.hour, 16.8, 0.5, dt);
    this.updateWorld(dt, p.pos, 1);
    const car = this.world.summit.group.position;
    const a = this.winT * 0.25 + 0.6;
    const r = 11 + Math.sin(this.winT * 0.3) * 1.5;
    this.camera.position.set(car.x + Math.cos(a) * r, car.y + 3.6, car.z + Math.sin(a) * r);
    v1.set(car.x + 1.5, car.y + 1.3, car.z);
    this.camera.lookAt(v1);
    this.updateConfetti(dt);
    if (this.honkT > 0) {
      this.honkT -= dt;
      const on = Math.floor(this.honkT * 10) % 2 === 0;
      this.world.summit.car.userData.headlight.color.set(on ? '#ffffff' : '#fff3b0');
    }
    if (this.state === 'won' && this.winT > 2.4) this.showWin();
  }

  // ---------------------------------------------------------------- confetti
  buildConfetti() {
    const n = 360;
    const geo = new THREE.PlaneGeometry(0.22, 0.12);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.confetti = new THREE.InstancedMesh(geo, mat, n);
    this.confetti.frustumCulled = false;
    this.confetti.visible = false;
    const colors = ['#ff6b1f', '#ffc23d', '#43b4ff', '#7bd35a', '#ff4b8b', '#ffffff'];
    const c = new THREE.Color();
    this.confettiData = [];
    for (let i = 0; i < n; i++) {
      c.set(colors[i % colors.length]);
      this.confetti.setColorAt(i, c);
      this.confettiData.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: Math.random() * 4 + 2 });
    }
    this.scene.add(this.confetti);
    this.dummy = new THREE.Object3D();
  }

  showConfetti(center, spread = 16, height = 14) {
    this.confettiCenter = center.clone();
    this.confettiHeight = height;
    for (const d of this.confettiData) {
      d.p.set(center.x + (Math.random() - 0.5) * spread, center.y + 2 + Math.random() * height, center.z + (Math.random() - 0.5) * spread);
      d.v.set((Math.random() - 0.5) * 2, -1 - Math.random() * 1.5, (Math.random() - 0.5) * 2);
      d.r.set(Math.random() * TAU, Math.random() * TAU, 0);
    }
    this.confetti.visible = true;
  }

  hideConfetti() {
    if (this.confetti) this.confetti.visible = false;
  }

  updateConfetti(dt) {
    if (!this.confetti.visible) return;
    const car = this.confettiCenter;
    this.confettiData.forEach((d, i) => {
      d.p.addScaledVector(d.v, dt);
      d.p.x += Math.sin(this.time * 2 + i) * dt * 0.6;
      d.r.x += dt * d.s;
      d.r.y += dt * d.s * 0.7;
      if (d.p.y < car.y) d.p.y = car.y + this.confettiHeight + Math.random() * 4;
      this.dummy.position.copy(d.p);
      this.dummy.rotation.copy(d.r);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    });
    this.confetti.instanceMatrix.needsUpdate = true;
  }
}

function showFatal(msg) {
  const el = document.getElementById('loading');
  if (!el) return;
  el.hidden = false;
  el.classList.remove('done');
  el.querySelector('.loading-text').textContent = msg;
}

const game = new Game();
game.init().catch((err) => {
  console.error(err);
  showFatal('The game could not start. Try a browser with WebGL turned on.');
});
window.__game = game;
window.__HF = HF;
