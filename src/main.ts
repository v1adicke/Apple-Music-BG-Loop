import "./style.css";
import { extractPaletteData } from "./palette";
import { recordCanvasLoop } from "./recorder";
import { createRenderer } from "./renderer";
import type { PaletteData, Vec3 } from "./types";

const defaultPaletteData: PaletteData = {
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
  weights: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  anchors: Array.from({ length: 10 }, () => [0.5, 0.5] as [number, number]),
  focus: new Array(10).fill(0.5),
  sharpness: 0.5
};

const motionPresets: Record<string, [number, number, number]> = {
  soft: [0.68, 0.72, 0.84],
  balanced: [1, 1, 1],
  active: [1.42, 1.45, 1.24]
};

const texturePresets: Record<string, number> = {
  clean: 0.05,
  balanced: 0.8,
  grain: 1.9
};

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
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

const updateSwatches = (container: HTMLElement, palette: Vec3[]): void => {
  container.innerHTML = "";

  for (let i = 0; i < 10; i += 1) {
    const c = palette[i] ?? [0, 0, 0];
    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
    container.appendChild(sw);
  }
};

const getRequiredElement = <T extends Element>(selector: string): T => {
  const node = document.querySelector(selector);
  if (!node) {
    throw new Error(`Element not found: ${selector}`);
  }
  return node as T;
};

const boot = (): void => {
  const canvas = getRequiredElement<HTMLCanvasElement>("#glCanvas");
  const uploadBtn = getRequiredElement<HTMLButtonElement>("#uploadBtn");
  const recordBtn = getRequiredElement<HTMLButtonElement>("#recordBtn");
  const fileInput = getRequiredElement<HTMLInputElement>("#fileInput");
  const motionMode = getRequiredElement<HTMLSelectElement>("#motionMode");
  const textureMode = getRequiredElement<HTMLSelectElement>("#textureMode");
  const statusEl = getRequiredElement<HTMLDivElement>("#status");
  const swatchesEl = getRequiredElement<HTMLDivElement>("#swatches");

  let renderer: ReturnType<typeof createRenderer>;

  try {
    renderer = createRenderer(canvas, defaultPaletteData);
  } catch (error) {
    statusEl.textContent = `Ошибка WebGL: ${String((error as Error).message ?? error)}`;
    uploadBtn.disabled = true;
    recordBtn.disabled = true;
    motionMode.disabled = true;
    textureMode.disabled = true;
    return;
  }

  const applyModes = (): void => {
    const motionKey = motionMode.value in motionPresets ? motionMode.value : "balanced";
    const textureKey = textureMode.value in texturePresets ? textureMode.value : "balanced";
    const motion = motionPresets[motionKey];
    const grain = texturePresets[textureKey];

    renderer.setTuning([motion[0], motion[1], motion[2], grain]);
    statusEl.textContent = `Режим: ${motionKey} / ${textureKey}`;
  };

  applyModes();
  motionMode.addEventListener("change", applyModes);
  textureMode.addEventListener("change", applyModes);
  updateSwatches(swatchesEl, renderer.getPalette());

  uploadBtn.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }

    statusEl.textContent = "Извлечение палитры...";

    try {
      const image = await loadImageFromFile(file);
      const paletteData = extractPaletteData(image, 10);
      renderer.setPaletteData(paletteData);
      updateSwatches(swatchesEl, paletteData.colors);
      const sharp = typeof paletteData.sharpness === "number" ? paletteData.sharpness.toFixed(2) : "n/a";
      statusEl.textContent = `Палитра обновлена. sharp=${sharp}`;
    } catch (error) {
      statusEl.textContent = `Ошибка обработки изображения: ${String((error as Error).message ?? error)}`;
    }
  });

  recordBtn.addEventListener("click", async () => {
    uploadBtn.disabled = true;
    recordBtn.disabled = true;
    statusEl.textContent = "Запись: 10 секунд...";

    try {
      await recordCanvasLoop({
        canvas,
        durationMs: 10_000,
        fps: 60,
        bitrate: 25_000_000,
        mimeType: "video/webm; codecs=vp9"
      });
      statusEl.textContent = "Готово: файл скачан.";
    } catch (error) {
      statusEl.textContent = `Ошибка записи: ${String((error as Error).message ?? error)}`;
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
