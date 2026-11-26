// Hand-drawn mountain film look: the scene renders to a texture, then one
// full-screen pass adds ink outlines (from depth edges), a cool, slightly
// faded color grade, a soft paper grain and a vignette.
import * as THREE from 'three';

const vert = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const frag = `#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uInk;
uniform float uTime;
uniform float uNight;
uniform float uThick;
varying vec2 vUv;

// 1 / distance: flat surfaces change linearly across the screen in this
// space, so only real edges (object outlines, ridgelines) light up.
float invDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float vz = perspectiveDepthToViewZ(d, uNear, uFar);
  return 1.0 / max(-vz, 0.001);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  vec2 px = uThick / uRes;
  float w0 = invDepth(vUv);
  float wl = invDepth(vUv - vec2(px.x, 0.0));
  float wr = invDepth(vUv + vec2(px.x, 0.0));
  float wu = invDepth(vUv + vec2(0.0, px.y));
  float wd = invDepth(vUv - vec2(0.0, px.y));
  float lap = abs(wl + wr + wu + wd - 4.0 * w0) / max(w0, 1e-5);
  float edge = smoothstep(0.06, 0.22, lap);
  // Thinner, softer lines far away so distant peaks read like paint
  float dist = 1.0 / max(w0, 1e-5);
  edge *= 1.0 - 0.75 * smoothstep(120.0, 900.0, dist);

  // Grade: a little less saturation, cool blue shadows, warm light
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 0.97);
  // A bit more contrast (an S-curve on brightness), like painted cels
  float pl = pow(max(l, 0.0), 0.4545);
  float pc = max(0.5 + (pl - 0.5) * 1.14, 0.0);
  col *= pow(pc, 2.2) / max(l, 1e-4);
  float shadow = 1.0 - smoothstep(0.0, 0.32, l);
  col += shadow * vec3(-0.004, 0.002, 0.018) * (1.0 + uNight);
  col *= mix(vec3(1.0), vec3(1.03, 1.0, 0.95), smoothstep(0.35, 1.2, l));

  vec3 ink = mix(vec3(0.012, 0.014, 0.024), vec3(0.03, 0.04, 0.08), uNight);
  col = mix(col, ink, edge * uInk);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  // Paper: faint large blotches and fine grain
  float paper = vnoise(vUv * uRes / 220.0) * 0.5 + vnoise(vUv * uRes / 60.0) * 0.5;
  gl_FragColor.rgb *= 0.975 + paper * 0.04;
  gl_FragColor.rgb += (hash(vUv * uRes + fract(uTime) * 17.0) - 0.5) * 0.018;
  vec2 c = vUv - 0.5;
  gl_FragColor.rgb *= 1.0 - smoothstep(0.42, 0.85, length(c * vec2(1.1, 1.0))) * 0.28;
}`;

export class InkPass {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = renderer.capabilities.isWebGL2;
    if (!this.enabled) return;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uInk: { value: 0.85 },
        uTime: { value: 0 },
        uNight: { value: 0 },
        uThick: { value: 1 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.size = new THREE.Vector2();
    this.makeTarget(1, 1);
  }

  makeTarget(w, h) {
    if (this.rt) {
      this.rt.depthTexture.dispose();
      this.rt.dispose();
    }
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.rt.depthTexture = new THREE.DepthTexture(w, h);
    this.material.uniforms.tColor.value = this.rt.texture;
    this.material.uniforms.tDepth.value = this.rt.depthTexture;
  }

  setSize() {
    if (!this.enabled) return;
    this.renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x)), h = Math.max(1, Math.floor(this.size.y));
    if (this.rt.width !== w || this.rt.height !== h) this.makeTarget(w, h);
    this.material.uniforms.uRes.value.set(w, h);
    this.material.uniforms.uThick.value = Math.max(1, h / 820);
  }

  render(scene, camera, { time = 0, night = 0 } = {}) {
    const r = this.renderer;
    if (!this.enabled) {
      r.render(scene, camera);
      return;
    }
    const u = this.material.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uTime.value = time;
    u.uNight.value = night;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
