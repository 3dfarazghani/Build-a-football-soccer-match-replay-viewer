import * as THREE from 'three';
import { PITCH } from '../data/schema.js';

function createPitchTexture(maxAnisotropy) {
  const w = 2048;
  const h = 1365;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1f4d2b';
  ctx.fillRect(0, 0, w, h);

  const padX = (5 / 115) * w;
  const padY = (5 / 78) * h;
  const pitchW = w - padX * 2;
  const pitchH = h - padY * 2;
  const m2pxX = pitchW / PITCH.LENGTH;
  const m2pxY = pitchH / PITCH.WIDTH;

  const stripes = 18;
  const stripeW = pitchW / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2b6b38' : '#265f32';
    ctx.fillRect(padX + i * stripeW, padY, stripeW + 0.5, pitchH);
  }

  ctx.strokeStyle = 'rgba(244, 248, 245, 0.92)';
  ctx.fillStyle = 'rgba(244, 248, 245, 0.92)';
  ctx.lineWidth = Math.max(2.2, 0.12 * m2pxX);

  const px = (x) => padX + (x + PITCH.HALF_LENGTH) * m2pxX;
  const py = (y) => padY + (y + PITCH.HALF_WIDTH) * m2pxY;

  ctx.strokeRect(px(-52.5), py(-34), pitchW, pitchH);
  ctx.beginPath();
  ctx.moveTo(px(0), py(-34));
  ctx.lineTo(px(0), py(34));
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(px(0), py(0), 9.15 * m2pxX, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(0), py(0), 0.25 * m2pxX, 0, Math.PI * 2);
  ctx.fill();

  const arcAngle = Math.acos(5.5 / 9.15);
  for (const side of [-1, 1]) {
    const gx = side * 52.5;
    ctx.strokeRect(px(side === -1 ? gx : gx - 16.5), py(-20.16), 16.5 * m2pxX, 40.32 * m2pxY);
    ctx.strokeRect(px(side === -1 ? gx : gx - 5.5), py(-9.16), 5.5 * m2pxX, 18.32 * m2pxY);

    const spotX = px(gx - side * 11);
    ctx.beginPath();
    ctx.arc(spotX, py(0), 0.22 * m2pxX, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(spotX, py(0), 9.15 * m2pxX, side === -1 ? -arcAngle : Math.PI - arcAngle, side === -1 ? arcAngle : Math.PI + arcAngle);
    ctx.stroke();

    for (const cy of [-34, 34]) {
      const a0 = side === -1 ? (cy < 0 ? 0 : -Math.PI / 2) : (cy < 0 ? Math.PI / 2 : Math.PI);
      ctx.beginPath();
      ctx.arc(px(gx), py(cy), m2pxX, a0, a0 + Math.PI / 2);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createGoal(side) {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35, metalness: 0.25 });
  const netMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, wireframe: true, transparent: true, opacity: 0.24 });

  const { GOAL_WIDTH: w, GOAL_HEIGHT: h, GOAL_DEPTH: d } = PITCH;
  const r = 0.065;
  const postGeo = new THREE.CylinderGeometry(r, r, h, 10);
  const barGeo = new THREE.CylinderGeometry(r, r, w + r * 2, 10).rotateX(Math.PI / 2);
  const sideGeo = new THREE.CylinderGeometry(r * 0.7, r * 0.7, d, 8).rotateZ(Math.PI / 2);

  for (const zSign of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(0, h / 2, (zSign * w) / 2);
    post.castShadow = true;
    const bottomBar = new THREE.Mesh(sideGeo, postMat);
    bottomBar.position.set((side * d) / 2, r, (zSign * w) / 2);
    const backPost = new THREE.Mesh(postGeo, postMat);
    backPost.position.set(side * d, h / 2, (zSign * w) / 2);
    group.add(post, bottomBar, backPost);
  }

  const crossbar = new THREE.Mesh(barGeo, postMat);
  crossbar.position.set(0, h, 0);
  crossbar.castShadow = true;
  const backBar = new THREE.Mesh(barGeo, postMat);
  backBar.position.set(side * d, h, 0);
  const netBox = new THREE.Mesh(new THREE.BoxGeometry(d, h, w, 6, 6, 12), netMat);
  netBox.position.set((side * d) / 2, h / 2, 0);

  group.add(crossbar, backBar, netBox);
  group.position.set(side * PITCH.HALF_LENGTH, 0, 0);
  return group;
}

function addStands(group) {
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9, metalness: 0.05 });
  const tierMat = new THREE.MeshStandardMaterial({ color: 0x263549, roughness: 0.85, metalness: 0.05 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, metalness: 0.2 });

  const surround = new THREE.Mesh(new THREE.PlaneGeometry(340, 260), new THREE.MeshStandardMaterial({ color: 0x101720, roughness: 0.95 }));
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.04;
  surround.receiveShadow = true;
  group.add(surround);

  for (const [x, z, bw, bh, bd] of [[0, -37.5, 110, 0.9, 0.3], [0, 37.5, 110, 0.9, 0.3], [-56.5, 0, 0.3, 0.9, 74], [56.5, 0, 0.3, 0.9, 74]]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), boardMat);
    board.position.set(x, bh / 2, z);
    board.receiveShadow = true;
    group.add(board);
  }

  for (const s of [{ x: 0, z: -49, w: 118, d: 16, rotY: 0 }, { x: 0, z: 49, w: 118, d: 16, rotY: Math.PI }, { x: -69, z: 0, w: 78, d: 16, rotY: Math.PI / 2 }, { x: 69, z: 0, w: 78, d: 16, rotY: -Math.PI / 2 }]) {
    const standGroup = new THREE.Group();
    for (let t = 0; t < 4; t++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(s.w, 2.2, s.d - t * 3.2), t % 2 === 0 ? concreteMat : tierMat);
      tier.position.set(0, 1.1 + t * 2.1, -t * 1.6);
      tier.receiveShadow = true;
      tier.castShadow = true;
      standGroup.add(tier);
    }
    standGroup.position.set(s.x, 0, s.z);
    standGroup.rotation.y = s.rotY;
    group.add(standGroup);
  }
}

export function createStadium(scene, renderer) {
  const group = new THREE.Group();
  const pitchTex = createPitchTexture(renderer.capabilities.getMaxAnisotropy());
  const pitchMesh = new THREE.Mesh(new THREE.PlaneGeometry(115, 78), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.88, metalness: 0.02 }));
  pitchMesh.rotation.x = -Math.PI / 2;
  pitchMesh.receiveShadow = true;
  group.add(pitchMesh, createGoal(-1), createGoal(1));
  addStands(group);

  group.add(new THREE.HemisphereLight(0xcbd5e1, 0x1e3a24, 0.75));
  const keyLight = new THREE.DirectionalLight(0xfff6e5, 1.85);
  keyLight.position.set(42, 68, 36);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  Object.assign(keyLight.shadow.camera, { near: 10, far: 180, left: -64, right: 64, top: 48, bottom: -48 });
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  group.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
  rimLight.position.set(-45, 38, -40);
  group.add(rimLight);

  scene.add(group);
  return group;
}
