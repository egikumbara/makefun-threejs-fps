// The Ember Yard: an original dusk rail yard, 44 x 36 m, built from boxes. Two bomb
// sites (A Foundry north-west, B Depot east), three lanes (west rail, The Cut mid,
// east siding), crates and containers for cover. Every box is a collider for players
// and bots and a surface a bullet stops on. Waypoints are a small graph bots walk with
// breadth-first search; the yard's lanes are the graph's edges.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph: index, x, z, neighbours. Node 0 is the attackers' spawn, node 12
// the defenders'. Sites sit on nodes 3 (A) and 10 (B).
const WAYPOINTS = [
  { x: -18, z: 14, links: [1, 13] }, // 0 attacker spawn
  { x: -15, z: 6, links: [0, 2, 13] }, // 1 west rail, south
  { x: -15, z: -6, links: [1, 3, 4] }, // 2 west rail, north
  { x: -14, z: -12, links: [2, 4] }, // 3 site A — Foundry
  { x: -6, z: -12, links: [2, 3, 5] }, // 4 A approach
  { x: 0, z: -9, links: [4, 6, 14] }, // 5 mid, north
  { x: 0, z: 0, links: [5, 7, 11] }, // 6 The Cut, centre
  { x: 0, z: 9, links: [6, 8, 13] }, // 7 mid, south
  { x: 7, z: 13, links: [7, 9] }, // 8 south siding
  { x: 14, z: 12, links: [8, 10] }, // 9 B approach, south
  { x: 14, z: 6, links: [9, 11] }, // 10 site B — Depot
  { x: 16, z: -4, links: [6, 10, 12] }, // 11 east siding
  { x: 18, z: -13, links: [11, 14] }, // 12 defender spawn
  { x: -8, z: 12, links: [0, 1, 7] }, // 13 south yard
  { x: 8, z: -12, links: [5, 12] }, // 14 north siding
];

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ember' ? 0.55 : 0.92,
      metalness: name === 'hairline' ? 0.35 : 0.05,
    });
  }
  const rust = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.85, metalness: 0.25 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a5260, roughness: 0.45, metalness: 0.7 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x453f52, roughness: 0.95, metalness: 0.02 });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and the yard walls, open to the dusk sky.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, concrete);
  box(0.4, 5.0, 36.4, -22.2, 2.5, 0, materials.surface);
  box(0.4, 5.0, 36.4, 22.2, 2.5, 0, materials.surface);
  box(44.4, 5.0, 0.4, 0, 2.5, -18.2, materials.surface);
  box(44.4, 5.0, 0.4, 0, 2.5, 18.2, materials.surface);

  // The Cut: two stacked containers split mid into two lanes, with a gap to slip through.
  box(6.0, 2.6, 2.4, -3.4, 1.3, -0.4, rust);
  box(6.0, 2.6, 2.4, 3.6, 1.3, 0.6, materials.accent);
  box(2.4, 1.2, 2.4, 0.1, 0.6, -3.6, steel);

  // Site A — Foundry: a silo corner, low walls and a crate stack.
  box(3.2, 1.1, 0.8, -14, 0.55, -9.2, materials.hairline);
  box(0.8, 1.1, 3.2, -11.2, 0.55, -12.4, materials.hairline);
  box(1.4, 1.4, 1.4, -17.5, 0.7, -13.5, rust);
  box(1.4, 1.4, 1.4, -16.1, 0.7, -13.5, rust);
  box(1.4, 1.4, 1.4, -16.8, 2.1, -13.5, rust);
  box(2.2, 0.9, 1.2, -10.4, 0.45, -15.6, materials.hairline);

  // Site B — Depot: container wall, pipe stack, low cover.
  box(6.0, 2.6, 2.4, 17.5, 1.3, 2.0, rust);
  box(2.4, 1.1, 1.2, 11.4, 0.55, 8.6, materials.hairline);
  box(1.2, 1.2, 3.4, 10.6, 0.6, 3.4, steel);
  box(1.4, 1.4, 1.4, 17.8, 0.7, 10.2, materials.accent);
  box(1.4, 1.4, 1.4, 17.8, 0.7, 11.6, materials.accent);

  // Lane cover: crates and low walls a crouched player hides behind.
  box(1.2, 1.1, 1.2, -9.5, 0.55, 4.5, materials.hairline);
  box(1.2, 1.1, 1.2, -8.3, 0.55, 4.5, materials.hairline);
  box(3.4, 1.0, 0.9, 8.5, 0.5, -6.5, materials.hairline);
  box(1.2, 0.9, 1.2, -4.5, 0.45, 12.5, rust);
  box(1.2, 0.9, 1.2, 12.5, 0.45, -9.5, rust);
  box(0.9, 3.0, 0.9, -19.5, 1.5, -2.0, steel);
  box(0.9, 3.0, 0.9, 19.5, 1.5, -8.0, steel);
  box(2.6, 1.0, 1.0, -1.5, 0.5, -15.5, materials.hairline);
  box(2.6, 1.0, 1.0, 4.5, 0.5, 15.2, materials.hairline);

  // Silo at A (visual cylinder over a box collider) and the yard crane silhouette.
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 6.5, 20), steel);
  silo.position.set(-19.2, 3.25, -15.2);
  silo.castShadow = true;
  silo.receiveShadow = true;
  group.add(silo);
  colliders.push(new THREE.Box3(new THREE.Vector3(-21.1, 0, -17.1), new THREE.Vector3(-17.3, 6.5, -13.3)));
  shootables.push(silo);

  // Distant skyline, outside the walls: pure silhouette, no colliders.
  const skyline = new THREE.Group();
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x241f33 });
  const skyBoxes = [
    [-30, 6, -26, 8, 12, 6], [26, 7, -30, 10, 14, 6], [-34, 4, 8, 6, 8, 10],
    [32, 5, 14, 8, 10, 6], [0, 8, -34, 14, 16, 6], [-8, 5, 30, 10, 10, 6],
  ];
  for (const [x, y, z, w, h, d] of skyBoxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skyMat);
    m.position.set(x, y, z);
    skyline.add(m);
  }
  const crane = new THREE.Group();
  const craneMat = new THREE.MeshBasicMaterial({ color: 0x2c2538 });
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 18, 0.8), craneMat);
  leg.position.set(-26, 9, -8);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(16, 0.8, 0.8), craneMat);
  arm.position.set(-20, 17.5, -8);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), craneMat);
  hook.position.set(-13, 15.5, -8);
  crane.add(leg, arm, hook);
  skyline.add(crane);
  scene.add(skyline);

  // Site markers: a glowing ring on the ground, a beacon light, a letter plate.
  function siteMarker(letter, x, z, colorHex) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.1, 2.6, 40),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.02, z);
    group.add(ring);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#171420';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#f59a2e';
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 70);
    const texture = new THREE.CanvasTexture(canvas);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(x, 0.03, z);
    group.add(plate);
    const light = new THREE.PointLight(colorHex, 14, 12);
    light.position.set(x, 3.2, z);
    scene.add(light);
    return { ring, light, x, z };
  }
  const markerA = siteMarker('A', -14, -12, 0xf59a2e);
  const markerB = siteMarker('B', 14, 6, 0xe4572e);

  // Dusk light: a low warm sun, a cool sky fill, and amber yard lamps.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x8a7fb0), new THREE.Color(0x1a1410), 1.25);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffb36b), 2.7);
  sun.position.set(-14, 16, 20);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const lampFill = new THREE.DirectionalLight(new THREE.Color(0x6a7ba8), 0.85);
  lampFill.position.set(12, 10, -14);
  scene.add(lampFill);
  // A warm bounce from the north-east so faces turned from the sun still read.
  const bounce = new THREE.DirectionalLight(new THREE.Color(0xff9a5a), 0.5);
  bounce.position.set(16, 8, -16);
  scene.add(bounce);

  return {
    colliders,
    shootables,
    waypoints: WAYPOINTS,
    sites: {
      A: { name: 'Foundry', x: -14, z: -12, radius: 3.4, marker: markerA },
      B: { name: 'Depot', x: 14, z: 6, radius: 3.4, marker: markerB },
    },
    spawns: {
      attackers: [{ x: -18, z: 14, yaw: -0.7 }],
      defenders: [
        { x: 18, z: -13, yaw: 2.4 },
        { x: 14, z: -14, yaw: 2.2 },
        { x: 16, z: -9, yaw: 2.6 },
        { x: 10, z: -14, yaw: 2.0 },
      ],
    },
  };
}

// Breadth-first search over the waypoint graph; returns the node indices from the
// nearest node to `from` to the nearest node to `to`, or null. Allocations happen
// once per path request, never per frame.
export function findPath(waypoints, fromX, fromZ, toX, toZ) {
  let from = 0;
  let to = 0;
  let bestFrom = Infinity;
  let bestTo = Infinity;
  for (let i = 0; i < waypoints.length; i += 1) {
    const dx = waypoints[i].x - fromX;
    const dz = waypoints[i].z - fromZ;
    const d = dx * dx + dz * dz;
    if (d < bestFrom) {
      bestFrom = d;
      from = i;
    }
    const ex = waypoints[i].x - toX;
    const ez = waypoints[i].z - toZ;
    const e = ex * ex + ez * ez;
    if (e < bestTo) {
      bestTo = e;
      to = i;
    }
  }
  if (from === to) return [from];
  const prev = new Array(waypoints.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === to) break;
    for (const next of waypoints[current].links) {
      if (prev[next] === -1) {
        prev[next] = current;
        queue.push(next);
      }
    }
  }
  if (prev[to] === -1) return null;
  const path = [];
  let node = to;
  while (node !== from) {
    path.unshift(node);
    node = prev[node];
  }
  path.unshift(from);
  return path;
}
