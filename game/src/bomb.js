// The objective: a spark charge the attacker plants at A or B. Planting takes 3.5 s
// of holding E inside a site ring; the fuse then runs 40 s, beeping faster as it
// runs down. A defender standing in the ring defuses in 5 s. The module owns the
// timers and the charge mesh; main.js owns the round outcome.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_SECONDS = 3.5;
export const FUSE_SECONDS = 40;

export function createBomb(scene, sites) {
  const state = {
    status: 'idle', // idle | planting | planted | detonated | defused
    site: null,
    plantProgress: 0,
    fuseLeft: FUSE_SECONDS,
    beepTimer: 0,
  };

  const charge = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.18, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.5, metalness: 0.3 }),
  );
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  lamp.position.set(0.12, 0.12, 0);
  charge.add(body, lamp);
  charge.visible = false;
  scene.add(charge);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 8);
  scene.add(light);

  let beepPhase = 0;

  function siteAt(x, z) {
    for (const key of Object.keys(sites)) {
      const site = sites[key];
      const dx = x - site.x;
      const dz = z - site.z;
      if (dx * dx + dz * dz < site.radius * site.radius) return key;
    }
    return null;
  }

  return {
    state,
    siteAt,
    // Called every fixed step while the round is live. Returns 'detonated' once.
    step(dt, planting, plantSite, onBeep) {
      if (state.status === 'idle' && planting && plantSite) {
        state.status = 'planting';
        state.site = plantSite;
        state.plantProgress = 0;
      }
      if (state.status === 'planting') {
        if (!planting || plantSite !== state.site) {
          state.status = 'idle';
          state.site = null;
          state.plantProgress = 0;
        } else {
          state.plantProgress += dt / PLANT_SECONDS;
          if (state.plantProgress >= 1) {
            state.status = 'planted';
            state.fuseLeft = FUSE_SECONDS;
            state.beepTimer = 0;
            const site = sites[state.site];
            charge.position.set(site.x, 0.12, site.z);
            charge.visible = true;
            light.position.set(site.x, 1.2, site.z);
            light.intensity = 6;
            onBeep(true);
          }
        }
      }
      if (state.status === 'planted') {
        state.fuseLeft -= dt;
        state.beepTimer -= dt;
        beepPhase += dt;
        lamp.material.color.setHex(Math.sin(beepPhase * 10) > 0 ? 0xf59a2e : 0x571a08);
        if (state.beepTimer <= 0) {
          state.beepTimer = Math.max(0.25, state.fuseLeft / FUSE_SECONDS);
          onBeep(false);
        }
        if (state.fuseLeft <= 0) {
          state.status = 'detonated';
          charge.visible = false;
          light.intensity = 0;
          return 'detonated';
        }
      }
      return null;
    },
    defuse() {
      if (state.status !== 'planted') return;
      state.status = 'defused';
      charge.visible = false;
      light.intensity = 0;
    },
    reset() {
      state.status = 'idle';
      state.site = null;
      state.plantProgress = 0;
      state.fuseLeft = FUSE_SECONDS;
      state.beepTimer = 0;
      charge.visible = false;
      light.intensity = 0;
    },
  };
}
