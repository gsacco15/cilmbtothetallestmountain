// A little banter between Ben and Rielle. Rielle is not a fan of dirt.
// Voices recorded with ElevenLabs (assets/audio/voice). Each moment plays
// once per visit, except the win and wipe-out lines.

export const SPEAKERS = {
  rielle: { name: 'Rielle', className: 'who-rielle' },
  ben: { name: 'Ben', className: 'who-ben' },
};

// [speaker, clip, subtitle]
export const DIALOG = {
  start: [
    ['rielle', 'rielle_01', 'Ben. BEN. Wipe your boots! We are NOT tracking mud all the way up this mountain.'],
    ['ben', 'ben_01', "Rielle... it's a mountain. It's literally made of dirt."],
  ],
  berries: [['rielle', 'rielle_02', "Did you wash those berries first? Of course you didn't."]],
  animal: [['rielle', 'rielle_03', 'Ew, ew, ew! That thing has NOT had a bath. Keep it away from me!']],
  camp: [
    ['rielle', 'rielle_04', 'This tent is filthy. Nobody sits down until I wipe everything.'],
    ['ben', 'ben_02', "We're sleeping here ONE night. One."],
  ],
  night: [
    ['rielle', 'rielle_05', "It's dark, it's freezing, and everything is dirty. Perfect."],
    ['ben', 'ben_03', 'Headlamp on. Stay close... the wolves come out at night.'],
  ],
  cleaner: [['rielle', 'rielle_06', 'See?! I TOLD you the floor cleaner would help!']],
  toilet: [
    ['rielle', 'rielle_07', "Is that a toilet? Ben, don't you DARE. Who even cleans that thing?"],
    ['ben', 'ben_05', "Relax. I wasn't gonna use it."],
  ],
  high: [['ben', 'ben_04', "Air's getting thin up here... but I can see the top."]],
  win: [
    ['rielle', 'rielle_08', "We made it! Okay... now somebody wash that car. It's covered in snow."],
    ['ben', 'ben_06', "Lamborghini, baby! And I'm NOT washing it."],
  ],
  death: [['rielle', 'rielle_09', 'Back to the bottom... and look at you. You\'re filthy.']],
};

const REPEATABLE = new Set(['win', 'death']);

export class Dialog {
  constructor(audio) {
    this.audio = audio;
    this.queue = [];
    this.done = new Set();
    this.current = null;
    this.gapUntil = 0;
    this.el = document.getElementById('caption');
    this.who = document.getElementById('caption-who');
    this.text = document.getElementById('caption-text');
  }

  // Call when a new climb starts
  newRun() {
    this.queue = [];
    for (const k of REPEATABLE) this.done.delete(k);
  }

  stop() {
    this.queue = [];
    this.current = null;
    this.el.hidden = true;
  }

  trigger(key) {
    if (this.done.has(key) || !DIALOG[key]) return;
    this.done.add(key);
    for (const [who, clip, text] of DIALOG[key]) this.queue.push({ who, clip, text });
  }

  // ctx: { player: 'daddy' | 'rielle', farFromPartner: bool, top: bool }
  update(ctx) {
    const now = performance.now() / 1000;
    if (this.current && now < this.current.end) {
      this.el.classList.toggle('top', !!ctx.top);
      return;
    }
    if (this.current) {
      this.el.hidden = true;
      this.current = null;
      this.gapUntil = now + 0.35;
    }
    if (now < this.gapUntil || !this.queue.length) return;
    const line = this.queue.shift();
    const speakerIsPlayer = (line.who === 'ben') === (ctx.player === 'daddy');
    const radio = !speakerIsPlayer && ctx.farFromPartner;
    let dur = this.audio.playVoice(line.clip, { radio });
    if (!dur) dur = Math.max(2.2, line.text.length / 15);
    const sp = SPEAKERS[line.who];
    this.who.textContent = radio ? `${sp.name} · radio` : sp.name;
    this.who.className = `caption-who ${sp.className}`;
    this.text.textContent = line.text;
    this.el.classList.toggle('top', !!ctx.top);
    this.el.hidden = false;
    this.current = { end: now + dur + 0.25 };
  }
}
