// The arsenal: three guns and one grenade, each with its own numbers, view model and
// feel. A gun owns its magazine, reserve, cooldown and reload; main.js owns the ray,
// the damage and the money. Spread grows with movement speed, so stopping to aim
// pays — the same rule the bots live by. Grenades are a small pooled ballistic list.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const ARSENAL = {
  pistol: {
    id: 'pistol', name: 'P-9 Sidearm', short: 'P-9', price: 0, damage: 30, headDamage: 90,
    mag: 12, reserveStart: 48, fireGap: 0.16, reloadTime: 1.3, auto: false,
    spreadStill: 0.004, spreadMoving: 0.03, kick: 0.011, range: 60,
  },
  smg: {
    id: 'smg', name: 'RK-9 Ripper', short: 'RK-9', price: 1500, damage: 26, headDamage: 78,
    mag: 32, reserveStart: 96, fireGap: 0.075, reloadTime: 1.7, auto: true,
    spreadStill: 0.006, spreadMoving: 0.036, kick: 0.007, range: 50,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', short: 'VK-7', price: 2700, damage: 34, headDamage: 100,
    mag: 30, reserveStart: 90, fireGap: 0.1, reloadTime: 1.9, auto: true,
    spreadStill: 0.0022, spreadMoving: 0.028, kick: 0.01, range: 80,
  },
};

export const GRENADE = { price: 300, maxDamage: 95, radius: 5.2, fuse: 1.5 };

const MOVE_REFERENCE = 5.4;

export function createWeapons(camera, onGrenadeExplode) {
  // Gunmetal view models: dark steel, amber accents — they must read as weapons,
  // not pale planks, against the dusk floor.
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.65, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a5060, roughness: 0.45, metalness: 0.55 });
  const amber = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const ember = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.5, metalness: 0.2 });

  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    return mesh;
  }

  // One view model per gun, built from boxes; only the current one is visible.
  function buildPistol() {
    const g = new THREE.Group();
    g.add(box(0.07, 0.09, 0.26, 0, 0, -0.1, steel));
    g.add(box(0.06, 0.14, 0.08, 0, -0.09, 0.02, dark));
    g.add(box(0.03, 0.03, 0.06, 0, 0.055, -0.2, amber));
    return g;
  }
  function buildSmg() {
    const g = new THREE.Group();
    g.add(box(0.09, 0.1, 0.4, 0, 0, -0.08, dark));
    g.add(box(0.05, 0.05, 0.3, 0, 0.02, -0.36, steel));
    g.add(box(0.06, 0.2, 0.07, 0, -0.13, -0.02, dark));
    g.add(box(0.08, 0.06, 0.16, 0, -0.03, 0.2, dark));
    return g;
  }
  function buildRifle() {
    const g = new THREE.Group();
    g.add(box(0.09, 0.1, 0.44, 0, 0, -0.1, steel));
    g.add(box(0.045, 0.045, 0.42, 0, 0.025, -0.5, dark));
    g.add(box(0.075, 0.08, 0.22, 0, -0.02, 0.24, dark));
    g.add(box(0.05, 0.06, 0.12, 0, 0.07, -0.12, amber));
    g.add(box(0.04, 0.05, 0.05, 0, 0.06, -0.42, ember));
    return g;
  }

  const models = { pistol: buildPistol(), smg: buildSmg(), rifle: buildRifle() };
  for (const key of Object.keys(models)) {
    models[key].position.set(0.28, -0.24, -0.5);
    models[key].scale.setScalar(0.85);
    models[key].visible = false;
    camera.add(models[key]);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.28, -0.22, -1.05);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.28, -0.2, -0.65);
  camera.add(flashLight);

  // One state record per gun; the pistol is always owned, the others are bought.
  const states = {};
  for (const key of Object.keys(ARSENAL)) {
    const def = ARSENAL[key];
    states[key] = {
      mag: def.mag, reserve: def.reserveStart, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, owned: key === 'pistol',
    };
  }
  let current = 'pistol';
  models.pistol.visible = true;

  // Grenades: a fixed pool of four; each flies, bounces once, then bursts.
  const grenades = [];
  const grenadeMeshes = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.4 });
  for (let i = 0; i < 4; i += 1) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.visible = false;
    camera.parent.add(mesh);
    grenadeMeshes.push(mesh);
    grenades.push({ active: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(), fuse: 0 });
  }
  let grenadeCount = 0;

  function step(dt, colliders) {
    const state = states[current];
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[current];
    model.position.z = -0.5 + state.kick;
    model.rotation.x = state.kick * 2.4;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 28;
    flashLight.intensity = state.flash > 0 ? 16 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.5 * Math.min(1, (ARSENAL[current].reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const def = ARSENAL[current];
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
    // Grenade flight: gravity, ground bounce, fuse.
    for (let i = 0; i < grenades.length; i += 1) {
      const g = grenades[i];
      if (!g.active) continue;
      g.velocity.y -= 14 * dt;
      g.position.addScaledVector(g.velocity, dt);
      if (g.position.y < 0.09) {
        g.position.y = 0.09;
        g.velocity.y *= -0.35;
        g.velocity.x *= 0.6;
        g.velocity.z *= 0.6;
      }
      g.fuse -= dt;
      grenadeMeshes[i].position.copy(g.position);
      if (g.fuse <= 0) {
        g.active = false;
        grenadeMeshes[i].visible = false;
        onGrenadeExplode(g.position);
      }
    }
  }

  return {
    states,
    get current() {
      return current;
    },
    get def() {
      return ARSENAL[current];
    },
    get grenadeCount() {
      return grenadeCount;
    },
    step,
    ready() {
      const state = states[current];
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const state = states[current];
      state.cooldown = ARSENAL[current].fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      const state = states[current];
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const state = states[current];
      const def = ARSENAL[current];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false;
      state.reloadLeft = def.reloadTime;
      return true;
    },
    spread(speed) {
      const def = ARSENAL[current];
      return def.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def.spreadMoving;
    },
    select(id) {
      if (!states[id] || !states[id].owned || id === current) return false;
      models[current].visible = false;
      current = id;
      models[current].visible = true;
      states[current].cooldown = Math.max(states[current].cooldown, 0.25);
      return true;
    },
    buy(id) {
      if (states[id].owned) return false;
      states[id].owned = true;
      states[id].mag = ARSENAL[id].mag;
      states[id].reserve = ARSENAL[id].reserveStart;
      return true;
    },
    buyGrenade() {
      grenadeCount += 1;
      return true;
    },
    throwGrenade(origin, direction) {
      if (grenadeCount <= 0) return false;
      for (let i = 0; i < grenades.length; i += 1) {
        const g = grenades[i];
        if (g.active) continue;
        grenadeCount -= 1;
        g.active = true;
        g.position.copy(origin);
        g.velocity.copy(direction).multiplyScalar(13);
        g.velocity.y += 4.5;
        g.fuse = GRENADE.fuse;
        grenadeMeshes[i].visible = true;
        grenadeMeshes[i].position.copy(g.position);
        return true;
      }
      return false;
    },
    refillRound() {
      // Between rounds every owned gun is topped back up, as in the genre.
      for (const key of Object.keys(states)) {
        if (!states[key].owned) continue;
        states[key].mag = ARSENAL[key].mag;
        states[key].reserve = ARSENAL[key].reserveStart;
        states[key].cooldown = 0;
        states[key].reloadLeft = 0;
        states[key].flash = 0;
        states[key].kick = 0;
      }
      grenadeCount = 0;
      for (let i = 0; i < grenades.length; i += 1) {
        grenades[i].active = false;
        grenadeMeshes[i].visible = false;
      }
    },
  };
}
