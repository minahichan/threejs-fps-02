# DUSTLINE — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Minahichan/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Minahichan/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A complete, round-based 5v5 tactical FPS in the browser, built with three.js 0.187.0 and plain static files — no build step, no network at play time. Counter-Strike-style, never a copy: its own map, art, sounds and names.

## How it plays

- **Two teams, short rounds.** VANGUARD (you + 4 bots) vs EMBER (5 bots). First team to 5 rounds wins the match.
- **Win a round two ways:** eliminate the enemy team, or hold the glowing centre zone uncontested until the capture bar fills. If the timer runs out, the team with more players alive takes the round.
- **Money and a buy menu.** Kills pay $300, a round win $325. Between rounds, spend it: SMG, rifle, sniper, Kevlar, medkit, ammo. Health and armour carry across rounds — a medkit is worth buying.
- **Gunfire where accuracy counts.** Spread grows when you move and when you spray; crouch, hold angles, and burst-fire. Headshots pay double (2.5× for the sniper). Armour soaks half of every hit.
- **Bots that play the objective.** They push lanes, hold the zone, strafe while firing, and react after a human-like delay. Friendly bots fight beside you; if you go down, you spectate one until the round ends.
- **Extras:** live minimap, kill feed, hit markers, tracers, muzzle flash, synthesised WebAudio gunfire (no audio files), and a pause menu.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Controls: WASD move · mouse look · click fire · R reload · B buy · Ctrl crouch · Space jump · M mute.

## Layout

- `game/` — the playable game: `index.html`, `src/` (main, world, player, bots, weapon, hud, input, audio, palette), `vendor/three/` (three.js 0.187.0, vendored).
- `screenshots/` — 4 captures from the game (start, buy, play, end).
- `main.ts` — the make.fun program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.
- `serve.ts` — tiny static server for local play.
- `vendor/makefun-threejs.ts` — make.fun's dossier library, copied byte for byte from the kit.

## Licence

MIT — see [LICENSE](LICENSE).

---

Entered on [make.fun](https://make.fun/?ref=60xrk087&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards
