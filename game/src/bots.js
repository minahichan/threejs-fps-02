// Bots: nine teammates and opponents with names, health bars and a simple
// tactical brain. A bot picks a goal — the capture zone, a lane waypoint, or
// the nearest enemy it can see — walks there with the same axis-separated
// collision as the player, and fights in bursts once it has line of sight and
// a short reaction time. Accuracy falls off with distance and with movement,
// so a bot that holds an angle wins over one that sprays on the run.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { weaponById } from './weapon.js';

const NAMES = {
  vanguard: ['Vex', 'Mira', 'Holt', 'Sable'],
  ember: ['Rook', 'Nyx', 'Bram', 'Kestrel', 'Onyx'],
};

const WAYPOINTS = [
  [-14, 0], [14, 0], [-7, -11], [7, -11], [-7, 11], [7, 11],
  [-16, -14], [16, 14], [-16, 14], [16, -14], [0, -8], [0, 8],
  [-4, -15], [4, 15], [-10, 6], [10, -6],
];

const BOT_SPEED = 4.2;
const BOT_RADIUS = 0.34;

function makeBodyMaterial(team) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'vanguard' ? PALETTE.vanguard : PALETTE.ember),
    roughness: 0.55,
    metalness: 0.1,
  });
}

export function createBots(scene, world, onBotShot) {
  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const tmp = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  function buildBot(team, index, spawn) {
    const weaponId = index % 3 === 2 ? 'smg' : 'rifle';
    const group = new THREE.Group();
    group.position.set(spawn[0], 0, spawn[1]);

    const bodyMat = makeBodyMaterial(team);
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.8, 0.32), bodyMat);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), bodyMat);
    head.position.y = 1.56;
    head.userData.part = 'head';
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.26), darkMat);
    legs.position.y = 0.31;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.55), darkMat);
    gun.position.set(0.2, 1.15, -0.3);
    group.add(torso, head, legs, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    // Health bar: two thin planes that always face the camera.
    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x0a0c0f, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    barBg.position.y = 1.95;
    const barFg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.06),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(team === 'vanguard' ? PALETTE.vanguard : PALETTE.ember), transparent: true, opacity: 0.95, depthWrite: false }),
    );
    barFg.position.set(0, 1.95, 0.01);
    group.add(barBg, barFg);
    scene.add(group);

    const bot = {
      team,
      name: NAMES[team][index % NAMES[team].length],
      group,
      torso,
      head,
      barFg,
      barBg,
      weapon: weaponById(weaponId),
      position: group.position,
      yaw: team === 'vanguard' ? Math.PI : 0,
      health: 100,
      alive: true,
      goal: null,
      goalTimer: 0,
      acquireAt: 0,
      target: null,
      burstLeft: 0,
      burstTimer: 0,
      cooldown: 0,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeTimer: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function spawnAll(random) {
    for (const team of ['vanguard', 'ember']) {
      const spots = world.spawns[team];
      const count = team === 'vanguard' ? 4 : 5;
      for (let i = 0; i < count; i += 1) buildBot(team, i, spots[i]);
    }
    // Shuffle the waypoint order per bot so no two rounds play the same.
    for (const bot of bots) bot.goalTimer = random() * 2;
  }

  function eyeOf(bot) {
    tmp.set(bot.position.x, bot.position.y + 1.5, bot.position.z);
    return tmp;
  }

  function canSee(bot, enemyPos, enemies) {
    // Line of sight: the first thing the ray hits, ignoring the bot's own
    // body, must be an enemy. The ray starts inside the bot's own head mesh,
    // so its own parts are skipped explicitly.
    const from = eyeOf(bot).clone();
    toTarget.copy(enemyPos).sub(from);
    const distance = toTarget.length();
    if (distance > 70) return false;
    toTarget.normalize();
    raycaster.set(from, toTarget);
    raycaster.far = distance + 0.5;
    const hits = raycaster.intersectObjects(world.shootables.concat(hitMeshes), false);
    for (const hit of hits) {
      if (hit.object.userData.bot === bot) continue;
      return hit.object.userData.bot !== undefined || hit.object.userData.isPlayer === true;
    }
    return true;
  }

  function nearestEnemy(bot, others, playerState) {
    let best = null;
    let bestDist = Infinity;
    const candidates = others.filter((o) => o.team !== bot.team && o.alive);
    for (const other of candidates) {
      const d = Math.hypot(other.position.x - bot.position.x, other.position.z - bot.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'bot', ref: other, dist: d };
      }
    }
    if (playerState.alive && bot.team === 'ember') {
      const d = Math.hypot(playerState.position.x - bot.position.x, playerState.position.z - bot.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'player', ref: playerState, dist: d };
      }
    }
    return best;
  }

  function pickGoal(bot, random) {
    const roll = random();
    if (roll < 0.45) return { x: 0, z: 0 }; // the capture zone
    if (roll < 0.75) {
      const w = WAYPOINTS[Math.floor(random() * WAYPOINTS.length)];
      return { x: w[0], z: w[1] };
    }
    // Push toward the enemy spawn.
    const dir = bot.team === 'vanguard' ? -1 : 1;
    return { x: (random() * 2 - 1) * 10, z: dir * (12 + random() * 5) };
  }

  function moveBot(bot, dt, targetX, targetZ) {
    const dx = targetX - bot.position.x;
    const dz = targetZ - bot.position.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.2) return true;
    const stepLen = Math.min(length, BOT_SPEED * dt);
    const nx = bot.position.x + (dx / length) * stepLen;
    const probe = new THREE.Box3();
    probe.min.set(nx - BOT_RADIUS, bot.position.y + 0.04, bot.position.z - BOT_RADIUS);
    probe.max.set(nx + BOT_RADIUS, bot.position.y + 1.7, bot.position.z + BOT_RADIUS);
    let blocked = false;
    for (const c of world.colliders) if (probe.intersectsBox(c)) { blocked = true; break; }
    if (!blocked) bot.position.x = nx;
    const nz = bot.position.z + (dz / length) * stepLen;
    probe.min.set(bot.position.x - BOT_RADIUS, bot.position.y + 0.04, nz - BOT_RADIUS);
    probe.max.set(bot.position.x + BOT_RADIUS, bot.position.y + 1.7, nz + BOT_RADIUS);
    blocked = false;
    for (const c of world.colliders) if (probe.intersectsBox(c)) { blocked = true; break; }
    if (!blocked) bot.position.z = nz;
    bot.yaw = Math.atan2(-dx, -dz);
    return false;
  }

  function damage(bot, amount, isHead) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.group.visible = false;
      return true;
    }
    return false;
  }

  function resetAll(random) {
    for (const bot of bots) {
      const spots = world.spawns[bot.team];
      const index = bots.filter((b) => b.team === bot.team).indexOf(bot);
      const spot = spots[index % spots.length];
      bot.position.set(spot[0], 0, spot[1]);
      bot.yaw = bot.team === 'vanguard' ? Math.PI : 0;
      bot.health = 100;
      bot.alive = true;
      bot.group.visible = true;
      bot.group.rotation.set(0, 0, 0);
      bot.target = null;
      bot.burstLeft = 0;
      bot.cooldown = 0;
      bot.goal = null;
      bot.goalTimer = random() * 2;
    }
  }

  function step(dt, time, random, playerState, onDamagePlayer, onKill) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      bot.strafeTimer -= dt;

      // Health bar faces the camera and shrinks with health.
      bot.barFg.scale.x = Math.max(0.001, bot.health / 100);
      bot.barFg.position.x = -(1 - bot.health / 100) * 0.33;

      const enemy = nearestEnemy(bot, bots, playerState);
      let engaged = false;
      if (enemy && enemy.dist < 55) {
        const enemyPos = enemy.kind === 'bot'
          ? new THREE.Vector3(enemy.ref.position.x, enemy.ref.position.y + 1.3, enemy.ref.position.z)
          : new THREE.Vector3(enemy.ref.position.x, enemy.ref.position.y + enemy.ref.eye, enemy.ref.position.z);
        if (canSee(bot, enemyPos, bots)) {
          if (bot.target !== enemy.ref) {
            bot.target = enemy.ref;
            bot.acquireAt = time + 0.35 + random() * 0.45; // reaction time
            bot.burstLeft = 0;
          }
          engaged = true;
          // Face the enemy, strafe sideways while firing.
          const dx = enemyPos.x - bot.position.x;
          const dz = enemyPos.z - bot.position.z;
          bot.yaw = Math.atan2(-dx, -dz);
          if (bot.strafeTimer <= 0) {
            bot.strafeDir = Math.random() > 0.5 ? 1 : -1;
            bot.strafeTimer = 0.7 + random() * 0.8;
          }
          const sx = Math.cos(bot.yaw) * bot.strafeDir;
          const sz = -Math.sin(bot.yaw) * bot.strafeDir;
          moveBot(bot, dt, bot.position.x + sx * 2, bot.position.z + sz * 2);
          if (time >= bot.acquireAt && bot.cooldown <= 0) {
            if (bot.burstLeft <= 0) {
              bot.burstLeft = 3 + Math.floor(random() * 4);
              bot.burstTimer = 0;
            }
            bot.burstTimer -= dt;
            if (bot.burstTimer <= 0) {
              bot.burstTimer = bot.weapon.fireGap * 1.6;
              bot.burstLeft -= 1;
              bot.cooldown = bot.weapon.fireGap * 1.6;
              // Accuracy: worse far away, worse while moving, better standing still.
              const baseSpread = 0.03 + enemy.dist * 0.0016;
              const miss = random() * 2 - 1;
              const hitChance = Math.max(0.1, 0.5 - enemy.dist * 0.007 - baseSpread);
              const hit = random() < hitChance;
              const isHead = hit && random() < 0.12;
              onBotShot(bot, enemy, hit, isHead, miss);
              if (hit) {
                const dmg = bot.weapon.damage * (isHead ? bot.weapon.headMult : 1) * (enemy.dist > 40 ? 0.75 : 1);
                if (enemy.kind === 'bot') {
                  const killed = damage(enemy.ref, dmg, isHead);
                  if (killed) onKill(bot, enemy.ref);
                } else {
                  // Bots hit the player a little softer than each other: the
                  // player should have time to react, take cover and fight
                  // back instead of dying to the first burst they walk into.
                  onDamagePlayer(bot, dmg * 0.7);
                }
              }
            }
          }
        }
      }
      if (!engaged) {
        bot.target = null;
        bot.goalTimer -= dt;
        if (!bot.goal || bot.goalTimer <= 0) {
          bot.goal = pickGoal(bot, random);
          bot.goalTimer = 4 + random() * 4;
        }
        moveBot(bot, dt, bot.goal.x, bot.goal.z);
      }
    }
  }

  return {
    bots,
    hitMeshes,
    spawnAll,
    step,
    damage,
    resetAll,
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    all() {
      return bots;
    },
  };
}
