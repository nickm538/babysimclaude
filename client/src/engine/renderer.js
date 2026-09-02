// WebGL renderer, camera, lighting rig and the day/night cycle.
// setDaylight(clockSec, season) drives the sun, sky and the tungsten/daylight balance; the resulting
// numbers are exposed on `this.daylight` for the outdoors, effects and art modules.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TUNGSTEN = new THREE.Color(0xffc98a), DAY_SKY = new THREE.Color(0xbcd6ff);

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
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 90);
    this.camera.position.set(0.5, 1.62, 3.6);
    this.camera.rotation.order = 'YXZ';
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.buildLights();
    this.clock = new THREE.Clock();
    this.onFrame = [];
    this.daylight = { elev: 0.5, az: 0, up: true, warm: 0, hour: 12, night: false, lightsOn: 0, sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(0xfff1dc), skyTop: new THREE.Color(0x5f9be6), skyHorizon: new THREE.Color(0xcfe3ff), season: 'autumn' };
    this.skyColor = new THREE.Color(0x9fc7ee);
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
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.015; this.sun.shadow.radius = 3;
    s.add(this.sun); s.add(this.sun.target);
    this.sun.target.position.set(1, 0, -1);
    // ceiling fixtures (warm tungsten) — the nursery one casts a soft shadow so the crib mobile reads on the sheet
    this.ceiling = [];
    for (const [x, z, shadow] of [[0.5, 0.5, false], [-4, -2.5, false], [4.2, -2.6, !this.isMobile], [-3, 3, false]]) {
      const l = new THREE.PointLight(TUNGSTEN, 0, 12, 2);
      l.position.set(x, 2.65, z); s.add(l); this.ceiling.push(l);
      if (shadow) { l.castShadow = true; l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.004; l.shadow.radius = 4; l.shadow.camera.near = 0.3; l.shadow.camera.far = 8; }
    }
    this.lamp = new THREE.PointLight(0xffb86b, 0, 6, 2);
    this.lamp.position.set(2.2, 1.45, 3.6); s.add(this.lamp);
    this.lamp.castShadow = false;
    this.nightlight = new THREE.PointLight(0xffa25c, 0, 3, 2);
    this.nightlight.position.set(5.75, 0.35, -3.0); s.add(this.nightlight);
    // cool fill from the windows so daylight scenes are not lit by tungsten-coloured bounce
    this.windowFill = new THREE.PointLight(DAY_SKY, 0, 9, 2);
    this.windowFill.position.set(3.4, 1.7, -4.2); s.add(this.windowFill);
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
    // twilight: a little sky light lingers 40 minutes either side of sunrise/sunset
    const twilight = up ? 1 : THREE.MathUtils.clamp(1 - Math.min(Math.abs(h - rise), Math.abs(h - set)) / 0.7, 0, 1);
    const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(elev * Math.PI * 0.5) * 0.9, Math.max(0.03, Math.sin(elev * Math.PI * 0.5)), -Math.cos(az) * Math.cos(elev * Math.PI * 0.5) * 0.8).normalize();
    this.sun.position.copy(sunDir).multiplyScalar(14).add(this.sun.target.position);
    const warm = up ? THREE.MathUtils.clamp(1 - elev * 1.6, 0, 1) : 1;
    this.sun.color.setRGB(1, 0.93 - warm * 0.25, 0.86 - warm * 0.45);
    const seasonSun = season === 'winter' ? 0.8 : season === 'summer' ? 1.1 : 1;
    this.sun.intensity = up ? (0.4 + elev * 2.4) * seasonSun : 0;
    this.sun.castShadow = up;
    const dusk = !up || elev < 0.25;
    this.hemi.intensity = up ? 0.22 + elev * 0.4 : 0.06 + twilight * 0.08;
    this.hemi.color.setHSL(0.6, 0.5, up ? 0.7 : 0.25);
    this.scene.environmentIntensity = up ? 0.3 + elev * 0.35 : 0.1;
    const lightsOn = dusk ? 1 : 0;
    const late = h > 22.5 || h < 6.5;
    for (const l of this.ceiling) l.intensity = THREE.MathUtils.lerp(l.intensity, lightsOn * (late ? 0.25 : 3.0), 0.1);
    this.lamp.intensity = THREE.MathUtils.lerp(this.lamp.intensity, dusk ? 2.4 : 0, 0.1);
    this.nightlight.intensity = h > 20 || h < 7 ? 0.8 : 0;
    this.windowFill.intensity = up ? 0.35 + elev * 1.1 : twilight * 0.25;
    this.windowFill.color.copy(DAY_SKY).lerp(new THREE.Color(0xffb27a), warm * 0.6);
    // sky gradient: zenith and horizon, warmed at dawn/dusk, deep blue at night
    const zen = new THREE.Color().setHSL(0.6, 0.6, 0.38 + elev * 0.28), hor = new THREE.Color().setHSL(0.57, 0.5, 0.72 + elev * 0.14);
    if (up) { zen.lerp(new THREE.Color(0xd98a5a), warm * 0.35); hor.lerp(new THREE.Color(0xffb070), warm * 0.7); }
    else { zen.set(0x070c1c).lerp(new THREE.Color(0x2a3a6a), twilight); hor.set(0x101a33).lerp(new THREE.Color(0xd08a60), twilight * 0.8); }
    if (season === 'winter' && up) { zen.lerp(new THREE.Color(0xa9b7c6), 0.25); hor.lerp(new THREE.Color(0xe6ebf0), 0.3); }
    this.skyColor = hor.clone().lerp(zen, 0.45);
    this.scene.background = this.skyColor;
    this.renderer.toneMappingExposure = up ? 1.0 : 0.9;
    this.isNight = !up;
    this.sunElev = elev;
    Object.assign(this.daylight, { elev, az, up, warm, hour: h, night: !up, twilight, lightsOn: this.ceiling[0].intensity / 3, season, dayT: t });
    this.daylight.sunDir.copy(sunDir); this.daylight.sunColor.copy(this.sun.color); this.daylight.skyTop.copy(zen); this.daylight.skyHorizon.copy(hor);
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
