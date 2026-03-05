(function initMainModule(globalScope) {
  // запасная палитра пока картинку не загрузили
  const defaultPaletteData = {
    colors: [
      [0.95, 0.25, 0.34],
      [0.97, 0.62, 0.24],
      [0.24, 0.75, 0.67],
      [0.25, 0.54, 0.95],
      [0.74, 0.38, 0.94],
      [0.95, 0.25, 0.34],
      [0.97, 0.62, 0.24],
      [0.24, 0.75, 0.67],
      [0.25, 0.54, 0.95],
      [0.74, 0.38, 0.94]
    ],
    weights: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]
  };

  const motionPresets = {
    soft: [0.68, 0.72, 0.84],
    balanced: [1.0, 1.0, 1.0],
    active: [1.42, 1.45, 1.24]
  };

  const texturePresets = {
    clean: 0.05,
    balanced: 0.8,
    grain: 1.9
  };

  const loadImageFromFile = (file) => new Promise((resolve, reject) => {
    // грузим через object url чтобы не трогать файловую систему
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось загрузить изображение."));
    };
    img.src = url;
  });

  const updateSwatches = (el, palette) => {
    // просто быстрый превью что прилетело из палитры
    el.innerHTML = "";
    for (let i = 0; i < 10; i += 1) {
      const c = palette[i] || [0, 0, 0];
      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.style.background = `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
      el.appendChild(sw);
    }
  };

  const boot = () => {
    // забираем все элементы ui в одном месте
    const canvas = document.getElementById("glCanvas");
    const uploadBtn = document.getElementById("uploadBtn");
    const recordBtn = document.getElementById("recordBtn");
    const fileInput = document.getElementById("fileInput");
    const motionMode = document.getElementById("motionMode");
    const textureMode = document.getElementById("textureMode");
    const statusEl = document.getElementById("status");
    const swatchesEl = document.getElementById("swatches");

    let renderer;
    try {
      renderer = globalScope.AppRenderer.createRenderer(canvas, defaultPaletteData);
    } catch (err) {
      statusEl.textContent = "Ошибка WebGL: " + String(err.message || err);
      uploadBtn.disabled = true;
      recordBtn.disabled = true;
      motionMode.disabled = true;
      textureMode.disabled = true;
      return;
    }

    const applyModes = () => {
      // тут просто склеиваем два селектора в один набор параметров
      const motionKey = motionMode.value in motionPresets ? motionMode.value : "balanced";
      const textureKey = textureMode.value in texturePresets ? textureMode.value : "balanced";
      const m = motionPresets[motionKey];
      const g = texturePresets[textureKey];
      renderer.setTuning([m[0], m[1], m[2], g]);
      statusEl.textContent = "Режим: " + motionKey + " / " + textureKey;
    };

    applyModes();
    motionMode.addEventListener("change", applyModes);
    textureMode.addEventListener("change", applyModes);

    updateSwatches(swatchesEl, renderer.getPalette());

    uploadBtn.addEventListener("click", () => {
      // прокидываем клик в скрытый input
      fileInput.value = "";
      fileInput.click();
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      statusEl.textContent = "Извлечение палитры...";
      try {
        // палитра уже приходит с весами и концентрацией
        const img = await loadImageFromFile(file);
        const paletteData = globalScope.AppPalette.extractPaletteData(img, 10);
        renderer.setPaletteData(paletteData);
        updateSwatches(swatchesEl, paletteData.colors);
        const sharp = typeof paletteData.sharpness === "number" ? paletteData.sharpness.toFixed(2) : "n/a";
        statusEl.textContent = "Палитра обновлена. sharp=" + sharp;
      } catch (err) {
        statusEl.textContent = "Ошибка обработки изображения: " + String(err.message || err);
      }
    });

    recordBtn.addEventListener("click", async () => {
      // на время записи блокируем кнопки чтобы не ломать поток
      uploadBtn.disabled = true;
      recordBtn.disabled = true;
      statusEl.textContent = "Запись: 10 секунд...";
      try {
        await globalScope.AppRecorder.recordCanvasLoop({
          canvas,
          durationMs: 10000,
          fps: 60,
          bitrate: 25000000,
          mimeType: "video/webm; codecs=vp9"
        });
        statusEl.textContent = "Готово: файл скачан.";
      } catch (err) {
        statusEl.textContent = "Ошибка записи: " + String(err.message || err.name || err);
      } finally {
        uploadBtn.disabled = false;
        recordBtn.disabled = false;
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
