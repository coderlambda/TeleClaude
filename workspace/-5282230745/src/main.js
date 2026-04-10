import "./style.css";
import * as THREE from "three";

const app = document.querySelector("#app");
const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const worldRadius = 54;
const cameraFrustum = 32;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0f1820, 0.015);

const camera = new THREE.OrthographicCamera(
  (-cameraFrustum * window.innerWidth / window.innerHeight) / 2,
  (cameraFrustum * window.innerWidth / window.innerHeight) / 2,
  cameraFrustum / 2,
  -cameraFrustum / 2,
  0.1,
  400,
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.append(renderer.domElement);

const hud = document.createElement("div");
hud.className = "hud";
hud.innerHTML = `
  <div class="panel topbar">
    <div class="stats compact-stats">
      <div class="row"><span class="label">HP</span><span class="value" data-stat="health"></span></div>
      <div class="row"><span class="label">Time</span><span class="value" data-stat="time"></span></div>
      <div class="row"><span class="label">Kills</span><span class="value" data-stat="kills"></span></div>
      <div class="row"><span class="label">Build</span><span class="value" data-weapons></span></div>
      <div class="row"><span class="label">Passives</span><span class="value" data-passives></span></div>
    </div>
    <div class="progress-wrap compact-progress">
      <div class="progress"><div class="progress-fill" data-xp-fill></div></div>
      <div class="row compact-level-row"><span class="label">LV</span><span class="value" data-level></span></div>
    </div>
  </div>
  <div class="banner" data-banner>Build 1</div>
  <div class="toast" data-toast></div>
  <div class="mobile-ui" data-mobile-ui>
    <div class="stick-wrap">
      <div class="stick-zone">
        <div class="stick-base"></div>
        <div class="stick-knob" data-stick-knob></div>
      </div>
    </div>
  </div>
  <div class="overlay" data-start-overlay>
    <div class="overlay-card">
      <h2>Emberline</h2>
      <p>Move, survive, level up, and build out your weapons. This is the reset baseline before new content expansion.</p>
      <p data-overlay-copy>Tap start and survive the field.</p>
      <button class="cta" type="button" data-start>Start Run</button>
    </div>
  </div>
  <div class="overlay" data-levelup-overlay hidden>
    <div class="overlay-card">
      <h2>Level Up</h2>
      <p>Choose one upgrade.</p>
      <div class="choice-grid" data-choice-grid></div>
    </div>
  </div>
`;
app.append(hud);

const statEls = Object.fromEntries([...hud.querySelectorAll("[data-stat]")].map((el) => [el.dataset.stat, el]));
const weaponsEl = hud.querySelector("[data-weapons]");
const passivesEl = hud.querySelector("[data-passives]");
const xpFillEl = hud.querySelector("[data-xp-fill]");
const levelEl = hud.querySelector("[data-level]");
const bannerEl = hud.querySelector("[data-banner]");
const toastEl = hud.querySelector("[data-toast]");
const startOverlayEl = hud.querySelector("[data-start-overlay]");
const levelUpOverlayEl = hud.querySelector("[data-levelup-overlay]");
const choiceGridEl = hud.querySelector("[data-choice-grid]");
const startButtonEl = hud.querySelector("[data-start]");
const stickKnobEl = hud.querySelector("[data-stick-knob]");
const mobileUiEl = hud.querySelector("[data-mobile-ui]");
const overlayCopyEl = hud.querySelector("[data-overlay-copy]");

if (isTouchDevice) {
  overlayCopyEl.textContent = "Tap start. Drag anywhere on the screen to move.";
  document.body.classList.add("touch-device");
}

const random = (min, max) => min + Math.random() * (max - min);
const clamp = THREE.MathUtils.clamp;
const clock = new THREE.Clock();

const state = {
  started: false,
  gameOver: false,
  pausedForLevel: false,
  elapsed: 0,
  kills: 0,
  spawnBudget: 0,
  eliteTimer: 14,
  pendingLevelUps: 0,
  message: "Move to begin.",
  messageTimer: 2.5,
  lastTouchTap: 0,
  choices: [],
};

const touch = {
  id: null,
  centerX: 0,
  centerY: 0,
  move: new THREE.Vector2(),
};

const keys = {};
const world = {
  enemies: [],
  projectiles: [],
  pickups: [],
  hazards: [],
  props: [],
};

const player = {
  position: new THREE.Vector3(0, 0.9, 0),
  radius: 1.15,
  speed: 10,
  maxHealth: 120,
  health: 120,
  xp: 0,
  level: 1,
  aimYaw: 0,
  invuln: 0,
  pickupRadius: 9,
  cooldownMultiplier: 1,
  damageMultiplier: 1,
  projectileBonus: 0,
  weapons: [],
  passives: {
    swift_steps: 0,
    ember_core: 0,
    magnet: 0,
    overclock: 0,
    splitter_lens: 0,
  },
};

const passiveDefs = {
  swift_steps: {
    label: "Swift Steps",
    rarity: "common",
    maxLevel: 5,
    description: "+1 move speed",
    apply() {
      player.passives.swift_steps += 1;
      player.speed += 1;
    },
  },
  ember_core: {
    label: "Ember Core",
    rarity: "common",
    maxLevel: 5,
    description: "+20 max HP, heal 12",
    apply() {
      player.passives.ember_core += 1;
      player.maxHealth += 20;
      player.health = Math.min(player.maxHealth, player.health + 12);
    },
  },
  magnet: {
    label: "Void Magnet",
    rarity: "uncommon",
    maxLevel: 4,
    description: "+2.5 pickup radius",
    apply() {
      player.passives.magnet += 1;
      player.pickupRadius += 2.5;
    },
  },
  overclock: {
    label: "Overclock",
    rarity: "rare",
    maxLevel: 4,
    description: "12% faster weapon cooldowns",
    apply() {
      player.passives.overclock += 1;
      player.cooldownMultiplier *= 0.88;
    },
  },
  splitter_lens: {
    label: "Splitter Lens",
    rarity: "uncommon",
    maxLevel: 3,
    description: "+1 projectile on burst weapons",
    apply() {
      player.passives.splitter_lens += 1;
      player.projectileBonus += 1;
    },
  },
};

const weaponDefs = {
  magic_bolt: {
    label: "Bolt",
    rarity: "common",
    maxLevel: 6,
    createState: () => ({ id: "magic_bolt", level: 1, cooldown: 0 }),
    update(weapon, delta) {
      weapon.cooldown -= delta;
      if (weapon.cooldown > 0) return;
      const target = getNearestEnemy();
      if (!target) {
        weapon.cooldown = 0.12;
        return;
      }
      const dir = target.mesh.position.clone().sub(player.position).setY(0).normalize();
      player.aimYaw = Math.atan2(dir.x, dir.z);
      const spread = [0];
      if (weapon.level >= 3) spread.unshift(-0.14), spread.push(0.14);
      if (weapon.level >= 5) spread.unshift(-0.22), spread.push(0.22);
      for (let i = 0; i < player.projectileBonus; i += 1) {
        const offset = 0.28 + i * 0.12;
        spread.unshift(-offset);
        spread.push(offset);
      }
      for (const offset of spread) {
        spawnProjectile({
          direction: dir,
          offsetAngle: offset,
          speed: 20 + weapon.level,
          ttl: 1.25,
          damage: (10 + weapon.level * 3) * player.damageMultiplier,
          radius: 0.28,
          collisionRadius: 0.24,
          pierce: weapon.level >= 4 ? 1 : 0,
          color: 0xffcc71,
          emissive: 0xff8d2f,
        });
      }
      weapon.cooldown = Math.max(0.18, 0.58 - weapon.level * 0.05) * player.cooldownMultiplier;
    },
  },
  orbit_blades: {
    label: "Orbit",
    rarity: "uncommon",
    maxLevel: 5,
    createState: () => ({ id: "orbit_blades", level: 1, angle: 0, blades: [] }),
    update(weapon, delta) {
      const desired = 1 + Math.floor((weapon.level - 1) / 2);
      while (weapon.blades.length < desired) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.4, 1.2),
          new THREE.MeshStandardMaterial({ color: 0xb4f7ff, emissive: 0x166f8f, emissiveIntensity: 1 }),
        );
        mesh.castShadow = true;
        scene.add(mesh);
        weapon.blades.push({ mesh, hitMap: new WeakMap() });
      }
      weapon.angle += delta * (1.9 + weapon.level * 0.15);
      const orbitRadius = 2.8 + weapon.level * 0.35;
      const damage = (7 + weapon.level * 2.5) * player.damageMultiplier;
      for (let i = 0; i < weapon.blades.length; i += 1) {
        const blade = weapon.blades[i];
        const angle = weapon.angle + (Math.PI * 2 * i) / weapon.blades.length;
        blade.mesh.position.set(
          player.position.x + Math.cos(angle) * orbitRadius,
          1.1,
          player.position.z + Math.sin(angle) * orbitRadius,
        );
        blade.mesh.rotation.y = -angle;
        for (const enemy of world.enemies) {
          const cooldownUntil = blade.hitMap.get(enemy) ?? 0;
          if (cooldownUntil > state.elapsed) continue;
          if (enemy.mesh.position.distanceTo(blade.mesh.position) < enemy.radius + 0.9) {
            enemy.health -= damage;
            blade.hitMap.set(enemy, state.elapsed + 0.28);
          }
        }
      }
    },
    cleanup(weapon) {
      for (const blade of weapon.blades) scene.remove(blade.mesh);
      weapon.blades = [];
    },
  },
  flame_ring: {
    label: "Flame",
    rarity: "uncommon",
    maxLevel: 5,
    createState: () => ({ id: "flame_ring", level: 1, cooldown: 0, pulses: [] }),
    update(weapon, delta) {
      weapon.cooldown -= delta;
      if (weapon.cooldown <= 0) {
        const mesh = new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.16, 10, 32),
          new THREE.MeshStandardMaterial({
            color: 0xff8d4b,
            emissive: 0xff5b10,
            emissiveIntensity: 1.2,
            transparent: true,
            opacity: 0.88,
          }),
        );
        mesh.rotation.x = Math.PI / 2;
        scene.add(mesh);
        weapon.pulses.push({
          mesh,
          age: 0,
          ttl: 0.5 + weapon.level * 0.05,
          radius: 2.8 + weapon.level * 0.55,
          damage: (13 + weapon.level * 3) * player.damageMultiplier,
          hit: new WeakSet(),
        });
        weapon.cooldown = Math.max(1.1, 2.6 - weapon.level * 0.18) * player.cooldownMultiplier;
      }
      for (let i = weapon.pulses.length - 1; i >= 0; i -= 1) {
        const pulse = weapon.pulses[i];
        pulse.age += delta;
        const progress = pulse.age / pulse.ttl;
        const currentRadius = 0.8 + pulse.radius * progress;
        pulse.mesh.position.set(player.position.x, 0.12, player.position.z);
        pulse.mesh.scale.setScalar(currentRadius);
        pulse.mesh.material.opacity = 0.9 - progress * 0.8;
        for (const enemy of world.enemies) {
          if (pulse.hit.has(enemy)) continue;
          if (enemy.mesh.position.distanceTo(player.position) <= currentRadius + enemy.radius) {
            enemy.health -= pulse.damage;
            pulse.hit.add(enemy);
          }
        }
        if (pulse.age >= pulse.ttl) {
          scene.remove(pulse.mesh);
          weapon.pulses.splice(i, 1);
        }
      }
    },
    cleanup(weapon) {
      for (const pulse of weapon.pulses) scene.remove(pulse.mesh);
      weapon.pulses = [];
    },
  },
  pierce_lance: {
    label: "Lance",
    rarity: "rare",
    maxLevel: 5,
    createState: () => ({ id: "pierce_lance", level: 1, cooldown: 0 }),
    update(weapon, delta) {
      weapon.cooldown -= delta;
      if (weapon.cooldown > 0) return;
      const target = getNearestEnemy();
      if (!target) {
        weapon.cooldown = 0.18;
        return;
      }
      const dir = target.mesh.position.clone().sub(player.position).setY(0).normalize();
      player.aimYaw = Math.atan2(dir.x, dir.z);
      spawnProjectile({
        direction: dir,
        speed: 27 + weapon.level,
        ttl: 0.9,
        damage: (22 + weapon.level * 5) * player.damageMultiplier,
        radius: 0.36,
        collisionRadius: 0.42,
        pierce: 2 + Math.floor(weapon.level / 2),
        color: 0xa8f4ff,
        emissive: 0x288ac2,
        scale: new THREE.Vector3(0.75, 0.75, 2.6),
      });
      weapon.cooldown = Math.max(0.7, 1.8 - weapon.level * 0.12) * player.cooldownMultiplier;
    },
  },
  chain_arc: {
    label: "Arc",
    rarity: "uncommon",
    maxLevel: 5,
    createState: () => ({ id: "chain_arc", level: 1, cooldown: 0 }),
    update(weapon, delta) {
      weapon.cooldown -= delta;
      if (weapon.cooldown > 0) return;
      const target = getNearestEnemy();
      if (!target) {
        weapon.cooldown = 0.14;
        return;
      }
      const jumps = 2 + Math.floor(weapon.level / 2);
      let current = target;
      const visited = new Set();
      const damage = (11 + weapon.level * 3.2) * player.damageMultiplier;
      for (let i = 0; i < jumps && current; i += 1) {
        current.health -= damage * Math.max(0.55, 1 - i * 0.16);
        visited.add(current);
        spawnArcVisual(i === 0 ? player.position : current.mesh.position, current.mesh.position);
        current = getNearestEnemyFrom(current.mesh.position, 9 + weapon.level * 1.2, visited);
      }
      weapon.cooldown = Math.max(0.72, 1.95 - weapon.level * 0.15) * player.cooldownMultiplier;
    },
  },
  saw_bloom: {
    label: "Saw",
    rarity: "rare",
    maxLevel: 5,
    createState: () => ({ id: "saw_bloom", level: 1, cooldown: 0 }),
    update(weapon, delta) {
      weapon.cooldown -= delta;
      if (weapon.cooldown > 0) return;
      const target = getNearestEnemy();
      if (!target) {
        weapon.cooldown = 0.18;
        return;
      }
      const dir = target.mesh.position.clone().sub(player.position).setY(0).normalize();
      player.aimYaw = Math.atan2(dir.x, dir.z);
      const count = 2 + Math.floor((weapon.level - 1) / 2) + player.projectileBonus;
      for (let i = 0; i < count; i += 1) {
        const offset = count === 1 ? 0 : THREE.MathUtils.lerp(-0.55, 0.55, i / (count - 1));
        spawnProjectile({
          direction: dir,
          offsetAngle: offset,
          speed: 11 + weapon.level * 0.9,
          ttl: 1.6,
          damage: (15 + weapon.level * 4.4) * player.damageMultiplier,
          radius: 0.34,
          collisionRadius: 0.54,
          pierce: 1 + Math.floor(weapon.level / 2),
          color: 0xe7f4ff,
          emissive: 0x5fb5ff,
          scale: new THREE.Vector3(1.15, 0.45, 1.15),
          spin: 15,
        });
      }
      weapon.cooldown = Math.max(1, 2.25 - weapon.level * 0.14) * player.cooldownMultiplier;
    },
  },
  frost_field: {
    label: "Frost",
    rarity: "rare",
    maxLevel: 5,
    createState: () => ({ id: "frost_field", level: 1, cooldown: 0, zones: [] }),
    update(weapon, delta) {
      weapon.cooldown -= delta;
      if (weapon.cooldown <= 0) {
        const target = getNearestEnemy();
        if (target) {
          const radius = 3.8 + weapon.level * 0.6;
          const mesh = new THREE.Mesh(
            new THREE.RingGeometry(radius * 0.65, radius, 40),
            new THREE.MeshBasicMaterial({ color: 0x8ce9ff, transparent: true, opacity: 0.6 }),
          );
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(target.mesh.position.x, 0.1, target.mesh.position.z);
          scene.add(mesh);
          weapon.zones.push({
            mesh,
            position: target.mesh.position.clone(),
            radius,
            ttl: 2.2 + weapon.level * 0.15,
            tick: 0,
            damage: (6 + weapon.level * 1.8) * player.damageMultiplier,
            slow: Math.min(0.58, 0.18 + weapon.level * 0.06),
          });
        }
        weapon.cooldown = Math.max(2.4, 5 - weapon.level * 0.3) * player.cooldownMultiplier;
      }
      for (let i = weapon.zones.length - 1; i >= 0; i -= 1) {
        const zone = weapon.zones[i];
        zone.ttl -= delta;
        zone.tick -= delta;
        zone.mesh.material.opacity = 0.28 + Math.min(zone.ttl / 2.4, 1) * 0.32;
        if (zone.tick <= 0) {
          zone.tick = 0.28;
          for (const enemy of world.enemies) {
            const distance = enemy.mesh.position.distanceTo(zone.position);
            if (distance <= zone.radius + enemy.radius) {
              enemy.health -= zone.damage;
              enemy.slowFactor = Math.min(enemy.slowFactor, 1 - zone.slow);
            }
          }
        }
        if (zone.ttl <= 0) {
          scene.remove(zone.mesh);
          weapon.zones.splice(i, 1);
        }
      }
    },
    cleanup(weapon) {
      for (const zone of weapon.zones) scene.remove(zone.mesh);
      weapon.zones = [];
    },
  },
};

const ambient = new THREE.HemisphereLight(0xb5d7ff, 0x162411, 1.4);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff1c4, 1.8);
sun.position.set(24, 38, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
scene.add(sun);

const groundMat = new THREE.MeshStandardMaterial({ color: 0x263b26, roughness: 1 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(worldRadius, 128), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const boundary = new THREE.Mesh(
  new THREE.RingGeometry(worldRadius - 1.2, worldRadius + 0.8, 80),
  new THREE.MeshBasicMaterial({ color: 0x0b0f12, transparent: true, opacity: 0.9 }),
);
boundary.rotation.x = -Math.PI / 2;
scene.add(boundary);

const playerRoot = new THREE.Group();
const playerBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.7, 1.2, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0xeae6d1, roughness: 0.5 }),
);
playerBody.castShadow = true;
playerBody.position.y = 1;
const playerCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.24, 12, 12),
  new THREE.MeshStandardMaterial({ color: 0xff9f43, emissive: 0xff6b12, emissiveIntensity: 1.2 }),
);
playerCore.position.set(0, 1.25, 0.55);
playerRoot.add(playerBody, playerCore);
scene.add(playerRoot);

const enemyDefs = {
  chaser: { color: 0xb64d69, emissive: 0x4e0f1d, hp: 16, speed: 3, damage: 6, radius: 1.1, behavior: "chase" },
  runner: { color: 0xc58d4b, emissive: 0x59310f, hp: 9, speed: 4.8, damage: 5, radius: 0.95, behavior: "rush" },
  seer: { color: 0x7d6de2, emissive: 0x2c215a, hp: 20, speed: 2.2, damage: 8, radius: 1.15, behavior: "caster" },
};

function setMessage(text, duration = 2.2) {
  state.message = text;
  state.messageTimer = duration;
}

function clearWorld() {
  for (const weapon of player.weapons) {
    weaponDefs[weapon.id]?.cleanup?.(weapon);
  }
  for (const key of Object.keys(world)) {
    for (const item of world[key]) {
      scene.remove(item.mesh);
    }
    world[key] = [];
  }
}

function addScenery() {
  for (let i = 0; i < 42; i += 1) {
    const mesh = new THREE.Mesh(
      i % 3 === 0 ? new THREE.ConeGeometry(random(1.2, 2.2), random(3, 5.4), 8) : new THREE.DodecahedronGeometry(random(0.8, 1.6), 0),
      new THREE.MeshStandardMaterial({
        color: i % 3 === 0 ? new THREE.Color().setHSL(random(0.28, 0.36), 0.45, random(0.22, 0.3)) : 0x5f6770,
        roughness: 1,
      }),
    );
    const radius = Math.sqrt(Math.random()) * (worldRadius - 8);
    const angle = Math.random() * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * radius, mesh.geometry.type === "ConeGeometry" ? 2.1 : 1, Math.sin(angle) * radius);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    world.props.push({ mesh });
  }
}

function resetGame() {
  state.started = false;
  state.gameOver = false;
  state.pausedForLevel = false;
  state.elapsed = 0;
  state.kills = 0;
  state.spawnBudget = 0;
  state.eliteTimer = 14;
  state.pendingLevelUps = 0;
  state.choices = [];
  state.message = "Move to begin.";
  state.messageTimer = 2.5;

  player.position.set(0, 0.9, 0);
  player.speed = 10;
  player.maxHealth = 120;
  player.health = 120;
  player.xp = 0;
  player.level = 1;
  player.aimYaw = 0;
  player.invuln = 0;
  player.pickupRadius = 9;
  player.cooldownMultiplier = 1;
  player.damageMultiplier = 1;
  player.projectileBonus = 0;
  player.weapons = [];
  player.passives = { swift_steps: 0, ember_core: 0, magnet: 0, overclock: 0, splitter_lens: 0 };

  clearWorld();
  addScenery();
  addWeapon("magic_bolt");
  spawnEnemy("chaser", false, 12);
  spawnEnemy("runner", false, 14);
  spawnEnemy("chaser", false, 16);

  startOverlayEl.hidden = false;
  levelUpOverlayEl.hidden = true;
}

function addWeapon(id) {
  if (player.weapons.some((weapon) => weapon.id === id)) return false;
  player.weapons.push(weaponDefs[id].createState());
  setMessage(`Weapon gained: ${weaponDefs[id].label}`);
  return true;
}

function upgradeWeapon(id) {
  const weapon = player.weapons.find((entry) => entry.id === id);
  if (!weapon) return false;
  const def = weaponDefs[id];
  if (weapon.level >= def.maxLevel) return false;
  weapon.level += 1;
  setMessage(`${def.label} upgraded to Lv.${weapon.level}`);
  return true;
}

function getNearestEnemy() {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const enemy of world.enemies) {
    const distance = enemy.mesh.position.distanceToSquared(player.position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = enemy;
    }
  }
  return nearest;
}

function getNearestEnemyFrom(position, maxDistance, excluded = new Set()) {
  let nearest = null;
  let nearestDistance = maxDistance * maxDistance;
  for (const enemy of world.enemies) {
    if (excluded.has(enemy)) continue;
    const distance = enemy.mesh.position.distanceToSquared(position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = enemy;
    }
  }
  return nearest;
}

function spawnArcVisual(start, end) {
  const direction = end.clone().sub(start);
  const length = Math.max(direction.length(), 0.01);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, length, 6),
    new THREE.MeshBasicMaterial({ color: 0x9be9ff, transparent: true, opacity: 0.95 }),
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.position.y = 1.1;
  const axis = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(axis, direction.clone().normalize());
  scene.add(mesh);
  world.hazards.push({ mesh, ttl: 0.12, triggered: true, visualOnly: true });
}

function spawnProjectile({ direction, offsetAngle = 0, speed, ttl, damage, radius, collisionRadius, pierce, color, emissive, scale = null, spin = 0 }) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 10, 10),
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1.4 }),
  );
  mesh.castShadow = true;
  mesh.position.copy(player.position);
  mesh.position.y = 1.1;
  if (scale) mesh.scale.copy(scale);
  const dir = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), offsetAngle).normalize();
  mesh.lookAt(mesh.position.clone().add(dir));
  scene.add(mesh);
  world.projectiles.push({
    mesh,
    velocity: dir.multiplyScalar(speed),
    ttl,
    damage,
    radius: collisionRadius,
    pierce,
    armed: 0.18,
    spin,
    hitTargets: new WeakSet(),
  });
}

function spawnPickup(position, value = 1) {
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.36, 0),
    new THREE.MeshStandardMaterial({ color: 0x60d2ff, emissive: 0x1076a8, emissiveIntensity: 1 }),
  );
  mesh.position.copy(position);
  mesh.position.y = 0.8;
  mesh.castShadow = true;
  scene.add(mesh);
  world.pickups.push({ mesh, value, bob: random(0, Math.PI * 2) });
}

function spawnHazard(position, radius, damage, delay = 0.9) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.82, radius, 32),
    new THREE.MeshBasicMaterial({ color: 0xff5d73, transparent: true, opacity: 0.78 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(position.x, 0.08, position.z);
  scene.add(mesh);
  world.hazards.push({ mesh, radius, damage, ttl: delay, triggered: false });
}

function getMoveInput() {
  const move = new THREE.Vector2();
  if (keys.KeyA || keys.ArrowLeft) move.x -= 1;
  if (keys.KeyD || keys.ArrowRight) move.x += 1;
  if (keys.KeyW || keys.ArrowUp) move.y += 1;
  if (keys.KeyS || keys.ArrowDown) move.y -= 1;
  move.add(touch.move);
  if (move.length() > 1) move.normalize();
  return move;
}

function segmentHitsCircleXZ(start, end, center, radius) {
  const ax = start.x;
  const az = start.z;
  const bx = end.x;
  const bz = end.z;
  const cx = center.x;
  const cz = center.z;
  const abx = bx - ax;
  const abz = bz - az;
  const abLenSq = abx * abx + abz * abz;
  const t = abLenSq === 0 ? 0 : clamp(((cx - ax) * abx + (cz - az) * abz) / abLenSq, 0, 1);
  const px = ax + abx * t;
  const pz = az + abz * t;
  const dx = cx - px;
  const dz = cz - pz;
  return dx * dx + dz * dz <= radius * radius;
}

function spawnEnemy(kind = null, elite = false, distanceOverride = null) {
  const chosenKind = kind ?? pickEnemyKind();
  const def = enemyDefs[chosenKind];
  const distance = distanceOverride ?? random(cameraFrustum * 0.38, cameraFrustum * 0.58);
  let spawnX = player.position.x;
  let spawnZ = player.position.z;
  for (let i = 0; i < 16; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const candidateX = player.position.x + Math.cos(angle) * distance;
    const candidateZ = player.position.z + Math.sin(angle) * distance;
    if (new THREE.Vector2(candidateX, candidateZ).length() <= worldRadius - 2) {
      spawnX = candidateX;
      spawnZ = candidateZ;
      break;
    }
  }
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(
    chosenKind === "runner" ? new THREE.OctahedronGeometry(random(0.8, 1.05), 0) : chosenKind === "seer" ? new THREE.IcosahedronGeometry(random(0.95, 1.15), 0) : new THREE.SphereGeometry(random(0.85, 1.2), 10, 10),
    new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.emissive,
      emissiveIntensity: elite ? 1.1 : 0.75,
      roughness: 0.7,
    }),
  );
  body.castShadow = true;
  body.position.y = 1;
  mesh.add(body);
  mesh.position.set(spawnX, 0, spawnZ);
  scene.add(mesh);

  const scale = (elite ? 1.85 : 1) * (random(0.95, 1.15) + Math.floor(state.elapsed / 20) * 0.04);
  mesh.scale.setScalar(scale);
  world.enemies.push({
    mesh,
    kind: chosenKind,
    elite,
    health: (def.hp + Math.floor(state.elapsed / 20) * 5) * (elite ? 4 : 1),
    speed: def.speed + Math.floor(state.elapsed / 20) * 0.08 + (elite ? 0.45 : 0),
    radius: def.radius * scale,
    damage: def.damage + Math.floor(state.elapsed / 20) * 0.8 + (elite ? 4 : 0),
    behavior: def.behavior,
    telegraphCooldown: random(2, 3.4),
    slowFactor: 1,
  });
}

function pickEnemyKind() {
  const wave = 1 + Math.floor(state.elapsed / 20);
  const roll = Math.random();
  if (wave <= 2) return roll < 0.78 ? "chaser" : "runner";
  if (wave <= 4) return roll < 0.52 ? "chaser" : roll < 0.82 ? "runner" : "seer";
  return roll < 0.4 ? "chaser" : roll < 0.72 ? "runner" : "seer";
}

function updatePlayer(delta) {
  const input = getMoveInput();
  const move = new THREE.Vector3(input.x, 0, -input.y).multiplyScalar(player.speed * delta);
  player.position.add(move);
  const planar = new THREE.Vector3(player.position.x, 0, player.position.z);
  if (planar.length() > worldRadius - 2.5) {
    planar.setLength(worldRadius - 2.5);
    player.position.x = planar.x;
    player.position.z = planar.z;
  }
  playerRoot.position.copy(player.position);
  playerRoot.position.y = 0;
  playerRoot.rotation.y = player.aimYaw;
  player.invuln = Math.max(0, player.invuln - delta);
  camera.position.set(player.position.x, 26, player.position.z + 16);
  camera.lookAt(player.position.x, 0, player.position.z);
}

function updateWeapons(delta) {
  for (const weapon of player.weapons) {
    weaponDefs[weapon.id]?.update(weapon, delta);
  }
}

function updateProjectiles(delta) {
  for (let i = world.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = world.projectiles[i];
    projectile.ttl -= delta;
    projectile.armed -= delta;
    const previous = projectile.mesh.position.clone();
    const step = projectile.velocity.clone().multiplyScalar(delta);
    projectile.mesh.position.add(step);
    if (projectile.spin) projectile.mesh.rotation.z += projectile.spin * delta;

    let remove = false;
    if (projectile.armed <= 0) {
      for (const enemy of world.enemies) {
        if (projectile.hitTargets.has(enemy)) continue;
        if (!segmentHitsCircleXZ(previous, projectile.mesh.position, enemy.mesh.position, enemy.radius + projectile.radius)) continue;
        enemy.health -= projectile.damage;
        projectile.hitTargets.add(enemy);
        if (projectile.pierce > 0) {
          projectile.pierce -= 1;
        } else {
          remove = true;
          break;
        }
      }
    }
    if (remove || projectile.ttl <= 0 || projectile.mesh.position.length() > worldRadius + 6) {
      scene.remove(projectile.mesh);
      world.projectiles.splice(i, 1);
    }
  }
}

function updateEnemies(delta) {
  const pressure = 0.9 + Math.min(state.elapsed / 45, 1.6) + Math.floor(state.elapsed / 20) * 0.22;
  state.spawnBudget += delta * pressure;
  while (state.spawnBudget >= 1) {
    state.spawnBudget -= 1;
    spawnEnemy();
  }

  state.eliteTimer -= delta;
  const eliteAlive = world.enemies.some((enemy) => enemy.elite);
  if (state.elapsed >= 25 && state.eliteTimer <= 0 && !eliteAlive) {
    spawnEnemy(Math.random() < 0.5 ? "seer" : "chaser", true);
    state.eliteTimer = 16;
    setMessage("Elite enters the field.", 2);
  }

  for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = world.enemies[i];
    enemy.slowFactor = 1;
  }

  for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = world.enemies[i];
    const toPlayer = player.position.clone().sub(enemy.mesh.position).setY(0);
    const distance = toPlayer.length();
    if (distance > 0.001) {
      toPlayer.normalize();
      const moveSpeed = enemy.speed * enemy.slowFactor;
      if (enemy.behavior === "chase") {
        enemy.mesh.position.addScaledVector(toPlayer, moveSpeed * delta);
      } else if (enemy.behavior === "rush") {
        enemy.mesh.position.addScaledVector(toPlayer, moveSpeed * (distance > 5 ? 1.25 : 0.8) * delta);
      } else if (enemy.behavior === "caster") {
        enemy.telegraphCooldown -= delta;
        if (distance > 10) enemy.mesh.position.addScaledVector(toPlayer, moveSpeed * delta);
        if (distance < 7) enemy.mesh.position.addScaledVector(toPlayer, -moveSpeed * 0.7 * delta);
        if (enemy.telegraphCooldown <= 0) {
          const input = getMoveInput();
          const lead = player.position.clone().add(new THREE.Vector3(input.x, 0, -input.y).multiplyScalar(input.length() > 0 ? 2.8 : 0));
          spawnHazard(lead, enemy.elite ? 4.1 : 3, enemy.damage + 4, enemy.elite ? 0.85 : 1.05);
          enemy.telegraphCooldown = enemy.elite ? 2.4 : 3.4;
        }
      }
    }
    enemy.mesh.position.y = 0;
    enemy.mesh.lookAt(player.position.x, 0.4, player.position.z);
    if (distance < enemy.radius + player.radius && player.invuln <= 0) {
      player.health = Math.max(0, player.health - enemy.damage);
      player.invuln = 0.8;
      setMessage("The swarm breaks through.", 1.1);
    }
    if (enemy.health <= 0) {
      const dropPos = enemy.mesh.position.clone();
      scene.remove(enemy.mesh);
      world.enemies.splice(i, 1);
      state.kills += 1;
      spawnPickup(dropPos, enemy.elite ? 5 : enemy.kind === "seer" ? 2 : 1);
    }
  }
}

function updateHazards(delta) {
  for (let i = world.hazards.length - 1; i >= 0; i -= 1) {
    const hazard = world.hazards[i];
    hazard.ttl -= delta;
    if (!hazard.triggered && hazard.ttl <= 0) {
      hazard.triggered = true;
      if (hazard.mesh.position.distanceTo(player.position) <= hazard.radius + player.radius && player.invuln <= 0) {
        player.health = Math.max(0, player.health - hazard.damage);
        player.invuln = 0.8;
        setMessage("A seer mark detonates.", 1.2);
      }
    }
    if (hazard.ttl <= -0.2) {
      scene.remove(hazard.mesh);
      world.hazards.splice(i, 1);
    }
  }
}

function updatePickups(delta) {
  for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
    const pickup = world.pickups[i];
    pickup.bob += delta * 3.2;
    pickup.mesh.position.y = 0.8 + Math.sin(pickup.bob) * 0.16;
    pickup.mesh.rotation.y += delta * 1.8;
    const distance = pickup.mesh.position.distanceTo(player.position);
    if (distance < player.pickupRadius) {
      pickup.mesh.position.add(player.position.clone().sub(pickup.mesh.position).multiplyScalar(delta * 2.4));
    }
    if (distance < 1.3) {
      player.xp += pickup.value;
      scene.remove(pickup.mesh);
      world.pickups.splice(i, 1);
    }
  }
}

function getUpgradePool() {
  const pool = [];
  for (const [id, def] of Object.entries(weaponDefs)) {
    const owned = player.weapons.find((weapon) => weapon.id === id);
    if (!owned) {
      pool.push({ kind: "weapon", id, label: `New Weapon: ${def.label}`, rarity: def.rarity, description: "Add this weapon to the build." });
    } else if (owned.level < def.maxLevel) {
      pool.push({ kind: "weapon_upgrade", id, label: `${def.label} Lv.${owned.level + 1}`, rarity: owned.level >= def.maxLevel - 1 ? "rare" : "common", description: "Upgrade this weapon." });
    }
  }
  for (const [id, def] of Object.entries(passiveDefs)) {
    if (player.passives[id] < def.maxLevel) {
      pool.push({ kind: "passive", id, label: def.label, rarity: def.rarity, description: def.description });
    }
  }
  return pool;
}

function pickWeightedChoice(pool, used) {
  const filtered = pool.filter((choice) => !used.has(`${choice.kind}:${choice.id}`));
  if (filtered.length === 0) return null;
  const rarityRoll = Math.random();
  const desired = rarityRoll < 0.1 ? "rare" : rarityRoll < 0.38 ? "uncommon" : "common";
  const subset = filtered.filter((choice) => choice.rarity === desired);
  return (subset.length > 0 ? subset : filtered)[Math.floor(Math.random() * (subset.length > 0 ? subset.length : filtered.length))];
}

function openLevelUp() {
  const pool = getUpgradePool();
  const used = new Set();
  state.choices = [];
  while (state.choices.length < 3 && used.size < pool.length) {
    const choice = pickWeightedChoice(pool, used);
    if (!choice) break;
    used.add(`${choice.kind}:${choice.id}`);
    state.choices.push(choice);
  }
  choiceGridEl.innerHTML = state.choices
    .map((choice, index) => `
      <button class="choice-card rarity-${choice.rarity}" type="button" data-choice="${index}">
        <span class="choice-title">${choice.label}</span>
        <span class="choice-meta">${choice.rarity.toUpperCase()}</span>
        <span class="choice-body">${choice.description}</span>
      </button>
    `)
    .join("");
  state.pausedForLevel = true;
  levelUpOverlayEl.hidden = false;
}

function applyChoice(choice) {
  if (!choice) return;
  if (choice.kind === "weapon") addWeapon(choice.id);
  if (choice.kind === "weapon_upgrade") upgradeWeapon(choice.id);
  if (choice.kind === "passive") {
    passiveDefs[choice.id].apply();
    setMessage(`${choice.label} empowered.`);
  }
  state.pendingLevelUps = Math.max(0, state.pendingLevelUps - 1);
  if (state.pendingLevelUps > 0) {
    openLevelUp();
  } else {
    state.pausedForLevel = false;
    levelUpOverlayEl.hidden = true;
  }
}

function maybeLevelUp() {
  while (true) {
    const xpRequired = 4 + (player.level - 1) * 4;
    if (player.xp < xpRequired) break;
    player.xp -= xpRequired;
    player.level += 1;
    state.pendingLevelUps += 1;
  }
  if (state.pendingLevelUps > 0 && !state.pausedForLevel) {
    openLevelUp();
  }
}

function updateHud() {
  const xpRequired = 4 + (player.level - 1) * 4;
  const eliteCount = world.enemies.filter((enemy) => enemy.elite).length;
  const passiveSummary = Object.entries(player.passives)
    .filter(([, level]) => level > 0)
    .map(([id, level]) => `${passiveDefs[id].label.split(" ")[0]} ${level}`)
    .join(" · ");

  statEls.health.textContent = `${Math.round(player.health)} / ${player.maxHealth}`;
  statEls.time.textContent = `${Math.floor(state.elapsed / 60).toString().padStart(2, "0")}:${Math.floor(state.elapsed % 60).toString().padStart(2, "0")}`;
  statEls.kills.textContent = state.kills;
  weaponsEl.textContent = player.weapons.map((weapon) => `${weaponDefs[weapon.id].label} ${weapon.level}`).join(" · ");
  passivesEl.textContent = passiveSummary || "None";
  levelEl.textContent = player.level;
  xpFillEl.style.width = `${clamp((player.xp / xpRequired) * 100, 0, 100)}%`;
  bannerEl.textContent = eliteCount > 0 ? `Elite x${eliteCount} | Speed ${player.speed.toFixed(1)}` : `Build ${player.weapons.length} | Speed ${player.speed.toFixed(1)}`;
  toastEl.hidden = state.messageTimer <= 0;
  toastEl.textContent = state.message;
}

function updateVisuals() {
  const sky = new THREE.Color();
  const pulse = Math.sin(state.elapsed * 0.2) * 0.04 + 0.5;
  sky.lerpColors(new THREE.Color(0x0b131b), new THREE.Color(0x203347), pulse);
  scene.background = sky;
  scene.fog.color.copy(sky);
}

function updateGame(delta) {
  state.messageTimer = Math.max(0, state.messageTimer - delta);
  updateVisuals();
  updateHud();

  if (!state.started || state.gameOver || state.pausedForLevel) {
    renderer.render(scene, camera);
    return;
  }

  state.elapsed += delta;
  updatePlayer(delta);
  updateWeapons(delta);
  updateProjectiles(delta);
  updateEnemies(delta);
  updateHazards(delta);
  updatePickups(delta);
  maybeLevelUp();

  if (player.health <= 0) {
    state.started = false;
    state.gameOver = true;
    startOverlayEl.hidden = false;
    startOverlayEl.querySelector(".overlay-card").innerHTML = `
      <h2>Run Over</h2>
      <p>You reached level ${player.level} with ${state.kills} kills.</p>
      <button class="cta" type="button" data-start>Restart</button>
    `;
    startOverlayEl.querySelector("[data-start]").addEventListener("click", startRun);
  }

  renderer.render(scene, camera);
}

function animate() {
  requestAnimationFrame(animate);
  updateGame(Math.min(clock.getDelta(), 0.05));
}

function shouldHandleTap(event) {
  const now = performance.now();
  if (event.type === "touchend") {
    state.lastTouchTap = now;
    return true;
  }
  return !(event.type === "click" && now - state.lastTouchTap < 450);
}

function startRun(event) {
  if (!shouldHandleTap(event)) return;
  event.preventDefault();
  event.stopPropagation();
  if (state.gameOver) resetGame();
  state.started = true;
  state.gameOver = false;
  state.pausedForLevel = false;
  startOverlayEl.hidden = true;
  levelUpOverlayEl.hidden = true;
  setMessage("Keep moving. Weapons fire automatically.", 2.2);
}

function updateTouchMove(clientX, clientY) {
  const dx = clientX - touch.centerX;
  const dy = clientY - touch.centerY;
  const maxRadius = 52;
  const distance = Math.hypot(dx, dy);
  const limited = Math.min(distance, maxRadius);
  const angle = Math.atan2(dy, dx);
  const knobX = Math.cos(angle) * limited;
  const knobY = Math.sin(angle) * limited;
  if (distance < 8) {
    touch.move.set(0, 0);
    stickKnobEl.style.transform = "translate(-50%, -50%)";
    return;
  }
  touch.move.set(clamp(dx / maxRadius, -1, 1), clamp(-dy / maxRadius, -1, 1));
  stickKnobEl.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
}

function resetTouch() {
  touch.id = null;
  touch.move.set(0, 0);
  mobileUiEl.classList.remove("active");
  stickKnobEl.style.transform = "translate(-50%, -50%)";
}

mobileUiEl.addEventListener("touchstart", (event) => {
  if (!isTouchDevice || touch.id !== null) return;
  const point = event.changedTouches[0];
  touch.id = point.identifier;
  touch.centerX = point.clientX;
  touch.centerY = point.clientY;
  mobileUiEl.style.setProperty("--stick-x", `${touch.centerX}px`);
  mobileUiEl.style.setProperty("--stick-y", `${touch.centerY}px`);
  mobileUiEl.classList.add("active");
  updateTouchMove(point.clientX, point.clientY);
}, { passive: false });

mobileUiEl.addEventListener("touchmove", (event) => {
  if (!isTouchDevice) return;
  for (const point of event.changedTouches) {
    if (point.identifier === touch.id) {
      updateTouchMove(point.clientX, point.clientY);
      event.preventDefault();
    }
  }
}, { passive: false });

mobileUiEl.addEventListener("touchend", (event) => {
  if (!isTouchDevice) return;
  for (const point of event.changedTouches) {
    if (point.identifier === touch.id) resetTouch();
  }
}, { passive: false });
mobileUiEl.addEventListener("touchcancel", resetTouch, { passive: false });

document.addEventListener("keydown", (event) => {
  keys[event.code] = true;
  if (event.code === "KeyR" && state.gameOver) {
    resetGame();
    state.started = true;
    startOverlayEl.hidden = true;
  }
});

document.addEventListener("keyup", (event) => {
  keys[event.code] = false;
});

startButtonEl.addEventListener("click", startRun);
startButtonEl.addEventListener("touchend", startRun, { passive: false });
choiceGridEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-choice]");
  if (!button) return;
  applyChoice(state.choices[Number(button.dataset.choice)]);
});
choiceGridEl.addEventListener("touchend", (event) => {
  const button = event.target.closest("[data-choice]");
  if (!button || !shouldHandleTap(event)) return;
  event.preventDefault();
  applyChoice(state.choices[Number(button.dataset.choice)]);
}, { passive: false });

window.addEventListener("resize", () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-cameraFrustum * aspect) / 2;
  camera.right = (cameraFrustum * aspect) / 2;
  camera.top = cameraFrustum / 2;
  camera.bottom = -cameraFrustum / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

camera.position.set(0, 26, 16);
camera.lookAt(0, 0, 0);
resetGame();
animate();
