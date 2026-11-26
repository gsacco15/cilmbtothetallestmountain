// Keyboard, mouse and touch controls.
import { clamp } from './util.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.look = { dx: 0, dy: 0 };
    this.wheel = 0;
    this.enabled = false;
    this.locked = false;
    this.drag = null;
    this.touch = { x: 0, z: 0, active: false, sprint: false };
    this.usingTouch = false;
    this.onLockLost = null;

    window.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        if (e.button === 0) this.pressed.add('Attack');
        return;
      }
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      this.requestLock();
    });
    window.addEventListener('mouseup', (e) => {
      if (this.drag && this.drag.moved < 6 && this.drag.button === 0 && this.enabled && !this.locked) this.pressed.add('Attack');
      this.drag = null;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      } else if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.look.dx += dx;
        this.look.dy += dy;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.onLockLost) this.onLockLost();
    });
    window.addEventListener('touchstart', () => this.setTouchMode(true), { passive: true, once: true });
  }

  setTouchMode(on) {
    if (this.usingTouch === on) return;
    this.usingTouch = on;
    document.body.classList.toggle('touch', on);
  }

  requestLock() {
    if (this.usingTouch || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* pointer lock is optional */
    }
  }

  releaseLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  consume(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // x: right, z: forward
  moveVector() {
    let x = 0, z = 0;
    if (this.down('KeyW', 'ArrowUp')) z += 1;
    if (this.down('KeyS', 'ArrowDown')) z -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.touch.active) {
      x += this.touch.x;
      z += this.touch.z;
    }
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z, len: Math.min(1, len) };
  }

  sprinting() {
    return this.down('ShiftLeft', 'ShiftRight') || this.touch.sprint;
  }

  endFrame() {
    this.pressed.clear();
    this.look.dx = 0;
    this.look.dy = 0;
    this.wheel = 0;
  }

  // On-screen joystick, look pad and buttons for phones and tablets
  bindTouch({ joyZone, joyBase, joyKnob, lookZone, buttons }) {
    let joyId = null, lookId = null, origin = null, lastLook = null;
    const R = 52;
    joyZone.addEventListener('pointerdown', (e) => {
      if (joyId !== null) return;
      this.setTouchMode(true);
      joyId = e.pointerId;
      joyZone.setPointerCapture(e.pointerId);
      origin = { x: e.clientX, y: e.clientY };
      joyBase.style.left = `${e.clientX}px`;
      joyBase.style.top = `${e.clientY}px`;
      joyBase.classList.add('on');
      joyKnob.style.transform = 'translate(-50%, -50%)';
      this.touch.active = true;
      e.preventDefault();
    });
    joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.touch.x = dx / R;
      this.touch.z = -dy / R;
    });
    const joyEnd = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      this.touch.active = false;
      this.touch.x = 0;
      this.touch.z = 0;
      joyBase.classList.remove('on');
    };
    joyZone.addEventListener('pointerup', joyEnd);
    joyZone.addEventListener('pointercancel', joyEnd);

    lookZone.addEventListener('pointerdown', (e) => {
      if (lookId !== null) return;
      this.setTouchMode(true);
      lookId = e.pointerId;
      lookZone.setPointerCapture(e.pointerId);
      lastLook = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      this.look.dx += (e.clientX - lastLook.x) * 1.4;
      this.look.dy += (e.clientY - lastLook.y) * 1.4;
      lastLook = { x: e.clientX, y: e.clientY };
    });
    const lookEnd = (e) => { if (e.pointerId === lookId) lookId = null; };
    lookZone.addEventListener('pointerup', lookEnd);
    lookZone.addEventListener('pointercancel', lookEnd);

    for (const b of buttons) {
      const act = b.dataset.act;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setTouchMode(true);
        if (act === 'sprint') {
          this.touch.sprint = !this.touch.sprint;
          b.classList.toggle('on', this.touch.sprint);
          b.setAttribute('aria-pressed', String(this.touch.sprint));
        } else if (act === 'jump') this.pressed.add('Space');
        else if (act === 'attack') this.pressed.add('Attack');
        else if (act === 'use') this.pressed.add('KeyE');
      });
    }
  }
}

export const LOOK_SPEED = 0.0024;
export const clampPitch = (p) => clamp(p, -0.25, 1.15);
