import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.152.2/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js';

const container = document.getElementById('container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// Visual group for the table so we can tilt visuals independently of physics
const tableGroup = new THREE.Group();
scene.add(tableGroup);

// Registry of objects that belong to the table (physics body + visual mesh + original local transform)
const tableObjects = [];

// Helper: sync registered table objects to the current tableGroup rotation
function syncTableObjects() {
  // get table quaternion as THREE.Quaternion
  const tableQuat = tableGroup.quaternion.clone();
  for (const obj of tableObjects) {
    try {
      const local = new THREE.Vector3(obj.localPos.x, obj.localPos.y, obj.localPos.z);
      const worldPos = local.clone().applyQuaternion(tableQuat);
      // update physics body position
      if (obj.body) {
        obj.body.position.set(worldPos.x, worldPos.y, worldPos.z);
      }
      // compose quaternions: tableQuat * localQuat
      const localQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(obj.localEuler.x, obj.localEuler.y, obj.localEuler.z, 'XYZ'));
      const worldQuat = tableQuat.clone().multiply(localQuat);
      if (obj.body) {
        obj.body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
      }
      if (obj.mesh) {
        obj.mesh.position.set(worldPos.x, worldPos.y, worldPos.z);
        obj.mesh.quaternion.copy(worldQuat);
      }
    } catch (err) {
      console.warn('syncTableObjects error', err);
    }
  }
}

// Register an object so it moves with the visual tableGroup rotation.
// body: CANNON.Body (optional), mesh: THREE.Mesh (optional)
function registerTableObject(body, mesh) {
  try {
    // determine world position/quaternion
    let worldPos = new THREE.Vector3();
    let worldQuat = new THREE.Quaternion();
    if (mesh) {
      worldPos.copy(mesh.getWorldPosition(new THREE.Vector3()));
      worldQuat.copy(mesh.getWorldQuaternion(new THREE.Quaternion()));
    } else if (body && body.position) {
      worldPos.set(body.position.x, body.position.y, body.position.z);
      worldQuat.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    } else return;

    // compute local position & rotation relative to tableGroup
    const localPos = tableGroup.worldToLocal(worldPos.clone());
    const invTableQuat = tableGroup.quaternion.clone().invert();
    const localQuat = invTableQuat.multiply(worldQuat);
    const localEuler = new THREE.Euler().setFromQuaternion(localQuat, 'XYZ');

    tableObjects.push({
      body: body || null,
      mesh: mesh || null,
      localPos: { x: localPos.x, y: localPos.y, z: localPos.z },
      localEuler: { x: localEuler.x, y: localEuler.y, z: localEuler.z }
    });
  } catch (err) {
    console.warn('registerTableObject error', err);
  }
}

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const ambient = new THREE.HemisphereLight(0xddeeff, 0x181824, 0.65);
scene.add(ambient);

// Key light with sharp yet soft shadows
const dir = new THREE.DirectionalLight(0xfffaed, 1.15);
dir.position.set(6, 15, 8);
dir.castShadow = true;
dir.shadow.mapSize.width = 2048;
dir.shadow.mapSize.height = 2048;
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 35;
const d = 9.0;
dir.shadow.camera.left = -d;
dir.shadow.camera.right = d;
dir.shadow.camera.top = d;
dir.shadow.camera.bottom = -d;
dir.shadow.bias = -0.0004;
dir.shadow.normalBias = 0.02;
scene.add(dir);

// Fill light for soft blue rim highlights
const fillLight = new THREE.DirectionalLight(0x5588cc, 0.45);
fillLight.position.set(-6, 10, -6);
scene.add(fillLight);

// --- 3D Spark Particle System ---
const MAX_SPARKS = 140;
const sparkGeo = new THREE.SphereGeometry(0.06, 6, 6);
const sparkPool = [];
const sparkGroup = new THREE.Group();
scene.add(sparkGroup);

for (let i = 0; i < MAX_SPARKS; i++) {
  const sm = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 }));
  sm.visible = false;
  sparkGroup.add(sm);
  sparkPool.push({
    mesh: sm,
    vel: new THREE.Vector3(),
    life: 0,
    maxLife: 0.4,
  });
}

function spawnSparks(x, y, z, colorHex = 0x00ffff, count = 16, speedMult = 1.0) {
  let spawned = 0;
  for (const sp of sparkPool) {
    if (sp.life <= 0) {
      sp.mesh.visible = true;
      sp.mesh.position.set(
        x + (Math.random() - 0.5) * 0.25,
        y + 0.05 + (Math.random() - 0.5) * 0.1,
        z + (Math.random() - 0.5) * 0.25
      );
      sp.mesh.material.color.setHex(colorHex);
      sp.mesh.material.opacity = 1;
      sp.mesh.scale.setScalar(0.8 + Math.random() * 0.6);

      const angle = Math.random() * Math.PI * 2;
      const horizSpeed = (2.5 + Math.random() * 5.0) * speedMult;
      sp.vel.set(
        Math.cos(angle) * horizSpeed,
        1.5 + Math.random() * 3.5,
        Math.sin(angle) * horizSpeed
      );
      sp.maxLife = 0.25 + Math.random() * 0.25;
      sp.life = sp.maxLife;
      spawned++;
      if (spawned >= count) break;
    }
  }
}

function updateSparks(dt) {
  for (const sp of sparkPool) {
    if (sp.life > 0) {
      sp.life -= dt;
      if (sp.life <= 0) {
        sp.mesh.visible = false;
      } else {
        sp.mesh.position.x += sp.vel.x * dt;
        sp.mesh.position.y += sp.vel.y * dt;
        sp.mesh.position.z += sp.vel.z * dt;
        sp.vel.y -= 9.8 * dt; // gravity
        const progress = sp.life / sp.maxLife;
        sp.mesh.material.opacity = progress;
        sp.mesh.scale.setScalar(progress * 1.1);
      }
    }
  }
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false; // default disabled so touch/drag won't interfere with gameplay
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.1;

// Frame the whole table with a mostly top-down view, adapting to the viewport
// aspect ratio so the full playfield stays visible (fixes mobile/portrait zoom-in).
function fitCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  const vFov = camera.fov * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const halfX = 5.5; // playfield half-width  + margin
  const halfZ = 8.0; // playfield half-length + margin
  const distForZ = halfZ / Math.tan(vFov / 2);
  const distForX = halfX / Math.tan(hFov / 2);
  const dist = Math.max(distForZ, distForX) * 1.06;
  const el = THREE.MathUtils.degToRad(68); // elevation above horizontal (mostly top-down)
  const target = new THREE.Vector3(0, 0, 0.5);
  camera.position.set(target.x, target.y + dist * Math.sin(el), target.z + dist * Math.cos(el));
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.update();
}
fitCamera();

// Physics
// Simulate a tilted pinball table: a constant downhill pull toward the flippers (+Z)
// so balls naturally roll down toward the bottom of the table.
const TABLE_INCLINE_G = 3.4;
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, TABLE_INCLINE_G) });
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 20; // a bit higher for stability

// Create shared materials so contact properties between bumpers/balls are explicit
const bumperMaterial = new CANNON.Material('bumper');
const ballMaterial = new CANNON.Material('ball');
// bumper <-> ball: tuned bounce/friction (raised restitution slightly for snappier hits)
const bumperBallContact = new CANNON.ContactMaterial(bumperMaterial, ballMaterial, { restitution: 0.95, friction: 0.015 });
world.addContactMaterial(bumperBallContact);
// ball <-> ball: slightly more bouncy for livelier interactions
const ballBallContact = new CANNON.ContactMaterial(ballMaterial, ballMaterial, { restitution: 0.88, friction: 0.02 });
world.addContactMaterial(ballBallContact);
// flipper <-> ball (same materials used), contact tweaks already covered by bumperBallContact

const bodies = [];
const meshes = [];

// Score
let score = 0;
const scoreEl = document.getElementById('score');
function updateScore(v) {
  score += v || 0;
  if (scoreEl) scoreEl.textContent = `Score: ${score}`;
  // progressive reward: award an extra ball when passing score milestones
  while (nextBonusIdx < BONUS_BALL_THRESHOLDS.length && score >= BONUS_BALL_THRESHOLDS[nextBonusIdx]) {
    nextBonusIdx++;
    awardBonusBall();
  }
}

// Game state (balls = lives). UI + game-over overlay are wired up later in the file.
let ballsLeft = 3;
let gameOver = false;
let highScore = 0;
try { highScore = parseInt(localStorage.getItem('PINBALL_HIGH') || '0', 10) || 0; } catch (e) {}

// Progressive reward: crossing each of these score milestones grants a bonus ball.
const BONUS_BALL_THRESHOLDS = [5000, 15000, 30000];
let nextBonusIdx = 0;

// Combo: chaining bumper hits within a short window raises a score multiplier.
let combo = 0;
let lastComboAt = 0;
let maxComboThisGame = 0; // best combo reached in the current game (shown on game over)
const COMBO_WINDOW_MS = 2000;
const COMBO_MAX = 10;

// =============================================================================
// HAPTIC FEEDBACK ENGINE (MOBILE / TABLET)
// =============================================================================
const hapticToggle = document.getElementById('haptic-toggle');
const Haptic = {
  enabled: true,
  init() {
    try {
      const saved = localStorage.getItem('PINBALL_HAPTIC');
      if (saved !== null) {
        this.enabled = saved === 'true';
      }
    } catch (e) {}
    if (hapticToggle) {
      hapticToggle.checked = this.enabled;
      hapticToggle.addEventListener('change', (e) => {
        this.enabled = !!e.target.checked;
        try { localStorage.setItem('PINBALL_HAPTIC', String(this.enabled)); } catch (err) {}
        if (this.enabled) this.flipper(); // test feedback pulse on enable
      });
    }
  },
  vibrate(pattern) {
    if (!this.enabled) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch (e) {}
  },
  flipper() { this.vibrate(12); },         // Solenoid click micro-pulse
  flipperHit() { this.vibrate(22); },      // Solid flipper strike
  bumper() { this.vibrate(28); },          // Pop bumper kick
  kicker() { this.vibrate(24); },          // Corner kicker blast
  saved() { this.vibrate([25, 40, 50]); }, // Ball Saved fanfare double-tap
  drain() { this.vibrate([40, 50, 30]); }, // Ball lost rumble
};
Haptic.init();

// =============================================================================
// PROCEDURAL PINBALL SOUND SYSTEM (WEB AUDIO API - ZERO EXTERNAL ASSETS)
// =============================================================================
const AudioFX = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) this.ctx = new AudioContextClass();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  },

  // 1. Flipper Solenoid Clack (mechanical snap)
  playFlipperClack(side = 'left') {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // A. Low punch (solenoid coil)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(side === 'left' ? 110 : 98, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.035);
    oscGain.gain.setValueAtTime(0.35, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);

    // B. High metallic click snap (bandpass white noise burst)
    const bufferSize = Math.floor(ctx.sampleRate * 0.02);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2900, now);
    filter.Q.value = 3.0;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.22, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    whiteNoise.start(now);
  },

  // 2. Harmonic Bumper Chime (rich dual-tone arcade bell)
  playBumperChime(baseFreq = 840, intensity = 1.0) {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 0.15;

    // Root + Fifth harmonic
    [baseFreq, baseFreq * 1.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.98, now + dur);

      const vol = (idx === 0 ? 0.22 : 0.12) * Math.min(1.4, 0.9 + intensity * 0.1);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(vol, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    });
  },

  // 3. Launch Whoosh / Jet
  playLaunchJet() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.14);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.14);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  },

  // 4. Ball Saved Fanfare (cheerful arpeggio: C5 -> E5 -> G5)
  playBallSavedFanfare() {
    this.init();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
      }, i * 65);
    });
  },

  // 5. Drop Target Drop Snap
  playDropTargetHit() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.04);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  },

  // 6. Target Bank Reset (Solenoid Lift)
  playBankReset() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    [140, 220].forEach((freq, i) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const n = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, n);
        gain.gain.setValueAtTime(0.2, n);
        gain.gain.exponentialRampToValueAtTime(0.001, n + 0.035);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(n);
        osc.stop(n + 0.04);
      }, i * 50);
    });
  },

  // 7. Top Rollover Lane Ding
  playRolloverDing(idx = 0) {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freqs = [1046.5, 1174.66, 1318.51]; // C6, D6, E6
    const f = freqs[idx % freqs.length] || 1100;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  },

  // 8. Multiplier Upgrade Fanfare
  playMultiplierUpFanfare() {
    this.init();
    if (!this.ctx) return;
    const notes = [659.25, 783.99, 987.77, 1318.51]; // E5, G5, B5, E6
    notes.forEach((freq, i) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.28, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
      }, i * 60);
    });
  }
};

// Legacy ping helper for backward compatibility
function playPing(freq = 440, duration = 0.08) {
  AudioFX.init();
  if (!AudioFX.ctx) return;
  const ctx = AudioFX.ctx;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.value = 0.0001;
  o.connect(g);
  g.connect(ctx.destination);
  const now = ctx.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  o.start(now);
  o.stop(now + duration + 0.02);
}

// Table / container
const tableSize = { w: 8, h: 12 };

function addWall(pos, quat, size, options = {}) {
  // physics body
  const shape = new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2));
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(shape);
  body.position.set(pos.x, pos.y, pos.z);
  body.quaternion.setFromEuler(quat.x, quat.y, quat.z, 'XYZ');
  world.addBody(body);

  // visual mesh (optional, default true)
  let mesh = null;
  if (options.visual !== false) {
    const mat = new THREE.MeshStandardMaterial({
      color: options.color || 0x334455,
      metalness: options.metalness || 0.4,
      roughness: options.roughness || 0.5,
      emissive: options.emissive || 0x05101a,
      emissiveIntensity: options.emissiveIntensity || 0.2
    });
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.quaternion.setFromEuler(new THREE.Euler(quat.x, quat.y, quat.z, 'XYZ'));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // attach visuals into tableGroup so we can tilt them together
    if (typeof tableGroup !== 'undefined') tableGroup.add(mesh); else scene.add(mesh);
  }
}


// Table bed (thin static box) — gives a finite table surface the balls can roll on
const bedThickness = 0.2;
const bedY = -1; // top surface at y = -1
// add bed physics without a thick visual box (we use a thin plane mesh for visuals)
addWall({ x: 0, y: bedY - bedThickness/2, z: 0 }, { x: 0, y: 0, z: 0 }, { x: tableSize.w + 2, y: bedThickness, z: tableSize.h + 2 }, { visual: false });

// Visual floor (match the bed)
const floorGeo = new THREE.PlaneGeometry(tableSize.w + 2, tableSize.h + 2);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x161820,
  metalness: 0.2,
  roughness: 0.75,
  emissive: 0x080a10,
  emissiveIntensity: 0.15
});
// prevent z-fighting by enabling polygon offset on the material
floorMat.polygonOffset = true;
floorMat.polygonOffsetFactor = 1.0;
floorMat.polygonOffsetUnits = 4.0;
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
// plane geometry faces +Z by default; rotate to horizontal
floorMesh.rotation.x = -Math.PI/2;
// slight upward offset to avoid coplanar overlap with physics bed
floorMesh.position.y = bedY + 0.001;
floorMesh.receiveShadow = true;
// add to tableGroup so visuals tilt together
tableGroup.add(floorMesh);

// Side rails (left and right) — short visible walls that sit ON the bed so balls
// can't roll off the sides. (The previous walls floated above the bed with their
// bottom at y=0, letting low-rolling balls slip underneath.)
const sideRailHeight = 2.0;
const sideRailThickness = 0.5;
const sideRailX = tableSize.w/2 + 0.75; // sits along the visible floor edge
addWall({ x: -sideRailX, y: bedY + sideRailHeight/2, z: 0 }, { x: 0, y: 0, z: 0 }, { x: sideRailThickness, y: sideRailHeight, z: tableSize.h }, { color: 0x3d5066, metalness: 0.6, roughness: 0.35, emissive: 0x0a1a2e, emissiveIntensity: 0.4 });
addWall({ x:  sideRailX, y: bedY + sideRailHeight/2, z: 0 }, { x: 0, y: 0, z: 0 }, { x: sideRailThickness, y: sideRailHeight, z: tableSize.h }, { color: 0x3d5066, metalness: 0.6, roughness: 0.35, emissive: 0x0a1a2e, emissiveIntensity: 0.4 });

// Tall back wall along the TOP edge (behind the bumpers) so balls can't fly out
// the back when they spawn from above or get launched by a hard hit. Spans the
// full width between the side rails.
const backWallHeight = 3.0;
addWall({ x: 0, y: bedY + backWallHeight/2, z: -tableSize.h/2 + 0.5 }, { x: 0, y: 0, z: 0 }, { x: 2 * sideRailX, y: backWallHeight, z: 0.5 }, { color: 0x2d3a4d, metalness: 0.5, roughness: 0.4 });

// create some spherical bumpers (visual + invisible physics)
// Pop-bumper kick strength (horizontal impulse applied when the ball hits a bumper).
// The kick grows with the current combo (in hitBumper) so the ball keeps momentum
// toward the flippers as combos build.
const BUMPER_POP = 11;
const BUMPER_COOLDOWN_MS = 150; // per-ball, per-bumper gate for pop + scoring
const bumpers = [];
function createBumper(x,z,r=0.6, points=100, colorHex=0xff3366, emissiveHex=0xff1144) {
  // create a vertical cylinder (post) rooted on the bed so balls bounce off a grounded post
  const height = 1.2;
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: emissiveHex,
    emissiveIntensity: 0.25,
    roughness: 0.25,
    metalness: 0.45
  });
  const geo = new THREE.CylinderGeometry(r, r, height, 32);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, bedY + height/2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // attach bumper visuals to tableGroup so they tilt visually
  tableGroup.add(mesh);

  // physics cylinder: align cylinder axis with Y by rotating the shape when adding
  const shape = new CANNON.Cylinder(r, r, height, 16);
  const body = new CANNON.Body({ mass: 0 });
  const q = new CANNON.Quaternion();
  // rotate cylinder so its axis aligns with Y (up)
  q.setFromEuler(0, 0, Math.PI/2, 'XYZ');
  body.addShape(shape, new CANNON.Vec3(), q);
  body.position.set(x, bedY + height/2, z);
  body.material = bumperMaterial; // use shared bumper material
  world.addBody(body);

  // ensure visual matches physics orientation
  try {
    const tq = body.quaternion;
    mesh.quaternion.set(tq.x, tq.y, tq.z, tq.w);
  } catch (err) {
    console.warn('failed to sync bumper visual quaternion', err);
  }

  const bp = { body, mesh, mat, points, r, flash: 0, baseColor: colorHex };
  body.addEventListener('collide', (e) => { if (e.body && e.body._isBall) hitBumper(bp, e.body); });
  bumpers.push(bp);
  // register so bumpers follow visual table tilt (syncTableObjects will update body/mesh)
  registerTableObject(body, mesh);
}

// Bumpers form a triangle in the UPPER playfield (negative z, toward the top ramp)
// so the lower/middle of the table stays clear for the ball to flow to the flippers.
createBumper(-1.8, -2.2, 0.6, 100, 0xff2a6d, 0xff0055);
createBumper( 1.8, -2.2, 0.6, 100, 0x05d9e8, 0x00b4d8);
createBumper( 0.0, -3.8, 0.6, 150, 0xffbe0b, 0xfb5607);

// Corner kickers: if the ball wanders into a dead top corner, fire it back toward
// the lower-centre (with random spread) plus points + FX, so corners aren't boring.
const KICKER_RADIUS = 1.5;
const KICKER_POP = 16;
const KICKER_SPREAD = 0.5; // max launch-angle jitter (radians, ~29 deg)
const kickers = [
  { x: -(tableSize.w / 2 + 0.2), z: -tableSize.h / 2 + 1.6, points: 250, flash: 0 },
  { x:  (tableSize.w / 2 + 0.2), z: -tableSize.h / 2 + 1.6, points: 250, flash: 0 },
];
for (const K of kickers) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x00f5d4,
    emissive: 0x00bbf9,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.75,
    roughness: 0.3,
    metalness: 0.5
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(KICKER_RADIUS * 0.7, KICKER_RADIUS * 0.7, 0.12, 32), mat);
  mesh.position.set(K.x, bedY + 0.07, K.z);
  mesh.receiveShadow = true;
  tableGroup.add(mesh);
  K.mesh = mesh; K.mat = mat;
}

// Launch velocity for a kicker: aimed at the lower-centre with a random angle/power.
function kickerLaunchVelocity(K) {
  let bx = 0 - K.x, bz = 2 - K.z; const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
  const jitter = (Math.random() - 0.5) * 2 * KICKER_SPREAD; // random launch angle
  const cs = Math.cos(jitter), sn = Math.sin(jitter);
  const rx = bx * cs - bz * sn, rz = bx * sn + bz * cs;
  const pop = KICKER_POP * (0.85 + Math.random() * 0.3); // slight random power
  return { x: rx * pop, y: 0, z: rz * pop };
}

// =============================================================================
// PHASE 5: 3-BANK DROP TARGETS (LEFT PLAYFIELD)
// =============================================================================
const dropTargets = [];
const DROP_TARGET_W = 0.22;
const DROP_TARGET_H = 0.75;
const DROP_TARGET_L = 0.65;
const DROP_TARGET_CONFIGS = [
  { x: -3.15, z: -0.75, id: 0, color: 0xffbe0b, points: 250 },
  { x: -3.15, z:  0.05, id: 1, color: 0xffbe0b, points: 250 },
  { x: -3.15, z:  0.85, id: 2, color: 0xffbe0b, points: 250 },
];

function createDropTargetBank() {
  const upY = bedY + DROP_TARGET_H / 2;
  const downY = bedY - DROP_TARGET_H / 2 - 0.05;

  for (const cfg of DROP_TARGET_CONFIGS) {
    const geo = new THREE.BoxGeometry(DROP_TARGET_W, DROP_TARGET_H, DROP_TARGET_L);
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: 0xff8800,
      emissiveIntensity: 0.45,
      metalness: 0.35,
      roughness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cfg.x, upY, cfg.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    tableGroup.add(mesh);

    // Physics body
    const shape = new CANNON.Box(new CANNON.Vec3(DROP_TARGET_W/2, DROP_TARGET_H/2, DROP_TARGET_L/2));
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(shape);
    body.position.set(cfg.x, upY, cfg.z);
    body.material = bumperMaterial;
    world.addBody(body);

    const dt = {
      cfg, mesh, mat, body,
      upY, downY,
      isDown: false,
      animY: upY,
      flash: 0,
    };

    body.addEventListener('collide', (e) => {
      if (e.body && e.body._isBall) hitDropTarget(dt, e.body);
    });

    dropTargets.push(dt);
    registerTableObject(body, mesh);
  }
}
createDropTargetBank();

function hitDropTarget(dt, ball) {
  if (dt.isDown) return;
  dt.isDown = true;
  dt.flash = 1;
  
  // Disable physics body so ball glides past
  dt.body.collisionResponse = false;
  dt.body.position.y = dt.downY;

  // SFX & Haptics
  AudioFX.playDropTargetHit();
  Haptic.vibrate(24);

  // Score & FX
  updateScore(dt.cfg.points);
  showScorePopup(dt.cfg.x, bedY + 0.6, dt.cfg.z, dt.cfg.points);
  triggerScreenFlash(0.12);
  spawnSparks(dt.cfg.x, bedY + 0.4, dt.cfg.z, 0xffbe0b, 16, 1.1);

  // Check if bank cleared!
  if (dropTargets.every(t => t.isDown)) {
    setTimeout(() => {
      onDropTargetBankCleared();
    }, 150);
  }
}

function onDropTargetBankCleared() {
  const bonus = 2000;
  updateScore(bonus);
  showScorePopup(-3.15, bedY + 1.0, 0.05, `🎯 TARGETS CLEARED! +${bonus}`);
  triggerScreenFlash(0.25);
  Haptic.saved();
  AudioFX.playMultiplierUpFanfare();

  // Reset bank after 1.2s
  setTimeout(() => {
    resetDropTargetBank();
  }, 1200);
}

function resetDropTargetBank() {
  AudioFX.playBankReset();
  Haptic.vibrate(18);
  for (const dt of dropTargets) {
    dt.isDown = false;
    dt.body.collisionResponse = true;
    dt.body.position.y = dt.upY;
    dt.flash = 0.8;
  }
}

// =============================================================================
// PHASE 5: TOP ROLLOVER LANES (A - B - C) & LANE CHANGE
// =============================================================================
let bonusMultiplier = 1; // Playfield Bonus Multiplier (1x -> 2x -> 3x -> 4x -> 5x)
const bonusMultiplierEl = document.createElement('div');
bonusMultiplierEl.id = 'bonus-multiplier-badge';
bonusMultiplierEl.style.display = 'none';
bonusMultiplierEl.innerHTML = '⭐ BONUS <span id="multiplier-val">×1</span>';
Object.assign(bonusMultiplierEl.style, {
  padding: '4px 10px',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: '800',
  color: '#ffbe0b',
  background: 'rgba(255,190,11,0.12)',
  border: '1px solid rgba(255,190,11,0.4)',
  boxShadow: '0 0 12px rgba(255,190,11,0.25)'
});
const uiEl = document.getElementById('ui');
if (uiEl) uiEl.insertBefore(bonusMultiplierEl, document.getElementById('controls-row'));

function updateBonusMultiplierUI() {
  if (!bonusMultiplierEl) return;
  if (bonusMultiplier > 1 && !gameOver) {
    bonusMultiplierEl.style.display = 'inline-flex';
    const valEl = document.getElementById('multiplier-val');
    if (valEl) valEl.textContent = `×${bonusMultiplier}`;
  } else {
    bonusMultiplierEl.style.display = 'none';
  }
}

const rolloverLanes = [
  { label: 'A', x: -1.2, z: -4.95, lit: false, flash: 0, mesh: null, mat: null },
  { label: 'B', x:  0.0, z: -4.95, lit: false, flash: 0, mesh: null, mat: null },
  { label: 'C', x:  1.2, z: -4.95, lit: false, flash: 0, mesh: null, mat: null },
];

function createTopRolloverLanes() {
  const laneY = bedY + 0.02;

  // 1. Lane divider walls (metal guides between A/B and B/C)
  const dividerH = 0.9;
  const dividerL = 1.6;
  const dividerThick = 0.16;
  const dividerY = bedY + dividerH / 2;
  [-0.6, 0.6].forEach(divX => {
    addWall(
      { x: divX, y: dividerY, z: -4.95 },
      { x: 0, y: 0, z: 0 },
      { x: dividerThick, y: dividerH, z: dividerL },
      { color: 0x556677, metalness: 0.8, roughness: 0.25, emissive: 0x112233, emissiveIntensity: 0.3 }
    );
  });

  // 2. Rollover Indicator Pads (Ground Neon Rings)
  rolloverLanes.forEach((lane) => {
    const padGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.04, 24);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x004455,
      emissive: 0x003344,
      emissiveIntensity: 0.2, // dim when unlit
      metalness: 0.4,
      roughness: 0.3,
    });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.set(lane.x, laneY, lane.z);
    padMesh.receiveShadow = true;
    tableGroup.add(padMesh);
    lane.mesh = padMesh;
    lane.mat = padMat;
  });
}
createTopRolloverLanes();

// Lane Change: shift lit lights when flipper engaged
function shiftLaneLights(direction = 'right') {
  if (rolloverLanes.length < 2) return;
  if (direction === 'right') {
    const last = rolloverLanes[rolloverLanes.length - 1].lit;
    for (let i = rolloverLanes.length - 1; i > 0; i--) {
      rolloverLanes[i].lit = rolloverLanes[i - 1].lit;
    }
    rolloverLanes[0].lit = last;
  } else {
    const first = rolloverLanes[0].lit;
    for (let i = 0; i < rolloverLanes.length - 1; i++) {
      rolloverLanes[i].lit = rolloverLanes[i + 1].lit;
    }
    rolloverLanes[rolloverLanes.length - 1].lit = first;
  }
}

function checkRolloverLanes(ball) {
  if (!ball) return;
  const bz = ball.position.z;
  const bx = ball.position.x;
  if (bz > -5.7 && bz < -4.2) {
    rolloverLanes.forEach((lane, idx) => {
      if (Math.abs(bx - lane.x) < 0.42) {
        ball._laneHitAt = ball._laneHitAt || {};
        const now = performance.now();
        if (now - (ball._laneHitAt[idx] || 0) > 600) {
          ball._laneHitAt[idx] = now;
          triggerRolloverLane(lane, idx);
        }
      }
    });
  }
}

function triggerRolloverLane(lane, idx) {
  lane.lit = true;
  lane.flash = 1;
  const pts = 150 * bonusMultiplier;
  updateScore(pts);
  showScorePopup(lane.x, bedY + 0.6, lane.z, `[${lane.label}] +${pts}`);
  AudioFX.playRolloverDing(idx);
  Haptic.vibrate(16);
  spawnSparks(lane.x, bedY + 0.2, lane.z, 0x00f5d4, 12, 0.9);

  // Check if all A-B-C lanes are completed!
  if (rolloverLanes.every(l => l.lit)) {
    setTimeout(() => {
      onRolloverLanesCompleted();
    }, 120);
  }
}

function onRolloverLanesCompleted() {
  bonusMultiplier = Math.min(5, bonusMultiplier + 1);
  updateBonusMultiplierUI();
  const bonusPts = 1000 * bonusMultiplier;
  updateScore(bonusPts);
  showScorePopup(0, bedY + 0.8, -4.95, `⭐ MULTIPLIER UP! ×${bonusMultiplier} (+${bonusPts})`);
  triggerScreenFlash(0.2);
  Haptic.saved();
  AudioFX.playMultiplierUpFanfare();

  // Flash lanes and reset
  setTimeout(() => {
    rolloverLanes.forEach(l => {
      l.lit = false;
      l.flash = 0.5;
    });
  }, 1000);
}

// Ball spawn (High metalness chrome ball with soft highlights)
let ballCount = 0;
function spawnBall(pos, vel) {
  const radius = 0.35;
  const sphereGeo = new THREE.SphereGeometry(radius, 32, 24);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0xf0f3f8,
    metalness: 0.95,
    roughness: 0.12,
    emissive: 0x112233,
    emissiveIntensity: 0.2
  });
  const mesh = new THREE.Mesh(sphereGeo, sphereMat);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.scale.set(1,1,1);
  scene.add(mesh);

  const shape = new CANNON.Sphere(radius);
  const body = new CANNON.Body({ mass: 0.9 });
  body.addShape(shape);
  body.position.set(pos.x, pos.y, pos.z);
  if (vel) body.velocity.set(vel.x, vel.y, vel.z);
  body.linearDamping = 0.01;
  body.angularDamping = 0.01;
  body.material = ballMaterial; // use shared ball material

  body._isBall = true; // marker

  body.addEventListener('collide', (e) => {
    try {
      // small sound on collision + debug
      if (e.contact && typeof e.contact.getImpactVelocityAlongNormal === 'function') {
        const vel = e.contact.getImpactVelocityAlongNormal();
        const vol = Math.min(Math.abs(vel)/8, 1);
        playPing(200 + Math.random()*600, 0.04 + Math.random()*0.05);
        if (Math.abs(vel) > 3.0) {
          spawnSparks(body.position.x, body.position.y, body.position.z, 0xffffff, 8, 0.7);
        }
      }
    } catch (err) {
      console.warn('ball collide handler error', err);
    }
  });

  world.addBody(body);
  bodies.push(body);
  meshes.push(mesh);

  ballCount++;

  // Activate Ball Saver protection for all newly entered balls
  ballSaverUntil = performance.now() + BALL_SAVER_DURATION;
  updateBallSaverUI(performance.now());

  return body;
}

function clearBalls() {
  for (const b of bodies) {
    try { world.removeBody(b); } catch (e) {}
  }
  bodies.length = 0;
  for (const m of meshes) try { scene.remove(m); } catch (e) {}
  meshes.length = 0;
  ballCount = 0;
}

// Drop the ball into the upper playfield (just below the top ramp) so it rolls
// down through the bumpers toward the flippers, instead of appearing dead-centre.
function spawnAtCenter() {
  // one ball in play at a time (a new ball is launched only after the current one drains)
  if (gameOver || ballsLeft <= 0 || bodies.length > 0) return;
  // Serve: launch the ball from a random top-corner kicker (random angle), no score.
  const ki = Math.random() < 0.5 ? 0 : 1;
  const K = kickers[ki];
  const body = spawnBall({ x: K.x, y: bedY + 0.4, z: K.z }, kickerLaunchVelocity(K));
  // suppress the kicker's scoring for this serve (ball starts inside the kicker zone)
  if (body) { body._kickerAt = {}; body._kickerAt[ki] = performance.now(); }
  K.flash = 1;
  spawnSparks(K.x, bedY + 0.2, K.z, 0x00f5d4, 20, 1.2);
  playPing(300 + Math.random() * 120, 0.1);

  // Activate Ball Saver protection window
  ballSaverUntil = performance.now() + BALL_SAVER_DURATION;
}

// Raycaster for pointer spawn onto floorMesh (prefer object intersection to plane)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Flippers — kinematic bodies that swing horizontally around the vertical (Y) axis.
const flippers = [];
function createFlipper(side='left') {
  const isLeft = side === 'left';
  // flipper blade geometry: lengthened for richer control & wider coverage
  const length = 2.32;
  const thickness = 0.45;
  const height = 0.9; // tall enough to cover the whole ball so hits push it sideways, not up

  // pivot sits near the bottom side edge; the blade extends toward the table centre
  const pivotX = isLeft ? -2.65 : 2.65;
  const pivotZ = tableSize.h/2 - 0.9;
  const pivotY = bedY + height/2; // blade bottom rests flush on the bed surface

  // offset from the pivot (= body origin) to the centre of the blade box
  const shapeOffset = new CANNON.Vec3(isLeft ? length/2 : -length/2, 0, 0);

  // Visual mesh: translate the box geometry so the pivot end sits at the local origin,
  // then the mesh transform can share the physics body's position/quaternion directly.
  const geo = new THREE.BoxGeometry(length, height, thickness);
  geo.translate(shapeOffset.x, shapeOffset.y, shapeOffset.z);
  const mat = new THREE.MeshStandardMaterial({
    color: isLeft ? 0x00e5ff : 0xffbe0b,
    metalness: 0.55,
    roughness: 0.35,
    emissive: isLeft ? 0x007799 : 0x996600,
    emissiveIntensity: 0.35
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pivotX, pivotY, pivotZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Kinematic physics body: used for transform tracking and sensor events
  // collisionResponse is set to false so Cannon's discrete solver doesn't counter-eject
  // balls downward during fast swept penetration. Collision is 100% cleanly resolved
  // by our continuous geometric resolver!
  const shape = new CANNON.Box(new CANNON.Vec3(length/2, height/2, thickness/2));
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
  body.collisionResponse = false; // disable discrete solver interference
  body.addShape(shape, shapeOffset);
  body.position.set(pivotX, pivotY, pivotZ);
  body.material = bumperMaterial;
  world.addBody(body);

  // Rest / engaged angles around the Y axis (radians)
  const restAngle = isLeft ? -0.58 : 0.58;
  const upAngle   = isLeft ?  0.52 : -0.52;

  // apply the rest orientation immediately (body + visual)
  const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), restAngle);
  body.quaternion.set(q0.x, q0.y, q0.z, q0.w);
  mesh.quaternion.copy(q0);

  const state = {
    body, mesh, side, shapeOffset,
    restAngle, upAngle,
    angle: restAngle, targetAngle: restAngle,
    baseSpeed: 12,    // initial start speed (rad/s) for quick tap
    maxSpeed: 30,     // full power speed (rad/s) for firm press
    angularSpeed: 24, // current dynamic sweep speed
    pressTime: 0,     // timestamp when flipper was engaged
    engaged: false,
    hingeVisualOffset: 0,
    bladeLen: length,          // physics blade length (for the predictive resolver)
    halfThick: thickness / 2,  // physics blade half-thickness
  };

  // assist impulse while the flipper is actively swinging (helps counter tunneling)
  body.addEventListener && body.addEventListener('collide', (e) => {
    try {
      if (e.body && e.body._isBall && state.engaged) {
        const ball = e.body;
        const contact = e.contact || null;
        let nx = 0, ny = 0, nz = -1;
        if (contact && contact.ni) { nx = contact.ni.x; ny = contact.ni.y; nz = contact.ni.z; }
        const impMag = Math.min(14, 8 + Math.abs(state.angularSpeed) * 0.3);
        const imp = new CANNON.Vec3(nx * impMag, Math.max(0, ny) * impMag * 0.3, nz * impMag);
        if (ball.applyImpulse) ball.applyImpulse(imp, ball.position);
        playPing(420 + Math.random()*120, 0.04);
      }
    } catch (err) { console.warn('flipper collision helper error', err); }
  });

  flippers.push(state);
}

createFlipper('left');
createFlipper('right');

// Developer overlays (angle readout + hinge tuner) are hidden by default.
// Append ?debug (or ?debug=1) to the URL to show them.
const DEBUG_UI = new URLSearchParams(window.location.search).has('debug');

// Debug overlay: show flipper hinge angles and states (helpful during development)
const debugEl = document.createElement('div');
debugEl.id = 'debug-angles';
// use fixed so it's always visible above the canvas and not affected by the container stacking context
debugEl.style.position = 'fixed';
debugEl.style.right = '12px';
debugEl.style.top = '36px';
debugEl.style.zIndex = 99999;
debugEl.style.pointerEvents = 'none'; // don't block touches/clicks
debugEl.style.padding = '6px 10px';
debugEl.style.background = 'rgba(0,0,0,0.55)';
debugEl.style.color = '#9fd';
debugEl.style.fontSize = '12px';
debugEl.style.borderRadius = '6px';
debugEl.style.fontFamily = 'monospace';
debugEl.style.whiteSpace = 'pre';
debugEl.innerText = 'flipper debug...';
// append to body so it's visually above the renderer canvas (dev-only)
if (DEBUG_UI && document && document.body) document.body.appendChild(debugEl);

let _lastDebug = 0;
function updateDebug(now) {
  if (!debugEl) return;
  if (now - _lastDebug < 150) return; // throttle updates to ~150ms
  _lastDebug = now;
  const lines = [];
  for (const f of flippers) {
    try {
      let ang = 0;
      let showVis = null;
      if (f.hinge && typeof f.hinge.getAngle === 'function') {
        ang = f.hinge.getAngle();
        // ang is physical angle; compute visual angle = phys + offset
        showVis = ang + (f.hingeVisualOffset || 0);
      } else if (typeof f.angle === 'number') {
        ang = f.angle;
        showVis = ang + (f.hingeVisualOffset || 0);
      }
      const degPhys = (ang * 180 / Math.PI).toFixed(1);
      const degVis = (showVis * 180 / Math.PI).toFixed(1);
      const pivotPos = f.pivot ? `${f.pivot.position.x.toFixed(2)},${f.pivot.position.y.toFixed(2)},${f.pivot.position.z.toFixed(2)}` : 'n/a';
      const bodyPos = f.body ? `${f.body.position.x.toFixed(2)},${f.body.position.y.toFixed(2)},${f.body.position.z.toFixed(2)}` : 'n/a';
      const meshPos = f.mesh ? `${f.mesh.position.x.toFixed(2)},${f.mesh.position.y.toFixed(2)},${f.mesh.position.z.toFixed(2)}` : 'n/a';
      const hingeMotor = f.hinge && typeof f.hinge.enableMotor === 'function' ? (f.hinge.motorEnabled ? 'on' : 'off') : 'n/a';
      lines.push(`${f.side}: phys ${degPhys}° vis ${degVis}° ${f.engaged? 'ENG':'   '} | pivot ${pivotPos} | body ${bodyPos} | mesh ${meshPos} | motor ${hingeMotor}`);
    } catch (e) { lines.push(`${f.side}: err`); }
  }
  debugEl.innerText = lines.join('\n');
}

// hook debug updater to animation frame
(function attachDebugLoop(){
  const obs = (t)=>{ updateDebug(t); requestAnimationFrame(obs); };
  requestAnimationFrame(obs);
})();

// Angled funnel (outlane) walls: guide balls from the side rails down toward the
// flippers so they don't drain in the open outer bottom corners.
(function addFlipperFunnels(){
  const funnelHeight = 1.5;
  const funnelThickness = 0.3;
  const y = bedY + funnelHeight/2;
  const railInner = tableSize.w/2 + 0.5; // just inside the side rail (rail centre 4.75)
  // Add a thin wall between two points on the bed, rotated around Y to line up.
  function addAngledWall(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const angleY = Math.atan2(-dz, dx); // align the box's local X axis with (dx, dz)
    addWall({ x: cx, y, z: cz }, { x: 0, y: angleY, z: 0 }, { x: len, y: funnelHeight, z: funnelThickness }, { color: 0x445566 });
  }
  addAngledWall( railInner, 2.3,  2.65, 5.2); // right funnel -> right flipper pivot
  addAngledWall(-railInner, 2.3, -2.65, 5.2); // left funnel  -> left flipper pivot
})();

function setFlipper(side, engaged) {
  const f = flippers.find(ff => ff.side === side);
  if (!f) return;
  const wasEngaged = f.engaged;
  f.engaged = !!engaged;
  f.targetAngle = engaged ? f.upAngle : f.restAngle;
  if (engaged && !wasEngaged) {
    f.pressTime = performance.now();
    f.angularSpeed = f.baseSpeed || 12;
    AudioFX.playFlipperClack(side);
    Haptic.flipper();
    shiftLaneLights(side === 'left' ? 'left' : 'right');
  } else if (!engaged && wasEngaged) {
    // Quick snappy release return
    f.angularSpeed = 24;
  }
}

// Controls: keyboard
window.addEventListener('keydown', (e)=>{
  if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setFlipper('left', true);
  if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') setFlipper('right', true);
  if (e.code === 'Space') spawnAtCenter();
});
window.addEventListener('keyup', (e)=>{
  if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setFlipper('left', false);
  if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') setFlipper('right', false);
});

// Dedicated Touch Buttons (Bottom UI)
const leftBtn = document.getElementById('left-flip');
const rightBtn = document.getElementById('right-flip');
if (leftBtn) {
  leftBtn.addEventListener('pointerdown', (e)=> { e.stopPropagation(); setFlipper('left', true); });
  leftBtn.addEventListener('pointerup',   (e)=> { e.stopPropagation(); setFlipper('left', false); });
  leftBtn.addEventListener('pointercancel', (e)=> { e.stopPropagation(); setFlipper('left', false); });
}
if (rightBtn) {
  rightBtn.addEventListener('pointerdown', (e)=> { e.stopPropagation(); setFlipper('right', true); });
  rightBtn.addEventListener('pointerup',   (e)=> { e.stopPropagation(); setFlipper('right', false); });
  rightBtn.addEventListener('pointercancel', (e)=> { e.stopPropagation(); setFlipper('right', false); });
}

// --- Full-Screen Split Multi-Touch Controls (Mobile / Tablet) ---
// Touching/holding anywhere on the left half of the screen drives the left flipper;
// touching/holding on the right half drives the right flipper.
const activeTouches = new Map(); // pointerId -> 'left' | 'right'

function updateFlipperTouchState() {
  let hasLeft = false;
  let hasRight = false;
  for (const side of activeTouches.values()) {
    if (side === 'left') hasLeft = true;
    if (side === 'right') hasRight = true;
  }
  setFlipper('left', hasLeft);
  setFlipper('right', hasRight);
}

window.addEventListener('pointerdown', (e) => {
  // Ignore clicks on UI elements (buttons, inputs, menus, version badge, etc.)
  const target = e.target;
  if (target && target.closest('button, input, select, label, summary, details, a, #version, #score, .flip-btn')) return;
  // Ignore top controls header (top 60px)
  if (e.clientY < 60) return;

  // If no ball in play, tap anywhere to launch a new ball
  if (bodies.length === 0 && !gameOver && ballsLeft > 0) {
    spawnAtCenter();
    return;
  }

  // Split screen touch
  const side = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
  activeTouches.set(e.pointerId, side);
  updateFlipperTouchState();
});

window.addEventListener('pointermove', (e) => {
  if (!activeTouches.has(e.pointerId)) return;
  const newSide = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
  if (activeTouches.get(e.pointerId) !== newSide) {
    activeTouches.set(e.pointerId, newSide);
    updateFlipperTouchState();
  }
});

window.addEventListener('pointerup', (e) => {
  if (activeTouches.has(e.pointerId)) {
    activeTouches.delete(e.pointerId);
    updateFlipperTouchState();
  }
});

window.addEventListener('pointercancel', (e) => {
  if (activeTouches.has(e.pointerId)) {
    activeTouches.delete(e.pointerId);
    updateFlipperTouchState();
  }
});

// UI
const spawnBtn = document.getElementById('spawn');
if (spawnBtn) spawnBtn.addEventListener('click', ()=> spawnAtCenter());
const clearBtn = document.getElementById('clear');
if (clearBtn) clearBtn.addEventListener('click', ()=> clearBalls());
const orbitToggle = document.getElementById('orbit');
if (orbitToggle) {
  orbitToggle.checked = false;
  orbitToggle.addEventListener('change', (e)=> { 
    controls.enabled = !!orbitToggle.checked;
    if (!visualsTiltEnabled) tableGroup.rotation.set(0,0,0);
  });
}

// Device orientation -> gravity
function handleOrientation(event) {
  const gamma = event.gamma || 0; // left-right
  const beta = event.beta || 0; // front-back
  const gx = Math.sin(gamma * Math.PI/180) * 9.82;
  const gz = Math.sin(beta * Math.PI/180) * 9.82;
  // keep the base table incline so the ball still rolls toward the flippers
  world.gravity.set(gx, -9.82, gz + TABLE_INCLINE_G);

  // update debug status and timestamp
  lastMotionTs = performance.now();
  try { updateMotionStatus(`β:${beta.toFixed(1)}° γ:${gamma.toFixed(1)}°`); } catch (e) {}

  // visually tilt the table to match device orientation (scaled down so it's pleasant)
  if (visualsTiltEnabled && typeof tableGroup !== 'undefined') {
    const betaRad = THREE.MathUtils.degToRad(beta);
    const gammaRad = THREE.MathUtils.degToRad(gamma);
    // apply a damping factor so visuals don't exactly match physics but give user a sense of tilt
    tableGroup.rotation.x = -betaRad * 0.55; // front-back
    tableGroup.rotation.z = -gammaRad * 0.55; // left-right
  }

  console.debug('DeviceOrientation', { beta, gamma, gx, gz });
}

const motionStatusEl = document.getElementById('motion-status');
const motionDiagEl = document.getElementById('motion-diagnostics');
let lastMotionTs = 0;
let simulateTilt = false;
let simulateTick = 0;
let visualsTiltEnabled = false; // default: visual table tilt disabled (user requested)

function updateMotionStatus(text) {
  try { if (motionStatusEl) motionStatusEl.textContent = `Motion: ${text}`; } catch (e) {}
}
function updateDiagnostics(text) {
  try { if (motionDiagEl) motionDiagEl.textContent = `diag: ${text}`; } catch (e) {}
}
function detectMotionAPIs() {
  const hasDO = typeof DeviceOrientationEvent !== 'undefined';
  const hasDM = typeof DeviceMotionEvent !== 'undefined';
  const reqDO = hasDO && typeof DeviceOrientationEvent.requestPermission === 'function';
  const reqDM = hasDM && typeof DeviceMotionEvent.requestPermission === 'function';
  return `DO:${hasDO}? req:${!!reqDO} | DM:${hasDM}? req:${!!reqDM}`;
}

async function enableMotionIfNeeded() {
  updateMotionStatus('requesting...');
  // On iOS Safari the permission API is on DeviceOrientationEvent.requestPermission
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res === 'granted') {
        window.addEventListener('deviceorientation', handleOrientation);
        updateMotionStatus('enabled (DeviceOrientationEvent granted)');
        console.debug('DeviceOrientation permission granted (DeviceOrientationEvent).');
        return;
      } else {
        updateMotionStatus('denied');
        console.warn('DeviceOrientation permission not granted:', res);
      }
    }
  } catch (err) {
    console.warn('DeviceOrientation permission request failed:', err);
  }

  // Fallback: DeviceMotionEvent.requestPermission
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const res = await DeviceMotionEvent.requestPermission();
      if (res === 'granted') {
        window.addEventListener('deviceorientation', handleOrientation);
        updateMotionStatus('enabled (DeviceMotionEvent granted)');
        console.debug('DeviceOrientation enabled via DeviceMotionEvent.requestPermission fallback.');
        return;
      } else {
        updateMotionStatus('denied');
        console.warn('DeviceMotion permission not granted:', res);
      }
    }
  } catch (err) {
    console.warn('DeviceMotion permission request failed:', err);
  }

  // Default: non-iOS browsers typically don't require a permission prompt for deviceorientation
  if (typeof window !== 'undefined') {
    window.addEventListener('deviceorientation', handleOrientation);
    // also listen to devicemotion as an alternate
    window.addEventListener('devicemotion', handleMotion);
    updateMotionStatus('listener attached');
    updateDiagnostics(detectMotionAPIs());
    console.debug('DeviceOrientation listener attached without explicit permission.');
  }
}

// If deviceorientation isn't available on some Android browsers, we'll try to derive gravity from devicemotion
function handleMotion(event) {
  lastMotionTs = performance.now();
  try { updateMotionStatus('devicemotion'); } catch (e) {}

  const a = event.accelerationIncludingGravity;
  if (!a || typeof a.x !== 'number') return;

  // build vector and scale to gravity magnitude (approx)
  const ax = a.x || 0;
  const ay = a.y || 0;
  const az = a.z || 0;
  // compute vector length
  const len = Math.hypot(ax, ay, az) || 1;
  const scale = 9.82 / len;
  // map device axes to world: approximate mapping (may vary by device/orientation)
  // assume device X -> world X, device Y -> world Z (forward), and device Z -> up
  const gx = ax * scale;
  const gz = ay * scale;
  // keep the base table incline so the ball still rolls toward the flippers
  world.gravity.set(gx, -9.82, gz + TABLE_INCLINE_G);

  updateDiagnostics(detectMotionAPIs() + ` | a:${ax.toFixed(2)},${ay.toFixed(2)},${az.toFixed(2)}`);
  console.debug('DeviceMotion derived gravity', { ax, ay, az, gx, gz });
}

// also provide a manual Enable Motion button (helps testing)
const enableBtn = document.getElementById('enable-motion');
if (enableBtn) {
  enableBtn.addEventListener('click', (e) => { enableMotionIfNeeded().catch(err=>console.warn(err)); });
}
const simBtn = document.getElementById('simulate-tilt');
if (simBtn) {
  simBtn.addEventListener('click', ()=>{ simulateTilt = !simulateTilt; updateMotionStatus(simulateTilt ? 'simulating tilt' : 'simulation off'); });
}

// Try to enable on any user interaction (some browsers require a user gesture for permission popups)
window.addEventListener('click', enableMotionIfNeeded, { once: true });

// show warning if no motion events after a short while
setInterval(()=>{
  if (!motionStatusEl) return;
  const now = performance.now();
  if (lastMotionTs && now - lastMotionTs > 3000) {
    updateMotionStatus('no recent motion events');
  }
}, 1500);

// Global error handler to surface runtime issues to the UI (helps Android debugging)
window.addEventListener('error', (ev) => {
  console.error('Window error', ev.error || ev.message);
  try { if (motionStatusEl) motionStatusEl.textContent = `Motion: error`; } catch (e) {}
});

window.addEventListener('unhandledrejection', (ev) => {
  console.error('Unhandled promise rejection', ev.reason);
  try { if (motionStatusEl) motionStatusEl.textContent = `Motion: error`; } catch (e) {}
});

// Resize
window.addEventListener('resize', ()=> {
  renderer.setSize(window.innerWidth, window.innerHeight);
  fitCamera();
});

// --- Visual feedback: floating score popups + brief screen flash ---
const fxLayer = document.createElement('div');
Object.assign(fxLayer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', overflow: 'hidden', zIndex: 40 });
if (document.body) document.body.appendChild(fxLayer);

const flashEl = document.createElement('div');
Object.assign(flashEl.style, { position: 'fixed', inset: '0', pointerEvents: 'none', background: '#fff', opacity: '0', zIndex: 39 });
if (document.body) document.body.appendChild(flashEl);

function triggerScreenFlash(strength = 0.1) {
  flashEl.style.transition = 'none';
  flashEl.style.opacity = String(Math.min(0.18, strength));
  void flashEl.offsetWidth; // force reflow so the fade-out animates
  flashEl.style.transition = 'opacity 260ms ease-out';
  flashEl.style.opacity = '0';
}

const _fxProj = new THREE.Vector3();
function showScorePopup(wx, wy, wz, points) {
  _fxProj.set(wx, wy, wz).project(camera);
  if (_fxProj.z > 1) return; // behind the camera
  const rect = renderer.domElement.getBoundingClientRect();
  const x = rect.left + (_fxProj.x * 0.5 + 0.5) * rect.width;
  const y = rect.top + (-_fxProj.y * 0.5 + 0.5) * rect.height;
  const el = document.createElement('div');
  el.textContent = '+' + points;
  Object.assign(el.style, {
    position: 'absolute', left: x + 'px', top: y + 'px',
    transform: 'translate(-50%, -50%)', color: '#ffd66b',
    font: '700 22px system-ui, sans-serif', textShadow: '0 2px 6px rgba(0,0,0,0.6)',
    transition: 'transform 700ms ease-out, opacity 700ms ease-out', opacity: '1',
  });
  fxLayer.appendChild(el);
  void el.offsetWidth;
  el.style.transform = 'translate(-50%, -170%)';
  el.style.opacity = '0';
  setTimeout(() => { try { fxLayer.removeChild(el); } catch (e) {} }, 760);
}

// --- Game structure: balls (lives) HUD, drain handling, game over, high score ---
const scoreRow = scoreEl ? scoreEl.parentNode : null;
const ballsEl = document.createElement('div');
ballsEl.id = 'balls';
Object.assign(ballsEl.style, { fontWeight: '700', padding: '6px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' });
const highEl = document.createElement('div');
highEl.id = 'high';
Object.assign(highEl.style, { fontWeight: '700', padding: '6px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' });
if (scoreRow && scoreEl) { scoreRow.insertBefore(ballsEl, scoreEl.nextSibling); scoreRow.insertBefore(highEl, ballsEl.nextSibling); }
function updateBallsUI() { if (ballsEl) ballsEl.textContent = `Balls: ${ballsLeft}`; }
function updateHighUI() { if (highEl) highEl.textContent = `High: ${highScore}`; }
updateBallsUI();
updateHighUI();

// Big centred celebratory banner (used for bonus-ball milestones)
function showCenterBanner(text) {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, { position: 'fixed', left: '50%', top: '40%', transform: 'translate(-50%, -50%) scale(0.8)', color: '#ffe08a', font: '800 32px system-ui, sans-serif', textShadow: '0 3px 12px rgba(0,0,0,0.7)', pointerEvents: 'none', zIndex: 50, transition: 'transform 500ms ease-out, opacity 900ms ease-out', opacity: '1' });
  (typeof fxLayer !== 'undefined' && fxLayer ? fxLayer : document.body).appendChild(el);
  void el.offsetWidth;
  el.style.transform = 'translate(-50%, -90%) scale(1.12)';
  el.style.opacity = '0';
  setTimeout(() => { try { el.remove(); } catch (e) {} }, 950);
}
function awardBonusBall() {
  ballsLeft += 1;
  updateBallsUI();
  playPing(880, 0.16); playPing(1320, 0.16);
  triggerScreenFlash(0.16);
  showCenterBanner('BONUS BALL!  +1');
}

// Combo multiplier HUD + bumper scoring that applies the current multiplier.
const comboEl = document.createElement('div');
comboEl.id = 'combo';
Object.assign(comboEl.style, { fontWeight: '800', padding: '6px 10px', background: 'rgba(255,140,40,0.18)', color: '#ffb347', borderRadius: '8px', display: 'none' });
if (scoreRow && highEl) scoreRow.insertBefore(comboEl, highEl.nextSibling);
function updateComboUI(n) {
  if (!comboEl) return;
  if (n > 1) { comboEl.textContent = `Combo ×${n}`; comboEl.style.display = ''; }
  else { comboEl.style.display = 'none'; }
}
function bumperScore(bp) {
  const now = performance.now();
  combo = (now - lastComboAt <= COMBO_WINDOW_MS) ? combo + 1 : 1;
  lastComboAt = now;
  if (combo > maxComboThisGame) maxComboThisGame = combo; // track the raw (uncapped) combo
  updateComboUI(combo); // show the raw combo count — no display cap, chase a high number
  const mult = Math.min(combo, COMBO_MAX); // score multiplier is capped so points don't inflate
  const gained = bp.points * mult;
  updateScore(gained);
  bp.flash = 1;
  showScorePopup(bp.body.position.x, bedY + 0.6, bp.body.position.z, gained);
  triggerScreenFlash(Math.min(0.2, 0.05 + gained / 3000));
  const baseFreq = bp.points >= 150 ? 920 : (bp.points >= 100 ? 780 : 660);
  AudioFX.playBumperChime(baseFreq, mult);
  return mult;
}
// Handle a bumper hit: debounce, score (combo), and kick the ball away with a
// speed that scales with the combo so higher combos send the ball faster.
function hitBumper(bp, ball) {
  const now = performance.now();
  ball._bumperHitAt = ball._bumperHitAt || {};
  if (now - (ball._bumperHitAt[bp.body.id] || 0) <= BUMPER_COOLDOWN_MS) return;
  ball._bumperHitAt[bp.body.id] = now;
  Haptic.bumper();
  const mult = bumperScore(bp);
  const pop = BUMPER_POP + (mult - 1) * 3; // more combo -> stronger kick
  const dx = ball.position.x - bp.body.position.x;
  const dz = ball.position.z - bp.body.position.z;
  const d = Math.hypot(dx, dz) || 1;
  if (ball.applyImpulse) ball.applyImpulse(new CANNON.Vec3((dx / d) * pop, 0, (dz / d) * pop), ball.position);
  // Spawn 3D spark particles on bumper hit
  spawnSparks(bp.body.position.x, bedY + 0.6, bp.body.position.z, bp.baseColor || 0xff0077, 18, 1.3);
}

const gameOverEl = document.createElement('div');
Object.assign(gameOverEl.style, { position: 'fixed', inset: '0', display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', background: 'rgba(0,0,0,0.62)', color: '#fff', zIndex: 60, fontFamily: 'system-ui, sans-serif' });
const goTitle = document.createElement('div');
goTitle.textContent = 'GAME OVER';
Object.assign(goTitle.style, { font: '800 34px system-ui, sans-serif', letterSpacing: '2px' });
const goScore = document.createElement('div');
Object.assign(goScore.style, { fontSize: '18px' });
const newBtn = document.createElement('button');
newBtn.textContent = 'New Game';
Object.assign(newBtn.style, { padding: '10px 20px', borderRadius: '10px', border: '0', background: '#66d9ff', color: '#002', fontWeight: '700', fontSize: '16px', cursor: 'pointer' });
gameOverEl.append(goTitle, goScore, newBtn);
if (document.body) document.body.appendChild(gameOverEl);
newBtn.addEventListener('click', newGame);

// --- Ball Saver Protection System ---
const BALL_SAVER_DURATION = 5000; // 5 seconds of launch protection
let ballSaverUntil = 0;
const ballSaverBadge = document.getElementById('ball-saver-badge');
const ballSaverTimer = document.getElementById('ball-saver-timer');
const ballSavedBanner = document.getElementById('ball-saved-banner');

function updateBallSaverUI(now) {
  if (!ballSaverBadge) return;
  const remaining = ballSaverUntil - now;
  if (remaining > 0 && bodies.length > 0 && !gameOver) {
    const sec = Math.ceil(remaining / 1000);
    ballSaverBadge.style.display = 'inline-flex';
    if (ballSaverTimer) ballSaverTimer.textContent = `${sec}s`;
    if (remaining < 2000) {
      ballSaverBadge.classList.add('pulse');
    } else {
      ballSaverBadge.classList.remove('pulse');
    }
  } else {
    ballSaverBadge.style.display = 'none';
    ballSaverBadge.classList.remove('pulse');
  }
}

let ballSavedBannerTimer = 0;
function showBallSavedBanner() {
  if (!ballSavedBanner) return;
  clearTimeout(ballSavedBannerTimer);
  ballSavedBanner.classList.add('show');
  ballSavedBannerTimer = setTimeout(() => {
    ballSavedBanner.classList.remove('show');
  }, 1400);
}

function triggerBallSavedEffect() {
  AudioFX.playBallSavedFanfare();
  Haptic.saved();
  showBallSavedBanner();
  triggerScreenFlash(0.2);
  ballSaverUntil = 0; // consumed on this save
  updateBallSaverUI(performance.now());
  setTimeout(() => {
    if (!gameOver && ballsLeft > 0) {
      clearBalls();
      const ki = Math.random() < 0.5 ? 0 : 1;
      const K = kickers[ki];
      const body = spawnBall({ x: K.x, y: bedY + 0.4, z: K.z }, kickerLaunchVelocity(K));
      if (body) { body._kickerAt = {}; body._kickerAt[ki] = performance.now(); }
      K.flash = 1;
      spawnSparks(K.x, bedY + 0.2, K.z, 0x00f5d4, 22, 1.3);
      AudioFX.playLaunchJet();
      Haptic.kicker();
    }
  }, 400);
}

function onBallDrained() {
  if (gameOver) return;

  // Ball Saver: save ball and free relaunch if drained within protection time
  if (performance.now() < ballSaverUntil) {
    triggerBallSavedEffect();
    return;
  }

  Haptic.drain();
  ballsLeft = Math.max(0, ballsLeft - 1);
  updateBallsUI();
  playPing(150, 0.25); // low "ball lost" tone
  combo = 0; updateComboUI(1);
  if (ballsLeft <= 0) endGame();
}
function endGame() {
  gameOver = true;
  ballSaverUntil = 0;
  updateBallSaverUI(performance.now());
  if (score > highScore) { highScore = score; try { localStorage.setItem('PINBALL_HIGH', String(highScore)); } catch (e) {} }
  updateHighUI();
  goScore.innerHTML = `Score ${score} &nbsp;·&nbsp; High ${highScore}<br>Best Combo ×${Math.max(1, maxComboThisGame)}`;
  gameOverEl.style.display = 'flex';
}
function newGame() {
  clearBalls();
  score = 0;
  if (scoreEl) scoreEl.textContent = 'Score: 0';
  ballsLeft = 3;
  gameOver = false;
  nextBonusIdx = 0;
  combo = 0;
  maxComboThisGame = 0;
  ballSaverUntil = 0;
  updateBallSaverUI(performance.now());
  bonusMultiplier = 1;
  updateBonusMultiplierUI();
  resetDropTargetBank();
  rolloverLanes.forEach(l => { l.lit = false; l.flash = 0; });
  gameOverEl.style.display = 'none';
}

// =============================================================================
// FLIPPER COLLISION SOLVER SOLUTIONS (FOR OBSERVATION & EASY ROLLBACK)
// =============================================================================
// Solution V2 (Current): Point-to-Segment Capsule Swept Resolver + disabled body.collisionResponse
// - Prevents Cannon-es discrete solver reverse-ejection during fast swept penetration.
// - Analytically projects ball to blade centerline and applies radial launch impulse (16~26).
//
// Solution V1 (Legacy): Discrete Cannon.js Kinematic Box + collide event assist impulse.
// - To switch back: change FLIPPER_SOLVER_VERSION = 'v1_discrete_kinematic' and set body.collisionResponse = true in createFlipper().
// =============================================================================
const FLIPPER_SOLVER_VERSION = 'v2_capsule_swept';

// Solution V2 (Active): Bulletproof Point-to-Segment Capsule Swept Flipper Resolver
function resolveFlipperBall_V2(f, b) {
  if (!f || !b) return;

  const isLeft = f.side === 'left';
  const Px = isLeft ? -2.65 : 2.65;
  const Pz = tableSize.h / 2 - 0.9; // 5.1
  const bladeL = 2.32;
  const ballR = 0.35;
  const halfThick = 0.225;
  const reach = halfThick + ballR; // 0.575

  const theta = f.angle;
  const dx = isLeft ? Math.cos(theta) : -Math.cos(theta);
  const dz = isLeft ? -Math.sin(theta) : Math.sin(theta);
  
  // Normal pointing up-table (-Z)
  const nx = -Math.sin(theta);
  const nz = -Math.cos(theta);

  // Ball vector from pivot
  const vx = b.position.x - Px;
  const vz = b.position.z - Pz;

  // Projection along blade (0 to bladeL)
  const along = vx * dx + vz * dz;
  if (along < -ballR * 0.5 || along > bladeL + ballR * 0.8) return;
  const tClamped = Math.max(0, Math.min(1, along / bladeL));

  // Closest point on blade centerline
  const cx = Px + tClamped * dx * bladeL;
  const cz = Pz + tClamped * dz * bladeL;

  // Vector from closest point to ball
  const diffX = b.position.x - cx;
  const diffZ = b.position.z - cz;
  const distN = diffX * nx + diffZ * nz;

  // Determine if actively swinging upward (high angular velocity toward up-angle)
  const angVel = f.angularVel || 0;
  const isActivelySwingingUp = isLeft ? angVel > 1.0 : angVel < -1.0;

  if (isActivelySwingingUp) {
    // Active Swing: Swept volume catch & explosive kick
    if (distN < reach + 0.2 && distN > -2.0) {
      // 1. Project to surface
      b.position.x = cx + nx * (reach + 0.04);
      b.position.z = cz + nz * (reach + 0.04);
      b.position.y = bedY + ballR + 0.005;

      // 2. Progressive kick impulse proportional to hold duration, angular speed & hit radius
      const holdMs = Math.max(0, performance.now() - (f.pressTime || 0));
      const holdRatio = Math.min(1.0, holdMs / 85.0); // 0.0 (quick tap) ~ 1.0 (firm power press)
      const tipFactor = tClamped;

      // Base kick speed: 10.0~18.0 depending on hold duration + up to 6.0~14.0 at the tip
      const baseKick = 10.0 + holdRatio * 8.0;
      const tipBonus = tipFactor * (6.0 + holdRatio * 8.0);
      const kickSpeed = baseKick + tipBonus;

      // Dynamic tangent preservation:
      // Short tap preserves more lateral rolling momentum (feathering / soft pass)
      // Long press forces ball predominantly upward along the normal (power launch)
      const tangentCoeff = 0.55 - holdRatio * 0.35; // 0.55 -> 0.20
      const tangentV = (b.velocity.x * dx + b.velocity.z * dz) * tangentCoeff;
      
      b.velocity.x = nx * kickSpeed + dx * tangentV;
      b.velocity.z = nz * kickSpeed + dz * tangentV;
      b.velocity.y = 0;

      // 3. Effects & Audio scaled to strike power
      const sparkCount = Math.floor(10 + holdRatio * 16);
      spawnSparks(b.position.x, bedY + 0.4, b.position.z, isLeft ? 0x00e5ff : 0xffbe0b, sparkCount, 0.8 + holdRatio * 0.6);
      playPing(380 + holdRatio * 280 + tipFactor * 160, 0.05 + holdRatio * 0.06);
      Haptic.vibrate(Math.floor(10 + holdRatio * 16));
    }
  } else {
    // Static / Held Up / Resting Barrier: Rigid collision constraint with slight bounce
    if (along <= bladeL) {
      // Normal blade side collision
      if (distN < reach && distN > -(reach * 0.85)) {
        b.position.x = cx + nx * reach;
        b.position.z = cz + nz * reach;
        b.position.y = bedY + ballR + 0.005;

        const vn = b.velocity.x * nx + b.velocity.z * nz;
        if (vn < 0) {
          const bounce = 0.25;
          b.velocity.x -= (1 + bounce) * vn * nx;
          b.velocity.z -= (1 + bounce) * vn * nz;
        }
      }
    } else {
      // Rounded Tip Cap collision (radial push outward from tip allowing smooth roll-off into drain)
      const distToTip = Math.hypot(diffX, diffZ);
      if (distToTip < reach && distToTip > 0.001) {
        const nTipX = diffX / distToTip;
        const nTipZ = diffZ / distToTip;
        b.position.x = cx + nTipX * reach;
        b.position.z = cz + nTipZ * reach;
        b.position.y = bedY + ballR + 0.005;

        const vnTip = b.velocity.x * nTipX + b.velocity.z * nTipZ;
        if (vnTip < 0) {
          const bounce = 0.2;
          b.velocity.x -= (1 + bounce) * vnTip * nTipX;
          b.velocity.z -= (1 + bounce) * vnTip * nTipZ;
        }
      }
    }
  }
}

// Solution V1 (Legacy Backup): Simple normal offset resolver
function resolveFlipperBall_V1(f, b) {
  if (!f || !f.body || !b || !f.engaged) return;
  const P = f.body.position;
  const localDir = new CANNON.Vec3(f.side === 'left' ? 1 : -1, 0, 0);
  const D = f.body.quaternion.vmult(localDir);
  const vx = b.position.x - P.x, vz = b.position.z - P.z;
  const along = vx * D.x + vz * D.z;
  const ballR = 0.35;
  if (along < -ballR || along > (f.bladeLen || 2.4) + ballR) return;
  const px = vx - along * D.x, pz = vz - along * D.z;
  if (Math.hypot(px, pz) > (f.halfThick || 0.225) + ballR + 0.06) return;
  let nx = -D.z, nz = D.x;
  if (nz > 0) { nx = -nx; nz = -nz; }
  const reach = (f.halfThick || 0.225) + ballR;
  const signed = px * nx + pz * nz;
  if (signed < reach) {
    const corr = reach - signed;
    b.position.x += nx * corr;
    b.position.z += nz * corr;
    const vn = b.velocity.x * nx + b.velocity.z * nz;
    if (vn < 0) { b.velocity.x -= vn * nx; b.velocity.z -= vn * nz; }
    const target = 10 + (f.angularSpeed || 24) * 0.25;
    const vN = b.velocity.x * nx + b.velocity.z * nz;
    if (vN < target) {
      const add = target - vN;
      b.velocity.x += nx * add;
      b.velocity.z += nz * add;
    }
  }
}

function resolveFlipperBall(f, b) {
  if (FLIPPER_SOLVER_VERSION === 'v1_discrete_kinematic') {
    resolveFlipperBall_V1(f, b);
  } else {
    resolveFlipperBall_V2(f, b);
  }
}

// Animation / physics loop
const timeStep = 1/60;
let lastTime;
function removeBallAtIndex(i) {
  const b = bodies[i];
  const m = meshes[i];
  try { world.removeBody(b); } catch (e) {}
  try { scene.remove(m); } catch (e) {}
  bodies.splice(i,1);
  meshes.splice(i,1);
}

function clampVec3(v, maxLen) {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l > maxLen) {
    v.x *= maxLen / l;
    v.y *= maxLen / l;
    v.z *= maxLen / l;
  }
}

function animate(time) {
  requestAnimationFrame(animate);
  if (simulateTilt && visualsTiltEnabled) {
    simulateTick += 1;
    const s = Math.sin(simulateTick * 0.05);
    tableGroup.rotation.x = -0.2 * s;
    tableGroup.rotation.z = -0.15 * Math.cos(simulateTick * 0.04);
  }

  if (lastTime !== undefined) {
    const dt = Math.min((time - lastTime) / 1000, 0.05);

    // --- Update kinematic flippers BEFORE stepping physics so collisions use correct motion ---
    for (const f of flippers) {
      try {
        if (f.shapeOffset) {
          const cur = f.angle;
          const target = f.targetAngle;

          // Dynamic Angular Acceleration based on hold duration:
          if (f.engaged) {
            const holdMs = Math.max(0, performance.now() - (f.pressTime || 0));
            const chargeRatio = Math.min(1.0, holdMs / 85.0); // ramp up from baseSpeed to maxSpeed in 85ms
            f.angularSpeed = (f.baseSpeed || 12) + chargeRatio * ((f.maxSpeed || 30) - (f.baseSpeed || 12));
          } else {
            f.angularSpeed = 24; // snappy return
          }

          const maxMove = f.angularSpeed * dt;
          const diff = target - cur;
          const newAngle = Math.abs(diff) <= maxMove ? target : cur + Math.sign(diff) * maxMove;
          const angVel = dt > 0 ? (newAngle - cur) / dt : 0;
          // store
          f.prevAngle = cur;
          f.angle = newAngle;
          f.angularVel = angVel;
          // rotate the kinematic body about the vertical (Y) axis and expose its angular
          // velocity so the physics step imparts momentum to any balls it sweeps.
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), f.angle);
          f.body.quaternion.set(q.x, q.y, q.z, q.w);
          f.body.angularVelocity.set(0, angVel, 0);
        }
      } catch (err) { console.warn('pre-step flipper update error', err); }
    }

    // Pre-step resolution: resolve any fast-approaching balls before physical step
    for (const b of bodies) {
      for (const f of flippers) resolveFlipperBall(f, b);
    }

    // If visuals tilt is enabled, sync registered table objects to the current visual tilt
    // BEFORE stepping physics so the physics bodies move consistently with the visuals.
    if (visualsTiltEnabled) {
      try { syncTableObjects(); } catch(e) { console.warn('syncTableObjects pre-step failed', e); }
    }

    // step physics (use maxSubSteps to keep simulation stable on variable frame rates)
    world.step(timeStep, dt, 10);

    // update flipper visuals from physics bodies (or sync kinematic meshes)
    for (const f of flippers) {
      try {
        if (f.shapeOffset) {
          // geometry is translated to the pivot origin, so mesh shares the body transform
          f.mesh.position.copy(f.body.position);
          f.mesh.quaternion.copy(f.body.quaternion);
          continue;
        }

        // sync mesh to body for dynamic/hinged flippers
        if (f.mesh && f.body) {
          f.mesh.position.copy(f.body.position);
          f.mesh.quaternion.copy(f.body.quaternion);
        }

        // if hinge present, check angle and stop motor when target reached
        if (f.hinge && typeof f.hinge.getAngle === 'function') {
          // hinge.getAngle() returns physical angle; account for visual offset when checking target
          const ang = f.hinge.getAngle();
          const targetVis = f.engaged ? f.upAngle : f.restAngle;
          const targetPhys = targetVis - (f.hingeVisualOffset || 0);
          const diff = Math.abs(ang - targetPhys);
          if (diff < 0.025) {
            // close enough: stop motor
            try { f.hinge.setMotorSpeed(0); f.hinge.disableMotor && f.hinge.disableMotor(); } catch(e){}
            f.body.angularVelocity.set(0,0,0);
          }
        }

      } catch (err) { console.warn('flipper sync error', err); }
    }

    // sync balls and other meshes, guard against invalid values
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      const m = meshes[i];
      // clamp velocities to avoid numerical explosion
      if (b.velocity) clampVec3(b.velocity, 50);
      if (b.angularVelocity) clampVec3(b.angularVelocity, 30);

      const { x, y, z } = b.position;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        console.warn('Removing ball with invalid position', b.position);
        removeBallAtIndex(i);
        continue;
      }
      // ball fell off the bottom (drain) — trigger immediately when ball rolls past flippers
      if (z > 6.2 || y < -2.5) {
        removeBallAtIndex(i);
        onBallDrained();
        continue;
      }
      // Pop bumpers (fallback): the collide event is the primary trigger, but this
      // per-frame proximity check also fires hitBumper() to un-stick a resting ball.
      for (const bp of bumpers) {
        const dx = b.position.x - bp.body.position.x;
        const dz = b.position.z - bp.body.position.z;
        if (Math.hypot(dx, dz) < bp.r + 0.35 + 0.12) hitBumper(bp, b);
      }
      // Corner kickers: shoot the ball back into play from a dead top corner,
      // aimed at the lower-centre with a random spread so it's less predictable.
      b._kickerAt = b._kickerAt || {};
      const nowK = performance.now();
      for (let ki = 0; ki < kickers.length; ki++) {
        const K = kickers[ki];
        if (Math.hypot(b.position.x - K.x, b.position.z - K.z) < KICKER_RADIUS) {
          if (nowK - (b._kickerAt[ki] || 0) > 400) {
            b._kickerAt[ki] = nowK;
            const v = kickerLaunchVelocity(K);
            if (b.applyImpulse) b.applyImpulse(new CANNON.Vec3(v.x, v.y, v.z), b.position);
            updateScore(K.points);
            showScorePopup(K.x, bedY + 0.6, K.z, K.points);
            triggerScreenFlash(0.14);
            AudioFX.playLaunchJet();
            Haptic.kicker();
            K.flash = 1;
            spawnSparks(K.x, bedY + 0.2, K.z, 0x00f5d4, 22, 1.3);
          }
        }
      }
      // Check Top Rollover Lanes (A - B - C)
      checkRolloverLanes(b);

      // Predictive flipper resolver: keep the ball on the playfield side of each
      // blade and kick it when the flipper is raised (robust vs fast-swing tunneling).
      for (const f of flippers) resolveFlipperBall(f, b);
      m.position.copy(b.position);
      m.quaternion.copy(b.quaternion);
    }

    // update 3D spark particles
    updateSparks(dt);

    // update Drop Targets smooth drop/rise animation
    for (const dtItem of dropTargets) {
      const targetY = dtItem.isDown ? dtItem.downY : dtItem.upY;
      dtItem.animY += (targetY - dtItem.animY) * Math.min(1, dt * 18);
      dtItem.mesh.position.y = dtItem.animY;
      if (dtItem.flash > 0) {
        dtItem.flash = Math.max(0, dtItem.flash - dt * 4);
        if (dtItem.mat) dtItem.mat.emissiveIntensity = 0.45 + dtItem.flash * 2.5;
      }
    }

    // update Top Rollover Lanes glow
    for (const l of rolloverLanes) {
      if (l.flash > 0) l.flash = Math.max(0, l.flash - dt * 3);
      if (l.mat) {
        const baseIntensity = l.lit ? 1.6 : 0.2;
        l.mat.emissiveIntensity = baseIntensity + l.flash * 2.2;
        l.mat.color.setHex(l.lit ? 0x00f5d4 : 0x004455);
        l.mat.emissive.setHex(l.lit ? 0x00f5d4 : 0x003344);
      }
    }

    // decay bumper hit pulse (visual feedback: emissive flash + radius pulse)
    for (const bp of bumpers) {
      if (bp.flash > 0) bp.flash = Math.max(0, bp.flash - dt * 4);
      const s = 1 + bp.flash * 0.3;
      bp.mesh.scale.set(s, 1, s);
      if (bp.mat) bp.mat.emissiveIntensity = 0.25 + bp.flash * 2.8;
    }
    // decay corner-kicker pad pulse
    for (const K of kickers) {
      if (K.flash > 0) K.flash = Math.max(0, K.flash - dt * 3);
      if (K.mat) K.mat.emissiveIntensity = 0.5 + K.flash * 2.8;
      const ks = 1 + K.flash * 0.2;
      if (K.mesh) K.mesh.scale.set(ks, 1, ks);
    }
    // expire the combo multiplier if no bumper was hit within the window
    if (combo > 0 && performance.now() - lastComboAt > COMBO_WINDOW_MS) { combo = 0; updateComboUI(1); }

    // update Ball Saver indicator
    updateBallSaverUI(performance.now());
  }
  controls.update();
  renderer.render(scene, camera);
  lastTime = time;
}
requestAnimationFrame(animate);

// expose some helpers for debugging & testing
window._pinball = {
  spawnAtCenter,
  clearBalls,
  updateScore,
  bodies,
  get ballsLeft() { return ballsLeft; },
  get ballSaverUntil() { return ballSaverUntil; }
};
