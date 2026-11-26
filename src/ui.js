// Everything on screen that isn't 3D: menus, the HUD, toasts and prompts.
import { CAMPS, SUMMIT, ALT_BASE, ALT_SUMMIT } from './heightfield.js';
import { formatMeters, wrapAngle, clamp } from './util.js';
import { STUFF, EMPTY_ICON } from './stuff.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.bars = {};
    for (const el of document.querySelectorAll('.bar')) {
      this.bars[el.dataset.stat] = { el, fill: el.querySelector('.fill'), val: el.querySelector('.val'), last: -1 };
    }
    this.slots = {};
    for (const el of document.querySelectorAll('.slot')) {
      if (el.dataset.item === 'stuff') continue;
      this.slots[el.dataset.item] = { el, count: el.querySelector('.slot-count'), last: -1 };
    }
    this.stuffEl = $('slot-stuff');
    this.buffsEl = $('buffs');
    this.lastStuff = undefined;
    this.lastBuffs = '';
    this.toastsEl = $('toasts');
    this.promptEl = $('prompt');
    this.promptText = $('prompt-text');
    this.hurtEl = $('hurt');
    this.coldEl = $('cold');
    this.hurtLevel = 0;
    this.buildCompass();
    this.buildGauge();
    this.toastKeys = new Map();
  }

  show(id, on = true) {
    const el = $(id);
    if (el) el.hidden = !on;
  }

  // ------------------------------------------------------------ compass
  buildCompass() {
    const strip = $('compass');
    this.compassItems = [];
    // North points at the mountain from Base Camp (toward -z)
    const cards = [['N', Math.PI], ['NE', Math.PI * 0.75], ['E', Math.PI / 2], ['SE', Math.PI / 4], ['S', 0], ['SW', -Math.PI / 4], ['W', -Math.PI / 2], ['NW', -Math.PI * 0.75]];
    for (const [label, b] of cards) {
      const s = document.createElement('span');
      s.textContent = label;
      s.className = label.length === 1 ? 'card' : '';
      strip.appendChild(s);
      this.compassItems.push({ el: s, bearing: b });
    }
    for (let k = 0; k < 24; k++) {
      if (k % 3 === 0) continue;
      const s = document.createElement('span');
      s.className = 'tick';
      strip.appendChild(s);
      this.compassItems.push({ el: s, bearing: (k / 24) * Math.PI * 2 });
    }
    this.campMark = document.createElement('span');
    this.campMark.className = 'mark-camp';
    strip.appendChild(this.campMark);
    this.summitMark = document.createElement('span');
    this.summitMark.className = 'mark-summit';
    this.summitMark.textContent = '▲ Top';
    strip.appendChild(this.summitMark);
    this.threatMarks = [];
    for (let k = 0; k < 6; k++) {
      const s = document.createElement('span');
      s.className = 'mark-threat';
      s.hidden = true;
      strip.appendChild(s);
      this.threatMarks.push(s);
    }
  }

  placeOnCompass(el, bearing, camYaw) {
    const rel = wrapAngle(bearing - camYaw);
    const fov = Math.PI * 0.55;
    if (Math.abs(rel) > fov) {
      el.style.visibility = 'hidden';
      return;
    }
    el.style.visibility = 'visible';
    el.style.left = `${50 - (rel / fov) * 50}%`;
  }

  updateCompass(camYaw, player, nextTarget, threats) {
    for (const it of this.compassItems) this.placeOnCompass(it.el, it.bearing, camYaw);
    const bearingTo = (x, z) => Math.atan2(x - player.x, z - player.z);
    if (nextTarget && nextTarget !== SUMMIT) {
      this.campMark.hidden = false;
      this.campMark.textContent = `▼ ${nextTarget.short}`;
      this.placeOnCompass(this.campMark, bearingTo(nextTarget.x, nextTarget.z), camYaw);
    } else {
      this.campMark.hidden = true;
    }
    this.placeOnCompass(this.summitMark, bearingTo(SUMMIT.x, SUMMIT.z), camYaw);
    this.threatMarks.forEach((m, i) => {
      const a = threats[i];
      if (!a) { m.hidden = true; return; }
      m.hidden = false;
      this.placeOnCompass(m, bearingTo(a.pos.x, a.pos.z), camYaw);
    });
  }

  // ------------------------------------------------------------ altitude gauge
  buildGauge() {
    const marks = $('gauge-marks');
    this.gaugeMarks = [];
    const points = [...CAMPS.map((c) => ({ label: c.short, alt: c.alt })), { label: 'Top', alt: ALT_SUMMIT, top: true }];
    for (const p of points) {
      const s = document.createElement('span');
      s.innerHTML = `<b>${p.label}</b> ${formatMeters(p.alt)}`;
      if (p.top) s.classList.add('top');
      s.style.bottom = `${this.altFrac(p.alt) * 100}%`;
      marks.appendChild(s);
      this.gaugeMarks.push({ el: s, alt: p.alt });
    }
  }

  altFrac(m) {
    return clamp((m - ALT_BASE) / (ALT_SUMMIT - ALT_BASE), 0, 1);
  }

  updateGauge(alt, best, visited) {
    const f = this.altFrac(alt);
    $('gauge-fill').style.height = `${f * 100}%`;
    $('gauge-you').style.bottom = `${f * 100}%`;
    $('gauge-best').style.bottom = `${this.altFrac(best) * 100}%`;
    this.gaugeMarks.forEach((m, i) => m.el.classList.toggle('reached', !!visited[i]));
  }

  // ------------------------------------------------------------ HUD values
  setCharacter(def) {
    $('hud-name').textContent = def.name;
    $('hud-role').textContent = def.role;
  }

  updateBars(stats, maxHealth) {
    const vals = {
      health: (stats.health / maxHealth) * 100,
      food: stats.food,
      water: stats.water,
      warmth: stats.warmth,
      stamina: stats.stamina,
    };
    for (const [k, v] of Object.entries(vals)) {
      const b = this.bars[k];
      const r = Math.round(clamp(v, 0, 100));
      if (r === b.last) continue;
      b.last = r;
      b.fill.style.width = `${r}%`;
      b.val.textContent = k === 'health' ? Math.ceil(stats.health) : r;
      b.el.classList.toggle('low', k !== 'stamina' && r <= 25);
    }
  }

  updateInventory(inv) {
    for (const [k, s] of Object.entries(this.slots)) {
      const n = inv[k] || 0;
      if (n === s.last) continue;
      if (n > s.last && s.last >= 0) {
        s.el.classList.remove('pop');
        void s.el.offsetWidth;
        s.el.classList.add('pop');
      }
      s.last = n;
      s.count.textContent = n;
      s.el.classList.toggle('empty', n === 0);
    }
  }

  // Rielle's random item slot
  updateStuff(key) {
    if (key === this.lastStuff) return;
    const had = this.lastStuff;
    this.lastStuff = key;
    const item = key ? STUFF[key] : null;
    $('stuff-icon').innerHTML = item ? item.icon : EMPTY_ICON;
    $('stuff-name').textContent = item ? item.name : "Rielle's";
    this.stuffEl.classList.toggle('empty', !item);
    this.stuffEl.classList.toggle('ready', !!item);
    this.stuffEl.setAttribute('aria-label', item ? `Use ${item.name}` : "Rielle's random stuff: empty");
    if (item && had !== undefined) {
      this.stuffEl.classList.remove('pop');
      void this.stuffEl.offsetWidth;
      this.stuffEl.classList.add('pop');
    }
  }

  // Active effects with seconds left: [{ key, label, t }]
  updateBuffs(list) {
    const sig = list.map((b) => `${b.key}:${b.label}:${Math.ceil(b.t)}`).join('|');
    if (sig === this.lastBuffs) return;
    this.lastBuffs = sig;
    this.buffsEl.innerHTML = '';
    for (const b of list) {
      const el = document.createElement('span');
      el.className = 'buff';
      el.innerHTML = STUFF[b.key] ? STUFF[b.key].icon : '';
      const txt = document.createElement('span');
      txt.textContent = b.t != null ? `${b.label} ${Math.ceil(b.t)}s` : b.label;
      el.appendChild(txt);
      this.buffsEl.appendChild(el);
    }
  }

  updateClock(day, hour, isNight) {
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60 / 10) * 10;
    const h12 = ((h + 11) % 12) + 1;
    const ap = h < 12 ? 'AM' : 'PM';
    const text = `Day ${day} · ${h12}:${String(m).padStart(2, '0')} ${ap}`;
    if (text !== this.lastClock) {
      $('clock-text').textContent = text;
      this.lastClock = text;
    }
    $('clock-dot').classList.toggle('night', isNight);
  }

  updateAltitude(m, airPct, next, dist) {
    const a = formatMeters(m);
    if (a !== this.lastAlt) { $('alt-num').textContent = a; this.lastAlt = a; }
    const air = `Air ${Math.round(airPct)}%`;
    if (air !== this.lastAir) { $('air').textContent = air; this.lastAir = air; }
    const nt = next ? `${next.short === 'Top' ? 'Summit' : next.name} · ${Math.round(dist)} m` : '';
    if (nt !== this.lastNext) { $('next-target').textContent = nt; this.lastNext = nt; }
  }

  setPrompt(text, enabled = true) {
    if (!text) {
      if (!this.promptEl.hidden) this.promptEl.hidden = true;
      return;
    }
    this.promptEl.hidden = false;
    if (text !== this.lastPrompt) {
      this.promptText.textContent = text;
      this.lastPrompt = text;
    }
    this.promptEl.classList.toggle('disabled', !enabled);
  }

  setThreat(text) {
    const el = $('threat');
    if (!text) { el.hidden = true; return; }
    el.hidden = false;
    if (el.textContent !== text) el.textContent = text;
  }

  toast(text, kind = '', key = null, cooldown = 0) {
    const now = performance.now();
    if (key) {
      const last = this.toastKeys.get(key) || 0;
      if (now - last < cooldown * 1000) return;
      this.toastKeys.set(key, now);
    }
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toastsEl.prepend(el);
    while (this.toastsEl.children.length > 3) this.toastsEl.lastChild.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  clearToasts() {
    this.toastsEl.innerHTML = '';
  }

  hurt(amount) {
    this.hurtLevel = Math.min(1, this.hurtLevel + amount);
  }

  updateEffects(dt, healthFrac, coldFrac) {
    this.hurtLevel = Math.max(0, this.hurtLevel - dt * 1.6);
    const low = healthFrac < 0.3 ? (0.3 - healthFrac) * 1.6 : 0;
    this.hurtEl.style.opacity = Math.min(1, this.hurtLevel + low).toFixed(3);
    this.coldEl.style.opacity = coldFrac.toFixed(3);
  }

  fade(on) {
    $('fade').classList.toggle('on', on);
  }

  // ------------------------------------------------------------ end screen
  showEnd({ kind, eyebrow, title, sub, stats, primary, secondary, honk }) {
    const card = $('end-card');
    card.className = `end-card ${kind}`;
    $('end-eyebrow').textContent = eyebrow;
    $('end-title').textContent = title;
    $('end-sub').textContent = sub;
    const dl = $('end-stats');
    dl.innerHTML = '';
    for (const [k, v] of stats) {
      const d = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      d.append(dt, dd);
      dl.appendChild(d);
    }
    $('end-primary').textContent = primary;
    $('end-secondary').textContent = secondary;
    $('honk-btn').hidden = !honk;
    this.show('screen-end', true);
    // Re-trigger the entrance animation
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
  }
}
