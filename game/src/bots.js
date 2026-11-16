// The ASHEN defenders: four bots that hold the sites, patrol the lanes, react to
// gunfire they hear, and defuse a planted charge. Each bot is one state machine —
// hold, patrol, engage, investigate, defuse — driven by vision (distance, facing,
// line of sight through losClear), hearing (main.js reports shots) and the round.
// Bots walk the waypoint graph with breadth-first search, strafe while they shoot,
// and miss more the farther and faster their target moves.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover, losClear } from './mover.js';
import { findPath } from './map.js';
import { pick } from './rng.js';

const BOT_NAMES = ['Ash', 'Cinder', 'Soot', 'Flint'];
const HEALTH = 100;
const WALK_SPEED = 3.3;
const ENGAGE_SPEED = 2.2;
const EYE_HEIGHT = 1.5;
const VIEW_DISTANCE = 27;
const VIEW_HALF_ANGLE = 1.15; // ~66 degrees either side of facing
const SHOT_DAMAGE = 14;
const DEFUSE_SECONDS = 5;

export function createBots(scene, map, random, events) {
  const mover = createMover(map.colliders);
  const slate = new THREE.MeshStandardMaterial({ color: 0x5a6274, roughness: 0.7, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3140, roughness: 0.8, metalness: 0.2 });
  const visor = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.35, metalness: 0.3, emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 0.7 });
  const torsoGeo = new THREE.BoxGeometry(0.56, 0.8, 0.32);
  const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const visorGeo = new THREE.BoxGeometry(0.26, 0.07, 0.05);
  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.22);
  const gunGeo = new THREE.BoxGeometry(0.08, 0.1, 0.62);

  const bots = [];
  const hitMeshes = [];
  const homeNodes = { A: [3, 4], B: [10, 11], mid: [6, 5, 11] };

  for (let i = 0; i < 4; i += 1) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, slate);
    torso.position.y = 1.08;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, dark);
    head.position.y = 1.62;
    head.userData.part = 'head';
    const visorMesh = new THREE.Mesh(visorGeo, visor);
    visorMesh.position.set(0, 1.62, 0.17);
    const legL = new THREE.Mesh(legGeo, dark);
    legL.position.set(-0.14, 0.36, 0);
    const legR = new THREE.Mesh(legGeo, dark);
    legR.position.set(0.14, 0.36, 0);
    const gun = new THREE.Mesh(gunGeo, dark);
    gun.position.set(0.2, 1.05, -0.3);
    group.add(torso, head, visorMesh, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
      }
    });
    scene.add(group);

    const bot = {
      id: i,
      name: BOT_NAMES[i],
      group,
      torso,
      head,
      legs: [legL, legR],
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      yaw: 0,
      health: HEALTH,
      alive: true,
      state: 'hold',
      path: null,
      pathIndex: 0,
      holdNode: 0,
      holdTimer: 0,
      scanAngle: 0,
      reaction: 0,
      burstLeft: 0,
      shootTimer: 0,
      strafeDir: 1,
      strafeTimer: 0,
      walkPhase: 0,
      fall: 0,
      investigateAt: null,
      defuseProgress: 0,
      assignment: i < 2 ? 'A' : 'B',
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
  }

  // Scratch vectors, reused across all bots every step.
  const toPlayer = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const moveDir = new THREE.Vector3();

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < map.waypoints.length; i += 1) {
      const dx = map.waypoints[i].x - x;
      const dz = map.waypoints[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function setPath(bot, targetNode) {
    const from = nearestNode(bot.position.x, bot.position.z);
    bot.path = findPath(map.waypoints, bot.position.x, bot.position.z, map.waypoints[targetNode].x, map.waypoints[targetNode].z);
    bot.pathIndex = 0;
    return bot.path !== null;
  }

  function canSee(bot, playerEye) {
    toPlayer.set(playerEye.x - bot.position.x, 0, playerEye.z - bot.position.z);
    const distance = Math.hypot(toPlayer.x, toPlayer.z);
    if (distance > VIEW_DISTANCE) return 0;
    const facingX = -Math.sin(bot.yaw);
    const facingZ = -Math.cos(bot.yaw);
    const dot = (toPlayer.x * facingX + toPlayer.z * facingZ) / (distance || 1);
    if (dot < Math.cos(VIEW_HALF_ANGLE)) return 0;
    if (!losClear(map.colliders, bot.position.x, EYE_HEIGHT, bot.position.z, playerEye.x, playerEye.y, playerEye.z)) return 0;
    return distance;
  }

  function faceToward(bot, x, z, dt, rate = 6) {
    const target = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = target - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function walkTo(bot, x, z, dt, speed) {
    toTarget.set(x - bot.position.x, 0, z - bot.position.z);
    const distance = Math.hypot(toTarget.x, toTarget.z);
    if (distance < 0.25) return true;
    toTarget.divideScalar(distance);
    bot.velocity.x = toTarget.x * speed;
    bot.velocity.z = toTarget.z * speed;
    bot.velocity.y -= 21 * dt;
    mover.move(bot.position, bot.velocity, dt, 1.72);
    bot.walkPhase += dt * speed * 2.4;
    bot.legs[0].rotation.x = Math.sin(bot.walkPhase) * 0.5;
    bot.legs[1].rotation.x = -Math.sin(bot.walkPhase) * 0.5;
    return false;
  }

  function stopLegs(bot) {
    bot.legs[0].rotation.x *= 0.8;
    bot.legs[1].rotation.x *= 0.8;
    bot.velocity.x = 0;
    bot.velocity.z = 0;
  }

  function step(dt, player, time, bombPlanted, bombSite, playerAlive) {
    const playerEye = { x: player.position.x, y: player.position.y + player.eye, z: player.position.z };
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.45);
        bot.group.rotation.x = -bot.fall * 1.5;
        bot.group.position.y = -bot.fall * 0.15;
        continue;
      }
      bot.group.position.copy(bot.position);
      bot.group.rotation.y = bot.yaw;

      const distance = canSee(bot, playerEye);
      if (distance > 0 && playerAlive) {
        if (bot.state !== 'engage') {
          bot.state = 'engage';
          bot.reaction = 0.35 + random() * 0.3;
          bot.burstLeft = 0;
          bot.shootTimer = 0;
        }
      } else if (bot.state === 'engage') {
        bot.state = bot.investigateAt ? 'investigate' : 'patrol';
        bot.path = null;
      }

      if (bombPlanted && bot.state !== 'engage') {
        if (bot.state !== 'defuse') {
          bot.state = 'defuse';
          bot.defuseProgress = 0;
          const site = bombSite === 'A' ? map.sites.A : map.sites.B;
          setPath(bot, nearestNode(site.x, site.z));
        }
      }

      if (bot.state === 'engage') {
        faceToward(bot, playerEye.x, playerEye.z, dt, 8);
        // Strafe sideways while shooting, so the player must track a moving target.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeDir = random() < 0.5 ? -1 : 1;
          bot.strafeTimer = 0.7 + random() * 0.9;
        }
        const sideX = Math.cos(bot.yaw) * bot.strafeDir;
        const sideZ = -Math.sin(bot.yaw) * bot.strafeDir;
        bot.velocity.x = sideX * ENGAGE_SPEED;
        bot.velocity.z = sideZ * ENGAGE_SPEED;
        bot.velocity.y -= 21 * dt;
        mover.move(bot.position, bot.velocity, dt, 1.72);
        bot.walkPhase += dt * ENGAGE_SPEED * 2.4;
        bot.legs[0].rotation.x = Math.sin(bot.walkPhase) * 0.4;
        bot.legs[1].rotation.x = -Math.sin(bot.walkPhase) * 0.4;

        bot.reaction -= dt;
        if (bot.reaction <= 0) {
          bot.shootTimer -= dt;
          if (bot.shootTimer <= 0) {
            if (bot.burstLeft <= 0) {
              bot.burstLeft = 3 + ((random() * 3) | 0);
              bot.shootTimer = 0.55 + random() * 0.4;
            } else {
              bot.burstLeft -= 1;
              bot.shootTimer = 0.13;
              // Hit chance falls with distance and with the player's speed, and
              // with the bot's own strafe: a moving shooter is a worse shooter.
              const playerSpeed = Math.hypot(player.velocity.x, player.velocity.z);
              let chance = 0.42 - distance * 0.008 - playerSpeed * 0.03 - 0.06;
              chance = Math.max(0.06, Math.min(0.5, chance));
              const hit = random() < chance;
              events.onBotShot(bot, hit, hit ? SHOT_DAMAGE : 0, distance);
            }
          }
        }
      } else if (bot.state === 'defuse') {
        const site = bombSite === 'A' ? map.sites.A : map.sites.B;
        const dx = site.x - bot.position.x;
        const dz = site.z - bot.position.z;
        if (Math.hypot(dx, dz) > 1.4) {
          if (!bot.path || bot.pathIndex >= bot.path.length) {
            setPath(bot, nearestNode(site.x, site.z));
          }
          followPath(bot, dt, WALK_SPEED);
        } else {
          stopLegs(bot);
          faceToward(bot, site.x, site.z, dt, 5);
          bot.defuseProgress += dt;
          events.onDefuse(bot, bot.defuseProgress);
        }
      } else if (bot.state === 'investigate' && bot.investigateAt) {
        if (!bot.path || bot.pathIndex >= bot.path.length) {
          if (followPath(bot, dt, WALK_SPEED)) {
            bot.investigateAt = null;
            bot.state = 'patrol';
            bot.path = null;
          }
        } else {
          followPath(bot, dt, WALK_SPEED);
        }
        faceToward(bot, bot.position.x - Math.sin(bot.yaw), bot.position.z - Math.cos(bot.yaw), dt, 3);
      } else {
        // hold / patrol: sit on an assigned waypoint, scan, then walk to the next.
        bot.holdTimer -= dt;
        if (bot.holdTimer <= 0) {
          if (!bot.path || bot.pathIndex >= bot.path.length) {
            const nodes = homeNodes[bot.assignment];
            const next = pick(random, nodes);
            if (setPath(bot, next)) {
              bot.state = 'patrol';
            } else {
              bot.holdTimer = 1.5;
            }
          } else {
            followPath(bot, dt, WALK_SPEED);
          }
        } else {
          stopLegs(bot);
          bot.scanAngle += dt * 0.7;
          bot.group.rotation.y = bot.yaw + Math.sin(bot.scanAngle) * 0.9;
        }
        if (bot.state === 'patrol' && bot.path && bot.pathIndex >= bot.path.length) {
          bot.state = 'hold';
          bot.path = null;
          bot.holdTimer = 1.5 + random() * 2.5;
          bot.yaw = random() * Math.PI * 2;
        }
      }
      bot.group.position.copy(bot.position);
    }
  }

  function followPath(bot, dt, speed) {
    if (!bot.path) return true;
    while (bot.pathIndex < bot.path.length) {
      const node = map.waypoints[bot.path[bot.pathIndex]];
      if (walkTo(bot, node.x, node.z, dt, speed)) {
        bot.pathIndex += 1;
        continue;
      }
      faceToward(bot, node.x, node.z, dt, 5);
      return false;
    }
    return true;
  }

  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) {
      bot.investigateAt = null;
      return false;
    }
    bot.alive = false;
    bot.fall = 0;
    bot.state = 'hold';
    events.onBotKilled(bot);
    return true;
  }

  function hearShot(x, z) {
    for (const bot of bots) {
      if (!bot.alive || bot.state === 'engage') continue;
      const dx = bot.position.x - x;
      const dz = bot.position.z - z;
      if (dx * dx + dz * dz < 22 * 22) {
        bot.investigateAt = { x, z };
        if (bot.state !== 'defuse') bot.state = 'investigate';
        bot.path = null;
      }
    }
  }

  function reset(spawns) {
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      const spawn = spawns[i % spawns.length];
      bot.position.set(spawn.x, 0, spawn.z);
      bot.velocity.set(0, 0, 0);
      bot.yaw = spawn.yaw;
      bot.health = HEALTH;
      bot.alive = true;
      bot.state = 'hold';
      bot.path = null;
      bot.pathIndex = 0;
      bot.holdNode = nearestNode(spawn.x, spawn.z);
      bot.holdTimer = 0.5 + random() * 1.5;
      bot.scanAngle = random() * 6;
      bot.reaction = 0;
      bot.burstLeft = 0;
      bot.shootTimer = 0;
      bot.fall = 0;
      bot.defuseProgress = 0;
      bot.investigateAt = null;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.copy(bot.position);
      bot.legs[0].rotation.x = 0;
      bot.legs[1].rotation.x = 0;
    }
  }

  function aliveCount() {
    let count = 0;
    for (const bot of bots) if (bot.alive) count += 1;
    return count;
  }

  return {
    bots,
    hitMeshes,
    step,
    damage,
    hearShot,
    reset,
    aliveCount,
    nearestNode,
  };
}
