"use client";

import { useEffect, useRef } from "react";

// "Soffit", a free WebGL2 gradient layer from GetLayers AI (getlayers.ai),
// recoloured from its shipped purple to LiftLog's graphite and red. The
// shader is theirs, verbatim. CONFIG is retuned: the stock framing (scale
// 0.2, light from below) lit the whole phone screen, so here it zooms out and
// turns the light to fall from above, like a gym spotlight over the bar.
const CONFIG = {
  bgColor: "#0a0b0c",
  colorA: "#140808",
  colorB: "#3a0c0f",
  colorC: "#c42630",
  colorD: "#ff8a8a",
  scale: 1.2,
  speed: 0.33,
  tilt: 1.7,
  rock: 0.11,
  horizon: -0.05,
  breathe: 0.09,
  spread: 1.3,
  curve: 2.6,
  direct: 0.7,
  bounce: 0.06,
  bounceCurve: 1.7,
  spillCentre: 0.04,
  spillWidth: 0.55,
  spillFloor: 0.05,
  amount: 0.22,
  warp: 1.1,
  warpScale: 0.72,
  flow: 0.15,
  roughness: 0.52,
  lacunarity: 2.05,
  motes: 0.03,
  moteScale: 7,
  ambient: 0.04,
  contrast: 1.3,
  midpoint: 0.5,
  sink: 0.26,
  glow: 0.08,
  grain: 0,
  grainAnim: 0,
  dither: 1.2,
  vignette: 0.44,
  steer: 0.22,
  lift: 0.2,
  sweep: 0.3,
  parallax: 0.002,
  maxDpr: 1,
};

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  iResolution;
uniform float iTime;
uniform vec2  iMouse;
uniform float uScale;

uniform vec3  uBg, uColorA, uColorB, uColorC, uColorD;
uniform float uSpeed, uTilt, uRock, uHorizon, uBreathe, uSpread, uCurve, uDirect;
uniform float uBounce, uBounceCurve;
uniform float uSpillCentre, uSpillWidth, uSpillFloor;
uniform float uAmount, uWarp, uWarpScale, uFlow, uRoughness, uLacunarity, uMotes, uMoteScale;
uniform float uAmbient, uContrast, uMidpoint, uSink, uGlow;
uniform float uGrain, uDither, uVignette;
uniform float uSteer, uLift, uSweep, uParallax;

#define OCTAVES 4

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float snoise(vec2 p) {
  const float K1 = 0.366025404, K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1.0 - m);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h * vec3(dot(a, hash2(i)), dot(b, hash2(i + o)), dot(c, hash2(i + 1.0)));
  return dot(n, vec3(70.0));
}

float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    v += amp * snoise(p);
    p *= uLacunarity;
    amp *= uRoughness;
  }
  return v;
}

vec3 ramp4(float t) {
  vec3 c = mix(uColorA, uColorB, smoothstep(0.00, 0.36, t));
  c = mix(c, uColorC, smoothstep(0.32, 0.70, t));
  c = mix(c, uColorD, smoothstep(0.66, 1.00, t));
  return c;
}

float triDither(vec2 fc) {
  float a = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453);
  float b = fract(sin(dot(fc + 17.0, vec2(12.9898, 78.233))) * 43758.5453);
  return (a + b - 1.0) / 255.0;
}

uniform float uGrainAnim;
float houseGrain(vec2 fc) {
  uvec2 q = uvec2(fc) * uvec2(1597334677u, 3812015801u)
          + uint(floor(iTime * 24.0 * uGrainAnim)) * 2654435769u;
  uint n = q.x ^ q.y; n = n * 1664525u + 1013904223u; n ^= n >> 16u; n *= 2246822519u; n ^= n >> 13u;
  float a = float(n & 0xffffu) / 65535.0;
  n *= 3266489917u; n ^= n >> 16u;
  float b = float(n & 0xffffu) / 65535.0;
  return a + b - 1.0;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  uv *= uScale;
  vec2 iM = iMouse * uScale;
  float t = iTime * uSpeed;

  vec2 p = uv - iM * uParallax;

  float tilt = uTilt + sin(t * 0.13) * uRock + iM.x * uSteer;
  vec2 dir = vec2(cos(tilt), sin(tilt));
  float axis = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x));

  vec2 q = vec2(fbm(p * uWarpScale + vec2(0.0, t * uFlow)),
                fbm(p * uWarpScale + vec2(5.2, 1.3) - t * uFlow * 0.7));
  float air = fbm(p + uWarp * q + vec2(t * 0.12, -t * 0.09)) * 0.5 + 0.5;

  float horizon = uHorizon + sin(t * 0.09 + 2.1) * uBreathe - iM.y * uLift;
  float alt = clamp(0.5 + (axis - horizon) * uSpread + (air - 0.5) * uAmount, 0.0, 1.0);

  float ac = (across - uSpillCentre - iM.x * uSweep) / max(0.05, uSpillWidth);
  float spill = mix(uSpillFloor, 1.0, exp(-ac * ac));

  float direct = pow(alt, max(0.05, uCurve)) * uDirect * spill;

  float bounce = uBounce * pow(1.0 - alt, max(0.05, uBounceCurve));

  float f = uAmbient + direct + bounce;
  f += uMotes * snoise(p * uMoteScale + vec2(-t * 0.5, t * 0.35)) * 0.5 * alt;

  f = clamp((f - uMidpoint) * uContrast + 0.5, 0.0, 1.0);

  vec3 col = ramp4(f);
  col += uColorD * uGlow * pow(f, 4.0);
  col = mix(uBg, col, smoothstep(0.0, max(0.01, uSink), f) * 0.90 + 0.10);

  col *= 1.0 - uVignette * dot(uv, uv);
  { float hgL = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    col += houseGrain(gl_FragCoord.xy) * uGrain * mix(1.0, 4.0 * hgL * (1.0 - hgL), 0.6); }
  col += triDither(gl_FragCoord.xy) * uDither;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const hexToVec3 = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// Starts transparent and fades in after its first frame, so whatever sits
// behind it (the splash's CSS wash) shows until WebGL is ready. Without
// WebGL2 it simply never appears. Under reduced motion it draws one still
// frame. The pointer is left at rest: the splash is too brief to steer.
export function SoffitGradient({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!canvas || !gl || gl.isContextLost()) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
      return sh;
    };
    const program = gl.createProgram();
    try {
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    } catch {
      return;
    }
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());

    const loc = (n: string) => gl.getUniformLocation(program, n);
    const colours: [string, string][] = [
      ["uBg", CONFIG.bgColor],
      ["uColorA", CONFIG.colorA],
      ["uColorB", CONFIG.colorB],
      ["uColorC", CONFIG.colorC],
      ["uColorD", CONFIG.colorD],
    ];
    for (const [n, hex] of colours) gl.uniform3f(loc(n), ...hexToVec3(hex));
    const skip = new Set(["bgColor", "colorA", "colorB", "colorC", "colorD", "maxDpr"]);
    for (const [k, v] of Object.entries(CONFIG)) {
      if (!skip.has(k) && typeof v === "number") gl.uniform1f(loc(`u${k[0].toUpperCase()}${k.slice(1)}`), v);
    }
    gl.uniform2f(loc("iMouse"), 0, 0);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(loc("iResolution"), w, h);
    };
    resize();

    // The shader clock accumulates clamped frame intervals rather than wall
    // time, so a backgrounded tab pauses instead of lurching.
    let clock = 0;
    let prev = performance.now();
    let raf = 0;
    const draw = () => {
      gl.uniform1f(loc("iTime"), clock);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const ms = Math.min(50, Math.max(4.167, now - prev));
      prev = now;
      if (document.hidden) return;
      clock += ms * 0.001;
      draw();
    };

    draw();
    canvas.style.opacity = "1";
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize, { passive: true });

    // No loseContext() here: a remount (React's dev double-mount included)
    // reuses this canvas, and a lost context can't be revived. The browser
    // frees it when the splash unmounts.
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`opacity-0 transition-opacity duration-700 ${className}`} />;
}
