// Shared movement physics: one AABB overlap test and one axis-separated mover, used
// by the player and by every bot, so both obey the same walls. Also a segment-vs-box
// line-of-sight test, which is how bots decide whether they can see the player.
// All scratch objects live here and are reused; the hot loop allocates nothing.
import * as THREE from 'three';

export const BODY_RADIUS = 0.34;

export function createMover(colliders) {
  const probe = new THREE.Box3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - BODY_RADIUS, y + lift, z - BODY_RADIUS);
    probe.max.set(x + BODY_RADIUS, y + height - lift, z + BODY_RADIUS);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  // Move a body (position Vector3, velocity Vector3) one axis at a time; a blocked
  // axis zeroes only that velocity component, so bodies slide along walls.
  function move(position, velocity, dt, height) {
    const nextX = position.x + velocity.x * dt;
    if (!overlaps(nextX, position.y, position.z, height, 0.04)) position.x = nextX;
    else velocity.x = 0;
    const nextZ = position.z + velocity.z * dt;
    if (!overlaps(position.x, position.y, nextZ, height, 0.04)) position.z = nextZ;
    else velocity.z = 0;
    position.y += velocity.y * dt;
    const hit = overlaps(position.x, position.y, position.z, height, 0);
    if (hit && velocity.y <= 0) {
      position.y = hit.max.y;
      velocity.y = 0;
      return true; // on ground
    }
    if (hit) {
      position.y = hit.min.y - height;
      velocity.y = 0;
    }
    if (position.y < 0) {
      position.y = 0;
      velocity.y = 0;
      return true;
    }
    return false;
  }

  return { overlaps, move };
}

// Does the segment a->b clear every collider? Slab test per box; returns false on
// the first box the segment enters. Used for bot vision and grenade splash checks.
const _dir = new THREE.Vector3();
export function losClear(colliders, ax, ay, az, bx, by, bz) {
  _dir.set(bx - ax, by - ay, bz - az);
  const length = _dir.length();
  if (length === 0) return true;
  _dir.divideScalar(length);
  for (let i = 0; i < colliders.length; i += 1) {
    const box = colliders[i];
    let tmin = 0;
    let tmax = length;
    const origin = [ax, ay, az];
    const d = [_dir.x, _dir.y, _dir.z];
    const min = [box.min.x, box.min.y, box.min.z];
    const max = [box.max.x, box.max.y, box.max.z];
    let hit = true;
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(d[axis]) < 1e-9) {
        if (origin[axis] < min[axis] || origin[axis] > max[axis]) {
          hit = false;
          break;
        }
        continue;
      }
      let t1 = (min[axis] - origin[axis]) / d[axis];
      let t2 = (max[axis] - origin[axis]) / d[axis];
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) {
        hit = false;
        break;
      }
    }
    if (hit && tmin < length && tmax > 0) return false;
  }
  return true;
}
