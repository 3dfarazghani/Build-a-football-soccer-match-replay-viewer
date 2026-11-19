import * as THREE from 'three';
import { PITCH } from '../data/schema.js';

const _delta = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _rotQuat = new THREE.Quaternion();

function createBallTexture(maxAnisotropy) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 128);

  // Classic pentagon-inspired high-visibility panels for rolling legibility
  ctx.fillStyle = '#0f172a';
  const spots = [
    [32, 32], [96, 32], [160, 32], [224, 32],
    [64, 96], [128, 96], [192, 96], [0, 96], [256, 96],
  ];
  for (const [cx, cy] of spots) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const r = 16;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export class Ball {
  constructor(scene, renderer) {
    this.radius = PITCH.BALL_RADIUS;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Scale visual radius slightly (1.45x) so ball reads crisply from tactical/broadcast heights
    // while keeping ground contact at ball.z
    this.visualScale = 1.45;
    const geo = new THREE.SphereGeometry(this.radius * this.visualScale, 20, 16);
    const mat = new THREE.MeshStandardMaterial({
      map: createBallTexture(maxAniso),
      roughness: 0.42,
      metalness: 0.05,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.position.set(0, this.radius * this.visualScale, 0);

    const shadowGeo = new THREE.PlaneGeometry(0.65, 0.65);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: createShadowTexture(),
      transparent: true,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0, 0.025, 0);

    this.prevPos = new THREE.Vector3(0, this.radius, 0);
    this.hasPrev = false;

    scene.add(this.mesh);
    scene.add(this.shadow);
  }

  /**
   * @param {{x: number, y: number, z: number}} ballSample
   */
  update(ballSample) {
    if (!ballSample || !Number.isFinite(ballSample.x) || !Number.isFinite(ballSample.y)) {
      this.mesh.visible = false;
      this.shadow.visible = false;
      this.hasPrev = false;
      return;
    }

    this.mesh.visible = true;
    this.shadow.visible = true;

    const worldY = Math.max(this.radius, ballSample.z) + (this.visualScale - 1) * this.radius;
    this.mesh.position.set(ballSample.x, worldY, ballSample.y);
    this.shadow.position.set(ballSample.x, 0.025, ballSample.y);

    // Subtle shadow shrink/fade as ball rises in future arc hook
    const heightFactor = Math.max(0.45, 1 - (ballSample.z - this.radius) * 0.12);
    this.shadow.scale.setScalar(heightFactor);
    this.shadow.material.opacity = heightFactor * 0.85;

    if (this.hasPrev) {
      _delta.set(ballSample.x - this.prevPos.x, 0, ballSample.y - this.prevPos.z);
      const dist = _delta.length();
      if (dist > 0.002 && dist < 5.0) {
        _axis.crossVectors(_up, _delta).normalize();
        const angle = dist / (this.radius * this.visualScale);
        _rotQuat.setFromAxisAngle(_axis, angle);
        this.mesh.quaternion.premultiply(_rotQuat);
      }
    }

    this.prevPos.set(ballSample.x, worldY, ballSample.y);
    this.hasPrev = true;
  }
}
