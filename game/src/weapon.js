// The armoury: four hitscan weapons where accuracy counts more than speed.
// A still, crouched shot is a laser; a running spray is a prayer. Each weapon
// owns its numbers; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P-9 Sidearm', price: 0, damage: 26, headMult: 2.0,
    mag: 12, reserve: 48, fireGap: 0.16, reloadTime: 1.3,
    spreadStill: 0.0018, spreadMoving: 0.02, auto: false, range: 45, tracer: 0xffe9a8,
  },
  smg: {
    id: 'smg', name: 'K-7 Vector', price: 600, damage: 19, headMult: 2.0,
    mag: 32, reserve: 128, fireGap: 0.075, reloadTime: 1.6,
    spreadStill: 0.006, spreadMoving: 0.034, auto: true, range: 38, tracer: 0x9fd8ff,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Vanguard', price: 2700, damage: 34, headMult: 2.0,
    mag: 30, reserve: 90, fireGap: 0.096, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMoving: 0.028, auto: true, range: 70, tracer: 0xffd27d,
  },
  sniper: {
    id: 'sniper', name: 'LW-50 Longshot', price: 4750, damage: 88, headMult: 2.5,
    mag: 5, reserve: 15, fireGap: 1.15, reloadTime: 2.6,
    spreadStill: 0.0004, spreadMoving: 0.06, auto: false, range: 90, tracer: 0xff9d7d,
  },
};

export const BUY_ITEMS = [
  { id: 'smg', label: 'K-7 Vector — SMG', price: 600, kind: 'weapon' },
  { id: 'rifle', label: 'AR-77 Vanguard — Rifle', price: 2700, kind: 'weapon' },
  { id: 'sniper', label: 'LW-50 Longshot — Sniper', price: 4750, kind: 'weapon' },
  { id: 'armor', label: 'Kevlar vest — 50 armour', price: 650, kind: 'armor' },
  { id: 'medkit', label: 'Medkit — restore health', price: 400, kind: 'medkit' },
  { id: 'ammo', label: 'Ammo refill — full reserve', price: 250, kind: 'ammo' },
];

const MAG_SIZE_FALLBACK = 30;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.2 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), bodyMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accentMat);
  sight.position.set(0, 0.075, -0.05);
  model.add(receiver, barrel, stock, sight);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let current = WEAPONS.rifle;
  const state = { mag: current.mag, reserve: current.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (current.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = current.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    get current() {
      return current;
    },
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current.fireGap;
      state.flash = 0.06;
      state.kick = current.id === 'sniper' ? 0.14 : 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === current.mag || state.reserve === 0) return;
      state.reloadLeft = current.reloadTime;
    },
    spread(speed) {
      const moving = Math.min(1, speed / 5.4);
      return current.spreadStill + moving * current.spreadMoving;
    },
    equip(id, keepAmmo = false) {
      current = WEAPONS[id] ?? WEAPONS.rifle;
      if (!keepAmmo) {
        state.mag = current.mag;
        state.reserve = current.reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    refillAmmo() {
      state.reserve = current.reserve;
    },
    refill() {
      state.mag = current.mag;
      state.reserve = current.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}

export function weaponById(id) {
  return WEAPONS[id] ?? WEAPONS.rifle;
}

export function magSizeOf(id) {
  return (WEAPONS[id] ?? { mag: MAG_SIZE_FALLBACK }).mag;
}
