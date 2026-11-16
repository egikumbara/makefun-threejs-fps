// Pooled effects: tracers, impact sparks and explosion fire, all pre-allocated.
// A tracer is one segment of a LineSegments buffer; a spark is one point of a Points
// cloud. Nothing is created or freed while the game runs — slots are recycled by
// life, so a firefight never touches the allocator.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_PARTICLES = 240;

export function createEffects(scene) {
  // --- Tracers: one LineSegments, 2 vertices per slot, faded by shrinking alpha
  // through a per-vertex colour (LineBasicMaterial with vertexColors).
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(MAX_TRACERS * 2 * 3);
  const tracerCol = new Float32Array(MAX_TRACERS * 2 * 3);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  tracerGeo.setAttribute('color', new THREE.BufferAttribute(tracerCol, 3));
  const tracerMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
  const tracers = new THREE.LineSegments(tracerGeo, tracerMat);
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tracerLife = new Float32Array(MAX_TRACERS);
  let tracerNext = 0;

  // --- Particles: one Points cloud; each slot has position, velocity, life, colour.
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(MAX_PARTICLES * 3);
  const particleCol = new Float32Array(MAX_PARTICLES * 3);
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(particleCol, 3));
  const particleMat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.frustumCulled = false;
  scene.add(particles);
  const particleVel = new Float32Array(MAX_PARTICLES * 3);
  const particleLife = new Float32Array(MAX_PARTICLES);
  const particleMaxLife = new Float32Array(MAX_PARTICLES);
  let particleNext = 0;
  // Park every particle far below the floor until it is used.
  for (let i = 0; i < MAX_PARTICLES; i += 1) particlePos[i * 3 + 1] = -100;

  // --- Explosion flash: one sphere that scales up and fades, one point light.
  const flashMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
  );
  flashMesh.visible = false;
  scene.add(flashMesh);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18);
  scene.add(flashLight);
  let flashLife = 0;

  function spawnParticle(x, y, z, vx, vy, vz, life, r, g, b) {
    const i = particleNext;
    particleNext = (particleNext + 1) % MAX_PARTICLES;
    particlePos[i * 3] = x;
    particlePos[i * 3 + 1] = y;
    particlePos[i * 3 + 2] = z;
    particleVel[i * 3] = vx;
    particleVel[i * 3 + 1] = vy;
    particleVel[i * 3 + 2] = vz;
    particleLife[i] = life;
    particleMaxLife[i] = life;
    particleCol[i * 3] = r;
    particleCol[i * 3 + 1] = g;
    particleCol[i * 3 + 2] = b;
  }

  return {
    tracer(from, to, r = 1, g = 0.75, b = 0.25) {
      const i = tracerNext;
      tracerNext = (tracerNext + 1) % MAX_TRACERS;
      tracerPos[i * 6] = from.x;
      tracerPos[i * 6 + 1] = from.y;
      tracerPos[i * 6 + 2] = from.z;
      tracerPos[i * 6 + 3] = to.x;
      tracerPos[i * 6 + 4] = to.y;
      tracerPos[i * 6 + 5] = to.z;
      tracerCol[i * 6] = r;
      tracerCol[i * 6 + 1] = g;
      tracerCol[i * 6 + 2] = b;
      tracerCol[i * 6 + 3] = r;
      tracerCol[i * 6 + 4] = g;
      tracerCol[i * 6 + 5] = b;
      tracerLife[i] = 0.09;
    },
    impact(point, random) {
      for (let i = 0; i < 6; i += 1) {
        spawnParticle(
          point.x, point.y, point.z,
          (random() - 0.5) * 4, random() * 3, (random() - 0.5) * 4,
          0.3 + random() * 0.25, 1, 0.8, 0.3,
        );
      }
    },
    blood(point, random) {
      for (let i = 0; i < 8; i += 1) {
        spawnParticle(
          point.x, point.y, point.z,
          (random() - 0.5) * 3, random() * 2.5, (random() - 0.5) * 3,
          0.4 + random() * 0.3, 0.55, 0.08, 0.05,
        );
      }
    },
    explosion(point, random) {
      flashMesh.position.copy(point);
      flashMesh.visible = true;
      flashMesh.scale.setScalar(0.5);
      flashLight.position.copy(point);
      flashLight.position.y += 0.5;
      flashLight.intensity = 60;
      flashLife = 0.35;
      for (let i = 0; i < 40; i += 1) {
        const angle = random() * Math.PI * 2;
        const speed = 2 + random() * 7;
        spawnParticle(
          point.x, point.y + 0.2, point.z,
          Math.cos(angle) * speed, 1 + random() * 5, Math.sin(angle) * speed,
          0.5 + random() * 0.6,
          1, 0.45 + random() * 0.35, 0.1,
        );
      }
    },
    step(dt) {
      for (let i = 0; i < MAX_TRACERS; i += 1) {
        if (tracerLife[i] <= 0) continue;
        tracerLife[i] -= dt;
        if (tracerLife[i] <= 0) {
          tracerPos[i * 6 + 1] = -100;
          tracerPos[i * 6 + 4] = -100;
        }
      }
      tracerGeo.attributes.position.needsUpdate = true;
      tracerGeo.attributes.color.needsUpdate = true;
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        if (particleLife[i] <= 0) continue;
        particleLife[i] -= dt;
        if (particleLife[i] <= 0) {
          particlePos[i * 3 + 1] = -100;
          continue;
        }
        particleVel[i * 3 + 1] -= 9 * dt;
        particlePos[i * 3] += particleVel[i * 3] * dt;
        particlePos[i * 3 + 1] += particleVel[i * 3 + 1] * dt;
        particlePos[i * 3 + 2] += particleVel[i * 3 + 2] * dt;
        if (particlePos[i * 3 + 1] < 0.03) {
          particlePos[i * 3 + 1] = 0.03;
          particleVel[i * 3 + 1] = 0;
        }
        const fade = particleLife[i] / particleMaxLife[i];
        particleCol[i * 3] *= 0.985 + fade * 0.015;
      }
      particleGeo.attributes.position.needsUpdate = true;
      particleGeo.attributes.color.needsUpdate = true;
      if (flashLife > 0) {
        flashLife -= dt;
        const t = Math.max(0, flashLife / 0.35);
        flashMesh.scale.setScalar(0.5 + (1 - t) * 5);
        flashMesh.material.opacity = t * 0.55;
        flashLight.intensity = t * 60;
        if (flashLife <= 0) {
          flashMesh.visible = false;
          flashLight.intensity = 0;
        }
      }
    },
  };
}
