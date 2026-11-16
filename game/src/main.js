// DUSTLINE boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. States: menu -> buy -> round -> roundEnd -> buy ...
// -> matchEnd. Rounds are first to 5; a round is won by eliminating the enemy
// team or by holding the centre zone uncontested. Money is earned per kill and
// per round and spent in the buy menu between rounds.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, weaponById, BUY_ITEMS } from './weapon.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 100;
const BUY_TIME = 15;
const WIN_ROUNDS = 5;
const START_MONEY = 800;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 80);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const bots = createBots(scene, world, onBotShot);
bots.spawnAll(random);
const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const direction = new THREE.Vector3();
const hint = document.getElementById('hint');

// Tracer pool: short-lived lines from a muzzle to the hit point.
const tracers = [];
const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffd27d, transparent: true, opacity: 0.9 });
for (let i = 0; i < 24; i += 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geometry, tracerMaterial.clone());
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
function spawnTracer(from, to, color) {
  const tracer = tracers.find((t) => t.life <= 0) ?? tracers[0];
  tracer.line.material.color.setHex(color);
  tracer.line.material.opacity = 0.9;
  const positions = tracer.line.geometry.attributes.position;
  positions.setXYZ(0, from.x, from.y, from.z);
  positions.setXYZ(1, to.x, to.y, to.z);
  positions.needsUpdate = true;
  tracer.line.visible = true;
  tracer.life = 0.07;
}

const body = player.state;
const markerHoldMs = shot ? 4000 : 90;
let state = 'menu'; // menu | buy | round | roundEnd | matchEnd
let round = 1;
let scoreV = 0;
let scoreE = 0;
let money = START_MONEY;
let ownedWeapon = 'rifle';
let roundTimeLeft = ROUND_TIME;
let buyTimeLeft = BUY_TIME;
let captureTeam = null;
let captureProgress = 0;
let captureTickAt = 0;
let bloom = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let spectateBot = null;
let roundEndTimer = 0;
let roundEndText = '';
let roundStartedAt = 0;

function playerName() {
  return 'YOU';
}

function syncCamera() {
  if (!body.alive && spectateBot && spectateBot.alive) {
    const bot = spectateBot;
    camera.position.set(bot.position.x, bot.position.y + 1.55, bot.position.z);
    const dx = -Math.sin(bot.yaw);
    const dz = -Math.cos(bot.yaw);
    camera.lookAt(bot.position.x + dx, 1.5, bot.position.z + dz);
    return;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function refreshHud() {
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.current.name);
  hud.setHealth(body.health, body.armor);
  hud.setMoney(money);
  hud.setScore(scoreV, scoreE, round);
  hud.setTimer(state === 'buy' ? buyTimeLeft : roundTimeLeft);
  hud.setCapture(captureTeam, captureProgress);
  hud.refreshBuy(money, ownedWeapon);
}

function startBuyPhase() {
  state = 'buy';
  buyTimeLeft = BUY_TIME;
  captureTeam = null;
  captureProgress = 0;
  roundTimeLeft = ROUND_TIME;
  bots.resetAll(random);
  const spot = world.spawns.vanguard[0];
  player.reset(spot[0], spot[1], Math.PI);
  // Ammunition carries across rounds; only a newly bought weapon refills.
  weapon.equip(ownedWeapon, true);
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showOverlay('buy');
  refreshHud();
}

function startRound() {
  state = 'round';
  roundTimeLeft = ROUND_TIME;
  roundStartedAt = elapsed;
  hud.hideOverlay();
  input.requestLock();
  refreshHud();
}

function endRound(winner, reason) {
  state = 'roundEnd';
  roundEndTimer = 3.5;
  if (winner === 'vanguard') {
    scoreV += 1;
    money += 325;
    audio.roundWin();
    roundEndText = `VANGUARD takes round ${round} — ${reason}.`;
  } else if (winner === 'ember') {
    scoreE += 1;
    money += 200;
    audio.roundLose();
    roundEndText = `EMBER takes round ${round} — ${reason}.`;
  } else {
    money += 200;
    roundEndText = `Round ${round} is a draw — ${reason}.`;
  }
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showOverlay('roundEnd', roundEndText);
  refreshHud();
}

function endMatch() {
  state = 'matchEnd';
  const won = scoreV >= WIN_ROUNDS;
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showOverlay(
    'matchEnd',
    won
      ? `VANGUARD wins the match ${scoreV}–${scoreE}. You earned $${money} across the match.`
      : `EMBER wins the match ${scoreE}–${scoreV}. You earned $${money} across the match.`,
  );
  refreshHud();
}

function restartMatch() {
  round = 1;
  scoreV = 0;
  scoreE = 0;
  money = START_MONEY;
  ownedWeapon = 'rifle';
  startBuyPhase();
}

function buyItem(id) {
  if (state !== 'buy') return;
  const item = BUY_ITEMS.find((b) => b.id === id);
  if (!item || money < item.price) return;
  if (item.kind === 'weapon') {
    if (ownedWeapon === item.id) return;
    money -= item.price;
    ownedWeapon = item.id;
    weapon.equip(item.id);
    weapon.refill();
  } else if (item.kind === 'armor') {
    money -= item.price;
    body.armor = Math.min(100, body.armor + 50);
  } else if (item.kind === 'medkit') {
    money -= item.price;
    body.health = 100;
  } else if (item.kind === 'ammo') {
    money -= item.price;
    weapon.refillAmmo();
  }
  audio.buy();
  refreshHud();
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state === 'menu' || state === 'matchEnd') {
    started = true;
    if (state === 'matchEnd') restartMatch();
    else startBuyPhase();
  } else if (state === 'buy') {
    startRound();
  } else if (state === 'round') {
    // Resuming from the pause overlay: the click is a user gesture, so the
    // lock request is allowed here.
    input.requestLock();
  } else if (state === 'roundEnd') {
    if (scoreV >= WIN_ROUNDS || scoreE >= WIN_ROUNDS) endMatch();
    else {
      round += 1;
      startBuyPhase();
    }
  }
});
hud.onBuy((id) => {
  if (state === 'buy') buyItem(id);
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (state === 'round' && body.alive) {
    hud.showOverlay('paused');
  }
}

function shoot(spread) {
  if (!weapon.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = weapon.current.range;
  const targets = world.shootables.concat(bots.hitMeshes);
  const hit = raycaster.intersectObjects(targets, false)[0];
  const muzzle = camera.position.clone().add(direction.clone().multiplyScalar(0.6));
  muzzle.y -= 0.12;
  const endPoint = hit ? hit.point.clone() : camera.position.clone().add(direction.clone().multiplyScalar(weapon.current.range));
  spawnTracer(muzzle, endPoint, weapon.current.tracer);
  audio.shoot(weapon.current.id);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const isHead = hit.object.userData.part === 'head';
    const dmg = weapon.current.damage * (isHead ? weapon.current.headMult : 1);
    const killed = bots.damage(bot, dmg, isHead);
    if (killed) {
      money += 300;
      audio.kill();
      hud.feed(playerName(), bot.name, isHead);
    } else {
      audio.hit();
    }
    hud.hitMarker(killed, markerHoldMs);
  }
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  bloom = Math.min(0.02, bloom + 0.0022);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.current.name);
  hud.setMoney(money);
  return true;
}

function onBotShot(bot, enemy, hit, isHead, miss) {
  // A short tracer from the bot's gun toward where it aimed, plus a distant
  // crack when it shoots at the player.
  const from = new THREE.Vector3(bot.position.x, bot.position.y + 1.35, bot.position.z);
  const targetPos = enemy.kind === 'bot'
    ? new THREE.Vector3(enemy.ref.position.x, enemy.ref.position.y + 1.3, enemy.ref.position.z)
    : new THREE.Vector3(enemy.ref.position.x, enemy.ref.position.y + enemy.ref.eye, enemy.ref.position.z);
  const dir = targetPos.clone().sub(from).normalize();
  const end = from.clone().add(dir.multiplyScalar(enemy.dist + (hit ? 0 : 2 + Math.abs(miss) * 6)));
  spawnTracer(from, end, bot.weapon.tracer);
  if (enemy.kind === 'player') audio.enemyShoot(enemy.dist);
}

function onDamagePlayer(bot, amount) {
  if (!body.alive) return;
  player.damage(amount);
  audio.hurt();
  hud.setHealth(body.health, body.armor);
  if (!body.alive) {
    hud.feed(bot.name, playerName(), false);
    spectateBot = bots.all().find((b) => b.team === 'vanguard' && b.alive) ?? null;
    hint.textContent = spectateBot ? `You are down — spectating ${spectateBot.name}.` : 'You are down.';
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function onBotKill(killer, victim) {
  hud.feed(killer.name, victim.name, false);
  if (killer.team === 'vanguard' && killer.name !== undefined) {
    // Teammate kills do not pay the player; only the player's own kills do.
  }
}

function stepCapture(dt) {
  const zone = world.capture;
  let vanguardIn = 0;
  let emberIn = 0;
  if (body.alive) {
    const d = Math.hypot(body.position.x - zone.x, body.position.z - zone.z);
    if (d <= zone.radius) vanguardIn += 1;
  }
  for (const bot of bots.all()) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - zone.x, bot.position.z - zone.z);
    if (d <= zone.radius) {
      if (bot.team === 'vanguard') vanguardIn += 1;
      else emberIn += 1;
    }
  }
  if (vanguardIn > 0 && emberIn === 0) {
    if (captureTeam !== 'vanguard') {
      captureTeam = 'vanguard';
      captureProgress = Math.max(0, captureProgress - 0.2);
    }
    captureProgress += dt / 8;
    captureTickAt += dt;
    if (captureTickAt > 1) {
      captureTickAt = 0;
      audio.captureTick();
    }
  } else if (emberIn > 0 && vanguardIn === 0) {
    if (captureTeam !== 'ember') {
      captureTeam = 'ember';
      captureProgress = Math.max(0, captureProgress - 0.2);
    }
    captureProgress += dt / 8;
    captureTickAt += dt;
    if (captureTickAt > 1) {
      captureTickAt = 0;
      audio.captureTick();
    }
  } else {
    captureProgress = Math.max(0, captureProgress - dt * 0.05);
    if (captureProgress === 0) captureTeam = null;
  }
  if (captureProgress >= 1) {
    const winner = captureTeam;
    captureTeam = null;
    captureProgress = 0;
    endRound(winner, 'zone captured');
  }
}

function step(dt) {
  elapsed += dt;
  bloom = Math.max(0, bloom - dt * 0.03);
  for (const tracer of tracers) {
    if (tracer.life > 0) {
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.07) * 0.9;
      if (tracer.life <= 0) tracer.line.visible = false;
    }
  }
  if (state === 'buy') {
    buyTimeLeft -= dt;
    if (buyTimeLeft <= 0) startRound();
    return;
  }
  if (state === 'roundEnd') {
    roundEndTimer -= dt;
    if (roundEndTimer <= 0) {
      if (scoreV >= WIN_ROUNDS || scoreE >= WIN_ROUNDS) endMatch();
      else {
        round += 1;
        startBuyPhase();
      }
    }
    return;
  }
  if (state !== 'round') return;

  roundTimeLeft -= dt;
  player.step(dt, input.state.keys);
  weapon.step(dt);
  bots.step(dt, elapsed, random, body, onDamagePlayer, (killer, victim) => onBotKill(killer, victim));
  stepCapture(dt);

  const vanguardAlive = bots.aliveCount('vanguard') + (body.alive ? 1 : 0);
  const emberAlive = bots.aliveCount('ember');
  if (emberAlive === 0) {
    endRound('vanguard', 'enemy team eliminated');
    return;
  }
  if (vanguardAlive === 0) {
    endRound('ember', 'your team eliminated');
    return;
  }
  if (roundTimeLeft <= 0) {
    if (vanguardAlive > emberAlive) endRound('vanguard', 'more players alive at time');
    else if (emberAlive > vanguardAlive) endRound('ember', 'more players alive at time');
    else endRound(null, 'time expired, even teams');
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const pressed = input.takePressed();
    if (pressed.has('KeyM')) audio.toggleMute();
    if (state === 'round' && body.alive) {
      const wantFire = weapon.current.auto ? input.state.firing : input.state.firing && weapon.ready();
      if (wantFire && weapon.ready()) shoot(weapon.spread(player.groundSpeed()) + bloom);
      if (input.state.keys.has('KeyR')) weapon.reload();
    }
    if (pressed.has('KeyB') && state === 'buy') {
      hud.showOverlay('buy');
    }
    if (pressed.has('Digit1')) buyItem('smg');
    if (pressed.has('Digit2')) buyItem('rifle');
    if (pressed.has('Digit3')) buyItem('sniper');
    if (pressed.has('Digit4')) buyItem('armor');
    if (pressed.has('Digit5')) buyItem('medkit');
    if (pressed.has('Digit6')) buyItem('ammo');
    // If the lock was never acquired (the request needs a gesture and the
    // round started from the timer), offer the pause overlay after a grace
    // second so the player can click to lock in.
    if (
      state === 'round' && body.alive && !input.state.locked
      && elapsed - roundStartedAt > 1 && document.getElementById('overlay').hidden
    ) {
      hud.showOverlay('paused');
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    if (state === 'round' || state === 'buy') {
      hud.setSpread(4 + weapon.spread(player.groundSpeed()) * 900 + bloom * 900);
      hud.drawMinimap(world.half, world.capture, body, bots.all());
      hud.setTimer(state === 'buy' ? buyTimeLeft : roundTimeLeft);
    }
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  started = true;
  if (name === 'start') {
    body.position.set(0.6, 0, 19);
    body.yaw = Math.PI;
    body.pitch = 0;
    settle(10);
    aimAt(new THREE.Vector3(0, 1.5, 0));
    hud.showOverlay('start', 0);
  } else if (name === 'buy') {
    startBuyPhase();
    money = 3400;
    refreshHud();
    hud.showOverlay('buy');
    body.position.set(0, 0, 18);
    body.yaw = Math.PI;
    settle(10);
    aimAt(new THREE.Vector3(0, 1.5, 0));
  } else if (name === 'play' || name === 'end') {
    startBuyPhase();
    startRound();
    // Let the bots fight a little so the frame shows combat — but keep it
    // short, so the player is still alive and firing in the capture.
    body.position.set(-6, 0, 12);
    settle(25);
    const alive = bots.all().filter((b) => b.team === 'ember' && b.alive);
    if (alive.length) {
      const target = alive[0];
      aimAt(new THREE.Vector3(target.position.x, 1.3, target.position.z));
      shoot(0);
      settle(8);
      aimAt(new THREE.Vector3(target.position.x, 1.3, target.position.z));
      shoot(0);
      settle(10);
    }
    if (name === 'end') {
      // Force a match-end frame: set the score and show the overlay.
      scoreV = 5;
      scoreE = 3;
      round = 8;
      endMatch();
    }
  }
  hint.textContent = 'WASD move · Mouse look · Click fire · R reload · B buy · M mute';
  hud.drawMinimap(world.half, world.capture, body, bots.all());
  hud.setSpread(4 + weapon.spread(0) * 900);
  refreshHud();
  hud.setScore(scoreV, scoreE, round);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.current.name);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
refreshHud();
// Small read-only handle for automated play-tests: state, score and vitals.
window.__dustline = {
  get state() { return state; },
  get round() { return round; },
  get score() { return [scoreV, scoreE]; },
  get money() { return money; },
  get health() { return body.health; },
  get alive() { return body.alive; },
  get weapon() { return weapon.current.id; },
};
if (shot) runShot(shot);
else requestAnimationFrame(frame);
