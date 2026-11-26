// Sky dome with a moving sun, moon and stars, plus the day/night lighting.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './util.js';

const C = (hex) => new THREE.Color(hex);
const PAL = {
  dayTop: C('#2a6fd0'), dayHorizon: C('#cde4f2'),
  duskTop: C('#2d3d7c'), duskHorizon: C('#ff9a5c'),
  nightTop: C('#050b1c'), nightHorizon: C('#16244a'),
  ground: C('#3d4a3a'),
  highHorizon: C('#8fb8e6'),
  sunDay: C('#fff3dc'), sunDusk: C('#ffb06a'),
  moon: C('#9fb4ff'),
};

const vert = `varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunVis;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
  col = mix(col, uGround, smoothstep(0.0, -0.3, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 5.0) * 0.28 + pow(s, 48.0) * 0.55) * uSunVis;
  col += uSunColor * smoothstep(0.9990, 0.9995, s) * 6.0 * uSunVis;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: PAL.dayTop.clone() },
      uHorizon: { value: PAL.dayHorizon.clone() },
      uGround: { value: PAL.ground.clone() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: PAL.sunDay.clone() },
      uSunVis: { value: 1 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(2600, 32, 20),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false }),
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // Stars
    const n = 1600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05;
      const r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * r * 2300;
      pos[i * 3 + 1] = y * 2300;
      pos[i * 3 + 2] = Math.sin(a) * r * 2300;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(55, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#f3f0e2', fog: false, transparent: true, depthWrite: false }),
    );
    this.moon.renderOrder = -8;
    scene.add(this.moon);

    // Lights
    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 500;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight('#bfe0ff', '#4b5a3c', 1.1);
    scene.add(this.hemi);

    scene.fog = new THREE.Fog('#bfe2f6', 160, 1350);

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.dayness = 1;
    this.night = 0;
    this.fogColor = new THREE.Color();
  }

  // hour: 0..24, focus: point the shadows follow, altitude01: 0..1 climb progress
  update(hour, focus, cameraPos, altitude01 = 0) {
    const a = ((hour - 6) / 12) * Math.PI;
    this.sunDir.set(-Math.cos(a), Math.sin(a) * 0.92, 0.38).normalize();
    this.moonDir.set(Math.cos(a) * 0.8, Math.max(0.35, -Math.sin(a)) * 0.9, -0.3).normalize();
    const e = this.sunDir.y;

    const day = smoothstep(-0.12, 0.22, e);
    const dusk = smoothstep(-0.25, 0.02, e) * (1 - smoothstep(0.02, 0.32, e));
    this.dayness = day;
    this.night = 1 - smoothstep(-0.2, 0.05, e);

    const u = this.uniforms;
    u.uTop.value.lerpColors(PAL.nightTop, PAL.dayTop, day).lerp(PAL.duskTop, dusk * 0.55);
    // Thinner air up high: a deeper blue overhead
    u.uTop.value.multiplyScalar(1 - altitude01 * 0.35 * day);
    u.uHorizon.value.lerpColors(PAL.nightHorizon, PAL.dayHorizon, day).lerp(PAL.duskHorizon, dusk * 0.8);
    // Up high the air is clear: a bluer horizon
    u.uHorizon.value.lerp(PAL.highHorizon, altitude01 * 0.45 * day);
    u.uGround.value.copy(u.uHorizon.value).multiplyScalar(0.55);
    u.uSunDir.value.copy(this.sunDir);
    u.uSunColor.value.lerpColors(PAL.sunDay, PAL.sunDusk, clamp(dusk * 1.4, 0, 1));
    u.uSunVis.value = smoothstep(-0.08, 0.04, e);

    this.dome.position.copy(cameraPos);
    this.stars.position.copy(cameraPos);
    this.stars.rotation.y = hour * 0.02;
    this.starMat.opacity = this.night * 0.95;
    this.moon.position.copy(cameraPos).addScaledVector(this.moonDir, 2000);
    this.moon.material.opacity = 0.25 + this.night * 0.75;

    // Light follows the sun by day and the moon at night
    const sunUp = smoothstep(0.0, 0.16, e);
    const moonUp = smoothstep(0.0, -0.16, e);
    if (e >= 0) {
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 220);
      this.sun.color.lerpColors(PAL.sunDusk, PAL.sunDay, smoothstep(0.05, 0.4, e));
      this.sun.intensity = 3.4 * sunUp;
    } else {
      this.sun.position.copy(focus).addScaledVector(this.moonDir, 220);
      this.sun.color.copy(PAL.moon);
      this.sun.intensity = 0.95 * moonUp;
    }
    // Keep shadow texels steady as the player moves
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    this.hemi.intensity = lerp(0.5, 0.9, smoothstep(-0.2, 0.25, e));
    this.hemi.color.lerpColors(new THREE.Color('#5a6fb0'), new THREE.Color('#cfe6ff'), day);
    this.hemi.groundColor.lerpColors(new THREE.Color('#1d2433'), new THREE.Color('#4b5a3c'), day);

    this.fogColor.copy(u.uHorizon.value);
    return { dayness: day, night: this.night, dusk };
  }
}

// A soft reflection map so the car and water have something to reflect
export function makeEnvMap(renderer) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; void main(){ vec3 d = normalize(vDir);
      vec3 top = vec3(0.18, 0.42, 0.85); vec3 hor = vec3(0.85, 0.92, 1.0); vec3 gnd = vec3(0.22, 0.24, 0.2);
      vec3 c = d.y > 0.0 ? mix(hor, top, pow(d.y, 0.5)) : mix(hor * 0.6, gnd, pow(-d.y, 0.4));
      c += vec3(1.0, 0.95, 0.85) * pow(max(dot(d, normalize(vec3(0.5, 0.6, 0.3))), 0.0), 64.0) * 6.0;
      gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  return rt.texture;
}
