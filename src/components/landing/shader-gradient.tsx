"use client";

import { useEffect, useRef } from "react";

/**
 * Animated brand mesh gradient in a single fragment shader (domain-warped noise + film grain).
 * No 3D library: ~2KB of GLSL. Pauses when off-screen or the tab is hidden, renders one still
 * frame for prefers-reduced-motion, caps DPR, and the CSS gradient underneath is the fallback
 * if WebGL is unavailable.
 */

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 r;
uniform float t;

vec3 c1 = vec3(0.043, 0.231, 0.290);  // #0B3B4A deep navy-teal
vec3 c2 = vec3(0.055, 0.486, 0.400);  // #0E7C66 brand teal
vec3 c3 = vec3(0.482, 0.878, 0.722);  // #7BE0B8 mint
vec3 c4 = vec3(0.020, 0.071, 0.098);  // near-black

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / r.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * r.xy) / min(r.x, r.y);
  float s = t * 0.045;
  vec2 q = vec2(fbm(p * 1.4 + s), fbm(p * 1.4 - s + 3.1));
  vec2 w = vec2(fbm(p * 1.8 + 2.4 * q + vec2(1.7, 9.2) + 0.6 * s), fbm(p * 1.8 + 2.4 * q + vec2(8.3, 2.8) - 0.4 * s));
  float f = fbm(p * 1.6 + 2.2 * w);

  vec3 col = mix(c4, c1, smoothstep(0.05, 0.55, f));
  col = mix(col, c2, smoothstep(0.35, 0.85, f + 0.25 * w.x));
  col = mix(col, c3, smoothstep(0.62, 1.05, f + 0.35 * q.y) * 0.75);
  col *= 0.85 + 0.25 * smoothstep(1.2, 0.2, length(p - vec2(0.35, 0.25)));   // soft light from top-right
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) * 0.035;                      // film grain
  gl_FragColor = vec4(col, 1.0);
}`;

export function ShaderGradient({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) return; // CSS gradient fallback stays visible

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, "r");
    const uT = gl.getUniformLocation(prog, "t");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr * 0.6)); // render at 60% res; the gradient is soft anyway
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr * 0.6));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    let raf = 0;
    let visible = true;
    const start = performance.now() - 20_000; // start mid-flow, not at t=0
    const draw = (now: number) => {
      resize();
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.style.opacity = "1";
    };
    const loop = (now: number) => {
      draw(now);
      if (!reduced && visible && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });
    io.observe(canvas);
    const onVis = () => !document.hidden && kick();
    document.addEventListener("visibilitychange", onVis);
    const ro = new ResizeObserver(() => draw(performance.now()));
    ro.observe(canvas);
    kick();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className={className} aria-hidden="true" style={{ background: "radial-gradient(120% 90% at 75% 20%, #0E7C66 0%, #0B3B4A 45%, #05121a 100%)" }}>
      <canvas ref={ref} className="h-full w-full opacity-0 transition-opacity duration-700" />
    </div>
  );
}
