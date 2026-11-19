import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MAX_PLAYERS = 28;
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _color = new THREE.Color();

const HOME_COLOR = new THREE.Color(0xe11d48);
const HOME_GK_COLOR = new THREE.Color(0xf59e0b);
const AWAY_COLOR = new THREE.Color(0x0284c7);
const AWAY_GK_COLOR = new THREE.Color(0x14b8a6);

function createPlayerGeometry() {
  const base = new THREE.CylinderGeometry(0.32, 0.36, 0.14, 12).translate(0, 0.07, 0);
  const torso = new THREE.CapsuleGeometry(0.28, 0.82, 4, 12).translate(0, 0.82, 0);
  const head = new THREE.SphereGeometry(0.21, 12, 10).translate(0, 1.66, 0);
  const visor = new THREE.BoxGeometry(0.18, 0.12, 0.18).translate(0, 1.62, 0.18);
  return mergeGeometries([base, torso, head, visor]);
}

function createNumberAtlasTexture(maxAnisotropy) {
  const cell = 64;
  const canvas = document.createElement('canvas');
  canvas.width = cell * 10;
  canvas.height = cell * 10;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 32px "Barlow Condensed", sans-serif';

  for (let i = 1; i <= 99; i++) {
    const idx = i - 1;
    const cx = (idx % 10) * cell + cell / 2;
    const cy = Math.floor(idx / 10) * cell + cell / 2;
    ctx.fillStyle = 'rgba(11, 16, 22, 0.78)';
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(String(i), cx, cy + 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.flipY = false;
  return tex;
}

function createBadgeMaterial(atlasTex) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uAtlas: { value: atlasTex } },
    vertexShader: `
      attribute float aNumIdx;
      varying vec2 vUv;
      varying float vNumIdx;
      void main() {
        vUv = uv;
        vNumIdx = aNumIdx;
        vec4 mvPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uAtlas;
      varying vec2 vUv;
      varying float vNumIdx;
      void main() {
        vec2 uv = vec2((mod(vNumIdx, 10.0) + vUv.x) / 10.0, (floor(vNumIdx / 10.0) + (1.0 - vUv.y)) / 10.0);
        vec4 texel = texture2D(uAtlas, uv);
        if (texel.a < 0.05) discard;
        gl_FragColor = texel;
      }
    `,
  });
}

function dampAngle(current, target, lambda, dt) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export class Players {
  constructor(scene, renderer) {
    this.mesh = new THREE.InstancedMesh(
      createPlayerGeometry(),
      new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.08 }),
      MAX_PLAYERS
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_PLAYERS; i++) this.mesh.setColorAt(i, _color.setHex(0xffffff));
    this.mesh.instanceColor.needsUpdate = true;

    const badgeGeo = new THREE.PlaneGeometry(1.1, 1.1);
    this.numIndices = new Float32Array(MAX_PLAYERS);
    this.numAttr = new THREE.InstancedBufferAttribute(this.numIndices, 1);
    badgeGeo.setAttribute('aNumIdx', this.numAttr);

    const atlas = createNumberAtlasTexture(renderer.capabilities.getMaxAnisotropy());
    this.badges = new THREE.InstancedMesh(badgeGeo, createBadgeMaterial(atlas), MAX_PLAYERS);
    this.badges.frustumCulled = false;
    this.badges.renderOrder = 2;

    this.showNumbers = true;
    this.stateById = new Map();
    scene.add(this.mesh, this.badges);
  }

  setShowNumbers(enabled) {
    this.showNumbers = enabled;
    this.badges.visible = enabled;
  }

  update(players, dt, camera) {
    const safeDt = Math.max(dt, 1 / 240);
    let activeCount = 0;

    for (let i = 0; i < players.length && activeCount < MAX_PLAYERS; i++) {
      const p = players[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;

      let state = this.stateById.get(p.id);
      if (!state) {
        state = { prevX: p.x, prevY: p.y, heading: p.team === 'home' ? Math.PI / 2 : -Math.PI / 2, phase: i * 0.7 };
        this.stateById.set(p.id, state);
      }

      const dx = p.x - state.prevX;
      const dy = p.y - state.prevY;
      const dist = Math.hypot(dx, dy);
      const speed = dist / safeDt;

      if (dist > 0.008 && dist < 4.0) {
        if (speed > 0.25) state.heading = dampAngle(state.heading, Math.atan2(dx, dy), 12, safeDt);
        state.phase += dist * 2.3;
      }
      state.prevX = p.x;
      state.prevY = p.y;

      const bob = speed > 0.3 && dist < 4.0 ? Math.abs(Math.sin(state.phase)) * Math.min(0.14, speed * 0.018) : 0;
      _pos.set(p.x, bob, p.y);
      _quat.setFromAxisAngle(_yAxis, state.heading);
      _scale.set(1, 1, 1);
      _mat4.compose(_pos, _quat, _scale);
      this.mesh.setMatrixAt(activeCount, _mat4);

      const isGk = p.isGk ?? (p.id === '11' || p.id === '25');
      this.mesh.setColorAt(activeCount, p.team === 'home' ? (isGk ? HOME_GK_COLOR : HOME_COLOR) : (isGk ? AWAY_GK_COLOR : AWAY_COLOR));

      if (this.showNumbers) {
        const displayNum = p.jersey || parseInt(p.id, 10) || activeCount + 1;
        this.numIndices[activeCount] = Math.max(1, Math.min(99, displayNum)) - 1;
        _pos.set(p.x, 2.55 + bob, p.y);
        _quat.copy(camera.quaternion);
        _mat4.compose(_pos, _quat, _scale);
        this.badges.setMatrixAt(activeCount, _mat4);
      }
      activeCount++;
    }

    _pos.set(0, -20, 0);
    _quat.identity();
    _scale.set(0, 0, 0);
    _mat4.compose(_pos, _quat, _scale);
    for (let i = activeCount; i < MAX_PLAYERS; i++) {
      this.mesh.setMatrixAt(i, _mat4);
      if (this.showNumbers) this.badges.setMatrixAt(i, _mat4);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    if (this.showNumbers) {
      this.badges.instanceMatrix.needsUpdate = true;
      this.numAttr.needsUpdate = true;
    }
  }
}
