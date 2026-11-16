// EMBERLINE boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. One state object (S) holds the match; modules own their own parts
// of it and never each other. ?shot=start|play|buy|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, jitter } from './rng.js';
import { createMap } from './map.js';
import { createPlayer } from './player.js';
import { createWeapons, ARSENAL, GRENADE } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createEconomy, ARMOR_PRICE } from './economy.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const ROUND_SECONDS = 100;
const BUY_SECONDS = 15;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));

// The one state: everything the round, the match and the HUD read lives here.
const S = {
  phase: 'menu', // menu | buy | live | roundEnd | matchEnd
  round: 1,
  ember: 0,
  ashen: 0,
  roundTime: ROUND_SECONDS,
  buyTime: BUY_SECONDS,
  health: 100,
  playerAlive: true,
  roundEndTimer: 0,
  roundReason: '',
  roundWon: false,
  defuseProgress: 0,
  shake: 0,
  elapsed: 0,
  frozen: false,
  started: false,
};

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 78);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const effects = createEffects(scene);
const audio = createAudio();
const economy = createEconomy();
const bomb = createBomb(scene, map.sites);
const hud = createHud();
const player = createPlayer(map.colliders);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

// Scratch vectors: the frame loop never allocates.
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _blood = new THREE.Vector3();
let plantRewarded = false;

const weapons = createWeapons(camera, (point) => grenadeExploded(point));
const bots = createBots(scene, map, random, {
  onBotShot,
  onBotKilled,
  onDefuse,
});
// One combined shootable list, built once: world surfaces plus every bot hitbox.
const shootTargets = map.shootables.concat(bots.hitMeshes);
const input = createInput(renderer.domElement, onLockChange);
// Clicking the canvas re-locks the pointer when a round is live (e.g. after the
// buy timer auto-deployed without a user gesture to lock with).
document.getElementById('game').addEventListener('click', () => {
  if (!shot && S.phase === 'live' && !input.state.locked) input.requestLock();
});

function onBotKilled(bot) {
  economy.onKill();
  hud.killfeed(`You ▸ ${bot.name} — eliminated`, true);
  hud.setMoney(economy.state.money);
}

function onDefuse(bot, progress) {
  S.defuseProgress = Math.max(S.defuseProgress, progress);
  if (progress >= 5) {
    bomb.defuse();
    endRound(false, 'The charge was defused — ASHEN takes the round.');
  }
}

function onBotShot(bot, hit, damage, distance) {
  // Tracer from the bot's gun toward the player (or past them on a miss).
  _from.set(bot.position.x, 1.35, bot.position.z);
  _eye.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  if (hit) {
    _to.copy(_eye);
  } else {
    _to.copy(_eye);
    _to.x += jitter(random) * 1.6;
    _to.y += jitter(random) * 0.9;
    _to.z += jitter(random) * 1.6;
  }
  effects.tracer(_from, _to, 0.65, 0.55, 0.9);
  audio.enemyShot(distance);
  if (!hit || !S.playerAlive || S.phase !== 'live') return;
  const healthDamage = economy.absorb(damage);
  S.health -= healthDamage;
  hud.damage();
  audio.hurt();
  S.shake = Math.min(0.5, S.shake + 0.25);
  if (S.health <= 0) {
    S.health = 0;
    S.playerAlive = false;
    hud.killfeed(`${bot.name} ▸ You — you are down`, false);
    if (bomb.state.status !== 'planted') {
      endRound(false, 'You were dropped. ASHEN takes the round.');
    } else {
      hud.showBanner('YOU ARE DOWN', 'The charge still ticks — hold on.', 3000);
    }
  }
}

function grenadeExploded(point) {
  effects.explosion(point, random);
  audio.explosion();
  S.shake = Math.min(0.8, S.shake + 0.5);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const dx = bot.position.x - point.x;
    const dy = 1.0 - point.y;
    const dz = bot.position.z - point.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > GRENADE.radius) continue;
    const damage = Math.round(GRENADE.maxDamage * (1 - distance / GRENADE.radius));
    const killed = bots.damage(bot.torso, damage);
    _blood.set(bot.position.x, 1.1, bot.position.z);
    effects.blood(_blood, random);
    if (killed) hud.hitMarker(true, 400);
  }
  const pdx = player.state.position.x - point.x;
  const pdz = player.state.position.z - point.z;
  const pdist = Math.hypot(pdx, pdz);
  if (pdist < GRENADE.radius * 0.7 && S.playerAlive) {
    S.health -= Math.round(GRENADE.maxDamage * 0.4 * (1 - pdist / GRENADE.radius));
    hud.damage();
    if (S.health <= 0) {
      S.health = 0;
      S.playerAlive = false;
      if (bomb.state.status !== 'planted') endRound(false, 'Caught by your own blast. ASHEN takes the round.');
    }
  }
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  const def = weapons.def;
  if (!weapons.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(_dir);
  _dir.x += jitter(random) * spread;
  _dir.y += jitter(random) * spread;
  _dir.z += jitter(random) * spread;
  _dir.normalize();
  _from.copy(camera.position);
  scene.updateMatrixWorld(true);
  raycaster.set(_from, _dir);
  const hit = raycaster.intersectObjects(shootTargets, false)[0];
  _to.copy(_from).addScaledVector(_dir, hit ? hit.distance : 40);
  effects.tracer(_from, _to);
  audio.shot(def.id);
  weapons.pullTrigger();
  player.recoil(0.008 + def.kick, jitter(random) * 0.004);
  bots.hearShot(player.state.position.x, player.state.position.z);
  if (hit) {
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const damage = part === 'head' ? def.headDamage : def.damage;
      const killed = bots.damage(hit.object, damage);
      effects.blood(hit.point, random);
      hud.hitMarker(killed, killed ? 400 : 120);
      audio.hit(killed);
      if (!killed) hud.killfeed(`You ▸ ${bot.name} — ${part === 'head' ? 'headshot' : 'hit'} ${damage}`, true);
      else hud.killfeed(`You ▸ ${bot.name} — ${part === 'head' ? 'HEADSHOT' : 'eliminated'}`, true);
    } else {
      effects.impact(hit.point, random);
    }
  }
  hud.setAmmo(weapons.states[weapons.current].mag, weapons.states[weapons.current].reserve);
  return true;
}

// --- Match / round flow -------------------------------------------------------

function startMatch() {
  economy.resetMatch();
  S.round = 1;
  S.ember = 0;
  S.ashen = 0;
  S.health = 100;
  S.playerAlive = true;
  weapons.refillRound();
  weapons.select('pistol');
  hud.setBuyPrices({ rifle: '$2700', smg: '$1500', grenade: '$300', armor: '$650' });
  hud.markBought('rifle', false);
  hud.markBought('smg', false);
  hud.markBought('grenade', false);
  hud.markBought('armor', false);
  startBuyPhase();
}

function startBuyPhase() {
  S.phase = 'buy';
  S.buyTime = BUY_SECONDS;
  S.roundTime = ROUND_SECONDS;
  S.playerAlive = true;
  S.health = 100;
  S.defuseProgress = 0;
  plantRewarded = false;
  bomb.reset();
  weapons.refillRound();
  player.reset(map.spawns.attackers[0].x, map.spawns.attackers[0].z, map.spawns.attackers[0].yaw);
  bots.reset(map.spawns.defenders);
  syncCamera();
  hud.hideBanner();
  hud.setBombStatus('');
  hud.setPlant(0);
  hud.setObjective('Buy up, then deploy. Plant the spark charge at A Foundry or B Depot — or eliminate all ASHEN defenders.');
  hud.showOverlay('buy', { round: S.round });
  if (document.pointerLockElement) document.exitPointerLock();
}

function startRound() {
  S.phase = 'live';
  S.roundTime = ROUND_SECONDS;
  hud.hideOverlay();
  hud.setObjective('Plant the spark charge at A Foundry or B Depot — or eliminate all ASHEN defenders.');
  if (!shot) input.requestLock();
}

function endRound(won, reason) {
  if (S.phase !== 'live') return;
  S.phase = 'roundEnd';
  S.roundWon = won;
  S.roundReason = reason;
  S.roundEndTimer = 3.2;
  if (won) S.ember += 1;
  else S.ashen += 1;
  economy.onRoundEnd(won);
  audio.roundEnd(won);
  hud.showBanner(won ? 'ROUND TAKEN' : 'ROUND LOST', reason, 3000);
  hud.setScore(S.ember, S.ashen, S.round);
  hud.setMoney(economy.state.money);
  if (document.pointerLockElement) document.exitPointerLock();
}

function afterRound() {
  const matchOver = S.ember >= WIN_ROUNDS || S.ashen >= WIN_ROUNDS || S.round >= MAX_ROUNDS;
  if (matchOver) {
    S.phase = 'matchEnd';
    hud.showOverlay('match', { won: S.ember > S.ashen, ember: S.ember, ashen: S.ashen });
    return;
  }
  S.round += 1;
  hud.showOverlay('round', {
    won: S.roundWon,
    reason: S.roundReason,
    matchOver: false,
    lines: [
      `Score — EMBER ${S.ember} : ${S.ashen} ASHEN`,
      `Money $${economy.state.money}  ·  Kills ${economy.state.kills}`,
      S.roundWon ? `+$${3250} round win` : `+$${1900} round loss`,
    ],
  });
  S.phase = 'roundEnd';
}

function buyItem(id) {
  if (S.phase !== 'buy') return;
  if (id === 'rifle' || id === 'smg') {
    if (weapons.states[id].owned) {
      weapons.select(id);
      return;
    }
    if (!economy.spend(ARSENAL[id].price)) {
      audio.denied();
      return;
    }
    weapons.buy(id);
    weapons.select(id);
    audio.buy();
    hud.markBought(id, true);
  } else if (id === 'grenade') {
    if (!economy.spend(GRENADE.price)) {
      audio.denied();
      return;
    }
    weapons.buyGrenade();
    audio.buy();
  } else if (id === 'armor') {
    if (economy.state.armor >= 50) return;
    if (!economy.spend(ARMOR_PRICE)) {
      audio.denied();
      return;
    }
    economy.state.armor = 50;
    audio.buy();
    hud.markBought('armor', true);
  }
  hud.setMoney(economy.state.money);
  hud.setWeapon(weapons.def.name.toUpperCase(), weapons.grenadeCount);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    S.started = true;
    if (S.phase === 'live') hud.hideOverlay();
  } else if (S.phase === 'live' && S.playerAlive) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (S.phase === 'menu' || S.phase === 'matchEnd') {
    startMatch();
  } else if (S.phase === 'buy') {
    startRound();
  } else if (S.phase === 'roundEnd') {
    if (S.ember >= WIN_ROUNDS || S.ashen >= WIN_ROUNDS || S.round >= MAX_ROUNDS) {
      startMatch();
    } else {
      S.round += 1;
      startBuyPhase();
    }
  } else if (S.phase === 'live') {
    input.requestLock();
  }
});
hud.onBuy((id) => buyItem(id));

input.onKey('KeyR', () => {
  if (S.phase === 'live' && S.playerAlive && weapons.reload()) audio.reload();
});
input.onKey('KeyG', () => {
  if (S.phase !== 'live' || !S.playerAlive) return;
  camera.getWorldDirection(_dir);
  _eye.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  if (weapons.throwGrenade(_eye, _dir)) {
    hud.setWeapon(weapons.def.name.toUpperCase(), weapons.grenadeCount);
    audio.shot('smg');
  } else {
    audio.denied();
  }
});
input.onKey('Digit1', () => {
  if (S.phase === 'buy') buyItem('rifle');
  else if (S.phase === 'live') weapons.select('pistol');
});
input.onKey('Digit2', () => {
  if (S.phase === 'buy') buyItem('smg');
  else if (S.phase === 'live') weapons.select('smg');
});
input.onKey('Digit3', () => {
  if (S.phase === 'buy') buyItem('grenade');
  else if (S.phase === 'live') weapons.select('rifle');
});
input.onKey('Digit4', () => {
  if (S.phase === 'buy') buyItem('armor');
});
input.onKey('KeyB', () => {
  if (S.phase === 'buy') startRound();
});
input.onKey('KeyM', () => audio.toggleMute());

// --- Fixed-step simulation ----------------------------------------------------

function step(dt) {
  S.elapsed += dt;
  const keys = input.state.keys;

  if (S.phase === 'buy') {
    S.buyTime -= dt;
    player.step(dt, keys);
    weapons.step(dt, map.colliders);
    if (S.buyTime <= 0) startRound();
  }

  if (S.phase === 'live') {
    S.roundTime -= dt;
    if (S.roundTime <= 0 && bomb.state.status !== 'planted') {
      endRound(false, 'Time expired with no charge planted — ASHEN takes the round.');
    }
    if (S.playerAlive) {
      player.step(dt, keys);
      // Automatic weapons fire while held; semi-automatic ones fire once per pull.
      const def = weapons.def;
      if (def.auto) {
        if (input.state.firing && weapons.ready()) shoot(weapons.spread(player.groundSpeed()));
      } else if (input.takeTrigger() && weapons.ready()) {
        shoot(weapons.spread(player.groundSpeed()));
      }
      if (keys.has('KeyR')) weapons.reload();
    }
    // Planting: hold E inside a site ring. The fuse keeps ticking even if the
    // planter is down — that is the round's whole drama.
    const site = bomb.siteAt(player.state.position.x, player.state.position.z);
    const planting = S.playerAlive && keys.has('KeyE') && site !== null && bomb.state.status !== 'planted';
    const result = bomb.step(dt, planting, site, (final) => audio.plantBeep(final));
    if (bomb.state.status === 'planting') {
      hud.setPlant(bomb.state.plantProgress, 'PLANTING CHARGE — HOLD E');
    } else if (bomb.state.status === 'planted' && result === null) {
      hud.setPlant(0);
    }
    if (bomb.state.status === 'planted' && !plantRewarded) {
      plantRewarded = true;
      economy.onPlant();
      hud.setMoney(economy.state.money);
      hud.showBanner('CHARGE PLANTED', 'Defend it for 40 seconds — ASHEN will come to defuse.', 3000);
      hud.setObjective('Charge planted — defend it. ASHEN defenders are moving to defuse.');
    }
    if (result === 'detonated') {
      endRound(true, 'The charge detonated — EMBER takes the round.');
    }
    weapons.step(dt, map.colliders);
    bots.step(dt, player.state, S.elapsed, bomb.state.status === 'planted', bomb.state.site, S.playerAlive);
    if (bomb.state.status === 'planted') {
      hud.setBombStatus(`CHARGE LIVE — ${Math.ceil(bomb.state.fuseLeft)}s`);
      hud.setTimer(bomb.state.fuseLeft, true);
    }
    if (S.defuseProgress > 0 && bomb.state.status === 'planted') {
      hud.setPlant(S.defuseProgress / 5, 'ASHEN DEFUSING');
    }
    if (bots.aliveCount() === 0 && S.phase === 'live') {
      endRound(true, 'All ASHEN defenders eliminated — EMBER takes the round.');
    }
  }

  if (S.phase === 'roundEnd') {
    S.roundEndTimer -= dt;
    weapons.step(dt, map.colliders);
    effects.step(dt);
    if (S.roundEndTimer <= 0) afterRound();
    return;
  }

  effects.step(dt);
  S.shake = Math.max(0, S.shake - dt * 1.4);
}

function syncCamera() {
  const body = player.state;
  const shakeX = S.shake > 0 ? jitter(random) * S.shake * 0.02 : 0;
  const shakeY = S.shake > 0 ? jitter(random) * S.shake * 0.02 : 0;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + shakeY, body.yaw + shakeX, 0, 'YXZ');
}

function pushHud() {
  const state = weapons.states[weapons.current];
  hud.setHealth(S.health, economy.state.armor);
  hud.setAmmo(state.mag, state.reserve);
  hud.setWeapon(weapons.def.name.toUpperCase(), weapons.grenadeCount);
  hud.setMoney(economy.state.money);
  hud.setScore(S.ember, S.ashen, S.round);
  if (S.phase === 'live' && bomb.state.status !== 'planted') hud.setTimer(S.roundTime, false);
  else if (S.phase === 'buy') hud.setTimer(S.buyTime, false);
  hud.setCrosshairGap(6 + weapons.spread(player.groundSpeed()) * 900);
}

// --- Frame loop ----------------------------------------------------------------

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!S.frozen) {
    const look = input.takeLook();
    if (S.phase === 'live' || S.phase === 'buy') player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    pushHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
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
      S.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    player.reset(-10, 12, -0.6);
    player.state.pitch = -0.02;
    settle(20);
    hud.showOverlay('start');
  } else if (name === 'buy') {
    startMatch();
    economy.state.money = 4250;
    buyItem('rifle');
    buyItem('grenade');
    player.reset(-10, 12, -0.6);
    settle(10);
    hud.setMoney(economy.state.money);
    hud.showOverlay('buy', { round: 1 });
  } else if (name === 'play') {
    startMatch();
    startRound();
    // Stage a mid-round fight: two defenders in view down The Cut, close enough
    // to read at a glance.
    player.reset(-8, 10, -0.64);
    bots.bots[0].position.set(-4, 0, 5);
    bots.bots[0].yaw = 2.47;
    bots.bots[0].state = 'engage';
    bots.bots[0].reaction = 99;
    bots.bots[1].position.set(2, 0, 1);
    bots.bots[1].yaw = 2.3;
    bots.bots[1].state = 'engage';
    bots.bots[1].reaction = 99;
    weapons.buy('rifle');
    weapons.select('rifle');
    settle(6);
    aimAt(new THREE.Vector3(-4, 1.1, 5));
    shoot(0);
    settle(2);
    shoot(0);
    settle(8);
    aimAt(new THREE.Vector3(-4, 1.1, 5));
    hud.hitMarker(false, 10000); // hold the hit marker for the capture
    hud.setAmmo(weapons.states.rifle.mag, weapons.states.rifle.reserve);
  } else if (name === 'end') {
    S.ember = 1;
    S.ashen = 0;
    S.round = 1;
    S.roundWon = true;
    S.roundReason = 'The charge detonated at Foundry — EMBER takes the round.';
    economy.state.money = 4050;
    bots.reset(map.spawns.defenders);
    player.reset(-8, -2, 0.9);
    player.state.pitch = -0.03;
    settle(10);
    // One defender down beside the site ring; the rest hold their ground.
    const dead = bots.bots[0];
    dead.alive = false;
    dead.fall = 1;
    dead.position.set(-16, 0, -8);
    dead.group.position.set(-16, -0.15, -8);
    dead.group.rotation.set(-1.5, 0.8, 0);
    hud.showOverlay('round', {
      won: true,
      reason: S.roundReason,
      matchOver: false,
      lines: ['Score — EMBER 1 : 0 ASHEN', 'Money $4050  ·  Kills 2', '+$3250 round win'],
    });
  }
  hud.setScore(S.ember, S.ashen, S.round);
  pushHud();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for play-testing: window.__emberline exposes the live state.
window.__emberline = { state: S, economy: economy.state, bots, bomb, weapons, player, input };

syncCamera();
hud.setAmmo(weapons.states.pistol.mag, weapons.states.pistol.reserve);
hud.setScore(0, 0, 1);
hud.showOverlay('start');
if (shot) runShot(shot);
else requestAnimationFrame(frame);
