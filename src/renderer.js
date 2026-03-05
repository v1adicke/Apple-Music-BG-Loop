(function initRendererModule(globalScope) {
  // небольшой helper слой вокруг webgl api
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  const createShader = (gl, type, source) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Shader creation failed.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || "Unknown shader compile error";
      gl.deleteShader(shader);
      throw new Error(log);
    }
    return shader;
  };

  const createProgram = (gl, vertSrc, fragSrc) => {
    const vs = createShader(gl, gl.VERTEX_SHADER, vertSrc);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram();
    if (!program) throw new Error("Program creation failed.");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || "Unknown link error";
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw new Error(log);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  };

  const flattenPalette = (palette) => {
    // пакуем 10 rgb в плоский float32 массив
    const out = new Float32Array(30);
    for (let i = 0; i < 10; i += 1) {
      const c = palette[i] || palette[palette.length - 1] || [0.5, 0.5, 0.5];
      out[i * 3] = clamp01(c[0]);
      out[i * 3 + 1] = clamp01(c[1]);
      out[i * 3 + 2] = clamp01(c[2]);
    }
    return out;
  };

  const normalizeWeights = (weights) => {
    // нормализуем веса чтобы сумма была 1
    const out = new Float32Array(10);
    for (let i = 0; i < 10; i += 1) {
      out[i] = Math.max(0.0001, weights[i] ?? 0.1);
    }
    let sum = 0;
    for (let i = 0; i < 10; i += 1) sum += out[i];
    const inv = sum > 0 ? 1 / sum : 0.1;
    for (let i = 0; i < 10; i += 1) out[i] *= inv;
    return out;
  };

  const flattenAnchors = (anchors) => {
    // якоря цветов тоже в плоский массив
    const out = new Float32Array(20);
    for (let i = 0; i < 10; i += 1) {
      const a = anchors[i] || [0.5, 0.5];
      out[i * 2] = clamp01(a[0]);
      out[i * 2 + 1] = clamp01(a[1]);
    }
    return out;
  };

  const normalizeFocus = (focus) => {
    // clamp на всякий случай если из палитры придет значение за [0..1]
    const out = new Float32Array(10);
    for (let i = 0; i < 10; i += 1) {
      out[i] = clamp01(focus[i] ?? 0.5);
    }
    return out;
  };

  const createRenderer = (canvas, initialPaletteData) => {
    // один webgl контекст и дальше только обновляем uniformы
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: false
    });
    if (!gl) throw new Error("WebGL not supported.");

    const shaders = globalScope.AppShaders;
    if (!shaders || !shaders.VERT_SRC || !shaders.FRAG_SRC) {
      throw new Error("Shaders are not loaded.");
    }

    const program = createProgram(gl, shaders.VERT_SRC, shaders.FRAG_SRC);
    gl.useProgram(program);

    const aPosLoc = gl.getAttribLocation(program, "a_position");
    const uResLoc = gl.getUniformLocation(program, "u_resolution");
    const uTimeLoc = gl.getUniformLocation(program, "u_time");
    const uPaletteLoc = gl.getUniformLocation(program, "u_palette");
    const uColorWeightsLoc = gl.getUniformLocation(program, "u_colorWeights");
    const uColorAnchorsLoc = gl.getUniformLocation(program, "u_colorAnchors");
    const uColorFocusLoc = gl.getUniformLocation(program, "u_colorFocus");
    const uTuneLoc = gl.getUniformLocation(program, "u_tune");
    const uSharpnessLoc = gl.getUniformLocation(program, "u_sharpness");

    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1
    ]);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

    let colors = (initialPaletteData.colors || []).slice(0, 10);
    while (colors.length < 10) colors.push(colors[colors.length - 1] || [0.5, 0.5, 0.5]);

    let weights = normalizeWeights(initialPaletteData.weights || [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    let anchors = flattenAnchors(initialPaletteData.anchors || []);
    let focus = normalizeFocus(initialPaletteData.focus || []);
    let paletteBuffer = flattenPalette(colors);
    let tune = new Float32Array([1.0, 1.0, 1.0, 1.0]);
    let sharpness = typeof initialPaletteData.sharpness === "number" ? initialPaletteData.sharpness : 0.5;
    const startMs = performance.now();

    const draw = (nowMs) => {
      // луп ровно 10 сек чтобы экспорт совпадал пиксель в пиксель
      const elapsed = (nowMs - startMs) * 0.001;
      const t = elapsed % 10.0;
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
      setPaletteData(nextData) {
        // принимаем новую палитру из анализатора и обновляем uniform буферы
        const p = (nextData.colors || []).slice(0, 10);
        while (p.length < 10) p.push(p[p.length - 1] || [0.5, 0.5, 0.5]);
        colors = p;
        weights = normalizeWeights(nextData.weights || [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
        anchors = flattenAnchors(nextData.anchors || []);
        focus = normalizeFocus(nextData.focus || []);
        sharpness = typeof nextData.sharpness === "number" ? nextData.sharpness : sharpness;
        paletteBuffer = flattenPalette(colors);
      },
      getPalette() {
        return colors.slice();
      },
      setTuning(nextTune) {
        tune = new Float32Array([
          nextTune[0] ?? 1.0,
          nextTune[1] ?? 1.0,
          nextTune[2] ?? 1.0,
          nextTune[3] ?? 1.0
        ]);
      }
    };
  };

  globalScope.AppRenderer = { createRenderer };
})(window);
