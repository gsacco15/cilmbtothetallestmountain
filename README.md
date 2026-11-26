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
| Who | 6'2", bald Navy doctor (black beanie and headlamp, beard, blue trekking poles) | Doctor (long dark hair, tan sherpa jacket) |
| Health | 130 | 100 |
| Trekking pole swing | Hits harder | Normal |
| Speed | Longer stride | Normal |
| Special | | First aid heals double, extra stamina, heals faster, starts with random stuff |

You can change skin tone (and Dr. Rielle's hair color) on the title screen.

## Controls

| Action | Keyboard and mouse | Phone or tablet |
|---|---|---|
| Walk | W A S D or arrow keys | Drag the left side |
| Look around | Move the mouse (click the game first) | Drag the right side |
| Run | Shift | Run button |
| Jump | Space | Jump button |
| Swing trekking pole | Click or F | Swing button |
| Eat, drink, open crates, sleep | E | Use button |
| Use backpack items | 1 soup, 2 water, 3 first aid, 4 hand warmer | Tap the item |
| Use Rielle's random stuff | 5 or G | Tap the purple slot |
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
  Swing your trekking pole to scare them off.

## Rielle's Random Stuff

Rielle is sure random stuff will help on the climb. Somehow, it does. Walk into one of
the purple boxes along the trail to get one random item, then press 5 to use it:

| Item | What it does |
|---|---|
| Floor cleaner | Animals in front of you slip on the clean ground and slide away |
| Stethoscope | Hear every animal nearby for 30 seconds (red markers), plus a little health |
| Rubber chicken | SQUAWK! Every animal nearby runs away |
| Banana | A snack, and you drop the peel. Animals that step on it slip |
| Hot sauce | Your mouth is on fire: lots of warmth |
| Umbrella | Blocks the next 2 attacks |
| Bubble wrap | So relaxing: unlimited stamina for 25 seconds |
| Cold pizza | Lots of food |
| Whoopee cushion | Animals laugh too hard to attack for 25 seconds |
| Roller skates | Zoom for 20 seconds |
| Frying pan | BONK! Swings hit 3 times harder for 30 seconds |
| Party popper | Does nothing. But it's fun |

There's other random stuff on the mountain too: pink flamingos at Base Camp, a giant
rubber duck in the big lake, a couch at Camp 1, a snack machine at Camp 2 and a toilet
at Camp 3 (try flushing it a few times).

## Voices and sound

Ben and Rielle talk a little during the climb: Rielle thinks everything on the mountain
is dirty and needs cleaning, and Ben has had enough of hearing about it. When one of
them is waiting at Base Camp, their lines come over the walkie-talkie. Every line shows
as a subtitle.

The voices, the ambience (meadow birds, mountain wind, night crickets, campfire) and the
animal calls were made with ElevenLabs and live in `assets/audio`. Ben is the
"Jeremy" voice and Rielle is the "Boo" voice. Small effects like footsteps and the
item sounds are made in code.

## Look

The game is drawn like a hand-painted mountain film: cel shading, ink outlines, a
cold Himalayan palette, snowcapped peaks around the valley, a plume of snow blowing off
the summit, and air that gets clearer the higher you climb. The outline and color pass
is in `src/ink.js`.

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
| `src/stuff.js` | Rielle's random stuff: items and icons |
| `src/dialog.js` | Ben and Rielle's lines and when they're said |
| `src/ink.js` | The hand-drawn look: outlines, color and paper grain |
| `src/audio.js` | Recorded voices, ambience and animal calls, plus small effects made in code |
| `src/ui.js`, `index.html`, `style.css` | Menus and the on-screen display |
| `src/main.js` | Game states and the main loop |
