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
container.appendChild(renderer.domElement);

const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(5, 10, 5);
scene.add(dir);

const controls = new OrbitControls(camera, renderer.domElement);
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
const COMBO_WINDOW_MS = 2000;
const COMBO_MAX = 5;

// Audio (simple collision sound)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playPing(freq = 440, duration = 0.08) {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.value = 0.0001;
  o.connect(g);
  g.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
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
    const mat = new THREE.MeshStandardMaterial({ color: options.color || 0x444444, metalness: 0.1, roughness: 0.7 });
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.quaternion.setFromEuler(new THREE.Euler(quat.x, quat.y, quat.z, 'XYZ'));
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
const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness:0.2, roughness:0.8 });
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
addWall({ x: -sideRailX, y: bedY + sideRailHeight/2, z: 0 }, { x: 0, y: 0, z: 0 }, { x: sideRailThickness, y: sideRailHeight, z: tableSize.h }, { color: 0x556677 });
addWall({ x:  sideRailX, y: bedY + sideRailHeight/2, z: 0 }, { x: 0, y: 0, z: 0 }, { x: sideRailThickness, y: sideRailHeight, z: tableSize.h }, { color: 0x556677 });

// Tall back wall along the TOP edge (behind the bumpers) so balls can't fly out
// the back when they spawn from above or get launched by a hard hit. Spans the
// full width between the side rails.
const backWallHeight = 3.0;
addWall({ x: 0, y: bedY + backWallHeight/2, z: -tableSize.h/2 + 0.5 }, { x: 0, y: 0, z: 0 }, { x: 2 * sideRailX, y: backWallHeight, z: 0.5 }, { color: 0x50607a });

// create some spherical bumpers (visual + invisible physics)
// Pop-bumper kick strength (horizontal impulse applied when the ball hits a bumper).
// The kick grows with the current combo (in hitBumper) so the ball keeps momentum
// toward the flippers as combos build.
const BUMPER_POP = 11;
const BUMPER_COOLDOWN_MS = 150; // per-ball, per-bumper gate for pop + scoring
const bumpers = [];
function createBumper(x,z,r=0.6, points=100) {
  // create a vertical cylinder (post) rooted on the bed so balls bounce off a grounded post
  const height = 1.2;
  const mat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive:0xff4422, emissiveIntensity: 0.12, roughness:0.35, metalness:0.2 });
  const geo = new THREE.CylinderGeometry(r, r, height, 24);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, bedY + height/2, z);
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

  // Reliable hit detection via the physics collide event (catches fast balls the
  // per-frame proximity check can skip). The proximity check in the animation loop
  // is a fallback that also un-sticks resting balls. Both go through hitBumper(),
  // which debounces per ball+bumper so a hit isn't counted twice.
  const bp = { body, mesh, mat, points, r, flash: 0 };
  body.addEventListener('collide', (e) => { if (e.body && e.body._isBall) hitBumper(bp, e.body); });
  bumpers.push(bp);
  // register so bumpers follow visual table tilt (syncTableObjects will update body/mesh)
  registerTableObject(body, mesh);
}

// Bumpers form a triangle in the UPPER playfield (negative z, toward the top ramp)
// so the lower/middle of the table stays clear for the ball to flow to the flippers.
createBumper(-1.8, -2.2, 0.6, 100);
createBumper( 1.8, -2.2, 0.6, 100);
createBumper( 0.0, -3.8, 0.6, 150);

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
  const mat = new THREE.MeshStandardMaterial({ color: 0x33ffcc, emissive: 0x0affcc, emissiveIntensity: 0.4, transparent: true, opacity: 0.55 });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(KICKER_RADIUS * 0.7, KICKER_RADIUS * 0.7, 0.12, 28), mat);
  mesh.position.set(K.x, bedY + 0.07, K.z);
  tableGroup.add(mesh);
  K.mesh = mesh; K.mat = mat;
}

// Ball spawn
let ballCount = 0;
function spawnBall(pos) {
  const radius = 0.35;
  const sphereGeo = new THREE.SphereGeometry(radius, 24, 24);
  const sphereMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, metalness:0.5, roughness:0.25 });
  const mesh = new THREE.Mesh(sphereGeo, sphereMat);
  mesh.scale.set(1,1,1);
  scene.add(mesh);

  const shape = new CANNON.Sphere(radius);
  const body = new CANNON.Body({ mass: 0.9 });
  body.addShape(shape);
  body.position.set(pos.x, pos.y, pos.z);
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
        console.debug('Ball collide', { ballId: body.id, vel });
      }
    } catch (err) {
      console.warn('ball collide handler error', err);
    }
  });

  world.addBody(body);
  bodies.push(body);
  meshes.push(mesh);

  ballCount++;
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
  spawnBall({ x: -0.6, y: 4, z: -1.5 });
}

// Raycaster for pointer spawn onto floorMesh (prefer object intersection to plane)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Flippers — kinematic bodies that swing horizontally around the vertical (Y) axis.
const flippers = [];
function createFlipper(side='left') {
  const isLeft = side === 'left';
  // flipper blade geometry: length (along local X), height (vertical Y), thickness (Z)
  const length = 2.4;
  const thickness = 0.45;
  const height = 0.9; // tall enough to cover the whole ball so hits push it sideways, not up

  // pivot sits near the bottom side edge; the blade extends toward the table centre
  const pivotX = isLeft ? -2.6 : 2.6;
  const pivotZ = tableSize.h/2 - 0.9;
  const pivotY = bedY + height/2; // blade bottom rests flush on the bed surface

  // offset from the pivot (= body origin) to the centre of the blade box
  const shapeOffset = new CANNON.Vec3(isLeft ? length/2 : -length/2, 0, 0);

  // Visual mesh: translate the box geometry so the pivot end sits at the local origin,
  // then the mesh transform can share the physics body's position/quaternion directly.
  const geo = new THREE.BoxGeometry(length, height, thickness);
  geo.translate(shapeOffset.x, shapeOffset.y, shapeOffset.z);
  const mat = new THREE.MeshStandardMaterial({ color: isLeft ? 0x66d9ff : 0xffd66b, metalness:0.5, roughness:0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pivotX, pivotY, pivotZ);
  scene.add(mesh);

  // Kinematic physics body: rotates cleanly about the pivot and imparts momentum to balls
  // via its angular velocity (set each frame in the animation loop).
  const shape = new CANNON.Box(new CANNON.Vec3(length/2, height/2, thickness/2));
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
  body.addShape(shape, shapeOffset);
  body.position.set(pivotX, pivotY, pivotZ);
  body.material = bumperMaterial;
  world.addBody(body);

  // Rest / engaged angles around the Y axis (radians); the pair forms a V at rest.
  const restAngle = isLeft ? -0.5 : 0.5;
  const upAngle   = isLeft ?  0.5 : -0.5;

  // apply the rest orientation immediately (body + visual)
  const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), restAngle);
  body.quaternion.set(q0.x, q0.y, q0.z, q0.w);
  mesh.quaternion.copy(q0);

  const state = {
    body, mesh, side, shapeOffset,
    restAngle, upAngle,
    angle: restAngle, targetAngle: restAngle,
    angularSpeed: 24, // sweep speed (rad/s)
    engaged: false,
    hingeVisualOffset: 0,
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

// small interactive tuner for hinge visual offset (mobile-friendly)
(function attachHingeTuner(){
  if (!DEBUG_UI) return; // dev-only panel, hidden unless ?debug is set
  const panel = document.createElement('div');
  panel.style.position = 'fixed';
  panel.style.left = '12px';
  // sit above the bottom flipper touch buttons so it doesn't cover the left (◀) button
  panel.style.bottom = '84px';
  panel.style.zIndex = 99999;
  panel.style.background = 'rgba(0,0,0,0.55)';
  panel.style.color = '#9fd';
  panel.style.padding = '8px';
  panel.style.borderRadius = '8px';
  panel.style.fontFamily = 'monospace';
  panel.style.fontSize = '12px';
  panel.style.display = 'flex';
  panel.style.gap = '6px';
  panel.style.alignItems = 'center';

  function mkBtn(text, onClick){
    const b = document.createElement('button');
    b.textContent = text;
    b.style.padding = '6px 8px';
    b.style.borderRadius = '6px';
    b.style.border = '1px solid rgba(255,255,255,0.06)';
    b.style.background = 'rgba(255,255,255,0.02)';
    b.style.color = '#9fd';
    b.addEventListener('click', onClick);
    return b;
  }

  const leftDec = mkBtn('L -', ()=> adjustOffset('left', -0.1));
  const leftInc = mkBtn('L +', ()=> adjustOffset('left', 0.1));
  const rightDec = mkBtn('R -', ()=> adjustOffset('right', -0.1));
  const rightInc = mkBtn('R +', ()=> adjustOffset('right', 0.1));
  const reset = mkBtn('Reset', ()=> { setOffset('left', 0); setOffset('right', 0); });
  const info = document.createElement('div');
  info.id = 'hinge-tuner-info';
  info.style.minWidth = '140px';

  panel.appendChild(leftDec);
  panel.appendChild(leftInc);
  panel.appendChild(rightDec);
  panel.appendChild(rightInc);
  panel.appendChild(reset);
  panel.appendChild(info);

  document.body.appendChild(panel);

  const HINGE_STORE_KEY = 'HINGE_VISUAL_OFFSETS';
  function loadStoredOffsets(){
    try{
      const raw = localStorage.getItem(HINGE_STORE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj;
    }catch(e){return null}
  }
  function saveStoredOffsets(left, right){
    try{ localStorage.setItem(HINGE_STORE_KEY, JSON.stringify({left, right})); }catch(e){}
  }
  function setOffset(side, value) {
    const f = flippers.find(ff=>ff.side===side);
    if (!f) return;
    f.hingeVisualOffset = value;
    applyOffsetToFlipper(f);
    // persist both values when one changes
    const l = flippers.find(ff=>ff.side==='left');
    const r = flippers.find(ff=>ff.side==='right');
    saveStoredOffsets(l ? (l.hingeVisualOffset||0) : 0, r ? (r.hingeVisualOffset||0) : 0);
    updateInfo();
  }
  function adjustOffset(side, delta) {
    const f = flippers.find(ff=>ff.side===side);
    if (!f) return;
    f.hingeVisualOffset = (f.hingeVisualOffset||0) + delta;
    applyOffsetToFlipper(f);
    // persist
    const l = flippers.find(ff=>ff.side==='left');
    const r = flippers.find(ff=>ff.side==='right');
    saveStoredOffsets(l ? (l.hingeVisualOffset||0) : 0, r ? (r.hingeVisualOffset||0) : 0);
    updateInfo();
  }
  function updateInfo(){
    const l = flippers.find(ff=>ff.side==='left');
    const r = flippers.find(ff=>ff.side==='right');
    const lv = l ? (l.hingeVisualOffset||0).toFixed(2) : 'n/a';
    const rv = r ? (r.hingeVisualOffset||0).toFixed(2) : 'n/a';
    info.textContent = `offset L:${lv} R:${rv}`;
  }
  function applyOffsetToFlipper(f){
    try{
      // recompute body & mesh quaternion based on current physical angle + offset
      let cur = 0;
      if (f.hinge && typeof f.hinge.getAngle === 'function') cur = f.hinge.getAngle();
      else if (f.body && f.body.quaternion) {
        const q = f.body.quaternion;
        const tq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
        const e = new THREE.Euler().setFromQuaternion(tq, 'XYZ');
        cur = e.z || 0;
      }
      const physAngle = cur; // physical hinge angle
      const visOffset = f.hingeVisualOffset || 0;
      const total = physAngle + visOffset;
      // set body quaternion to reflect total orientation used by visual
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), total);
      f.body.quaternion.set(q.x, q.y, q.z, q.w);
      if (f.mesh) f.mesh.quaternion.copy(q);
      // reposition mesh so its pivot stays aligned
      if (f.shapeOffset) {
        try{
          const rotated = f.body.quaternion.vmult(f.shapeOffset);
          f.mesh.position.set(f.body.position.x + rotated.x, f.body.position.y + rotated.y + 0.01, f.body.position.z + rotated.z);
        }catch(e){}
      } else if (f.body) {
        if (f.mesh) f.mesh.position.copy(f.body.position);
      }
    }catch(e){console.warn('applyOffsetToFlipper failed', e)}
  }

  // expose helpers for manual use
  window._pinball = window._pinball || {};
  window._pinball.adjustOffset = adjustOffset;
  window._pinball.setOffset = setOffset;

  // initial info update
  const _stored = loadStoredOffsets ? loadStoredOffsets() : null;
  if (_stored) {
    try { if (typeof _stored.left === 'number') setOffset('left', _stored.left); if (typeof _stored.right === 'number') setOffset('right', _stored.right); } catch(e){}
  }
  setTimeout(updateInfo, 300);
})();

// initial dump for diagnostics
for (const f of flippers) {
  try {
    if (f.hinge && typeof f.hinge.getAngle === 'function') console.debug('flipper initial angle', f.side, f.hinge.getAngle());
    else console.debug('flipper initial angle (body)', f.side, f.body && f.body.quaternion);
  } catch (e) { console.warn('flipper initial debug failed', e); }
}


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
  addAngledWall( railInner, 2.3,  2.6, 5.2); // right funnel -> right flipper pivot
  addAngledWall(-railInner, 2.3, -2.6, 5.2); // left funnel  -> left flipper pivot
})();

function setFlipper(side, engaged) {
  const f = flippers.find(ff => ff.side === side);
  if (!f) return;
  // if hinge-based dynamic flipper, drive motor toward target angle
  if (f.hinge) {
    f.engaged = engaged;
    // Conservative motor policy: only actively drive the flipper when engaged (pressed).
    // When released, disable the motor and allow damping/hinge limits to settle the flipper.
    try {
      if (engaged) {
        // compute physical target by subtracting visual offset
        const targetVis = f.upAngle;
        const target = targetVis - (f.hingeVisualOffset || 0);
        let cur = 0;
        if (typeof f.hinge.getAngle === 'function') cur = f.hinge.getAngle();
        else if (f.body && f.body.quaternion) {
          const q = f.body.quaternion;
          const tq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
          const e = new THREE.Euler().setFromQuaternion(tq, 'XYZ');
          // hinge is around Z axis so the rotation of interest is 'z'
          cur = e.z || 0;
        }
        let delta = target - cur;
        while (delta > Math.PI) delta -= Math.PI*2;
        while (delta < -Math.PI) delta += Math.PI*2;
        if (Math.abs(delta) < 0.02) {
          try { if (f.hinge.setMotorSpeed) f.hinge.setMotorSpeed(0); if (f.hinge.disableMotor) { f.hinge.disableMotor(); f.hinge._motorEnabled = false; } } catch(e){}
          return;
        }
        const speed = Math.sign(delta) * Math.abs(f.upSpeed);
        try { if (f.hinge.enableMotor) { f.hinge.enableMotor(); f.hinge._motorEnabled = true; } if (f.hinge.setMotorSpeed) f.hinge.setMotorSpeed(speed); } catch (e) { console.warn('hinge motor set failed', e); }
      } else {
        // release: stop active motor control and let physics/damping return flipper to rest
        try { if (f.hinge.setMotorSpeed) f.hinge.setMotorSpeed(0); if (f.hinge.disableMotor) { f.hinge.disableMotor(); f.hinge._motorEnabled = false; } } catch(e){}
      }
    } catch (err) { console.warn('setFlipper hinge error', err); }
    return;
  }
  // fallback kinematic behavior
  f.targetAngle = engaged ? f.upAngle : f.restAngle;
}

// Controls: keyboard and touch UI
window.addEventListener('keydown', (e)=>{
  if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setFlipper('left', true);
  if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') setFlipper('right', true);
  if (e.code === 'Space') spawnAtCenter();
});
window.addEventListener('keyup', (e)=>{
  if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setFlipper('left', false);
  if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') setFlipper('right', false);
});

// Touch buttons
const leftBtn = document.getElementById('left-flip');
const rightBtn = document.getElementById('right-flip');
if (leftBtn) {
  leftBtn.addEventListener('pointerdown', ()=> setFlipper('left', true));
  leftBtn.addEventListener('pointerup', ()=> setFlipper('left', false));
  leftBtn.addEventListener('pointercancel', ()=> setFlipper('left', false));
}
if (rightBtn) {
  rightBtn.addEventListener('pointerdown', ()=> setFlipper('right', true));
  rightBtn.addEventListener('pointerup', ()=> setFlipper('right', false));
  rightBtn.addEventListener('pointercancel', ()=> setFlipper('right', false));
}

// Mouse / touch spawn (tap elsewhere) — use raycast onto floorMesh so spawn position is predictable
renderer.domElement.addEventListener('pointerdown', (e) => {
  // avoid triggering when clicking UI buttons
  if (e.target && (e.target.id === 'left-flip' || e.target.id === 'right-flip' || e.target.id === 'spawn' || e.target.id === 'clear')) return;
  if (gameOver || ballsLeft <= 0 || bodies.length > 0) return; // one ball in play at a time

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(floorMesh, true);
  if (intersects && intersects.length) {
    const pt = intersects[0].point;
    spawnBall({ x: pt.x, y: pt.y + 2.0, z: pt.z });
  } else {
    // fallback to center spawn
    spawnAtCenter();
  }
});

// UI
const spawnBtn = document.getElementById('spawn');
if (spawnBtn) spawnBtn.addEventListener('click', ()=> spawnAtCenter());
const clearBtn = document.getElementById('clear');
if (clearBtn) clearBtn.addEventListener('click', ()=> clearBalls());
const orbitToggle = document.getElementById('orbit');
if (orbitToggle) orbitToggle.addEventListener('change', (e)=> { 
  controls.enabled = orbitToggle.checked;
  // do NOT change visualsTiltEnabled here — user asked to keep visual tilt disabled
  if (!visualsTiltEnabled) tableGroup.rotation.set(0,0,0);
});

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
function updateComboUI(mult) {
  if (!comboEl) return;
  if (mult > 1) { comboEl.textContent = `Combo ×${mult}`; comboEl.style.display = ''; }
  else { comboEl.style.display = 'none'; }
}
function bumperScore(bp) {
  const now = performance.now();
  combo = (now - lastComboAt <= COMBO_WINDOW_MS) ? combo + 1 : 1;
  lastComboAt = now;
  const mult = Math.min(combo, COMBO_MAX);
  updateComboUI(mult);
  const gained = bp.points * mult;
  updateScore(gained);
  bp.flash = 1;
  showScorePopup(bp.body.position.x, bedY + 0.6, bp.body.position.z, gained);
  triggerScreenFlash(Math.min(0.2, 0.05 + gained / 3000));
  playPing(560 + Math.random() * 300 + mult * 70, 0.09);
  return mult;
}
// Handle a bumper hit: debounce, score (combo), and kick the ball away with a
// speed that scales with the combo so higher combos send the ball faster.
function hitBumper(bp, ball) {
  const now = performance.now();
  ball._bumperHitAt = ball._bumperHitAt || {};
  if (now - (ball._bumperHitAt[bp.body.id] || 0) <= BUMPER_COOLDOWN_MS) return;
  ball._bumperHitAt[bp.body.id] = now;
  const mult = bumperScore(bp);
  const pop = BUMPER_POP + (mult - 1) * 3; // more combo -> stronger kick
  const dx = ball.position.x - bp.body.position.x;
  const dz = ball.position.z - bp.body.position.z;
  const d = Math.hypot(dx, dz) || 1;
  if (ball.applyImpulse) ball.applyImpulse(new CANNON.Vec3((dx / d) * pop, 0, (dz / d) * pop), ball.position);
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

function onBallDrained() {
  if (gameOver) return;
  ballsLeft = Math.max(0, ballsLeft - 1);
  updateBallsUI();
  playPing(150, 0.25); // low "ball lost" tone
  combo = 0; updateComboUI(1);
  if (ballsLeft <= 0) endGame();
}
function endGame() {
  gameOver = true;
  if (score > highScore) { highScore = score; try { localStorage.setItem('PINBALL_HIGH', String(highScore)); } catch (e) {} }
  updateHighUI();
  goScore.textContent = `Score ${score}   \u00b7   High ${highScore}`;
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
  updateComboUI(1);
  updateBallsUI();
  gameOverEl.style.display = 'none';
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
      // ball fell off the bottom (drain) — remove it and lose a ball
      if (y < -4) {
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
            let bx = 0 - K.x, bz = 2 - K.z; const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
            const jitter = (Math.random() - 0.5) * 2 * KICKER_SPREAD; // random launch angle
            const cs = Math.cos(jitter), sn = Math.sin(jitter);
            const rx = bx * cs - bz * sn, rz = bx * sn + bz * cs;
            const pop = KICKER_POP * (0.85 + Math.random() * 0.3); // slight random power
            if (b.applyImpulse) b.applyImpulse(new CANNON.Vec3(rx * pop, 0, rz * pop), b.position);
            updateScore(K.points);
            showScorePopup(K.x, bedY + 0.6, K.z, K.points);
            triggerScreenFlash(0.14);
            playPing(320 + Math.random() * 160, 0.12);
            K.flash = 1;
          }
        }
      }
      m.position.copy(b.position);
      m.quaternion.copy(b.quaternion);
    }

    // decay bumper hit pulse (visual feedback: emissive flash + radius pulse)
    for (const bp of bumpers) {
      if (bp.flash > 0) bp.flash = Math.max(0, bp.flash - dt * 4);
      const s = 1 + bp.flash * 0.3;
      bp.mesh.scale.set(s, 1, s);
      if (bp.mat) bp.mat.emissiveIntensity = 0.12 + bp.flash * 2.0;
    }
    // decay corner-kicker pad pulse
    for (const K of kickers) {
      if (K.flash > 0) K.flash = Math.max(0, K.flash - dt * 3);
      if (K.mat) K.mat.emissiveIntensity = 0.4 + K.flash * 2.5;
      const ks = 1 + K.flash * 0.2;
      if (K.mesh) K.mesh.scale.set(ks, 1, ks);
    }
    // expire the combo multiplier if no bumper was hit within the window
    if (combo > 0 && performance.now() - lastComboAt > COMBO_WINDOW_MS) { combo = 0; updateComboUI(1); }
  }
  controls.update();
  renderer.render(scene, camera);
  lastTime = time;
}
requestAnimationFrame(animate);

// expose some helpers for debugging
window._pinball = { spawnAtCenter, clearBalls, updateScore };
