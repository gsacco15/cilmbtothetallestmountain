// Rielle's Random Stuff: Rielle is sure all of this will help on the climb.
// Somehow, it does. Each purple box gives you one random item.

const svg = (body) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;

export const STUFF = {
  cleaner: {
    name: 'Floor cleaner',
    icon: svg('<path d="M10 10h9l3 3v14a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V12z" fill="#7fd6ff"/><rect x="11" y="4" width="8" height="6" rx="1" fill="#f4f6f8"/><path d="M19 5h7v3h-7z" fill="#f4f6f8"/><rect x="10" y="16" width="12" height="7" fill="#ffe26a"/><circle cx="28" cy="5" r="1" fill="#bfe9ff"/><circle cx="29" cy="9" r="1.2" fill="#bfe9ff"/>'),
    use: 'Psssht! Lemon fresh! Animals slipped on the squeaky-clean ground.',
  },
  stethoscope: {
    name: 'Stethoscope',
    icon: svg('<path d="M9 4v9a6 6 0 0 0 12 0V4" stroke="#2b2e33" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M15 19v3a5 5 0 0 0 10 0v-3" stroke="#2b2e33" stroke-width="2.6" fill="none"/><circle cx="25" cy="16" r="4.2" fill="#c9ced4" stroke="#5b636c" stroke-width="1.6"/>'),
    use: 'You listen closely... you can hear every animal nearby! Heartbeat: strong. +10 health',
  },
  chicken: {
    name: 'Rubber chicken',
    icon: svg('<ellipse cx="14" cy="20" rx="7" ry="8.5" fill="#ffd23a"/><circle cx="20" cy="10" r="4.2" fill="#ffd23a"/><path d="M24 9.5l5 1.5-5 1.8z" fill="#ff8a00"/><path d="M17.5 6.5c.8-2.5 3.5-2.8 4.6-.6" stroke="#e0202e" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="21" cy="9.5" r="1" fill="#222"/>'),
    use: 'SQUAWK! Every animal nearby ran away.',
  },
  banana: {
    name: 'Banana',
    icon: svg('<path d="M6 9c2 12 14 18 22 12-8 2-16-4-18-12z" fill="#ffd93b" stroke="#c9a400" stroke-width="1.2"/><path d="M5 8l2-3 2 2z" fill="#6b4a2f"/>'),
    use: 'You ate the banana (+15 food) and dropped the peel. Lead an animal over it!',
  },
  hotsauce: {
    name: 'Hot sauce',
    icon: svg('<rect x="12" y="11" width="9" height="17" rx="3" fill="#e0202e"/><rect x="14" y="4" width="5" height="8" rx="1" fill="#2f2f2f"/><path d="M16.5 15c2 2 2.5 3.5 2.5 5a2.5 2.5 0 0 1-5 0c0-1.5 1-2.5 2.5-5z" fill="#ffd23a"/>'),
    use: 'Your mouth is on FIRE! +60 warmth',
  },
  umbrella: {
    name: 'Umbrella',
    icon: svg('<path d="M3 16a13 11 0 0 1 26 0z" fill="#ff4b8b"/><path d="M9 16a7 6 0 0 1 14 0" fill="#ff8ab4"/><path d="M16 16v9a2.5 2.5 0 0 1-5 0" stroke="#2b2e33" stroke-width="2" fill="none" stroke-linecap="round"/>'),
    use: 'Umbrella up! It blocks the next 2 attacks.',
  },
  bubblewrap: {
    name: 'Bubble wrap',
    icon: svg('<rect x="4" y="4" width="24" height="24" rx="3" fill="#d6f1ff"/>' + [8, 16, 24].map((x) => [8, 16, 24].map((y) => `<circle cx="${x}" cy="${y}" r="3" fill="#ffffff" stroke="#8fd3ff" stroke-width="1"/>`).join('')).join('')),
    use: 'Pop pop pop... so relaxing. Unlimited stamina for 25 seconds.',
  },
  pizza: {
    name: 'Cold pizza',
    icon: svg('<path d="M5 7l22 3-12 18z" fill="#ffcf5a"/><path d="M5 7l22 3" stroke="#c77b2a" stroke-width="3.2" stroke-linecap="round"/><circle cx="14" cy="13" r="2" fill="#d8322b"/><circle cx="19.5" cy="15" r="2" fill="#d8322b"/><circle cx="15" cy="19.5" r="2" fill="#d8322b"/>'),
    use: 'Cold pizza on a mountain. Perfect. +40 food',
  },
  whoopee: {
    name: 'Whoopee cushion',
    icon: svg('<ellipse cx="14" cy="18" rx="10" ry="7.5" fill="#ff7ab6"/><path d="M23 15.5l6-2v7l-6-1.5z" fill="#ff7ab6"/><ellipse cx="12" cy="15" rx="4" ry="2" fill="#ffb3d4"/>'),
    use: 'PFFFT! The animals are laughing too hard to attack.',
  },
  skates: {
    name: 'Roller skates',
    icon: svg('<path d="M8 5h7v10h8a3.5 3.5 0 0 1 3.5 3.5V22H8z" fill="#9b5cff"/><path d="M8 9h7" stroke="#fff" stroke-width="1.5"/><circle cx="11" cy="26" r="2.8" fill="#ffd23a"/><circle cx="22" cy="26" r="2.8" fill="#ffd23a"/>'),
    use: 'Roller skates! Zoom for 20 seconds. Even uphill. Somehow.',
  },
  pan: {
    name: 'Frying pan',
    icon: svg('<circle cx="13" cy="16" r="9.5" fill="#3a3f46"/><circle cx="13" cy="16" r="6.8" fill="#24282d"/><rect x="21" y="14" width="9.5" height="4" rx="2" fill="#6b4a2f"/>'),
    use: 'Frying pan! BONK! Your swings hit 3 times harder for 30 seconds.',
  },
  popper: {
    name: 'Party popper',
    icon: svg('<path d="M5 28l6.5-16.5 10 10z" fill="#ffc23d"/><path d="M8 21l6 6" stroke="#ff6b1f" stroke-width="2"/><circle cx="22" cy="8" r="2" fill="#ff4b8b"/><circle cx="27" cy="13" r="1.7" fill="#43b4ff"/><rect x="17" y="3" width="3" height="2" fill="#7bd35a"/><rect x="25" y="5" width="2.5" height="2.5" fill="#ffc23d"/>'),
    use: 'It does absolutely nothing. But it is fun!',
  },
};

export const STUFF_KEYS = Object.keys(STUFF);

export function randomStuff(except = null) {
  const keys = STUFF_KEYS.filter((k) => k !== except);
  return keys[Math.floor(Math.random() * keys.length)];
}

export const EMPTY_ICON = svg('<rect x="5" y="5" width="22" height="22" rx="4" fill="none" stroke="#a9b7c4" stroke-width="2" stroke-dasharray="3 3"/><text x="16" y="21.5" text-anchor="middle" font-size="14" font-weight="900" fill="#a9b7c4" font-family="sans-serif">?</text>');
