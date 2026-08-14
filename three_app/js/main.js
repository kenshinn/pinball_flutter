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
camera.position.set(0, 8, 12);

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

// Physics
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
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
}

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
    mesh.quaternion.setFromEuler(quat.x, quat.y, quat.z, 'XYZ');
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

// Side walls (left and right only)
// side walls: physics only (visuals hidden so they don't block flipper visuals)
addWall({x:-tableSize.w/2 -1, y:2.5, z:0}, {x:0,y:0,z:0}, {x:1, y:5, z:tableSize.h}, { visual: false });
addWall({x:tableSize.w/2 +1, y:2.5, z:0}, {x:0,y:0,z:0}, {x:1, y:5, z:tableSize.h}, { visual: false });

// Ramp wall kept at the TOP (opposite the flippers) to keep balls in play
// Move it to the negative z side so it doesn't block flippers at the bottom.
const rampHeight = 1;
addWall({x:0, y: bedY + rampHeight/2, z:-tableSize.h/2 + 1}, {x: -0.3, y:0, z:0}, {x:tableSize.w-1, y:rampHeight, z:1});

// create some spherical bumpers (visual + invisible physics)
const bumpers = [];
function createBumper(x,z,r=0.6, points=100) {
  // create a vertical cylinder (post) rooted on the bed so balls bounce off a grounded post
  const height = 1.2;
  const mat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive:0x220000, roughness:0.35, metalness:0.2 });
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

  // collision scoring + debug log
  body.addEventListener('collide', (e) => {
    try {
      if (e.body && e.body._isBall) {
        const impact = e.contact && typeof e.contact.getImpactVelocityAlongNormal === 'function' ? e.contact.getImpactVelocityAlongNormal() : null;
        console.debug('Bumper collided with ball', { bumperPos: body.position, ballId: e.body.id, impact });
        updateScore(points);
        playPing(600 + Math.random()*400, 0.09);
      }
    } catch (err) {
      console.warn('bumper collide handler error', err);
    }
  });

  bumpers.push({ body, mesh });
  // register so bumpers follow visual table tilt (syncTableObjects will update body/mesh)
  registerTableObject(body, mesh);
}

createBumper(-2, 0, 0.6, 150);
createBumper(2, -2, 0.6, 100);
createBumper(0, 2, 0.6, 200);

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

// Spawn at a safe position above the table
function spawnAtCenter() {
  const v = new THREE.Vector3(0, 6, 0);
  spawnBall({x:v.x, y:v.y, z:v.z});
}

// Raycaster for pointer spawn onto floorMesh (prefer object intersection to plane)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Flippers (kinematic bodies animated) — simple, stable model (restoring A)
const flippers = [];
function createFlipper(side='left') {
  const isLeft = side === 'left';
  // flipper geometry: length (x), height (vertical), thickness (z)
  const length = 2.6;
  const thickness = 0.2;
  const height = 0.48;
  const x = isLeft ? -2.2 : 2.2;
  const z = tableSize.h/2 - 0.6;
  const y = bedY + 0.32;

  const geo = new THREE.BoxGeometry(length, height, thickness);
  const mat = new THREE.MeshStandardMaterial({ color: isLeft ? 0x66d9ff : 0xffd66b, metalness:0.5, roughness:0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);

  // Dynamic (rigid) flipper body — try treating as a steel/dynamic body with hinge constraint
  const shape = new CANNON.Box(new CANNON.Vec3(length/2, height/2, thickness/2));
  // dynamic body centered at flipper center
  const body = new CANNON.Body({ mass: 3 }); // heavier to act like steel
  body.addShape(shape);
  body.position.set(x, y, z);
  body.material = bumperMaterial;
  body.angularDamping = 0.4;
  world.addBody(body);

  // pivot (static) at inner end toward the center of the table
  const pivotX = x + (isLeft ? (length/2) : (-length/2));
  const pivot = new CANNON.Body({ mass: 0 });
  pivot.position.set(pivotX, y, z);
  world.addBody(pivot);

  // hinge around Y axis, pivotB is expressed in body-local coordinates (from body center to pivot)
  const axis = new CANNON.Vec3(0,0,1);
  const pivotB = new CANNON.Vec3(isLeft ? length/2 : -length/2, 0, 0);
  const hinge = new CANNON.HingeConstraint(pivot, body, {
    pivotA: new CANNON.Vec3(0,0,0), axisA: axis,
    pivotB: pivotB, axisB: axis,
    maxForce: 1e7
  });
  world.addConstraint(hinge);

  const restAngle = isLeft ? -0.45 : 0.45;
  const upAngle = isLeft ? 1.05 : -1.05;

  try {
    if (typeof hinge.setLimits === 'function') {
      hinge.setLimits(Math.min(restAngle, upAngle), Math.max(restAngle, upAngle), 0.9, 0.3);
    }
    hinge.disableMotor && hinge.disableMotor();
    hinge.setMotorSpeed && hinge.setMotorSpeed(0);
    if (typeof hinge.motorMaxForce !== 'undefined') hinge.motorMaxForce = 1e6;
  } catch (err) { console.warn('hinge setup failed', err); }

  // Ensure the flipper starts at its rest angle (both physics body and visual mesh)
  try {
    const tq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), restAngle);
    // set physics body quaternion
    try { body.quaternion.set(tq.x, tq.y, tq.z, tq.w); } catch(e) { /* fallback ignored */ }
    // reposition body so pivot aligns correctly: body.position = pivot.position - rotated(pivotB)
    try {
      const pivotPos = pivot.position; // CANNON.Vec3
      const localPivotB = new THREE.Vector3(pivotB.x, pivotB.y, pivotB.z);
      const worldPivotOffset = localPivotB.clone().applyQuaternion(tq);
      const bodyWorldPos = new THREE.Vector3(pivotPos.x - worldPivotOffset.x, pivotPos.y - worldPivotOffset.y, pivotPos.z - worldPivotOffset.z);
      body.position.set(bodyWorldPos.x, bodyWorldPos.y, bodyWorldPos.z);
    } catch (e) { /* best-effort, ignore */ }
    // set mesh quaternion & position for visual match
    try { mesh.quaternion.copy(tq); mesh.position.set(body.position.x, body.position.y, body.position.z); } catch(e) { /* ok */ }
  } catch (err) { console.warn('initial flipper quaternion set failed', err); }

  const state = { body, mesh, pivot, hinge, side, restAngle, upAngle, engaged:false, upSpeed: 12, downSpeed: 8 };

  // small assist impulse on collision while flipper is actively driving (helps counter tunneling)
  body.addEventListener && body.addEventListener('collide', (e) => {
    try {
      if (e.body && e.body._isBall && state.engaged) {
        const ball = e.body;
        // try to use contact normal if available
        const contact = e.contact || null;
        let nx = 0, ny = 1, nz = 0;
        if (contact && contact.ni) { nx = contact.ni.x; ny = contact.ni.y; nz = contact.ni.z; }
        const mass = ball.mass || 1;
        const impMag = Math.min(12, 6 + Math.abs(state.upSpeed));
        const imp = new CANNON.Vec3(nx * impMag, ny * impMag * 0.6, nz * impMag);
        if (ball.applyImpulse) ball.applyImpulse(imp, ball.position);
        playPing(420 + Math.random()*120, 0.04);
      }
    } catch (err) { console.warn('flipper collision helper error', err); }
  });

  flippers.push(state);
  // register pivot and body so they tilt with the table visually and keep physics anchored
  registerTableObject(pivot, null);
  registerTableObject(body, mesh);
}

createFlipper('left');
createFlipper('right');

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
// append to body so it's visually above the renderer canvas
if (document && document.body) document.body.appendChild(debugEl);

let _lastDebug = 0;
function updateDebug(now) {
  if (!debugEl) return;
  if (now - _lastDebug < 150) return; // throttle updates to ~150ms
  _lastDebug = now;
  const lines = [];
  for (const f of flippers) {
    try {
      let ang = 0;
      if (f.hinge && typeof f.hinge.getAngle === 'function') ang = f.hinge.getAngle();
      else if (typeof f.angle === 'number') ang = f.angle;
      const deg = (ang * 180 / Math.PI).toFixed(1);
      const pivotPos = f.pivot ? `${f.pivot.position.x.toFixed(2)},${f.pivot.position.y.toFixed(2)},${f.pivot.position.z.toFixed(2)}` : 'n/a';
      const bodyPos = f.body ? `${f.body.position.x.toFixed(2)},${f.body.position.y.toFixed(2)},${f.body.position.z.toFixed(2)}` : 'n/a';
      const meshPos = f.mesh ? `${f.mesh.position.x.toFixed(2)},${f.mesh.position.y.toFixed(2)},${f.mesh.position.z.toFixed(2)}` : 'n/a';
      const hingeMotor = f.hinge && typeof f.hinge.enableMotor === 'function' ? (f.hinge.motorEnabled ? 'on' : 'off') : 'n/a';
      lines.push(`${f.side}: ${deg}° ${f.engaged? 'ENG':'   '} | pivot ${pivotPos} | body ${bodyPos} | mesh ${meshPos} | motor ${hingeMotor}`);
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
  const panel = document.createElement('div');
  panel.style.position = 'fixed';
  panel.style.left = '12px';
  panel.style.bottom = '12px';
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


// Add short side-guards near the flippers so balls can't roll out the sides
(function addSideGuards(){
  const guardHeight = 1.0;
  const guardThicknessX = 0.6; // width across X
  const guardDepthZ = 2.4;     // length along Z to cover the flipper area
  const guardZ = tableSize.h/2 - 0.9; // near the bottom (flipper) region
  const guardY = bedY + guardHeight/2; // sit on top of the bed
  const guardX = tableSize.w/2 - 0.6; // place close to the side edges but inside the main side wall

  // left guard
  addWall({ x: -guardX, y: guardY, z: guardZ }, { x: 0, y: 0, z: 0 }, { x: guardThicknessX, y: guardHeight, z: guardDepthZ }, { color: 0x333333 });
  // right guard
  addWall({ x: guardX, y: guardY, z: guardZ }, { x: 0, y: 0, z: 0 }, { x: guardThicknessX, y: guardHeight, z: guardDepthZ }, { color: 0x333333 });
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
        const target = f.upAngle;
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
  world.gravity.set(gx, -9.82, gz);

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
  world.gravity.set(gx, -9.82, gz);

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
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

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
          // set body quaternion and angular velocity so the physics step sees the motion
          try {
            // include visual offset so kinematic angle matches the physics body orientation used at creation
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), f.angle + (f.hingeVisualOffset||0));
            f.body.quaternion.set(q.x, q.y, q.z, q.w);
          } catch (e) {
            const tq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), f.angle + (f.hingeVisualOffset||0));
            f.body.quaternion.set(tq.x, tq.y, tq.z, tq.w);
          }
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
          // after physics step, position mesh according to body quaternion
          let rotated = null;
          try {
            rotated = f.body.quaternion.vmult(f.shapeOffset);
            f.mesh.position.set(f.body.position.x + rotated.x, f.body.position.y + rotated.y + 0.01, f.body.position.z + rotated.z);
            f.mesh.quaternion.set(f.body.quaternion.x, f.body.quaternion.y, f.body.quaternion.z, f.body.quaternion.w);
          } catch (e) {
            f.mesh.position.copy(f.body.position);
            f.mesh.quaternion.copy(f.body.quaternion);
          }
          continue;
        }

        // sync mesh to body for dynamic/hinged flippers
        if (f.mesh && f.body) {
          f.mesh.position.copy(f.body.position);
          f.mesh.quaternion.copy(f.body.quaternion);
        }

        // if hinge present, check angle and stop motor when target reached
        if (f.hinge && typeof f.hinge.getAngle === 'function') {
          const ang = f.hinge.getAngle();
          const target = f.engaged ? f.upAngle : f.restAngle;
          const diff = Math.abs(ang - target);
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
      // if ball falls far below the table, remove it to avoid invisible runaway
      if (y < -20) {
        removeBallAtIndex(i);
        continue;
      }
      m.position.copy(b.position);
      m.quaternion.copy(b.quaternion);
    }
  }
  controls.update();
  renderer.render(scene, camera);
  lastTime = time;
}
requestAnimationFrame(animate);

// expose some helpers for debugging
window._pinball = { spawnAtCenter, clearBalls, updateScore };
