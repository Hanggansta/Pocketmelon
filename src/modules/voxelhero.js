import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer, RenderPass, EffectPass, DepthOfFieldEffect, NoiseEffect, VignetteEffect, SMAAEffect, BlendFunction } from 'postprocessing';
import { PixelCat, CAT_SIZE } from './pixelcat.js';
import sprite from './cat-sprite.json';
import { pointer } from './env.js';

/**
 * VoxelHero: the Pocketmelon mascot as a real-time sculpture of ~1,200 glossy voxels.
 *
 * - A headless PixelCat drives a 44×44 colour map (blinks, eye tracking, bites).
 *   Every lit cell owns a voxel; colour changes flip the voxel physically.
 * - A small custom solver (typed arrays, no WASM): voxels are damped springs pulled
 *   to their home cell. The cursor is a moving sphere collider that shoves them, a
 *   click is a radial impulse, and bitten melon voxels drop and bounce on the floor.
 * - Scroll: home targets interpolate into a floating cloud (and back), while the
 *   camera dollies in. The same interpolation assembles the cat on load.
 * - Post: depth of field, film grain, vignette. Quality tiers + a frame-time
 *   governor keep it smooth on weaker GPUs.
 */
const N = CAT_SIZE.w;
const M = CAT_SIZE.h;
const POOL = 1700;
const SIZE = 0.9; // voxel edge, leaves a hairline gap on the 1-unit grid
const FOV = 26;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function qualityTier() {
  const mobile = matchMedia('(max-width: 900px)').matches || /Mobi|Android/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return 0;
  return cores >= 8 ? 2 : 1;
}

export class VoxelHero {
  /**
   * @param {HTMLElement} frame  element the canvas fills
   * @param {object} o
   * @param {boolean} [o.still]  reduced motion: assemble instantly, no simulation
   * @param {(n:number)=>void} [o.onPush]  called with the number of voxels shoved this frame (sound)
   * @param {()=>void} [o.onBite]
   */
  static async create(frame, o = {}) {
    return new VoxelHero(frame, o);
  }

  constructor(frame, { still = false, onPush, onBite } = {}) {
    this.frame = frame;
    this.still = still;
    this.onPush = onPush;
    this.onBite = onBite;
    this.tier = qualityTier();
    this.explode = 0; // 0 = cat, 1 = cloud (scroll)
    this.intro = still ? 0 : 1; // assembles from the cloud on start()
    this.started = still;
    this.visible = true;
    this.last = 0;
    this.acc = 0;
    this.slow = 0;

    /* ---------- renderer */
    const canvas = (this.canvas = document.createElement('canvas'));
    canvas.className = 'hero__gl';
    canvas.setAttribute('aria-hidden', 'true');
    frame.prepend(canvas);
    const renderer = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    }));
    this.dprMax = this.tier === 2 ? 2 : this.tier === 1 ? 1.5 : 1.5;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprMax));
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    /* ---------- scene */
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#e6dfd2');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 600);

    const hemi = new THREE.HemisphereLight('#fffaf0', '#b8ab95', 0.55);
    scene.add(hemi);
    const key = (this.key = new THREE.DirectionalLight('#fff6e8', 1.55));
    key.position.set(-26, 38, 60);
    key.castShadow = true;
    key.shadow.mapSize.set(this.tier ? 4096 : 2048, this.tier ? 4096 : 2048);
    key.shadow.camera.left = -110;
    key.shadow.camera.right = 110;
    key.shadow.camera.top = 80;
    key.shadow.camera.bottom = -80;
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 200;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#ffd9c9', 0.45);
    rim.position.set(40, 10, -20);
    scene.add(rim);

    // the sculpture lives in a group that leans toward the cursor
    const group = (this.group = new THREE.Group());
    scene.add(group);
    key.target = group;

    // studio backdrop + floor catch soft shadows
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(800, 500),
      new THREE.MeshStandardMaterial({ color: '#efe9de', roughness: 1, metalness: 0 })
    );
    backdrop.position.z = -9;
    backdrop.receiveShadow = true;
    scene.add(backdrop);
    this.floorY = -M / 2 - 2.2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 120), new THREE.ShadowMaterial({ color: '#4a3b2a', opacity: 0.16, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = this.floorY;
    floor.receiveShadow = true;
    group.add(floor);

    /* ---------- voxels */
    const geo = new RoundedBoxGeometry(1, 1, 1, 3, 0.14);
    const mat = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.9,
      clearcoatRoughness: 0.22,
      sheen: 0.25,
      sheenRoughness: 0.6,
    });
    const mesh = (this.mesh = new THREE.InstancedMesh(geo, mat, POOL));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const black = new THREE.Color(0, 0, 0);
    for (let i = 0; i < POOL; i++) mesh.setColorAt(i, black);
    group.add(mesh);
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpP = new THREE.Vector3();
    this.tmpS = new THREE.Vector3();
    this.tmpC = new THREE.Color();

    /* ---------- physics state (structure of arrays) */
    this.P = new Float32Array(POOL * 3); // position
    this.V = new Float32Array(POOL * 3); // velocity
    this.Q = new Float32Array(POOL * 4); // rotation quaternion
    this.W = new Float32Array(POOL * 3); // angular velocity
    this.cursorPos = new THREE.Vector3(0, 0, 200);
    this.cursorPrev = new THREE.Vector3(0, 0, 200);
    this.cursorTarget = new THREE.Vector3(0, 0, 200);

    this.vox = [];
    for (let i = 0; i < POOL; i++) {
      this.Q[i * 4 + 3] = 1;
      // a random spot in the cloud this voxel drifts to when the cat explodes
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(2 * Math.random() - 1);
      const r = 18 + Math.pow(Math.random(), 0.7) * 46;
      this.vox.push({
        cell: -1, // grid cell it belongs to, -1 when free or falling
        state: 0, // 0 free, 1 attached, 2 falling, 3 leaving
        s: 0, // display scale
        life: 0,
        col: 0,
        rest: false,
        cloud: [Math.cos(u) * Math.sin(v) * r * 1.5, Math.cos(v) * r * 0.85, Math.sin(u) * Math.sin(v) * r * 0.9 + 6],
        spin: [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6],
      });
    }
    this.free = [];
    for (let i = POOL - 1; i >= 0; i--) this.free.push(i);
    this.cellVox = new Int32Array(N * M).fill(-1);

    /* ---------- the living colour map */
    this.cat = new PixelCat(document.createElement('canvas'), {
      manual: true,
      nibble: true,
      maxBites: 4,
      rect: () => this.screenRect(),
    });
    this.melon = { x: sprite.layout.melon[0], y: sprite.layout.melon[1], w: sprite.melon[0].length, h: sprite.melon.length };
    this.sync(true);

    /* ---------- post */
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: this.tier && renderer.capabilities.isWebGL2 ? Math.min(4, renderer.capabilities.maxSamples) : 0,
    });
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.dof = new DepthOfFieldEffect(this.camera, { worldFocusRange: 26, bokehScale: this.tier === 2 ? 4 : 2.5, resolutionScale: 0.5 });
    this.dof.target = new THREE.Vector3();
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    noise.blendMode.opacity.value = 0.16;
    const vignette = new VignetteEffect({ offset: 0.35, darkness: 0.28 });
    const effects = [];
    if (this.tier > 0) effects.push(this.dof);
    effects.push(noise, vignette);
    if (!this.composer.multisampling) effects.push(new SMAAEffect());
    this.effectPass = new EffectPass(this.camera, ...effects);
    this.composer.addPass(this.effectPass);

    /* ---------- events */
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane();
    this.lean = { x: 0, y: 0 };
    this.measure = this.measure.bind(this);
    this.loop = this.loop.bind(this);
    new ResizeObserver(this.measure).observe(frame);
    this.measure();
    new IntersectionObserver(([e]) => (this.visible = e.isIntersecting)).observe(frame);
    frame.addEventListener('pointerdown', (e) => this.poke(e.clientX, e.clientY));
    // phones: tilt the sculpture with the device (where orientation is available without a prompt)
    this.tilt = null;
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return;
      this.tilt = { x: clamp(e.gamma / 40, -0.5, 0.5), y: clamp((e.beta - 50) / 50, -0.5, 0.5) };
    });

    if (still) {
      this.settle();
      this.render();
    } else {
      requestAnimationFrame(this.loop);
    }
  }

  /* =========================================================== layout */
  measure() {
    const r = this.frame.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.rect = r;
    this.renderer.setSize(r.width, r.height, false);
    this.composer.setSize(r.width, r.height, false);
    const a = r.width / r.height;
    const cam = this.camera;
    cam.aspect = a;
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const desktop = a > 1.15;
    // fit the 44-cell sculpture (+ floor) into the frame
    const needH = desktop ? 44 / 0.6 : 44 / 0.5;
    const needW = desktop ? 44 / 0.36 : 44 / 0.9;
    this.dist = Math.max(needH / (2 * t), needW / (2 * t * a));
    const visH = 2 * t * this.dist;
    const visW = visH * a;
    // the card is clipped under the header: centre on what is visible
    const top = parseFloat(getComputedStyle(this.frame).getPropertyValue('--header-h')) || 70;
    const shift = (top / 2 / r.height) * visH;
    // desktop: sculpture sits right of centre, clear of the headline; mobile: up top
    this.home = desktop ? new THREE.Vector3(visW * 0.02, visH * 0.1 - shift, 0) : new THREE.Vector3(0, visH * 0.16 - shift, 0);
    this.desktop = desktop;
    cam.updateProjectionMatrix();
    this.placeCamera();
    if (this.still) this.render();
  }

  placeCamera() {
    const e = smooth(Math.max(this.explode, this.intro * 0.6));
    const cam = this.camera;
    // dolly in and drift as the cat becomes a cloud
    const d = this.dist * (1 - 0.42 * smooth(this.explode));
    cam.position.set(this.home.x * (1 - this.explode) - this.explode * 4, this.home.y * (1 - this.explode), d);
    cam.lookAt(this.home.x * (1 - this.explode), this.home.y * (1 - this.explode), 0);
    this.group.position.copy(this.home).multiplyScalar(1 - smooth(this.explode));
    this.dof.target.set(this.group.position.x, this.group.position.y, e * 8);
  }

  /** screen-space box of the sculpture, for the cat's eye tracking */
  screenRect() {
    if (!this.rect) return { left: 0, top: 0, width: 1, height: 1 };
    const p = this.tmpP.copy(this.group.position).project(this.camera);
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const size = (44 / (2 * t * this.camera.position.z)) * this.rect.height;
    const cx = this.rect.left + ((p.x + 1) / 2) * this.rect.width;
    const cy = this.rect.top + ((1 - p.y) / 2) * this.rect.height;
    return { left: cx - size / 2, top: cy - size / 2, width: size, height: size };
  }

  /* =========================================================== cells */
  homeOf(cell) {
    return [(cell % N) - N / 2 + 0.5, M / 2 - Math.floor(cell / N) - 0.5, 0];
  }

  inMelon(cell) {
    const x = cell % N, y = Math.floor(cell / N), m = this.melon;
    return x >= m.x && x < m.x + m.w && y >= m.y - 1 && y < m.y + 3;
  }

  spawn(cell, col, instant) {
    const i = this.free.pop();
    if (i === undefined) return;
    const v = this.vox[i];
    const [hx, hy, hz] = this.homeOf(cell);
    v.cell = cell;
    v.state = 1;
    v.col = col;
    v.s = instant ? 1 : 0;
    const start = this.started && !this.still ? [hx, hy, hz] : this.blend(v, hx, hy, hz, 1);
    this.P.set(start, i * 3);
    this.V.fill(0, i * 3, i * 3 + 3);
    this.W.fill(0, i * 3, i * 3 + 3);
    this.Q.set([0, 0, 0, 1], i * 4);
    v.rest = false;
    this.cellVox[cell] = i;
    this.paint(i, col);
  }

  paint(i, u32) {
    this.tmpC.setRGB((u32 & 255) / 255, ((u32 >> 8) & 255) / 255, ((u32 >> 16) & 255) / 255, THREE.SRGBColorSpace);
    this.mesh.setColorAt(i, this.tmpC);
    this.mesh.instanceColor.needsUpdate = true;
  }

  release(i) {
    const v = this.vox[i];
    if (v.cell >= 0 && this.cellVox[v.cell] === i) this.cellVox[v.cell] = -1;
    v.cell = -1;
    v.state = 0;
    v.s = 0;
    this.free.push(i);
  }

  sync(initial = false) {
    const buf = this.cat.buf;
    for (let c = 0; c < N * M; c++) {
      const col = buf[c] >>> 0;
      const i = this.cellVox[c];
      if (col && i < 0) {
        this.spawn(c, col, initial);
      } else if (col && i >= 0) {
        const v = this.vox[i];
        if (v.col !== col) {
          v.col = col;
          this.paint(i, col);
          // a quick physical flip when a pixel changes colour (blinks, glances)
          if (!initial && !this.still) {
            this.W[i * 3 + 1] = 16 * (Math.random() > 0.5 ? 1 : -1);
            v.rest = false;
          }
        }
      } else if (!col && i >= 0) {
        const v = this.vox[i];
        this.cellVox[c] = -1;
        v.cell = -1;
        if (!initial && this.inMelon(c) && this.explode < 0.05 && this.intro < 0.05) {
          // bitten: drop under gravity, rest on the floor for a while
          v.state = 2;
          v.rest = false;
          v.life = 4 + Math.random() * 3;
          const o = i * 3;
          this.V[o] = (Math.random() - 0.5) * 3;
          this.V[o + 1] = 3 + Math.random() * 4;
          this.V[o + 2] = 3 + Math.random() * 4;
          this.W[o] = (Math.random() - 0.5) * 14;
          this.W[o + 1] = (Math.random() - 0.5) * 14;
          this.W[o + 2] = (Math.random() - 0.5) * 14;
          this.bitten = true;
        } else {
          v.state = 3; // shrink away
        }
      }
    }
    if (this.bitten) {
      this.bitten = false;
      this.onBite?.();
    }
  }

  /** target for voxel v: its home cell blended toward its cloud spot */
  blend(v, hx, hy, hz, e) {
    const k = smooth(e);
    return [hx + (v.cloud[0] - hx) * k, hy + (v.cloud[1] - hy) * k, hz + (v.cloud[2] - hz) * k];
  }

  /** reduced motion / first frame: everyone at home */
  settle() {
    for (const v of this.vox) {
      if (v.state !== 1) continue;
      const i = this.vox.indexOf(v);
      this.P.set(this.homeOf(v.cell), i * 3);
      v.s = 1;
    }
  }

  /* =========================================================== control */
  start() {
    this.started = true;
    this.introT0 = performance.now();
  }

  setExplode(p) {
    this.explode = clamp(p);
  }

  nibble() {
    this.cat.nibble();
  }

  /** click / tap: an impulse wave from the pointer */
  poke(x, y) {
    if (this.still) return;
    const hit = this.pointerLocal(x, y);
    if (!hit) return;
    const R = 9;
    const { P, V, W } = this;
    for (let i = 0; i < POOL; i++) {
      const v = this.vox[i];
      if (v.state !== 1 && v.state !== 2) continue;
      const o = i * 3;
      const dx = P[o] - hit.x, dy = P[o + 1] - hit.y, dz = P[o + 2];
      const d = Math.hypot(dx, dy, dz) || 1;
      if (d > R) continue;
      const f = (1 - d / R) * 26;
      V[o] += (dx / d) * f;
      V[o + 1] += (dy / d) * f;
      V[o + 2] += f * 0.9 + 2;
      W[o] += (Math.random() - 0.5) * f * 0.8;
      W[o + 1] += (Math.random() - 0.5) * f * 0.8;
      v.rest = false;
    }
    // a click on the sculpture feeds the cat
    if (Math.abs(hit.x) < N / 2 && Math.abs(hit.y) < M / 2 && this.explode < 0.1) this.cat.nibble();
  }

  pointerLocal(x, y) {
    const r = this.rect;
    if (!r) return null;
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.group.updateMatrixWorld();
    this.plane.set(new THREE.Vector3(0, 0, 1), 0).applyMatrix4(this.group.matrixWorld);
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.tmpP);
    return hit ? this.group.worldToLocal(hit) : null;
  }

  /* =========================================================== loop */
  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    if (!this.visible) return;
    this.rect = this.frame.getBoundingClientRect();

    // intro: assemble from the cloud
    if (this.started && this.intro > 0) {
      const u = clamp((now - this.introT0) / 2400);
      this.intro = 1 - easeOutCubic(u);
    }
    if (this.started && this.cat.step(dt * 1000)) this.sync();
    this.simulate(dt);
    this.placeCamera();
    this.render();
    this.govern(dt);
  }

  simulate(dt) {
    // lean toward the cursor
    const r = this.rect;
    const inside = pointer.active && pointer.x > r.left && pointer.x < r.right && pointer.y > r.top && pointer.y < r.bottom;
    const lx = inside ? ((pointer.x - r.left) / r.width - 0.5) : this.tilt ? this.tilt.x : 0;
    const ly = inside ? ((pointer.y - r.top) / r.height - 0.5) : this.tilt ? this.tilt.y : 0;
    this.lean.x += (lx - this.lean.x) * 0.05;
    this.lean.y += (ly - this.lean.y) * 0.05;
    const t = performance.now() / 1000;
    this.group.rotation.y = this.lean.x * 0.32 + Math.sin(t * 0.4) * 0.04;
    this.group.rotation.x = this.lean.y * 0.18 + Math.sin(t * 0.3) * 0.02;

    // cursor sphere follows the pointer on the sculpture plane, speed-limited
    const hit = inside && this.explode < 0.6 && this.intro < 0.2 ? this.pointerLocal(pointer.x, pointer.y) : null;
    this.cursorPrev.copy(this.cursorPos);
    if (hit) {
      if (this.cursorPos.z > 30) {
        this.cursorPos.set(hit.x, hit.y, 14); // re-enter from the front
        this.cursorPrev.copy(this.cursorPos);
      }
      this.cursorTarget.set(hit.x, hit.y, 0.3);
    } else {
      this.cursorTarget.set(this.cursorPos.x, this.cursorPos.y, 60);
    }
    const step = this.tmpS.copy(this.cursorTarget).sub(this.cursorPos);
    const max = 2.4;
    if (step.length() > max) step.setLength(max);
    this.cursorPos.add(step);

    this.acc += dt;
    let n = 0;
    const h = 1 / 60;
    let pushed = 0;
    while (this.acc >= h && n < 3) {
      pushed += this.integrate(h);
      this.acc -= h;
      n++;
    }
    if (n === 3) this.acc = 0;
    if (pushed) this.onPush?.(pushed);
  }

  /** one fixed step of the solver; returns how many voxels the cursor shoved */
  integrate(h) {
    const { P, V, Q, W } = this;
    const e = Math.max(this.explode, this.intro);
    const ke = smooth(e);
    const K = 70, C = 10, KR = 60, CR = 8;
    const G = -46, FLOOR = this.floorY + SIZE / 2;
    const cx = this.cursorPos.x, cy = this.cursorPos.y, cz = this.cursorPos.z;
    const cvx = (cx - this.cursorPrev.x) / h, cvy = (cy - this.cursorPrev.y) / h, cvz = (cz - this.cursorPrev.z) / h;
    const CR2 = 3.6; // cursor radius + half a voxel
    const cursorLive = cz < 20;
    let pushed = 0;

    for (let i = 0; i < POOL; i++) {
      const v = this.vox[i];
      const st = v.state;
      if (st === 0) continue;
      const o = i * 3;
      const q = i * 4;

      if (st === 3) {
        v.s -= h * 9;
        if (v.s <= 0) this.release(i);
        continue;
      }
      if (st === 1) v.s = Math.min(1, v.s + h * 5);

      // cursor collider: push out of the sphere, inherit some of its velocity
      if (cursorLive) {
        const dx = P[o] - cx, dy = P[o + 1] - cy, dz = P[o + 2] - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < CR2 * CR2) {
          const d = Math.sqrt(d2) || 1e-3;
          const nx = dx / d, ny = dy / d, nz = dz / d;
          const pen = CR2 - d;
          P[o] += nx * pen; P[o + 1] += ny * pen; P[o + 2] += nz * pen;
          const rel = (cvx * nx + cvy * ny + cvz * nz) - (V[o] * nx + V[o + 1] * ny + V[o + 2] * nz);
          const j = Math.max(0, rel) * 1.15 + pen * 6;
          V[o] += nx * j; V[o + 1] += ny * j; V[o + 2] += nz * j;
          // spin around the axis perpendicular to the hit
          W[o] += -ny * j * 0.9; W[o + 1] += nx * j * 0.9;
          v.rest = false;
          if (j > 4) pushed++;
        }
      }

      if (st === 1) {
        if (v.rest && e < 0.001) continue;
        const [hx, hy, hz] = this.homeOf(v.cell);
        let tx = hx, ty = hy, tz = hz;
        if (ke > 0) {
          tx += (v.cloud[0] - hx) * ke; ty += (v.cloud[1] - hy) * ke; tz += (v.cloud[2] - hz) * ke;
        }
        V[o] += ((tx - P[o]) * K - V[o] * C) * h;
        V[o + 1] += ((ty - P[o + 1]) * K - V[o + 1] * C) * h;
        V[o + 2] += ((tz - P[o + 2]) * K - V[o + 2] * C) * h;
        // rotation: back to square, or a slow tumble while in the cloud
        const sg = Q[q + 3] < 0 ? -1 : 1;
        const kr = KR * (1 - ke);
        W[o] += (-2 * Q[q] * sg * kr - W[o] * CR + v.spin[0] * ke * CR) * h;
        W[o + 1] += (-2 * Q[q + 1] * sg * kr - W[o + 1] * CR + v.spin[1] * ke * CR) * h;
        W[o + 2] += (-2 * Q[q + 2] * sg * kr - W[o + 2] * CR + v.spin[2] * ke * CR) * h;
      } else if (st === 2) {
        V[o + 1] += G * h;
        V[o] *= 0.995; V[o + 2] *= 0.995;
        v.life -= h * (this.explode > 0.02 ? 6 : 1);
        if (v.life < 0.6) v.s = Math.max(0, v.life / 0.6);
        if (v.life <= 0) { this.release(i); continue; }
      }

      P[o] += V[o] * h; P[o + 1] += V[o + 1] * h; P[o + 2] += V[o + 2] * h;
      if (st === 2 && P[o + 1] < FLOOR) {
        P[o + 1] = FLOOR;
        if (V[o + 1] < 0) V[o + 1] *= -0.32;
        V[o] *= 0.6; V[o + 2] *= 0.6;
        W[o] *= 0.7; W[o + 1] *= 0.7; W[o + 2] *= 0.7;
      }

      // integrate rotation: q += 0.5 * (w, 0) * q * h
      const wx = W[o], wy = W[o + 1], wz = W[o + 2];
      if (wx || wy || wz) {
        let x = Q[q], y = Q[q + 1], z = Q[q + 2], w = Q[q + 3];
        const hh = 0.5 * h;
        x += (wx * w + wy * z - wz * y) * hh;
        y += (wy * w + wz * x - wx * z) * hh;
        z += (wz * w + wx * y - wy * x) * hh;
        w += (-wx * x - wy * y - wz * z) * hh;
        const l = 1 / Math.hypot(x, y, z, w);
        Q[q] = x * l; Q[q + 1] = y * l; Q[q + 2] = z * l; Q[q + 3] = w * l;
      }

      // sleep when it is home and still
      if (st === 1 && e < 0.001) {
        const [hx, hy, hz] = this.homeOf(v.cell);
        const off = Math.abs(hx - P[o]) + Math.abs(hy - P[o + 1]) + Math.abs(hz - P[o + 2]);
        const sp = Math.abs(V[o]) + Math.abs(V[o + 1]) + Math.abs(V[o + 2]) + Math.abs(wx) + Math.abs(wy) + Math.abs(wz);
        if (off < 0.003 && sp < 0.02 && Math.abs(Q[q]) + Math.abs(Q[q + 1]) + Math.abs(Q[q + 2]) < 0.003) {
          P[o] = hx; P[o + 1] = hy; P[o + 2] = hz;
          V.fill(0, o, o + 3); W.fill(0, o, o + 3);
          Q[q] = Q[q + 1] = Q[q + 2] = 0; Q[q + 3] = 1;
          v.rest = true;
        }
      } else if (st === 1) {
        v.rest = false;
      }
    }
    return pushed;
  }

  render() {
    const mesh = this.mesh;
    for (let i = 0; i < POOL; i++) {
      const v = this.vox[i];
      if (v.state === 0 || v.s <= 0) {
        this.tmpM.makeScale(0, 0, 0);
      } else {
        this.tmpP.fromArray(this.P, i * 3);
        this.tmpQ.fromArray(this.Q, i * 4);
        const s = SIZE * (v.state === 1 ? easeOutCubic(v.s) : v.s);
        this.tmpS.set(s, s, s);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      }
      mesh.setMatrixAt(i, this.tmpM);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.composer.render();
  }

  /** frame-time governor: shed resolution, then depth of field, if frames run long */
  govern(dt) {
    if (dt > 1 / 40) this.slow += dt;
    else this.slow = Math.max(0, this.slow - dt * 0.5);
    if (this.slow < 1.2) return;
    this.slow = 0;
    const pr = this.renderer.getPixelRatio();
    if (pr > 1) {
      this.renderer.setPixelRatio(Math.max(1, pr - 0.5));
      this.measure();
    } else if (this.effectPass && this.dof && !this.dofOff) {
      this.dofOff = true;
      this.dof.blendMode.opacity.value = 0;
    }
  }
}
