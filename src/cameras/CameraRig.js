import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const CAMERA_MODES = Object.freeze({
  TACTICAL: 1,
  BROADCAST: 2,
  ORBIT: 3,
});

const _desiredPos = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();

export class CameraRig {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{isSoftwareGl?: boolean, onModeChange?: (mode: number) => void}} [options]
   */
  constructor(renderer, options = {}) {
    this.camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.5, 450);
    this.mode = CAMERA_MODES.BROADCAST;
    this.onModeChange = options.onModeChange || null;

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = !options.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 160;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.target.set(0, 0, 0);
    this.controls.enabled = false;

    this.lastBallX = 0;
    this.lastBallY = 0;
    this.lookTarget = new THREE.Vector3(0, 0.8, 0);
    this.transitioning = false;

    this.setMode(CAMERA_MODES.BROADCAST, true);
  }

  setMode(mode, immediate = false) {
    if (mode !== 1 && mode !== 2 && mode !== 3) return;
    this.mode = mode;
    this.controls.enabled = mode === CAMERA_MODES.ORBIT;
    this.transitioning = !immediate;

    if (mode === CAMERA_MODES.ORBIT && immediate) {
      this.camera.position.set(0, 38, 66);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    } else if (mode === CAMERA_MODES.TACTICAL && immediate) {
      this.camera.position.set(0, 112, 4);
      this.lookTarget.set(0, 0, 0);
      this.camera.lookAt(this.lookTarget);
    } else if (mode === CAMERA_MODES.BROADCAST && immediate) {
      this.camera.position.set(0, 26, 54);
      this.lookTarget.set(0, 0.8, 0);
      this.camera.lookAt(this.lookTarget);
    }

    this.onModeChange?.(mode);
  }

  onResize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param {number} dt
   * @param {{x: number, y: number}|null} ballPos
   */
  update(dt, ballPos) {
    if (ballPos && Number.isFinite(ballPos.x) && Number.isFinite(ballPos.y)) {
      this.lastBallX = ballPos.x;
      this.lastBallY = ballPos.y;
    }

    const safeDt = Math.min(dt, 0.1);
    const desiredFov = this.mode === CAMERA_MODES.TACTICAL ? 38 : this.mode === CAMERA_MODES.BROADCAST ? 43 : 48;
    if (Math.abs(this.camera.fov - desiredFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, desiredFov, 7, safeDt);
      this.camera.updateProjectionMatrix();
    }

    if (this.mode === CAMERA_MODES.TACTICAL) {
      _desiredPos.set(0, 112, 4);
      _desiredTarget.set(0, 0, 0);
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _desiredPos.x, 6, safeDt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _desiredPos.y, 6, safeDt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _desiredPos.z, 6, safeDt);
      this.lookTarget.lerp(_desiredTarget, 1 - Math.exp(-7 * safeDt));
      this.camera.lookAt(this.lookTarget);
      return;
    }

    if (this.mode === CAMERA_MODES.BROADCAST) {
      const bx = THREE.MathUtils.clamp(this.lastBallX, -48, 48);
      const bz = THREE.MathUtils.clamp(this.lastBallY, -30, 30);

      _desiredPos.set(bx * 0.72, 25.5, 52 + bz * 0.24);
      _desiredTarget.set(bx * 0.85, 0.8, bz * 0.65);

      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _desiredPos.x, 3.2, safeDt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _desiredPos.y, 4.5, safeDt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _desiredPos.z, 3.2, safeDt);
      this.lookTarget.x = THREE.MathUtils.damp(this.lookTarget.x, _desiredTarget.x, 4.0, safeDt);
      this.lookTarget.y = THREE.MathUtils.damp(this.lookTarget.y, _desiredTarget.y, 4.0, safeDt);
      this.lookTarget.z = THREE.MathUtils.damp(this.lookTarget.z, _desiredTarget.z, 4.0, safeDt);
      this.camera.lookAt(this.lookTarget);
      return;
    }

    // Mode 3: Free orbit
    if (this.transitioning) {
      _desiredPos.set(this.lastBallX * 0.4, 34, 62);
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _desiredPos.x, 6, safeDt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _desiredPos.y, 6, safeDt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _desiredPos.z, 6, safeDt);
      if (this.camera.position.distanceTo(_desiredPos) < 0.8) {
        this.transitioning = false;
      }
    }
    this.controls.update();
  }

  dispose() {
    this.controls.dispose();
  }
}
