# Climb the Tallest Mountain

A 3D survival climbing game made with [three.js](https://threejs.org).

Someone made a bet: climb to the top of the tallest mountain and you win a Lamborghini.
Survive day and night, keep your food, water and warmth up, and watch out for wild animals.
If an animal gets you, you're done and you go back to the bottom. You can give up any
time, but then you don't get the Lamborghini.

## Run it

You need [Node.js](https://nodejs.org) and an internet connection (three.js and the fonts
load from a CDN). There is nothing to install.

```bash
npm start
```

Then open http://localhost:8080 in Chrome, Edge, Firefox or Safari.

## Climbers

| | Daddy | Dr. Rielle (a.k.a. Mrs. Rielle) |
|---|---|---|
| Who | 6'2", bald, Navy doctor | Doctor |
| Health | 130 | 100 |
| Ice axe | Hits harder | Normal |
| Speed | Longer stride | Normal |
| Special | | First aid heals double, extra stamina, heals faster |

You can change skin tone (and Dr. Rielle's hair color) on the title screen.

## Controls

| Action | Keyboard and mouse | Phone or tablet |
|---|---|---|
| Walk | W A S D or arrow keys | Drag the left side |
| Look around | Move the mouse (click the game first) | Drag the right side |
| Run | Shift | Run button |
| Jump | Space | Jump button |
| Swing ice axe | Click or F | Swing button |
| Eat, drink, open crates, sleep | E | Use button |
| Use backpack items | 1 soup, 2 water, 3 first aid, 4 hand warmer | Tap the item |
| Pause or give up | Esc | Pause button |
| Sound on/off | M | Speaker button |

## How the climb works

- **The route:** Base Camp (1,350 m) → Camp 1 → Camp 2 → Camp 3 → Summit (8,849 m).
  Orange trail flags mark the way and a gold beam of light marks the top.
- **Food:** red berry bushes and brown mushrooms. Red mushrooms with white spots make you sick.
- **Water:** lakes and mountain ponds. In the snow you can scoop snow, but it makes you cold.
- **Warmth:** drops at night and the higher you go. Campfires and hand warmers warm you up.
- **Camps:** animals stay away from the campfire. Each camp has a supply crate that
  restocks every day, and you can sleep in a tent to skip the night.
- **Thin air:** the higher you climb, the slower your stamina comes back.
- **Animals:** rattlesnakes and bears down low, wolves everywhere (lots more at night),
  mountain goats on the rocky slopes, and snow leopards and eagles near the top.
  Swing your ice axe to scare them off.

## Code map

| File | What it does |
|---|---|
| `src/heightfield.js` | The mountain's shape, camps, ponds and height lookups |
| `src/world.js` | Terrain mesh, lakes, forests, rocks, food, trail flags, camps, summit, clouds |
| `src/sky.js` | Day/night sky, sun, moon, stars and lighting |
| `src/characters.js` | Daddy and Dr. Rielle models and animation |
| `src/animals.js` | Animal models and how each one hunts |
| `src/player.js` | Movement, survival stats and the backpack |
| `src/car.js` | The prize car on the summit |
| `src/audio.js` | Sound effects made with the Web Audio API (no sound files) |
| `src/ui.js`, `index.html`, `style.css` | Menus and the on-screen display |
| `src/main.js` | Game states and the main loop |
