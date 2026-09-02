// WebGL renderer, camera, lighting rig and the day/night cycle.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    this.isMobile = isMobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile || devicePixelRatio < 2, powerPreference: 'high-performance', alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 2 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0e12);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
    this.camera.position.set(0.5, 1.62, 3.6);
    this.camera.rotation.order = 'YXZ';
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.buildLights();
    this.clock = new THREE.Clock();
    this.onFrame = [];
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x7a6a55, 0.5);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    this.sun.position.set(6, 8, -4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.isMobile ? 1024 : 2048, this.isMobile ? 1024 : 2048);
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 40;
    this.sun.shadow.camera.left = -9; this.sun.shadow.camera.right = 9; this.sun.shadow.camera.top = 9; this.sun.shadow.camera.bottom = -9;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.02;
    s.add(this.sun); s.add(this.sun.target);
    this.sun.target.position.set(1, 0, -1);
    // ceiling fixtures
    this.ceiling = [];
    for (const [x, z] of [[0.5, 0.5], [-4, -2.5], [4, -2.5], [-3, 3]]) {
      const l = new THREE.PointLight(0xffe2b8, 0, 12, 2);
      l.position.set(x, 2.65, z); s.add(l); this.ceiling.push(l);
    }
    this.lamp = new THREE.PointLight(0xffc98a, 0, 6, 2);
    this.lamp.position.set(2.2, 1.45, 3.6); s.add(this.lamp);
    this.lamp.castShadow = false;
    this.nightlight = new THREE.PointLight(0xffb070, 0, 3, 2);
    this.nightlight.position.set(5.75, 0.35, -3.0); s.add(this.nightlight);
  }

  // clockSec: seconds since midnight in sim time
  setDaylight(clockSec, season = 'autumn') {
    const h = clockSec / 3600;
    const dayLen = season === 'summer' ? 15 : season === 'winter' ? 9 : 12;
    const rise = 12 - dayLen / 2, set = 12 + dayLen / 2;
    const t = (h - rise) / (set - rise); // 0..1 across the day
    const up = t > 0 && t < 1;
    const elev = up ? Math.sin(t * Math.PI) : 0;
    const az = (t - 0.5) * Math.PI * 0.9;
    this.sun.position.set(Math.sin(az) * 10, 2 + elev * 9, -Math.cos(az) * 8 + 1);
    const warm = up ? THREE.MathUtils.clamp(1 - elev * 1.6, 0, 1) : 1;
    this.sun.color.setRGB(1, 0.93 - warm * 0.25, 0.86 - warm * 0.45);
    this.sun.intensity = up ? 0.4 + elev * 2.4 : 0;
    this.sun.castShadow = up;
    const dusk = !up || elev < 0.25;
    this.hemi.intensity = up ? 0.25 + elev * 0.45 : 0.08;
    this.hemi.color.setHSL(0.6, 0.5, up ? 0.7 : 0.25);
    this.scene.environmentIntensity = up ? 0.35 + elev * 0.35 : 0.12;
    const lightsOn = dusk ? 1 : 0;
    for (const l of this.ceiling) l.intensity = THREE.MathUtils.lerp(l.intensity, lightsOn * (h > 22.5 || h < 6.5 ? 0.25 : 3.2), 0.1);
    this.lamp.intensity = THREE.MathUtils.lerp(this.lamp.intensity, dusk ? 2.4 : 0, 0.1);
    this.nightlight.intensity = h > 20 || h < 7 ? 0.8 : 0;
    this.skyColor = up ? new THREE.Color().setHSL(0.58, 0.55, 0.45 + elev * 0.3).lerp(new THREE.Color(0xffa060), warm * 0.5) : new THREE.Color(0x0a1020);
    this.scene.background = this.skyColor;
    this.renderer.toneMappingExposure = up ? 1.0 : 0.9;
    this.isNight = !up;
    this.sunElev = elev;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 78 : 68;
    this.camera.updateProjectionMatrix();
  }

  start() {
    const loop = () => {
      const dt = Math.min(0.05, this.clock.getDelta());
      for (const fn of this.onFrame) fn(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
