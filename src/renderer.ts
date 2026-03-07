import { FRAG_SRC, VERT_SRC } from "./shaders";
import type { PaletteData, RendererApi, Vec2, Vec3 } from "./types";

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const createShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Shader creation failed.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error";
    gl.deleteShader(shader);
    throw new Error(log);
  }

  return shader;
};

const createProgram = (gl: WebGLRenderingContext, vertSrc: string, fragSrc: string): WebGLProgram => {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);

  const program = gl.createProgram();
  if (!program) {
    throw new Error("Program creation failed.");
  }

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "Unknown link error";
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error(log);
  }

  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
};

const flattenPalette = (palette: Vec3[]): Float32Array => {
  const out = new Float32Array(30);
  for (let i = 0; i < 10; i += 1) {
    const c = palette[i] ?? palette[palette.length - 1] ?? [0.5, 0.5, 0.5];
    out[i * 3] = clamp01(c[0]);
    out[i * 3 + 1] = clamp01(c[1]);
    out[i * 3 + 2] = clamp01(c[2]);
  }
  return out;
};

const normalizeWeights = (weights: number[]): Float32Array => {
  const out = new Float32Array(10);
  for (let i = 0; i < 10; i += 1) {
    out[i] = Math.max(0.0001, weights[i] ?? 0.1);
  }

  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += out[i];
  }

  const inv = sum > 0 ? 1 / sum : 0.1;
  for (let i = 0; i < 10; i += 1) {
    out[i] *= inv;
  }

  return out;
};

const flattenAnchors = (anchors: Vec2[]): Float32Array => {
  const out = new Float32Array(20);
  for (let i = 0; i < 10; i += 1) {
    const a = anchors[i] ?? [0.5, 0.5];
    out[i * 2] = clamp01(a[0]);
    out[i * 2 + 1] = clamp01(a[1]);
  }
  return out;
};

const normalizeFocus = (focus: number[]): Float32Array => {
  const out = new Float32Array(10);
  for (let i = 0; i < 10; i += 1) {
    out[i] = clamp01(focus[i] ?? 0.5);
  }
  return out;
};

const requireUniform = (gl: WebGLRenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation => {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`Uniform not found: ${name}`);
  }
  return location;
};

export const createRenderer = (canvas: HTMLCanvasElement, initialPaletteData: PaletteData): RendererApi => {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: false
  });
  if (!gl) {
    throw new Error("WebGL not supported.");
  }

  const program = createProgram(gl, VERT_SRC, FRAG_SRC);
  gl.useProgram(program);

  const aPosLoc = gl.getAttribLocation(program, "a_position");
  if (aPosLoc < 0) {
    throw new Error("Attribute not found: a_position");
  }

  const uResLoc = requireUniform(gl, program, "u_resolution");
  const uTimeLoc = requireUniform(gl, program, "u_time");
  const uPaletteLoc = requireUniform(gl, program, "u_palette");
  const uColorWeightsLoc = requireUniform(gl, program, "u_colorWeights");
  const uColorAnchorsLoc = requireUniform(gl, program, "u_colorAnchors");
  const uColorFocusLoc = requireUniform(gl, program, "u_colorFocus");
  const uTuneLoc = requireUniform(gl, program, "u_tune");
  const uSharpnessLoc = requireUniform(gl, program, "u_sharpness");

  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const vbo = gl.createBuffer();
  if (!vbo) {
    throw new Error("Buffer creation failed.");
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPosLoc);
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

  const baseColors = initialPaletteData.colors.slice(0, 10);
  while (baseColors.length < 10) {
    baseColors.push(baseColors[baseColors.length - 1] ?? [0.5, 0.5, 0.5]);
  }

  let colors = baseColors;
  let weights = normalizeWeights(initialPaletteData.weights);
  let anchors = flattenAnchors(initialPaletteData.anchors);
  let focus = normalizeFocus(initialPaletteData.focus);
  let paletteBuffer = flattenPalette(colors);
  let tune = new Float32Array([1, 1, 1, 1]);
  let sharpness = typeof initialPaletteData.sharpness === "number" ? initialPaletteData.sharpness : 0.5;
  const startMs = performance.now();

  const draw = (nowMs: number): void => {
    const elapsed = (nowMs - startMs) * 0.001;
    const t = elapsed % 10;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uResLoc, canvas.width, canvas.height);
    gl.uniform1f(uTimeLoc, t);
    gl.uniform3fv(uPaletteLoc, paletteBuffer);
    gl.uniform1fv(uColorWeightsLoc, weights);
    gl.uniform2fv(uColorAnchorsLoc, anchors);
    gl.uniform1fv(uColorFocusLoc, focus);
    gl.uniform4fv(uTuneLoc, tune);
    gl.uniform1f(uSharpnessLoc, sharpness);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);

  return {
    setPaletteData(nextData: PaletteData): void {
      const p = nextData.colors.slice(0, 10);
      while (p.length < 10) {
        p.push(p[p.length - 1] ?? [0.5, 0.5, 0.5]);
      }
      colors = p;
      weights = normalizeWeights(nextData.weights);
      anchors = flattenAnchors(nextData.anchors);
      focus = normalizeFocus(nextData.focus);
      if (typeof nextData.sharpness === "number") {
        sharpness = nextData.sharpness;
      }
      paletteBuffer = flattenPalette(colors);
    },
    getPalette(): Vec3[] {
      return colors.slice();
    },
    setTuning(nextTune: [number, number, number, number]): void {
      tune = new Float32Array([
        nextTune[0] ?? 1,
        nextTune[1] ?? 1,
        nextTune[2] ?? 1,
        nextTune[3] ?? 1
      ]);
    }
  };
};
