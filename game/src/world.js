// DUSTLINE map: a 44 x 44 m yard, two spawn ends and a capture zone in the
// middle. Every box is a collider for walkers and a surface a bullet stops on.
// Built from plain geometry only, no models and no textures. The two team
// colours mark the spawn ends and the capture ring so the objective reads from
// anywhere on the map.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HALF = 22;

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and outer walls, open to the sky so one directional light reaches
  // every corner.
  box(44.4, 0.4, 44.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5.0, 44.4, -HALF - 0.2, 2.5, 0, 'surface');
  box(0.4, 5.0, 44.4, HALF + 0.2, 2.5, 0, 'surface');
  box(44.4, 5.0, 0.4, 0, 2.5, -HALF - 0.2, 'surface');
  box(44.4, 5.0, 0.4, 0, 2.5, HALF + 0.2, 'surface');

  // Spawn pads: a low coloured plate under each team's start, so the ends read
  // as home ground without a wall of text.
  box(10, 0.12, 4, 0, 0.06, 19, 'vanguard');
  box(10, 0.12, 4, 0, 0.06, -19, 'ember');

  // Mid: a low wall with two gaps, a pillar in the centre of the yard, and
  // crates that split the three lanes.
  box(1.4, 3.4, 1.4, 0, 1.7, 0, 'hairline');
  box(7.0, 2.2, 1.0, -11, 1.1, 0, 'hairline');
  box(7.0, 2.2, 1.0, 11, 1.1, 0, 'hairline');
  box(1.0, 2.2, 7.0, 0, 1.1, -8, 'hairline');
  box(1.0, 2.2, 7.0, 0, 1.1, 8, 'hairline');

  // Crates: crouch cover on every lane, two stacked towers for sight lines.
  const crates = [
    [-7.5, 0.55, -11, 1.6, 1.1, 1.6],
    [7.5, 0.55, -11, 1.6, 1.1, 1.6],
    [-7.5, 0.55, 11, 1.6, 1.1, 1.6],
    [7.5, 0.55, 11, 1.6, 1.1, 1.6],
    [-14, 0.55, -4, 1.6, 1.1, 1.6],
    [14, 0.55, 4, 1.6, 1.1, 1.6],
    [-14, 0.55, 4, 1.6, 1.1, 1.6],
    [14, 0.55, -4, 1.6, 1.1, 1.6],
    [-5, 0.55, -15.5, 3.2, 1.1, 1.2],
    [5, 0.55, 15.5, 3.2, 1.1, 1.2],
    [-16.5, 0.45, 0, 1.8, 0.9, 1.8],
    [16.5, 0.45, 0, 1.8, 0.9, 1.8],
  ];
  for (const [x, y, z, w, h, d] of crates) box(w, h, d, x, y, z, 'hairline');
  // Two towers to shoot over the mid wall from.
  box(3.0, 1.0, 3.0, -16, 0.5, -14, 'surface');
  box(3.0, 1.0, 3.0, 16, 0.5, 14, 'surface');
  box(3.0, 1.0, 3.0, -16, 0.5, 14, 'surface');
  box(3.0, 1.0, 3.0, 16, 0.5, -14, 'surface');

  // Capture zone: a flat ring on the ground around the centre pillar. It is
  // not a collider; the game measures who stands inside it.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.4, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.03, 0);
  group.add(ring);
  const zoneDisc = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
  );
  zoneDisc.rotation.x = -Math.PI / 2;
  zoneDisc.position.set(0, 0.025, 0);
  group.add(zoneDisc);

  // Light: a warm key from the front right, a cool fill from behind, and a
  // sky/ground gradient so the dark palette still reads.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.15);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.1);
  key.position.set(14, 20, 10);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(-12, 12, 14);
  scene.add(fill);

  return {
    colliders,
    shootables,
    group,
    half: HALF,
    capture: { x: 0, z: 0, radius: 3.4 },
    spawns: {
      vanguard: [
        [-4, 18], [0, 19], [4, 18], [-2, 16.5], [2, 16.5],
      ],
      ember: [
        [-4, -18], [0, -19], [4, -18], [-2, -16.5], [2, -16.5],
      ],
    },
  };
}
