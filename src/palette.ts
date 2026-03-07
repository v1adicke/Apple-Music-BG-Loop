import type { PaletteData, Vec2, Vec3 } from "./types";

interface Pixel {
  c: Vec3;
  x: number;
  y: number;
}

interface Sample {
  data: Uint8ClampedArray;
  size: number;
}

interface Cluster {
  color: Vec3;
  share: number;
  anchor: Vec2;
  focus: number;
}

interface WeightedCluster {
  color: Vec3;
  anchor: Vec2;
  focus: number;
  weight: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const colorDist = (a: Vec3, b: Vec3): number => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const rgbToSv = (r: number, g: number, b: number): [number, number] => {
  const maxc = Math.max(r, g, b);
  const minc = Math.min(r, g, b);
  const d = maxc - minc;
  const s = maxc === 0 ? 0 : d / maxc;
  return [s, maxc];
};

const luminance = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const sampleImage = (image: CanvasImageSource, size: number): Sample => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("2D context is not available.");
  }
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  return { data: img.data, size };
};

const buildPixels = (sample: Sample): Pixel[] => {
  const pixels: Pixel[] = [];
  const { data, size } = sample;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const alpha = data[i + 3];
      if (alpha < 32) {
        continue;
      }

      pixels.push({
        c: [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255],
        x: (x + 0.5) / size,
        y: (y + 0.5) / size
      });
    }
  }

  return pixels;
};

const seededRandom = (seed: number): (() => number) => {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100_000) / 100_000;
  };
};

const initCentroids = (pixels: Pixel[], k: number, rand: () => number): Vec3[] => {
  const centroids: Vec3[] = [];
  centroids.push(pixels[Math.floor(rand() * pixels.length)].c);

  while (centroids.length < k) {
    let sum = 0;
    const d2 = new Array<number>(pixels.length);

    for (let i = 0; i < pixels.length; i += 1) {
      let best = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centroids.length; c += 1) {
        const d = colorDist(pixels[i].c, centroids[c]);
        const dd = d * d;
        if (dd < best) {
          best = dd;
        }
      }
      d2[i] = best;
      sum += best;
    }

    if (sum <= 1e-12) {
      centroids.push(pixels[Math.floor(rand() * pixels.length)].c);
    } else {
      let t = rand() * sum;
      let pick = 0;
      for (let i = 0; i < d2.length; i += 1) {
        t -= d2[i];
        if (t <= 0) {
          pick = i;
          break;
        }
      }
      centroids.push(pixels[pick].c);
    }
  }

  return centroids.map((c) => [c[0], c[1], c[2]]);
};

const runKMeans = (pixels: Pixel[], k: number): Cluster[] => {
  const rand = seededRandom(1337);
  const centroids = initCentroids(pixels, k, rand);
  const asg = new Array<number>(pixels.length).fill(0);

  for (let iter = 0; iter < 24; iter += 1) {
    let changed = false;

    for (let i = 0; i < pixels.length; i += 1) {
      let bestIdx = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let c = 0; c < k; c += 1) {
        const d = colorDist(pixels[i].c, centroids[c]);
        if (d < best) {
          best = d;
          bestIdx = c;
        }
      }
      if (asg[i] !== bestIdx) {
        asg[i] = bestIdx;
        changed = true;
      }
    }

    const sr = new Array<number>(k).fill(0);
    const sg = new Array<number>(k).fill(0);
    const sb = new Array<number>(k).fill(0);
    const ct = new Array<number>(k).fill(0);

    for (let i = 0; i < pixels.length; i += 1) {
      const a = asg[i];
      sr[a] += pixels[i].c[0];
      sg[a] += pixels[i].c[1];
      sb[a] += pixels[i].c[2];
      ct[a] += 1;
    }

    for (let c = 0; c < k; c += 1) {
      if (ct[c] > 0) {
        centroids[c][0] = sr[c] / ct[c];
        centroids[c][1] = sg[c] / ct[c];
        centroids[c][2] = sb[c] / ct[c];
      }
    }

    if (!changed && iter > 2) {
      break;
    }
  }

  const ct = new Array<number>(k).fill(0);
  const sx = new Array<number>(k).fill(0);
  const sy = new Array<number>(k).fill(0);
  const sumDist = new Array<number>(k).fill(0);

  for (let i = 0; i < pixels.length; i += 1) {
    const a = asg[i];
    ct[a] += 1;
    sx[a] += pixels[i].x;
    sy[a] += pixels[i].y;
    sumDist[a] += colorDist(pixels[i].c, centroids[a]);
  }

  const total = pixels.length || 1;
  const clusters: Cluster[] = [];

  for (let c = 0; c < k; c += 1) {
    if (ct[c] <= 0) {
      continue;
    }

    const share = ct[c] / total;
    const cx = sx[c] / ct[c];
    const cy = sy[c] / ct[c];
    const avgDist = sumDist[c] / ct[c];

    let varSum = 0;
    for (let i = 0; i < pixels.length; i += 1) {
      if (asg[i] !== c) {
        continue;
      }
      const dx = pixels[i].x - cx;
      const dy = pixels[i].y - cy;
      varSum += dx * dx + dy * dy;
    }

    const spread = Math.sqrt(varSum / ct[c]);
    const spatialConc = clamp01(1 - spread / 0.34);
    const colorConc = clamp01(1 - avgDist / 0.3);
    const focus = clamp01(0.65 * spatialConc + 0.35 * colorConc);

    clusters.push({
      color: centroids[c].slice() as Vec3,
      share,
      anchor: [clamp01(cx), clamp01(cy)],
      focus
    });
  }

  return clusters;
};

const mergeClose = (clusters: Cluster[]): Cluster[] => {
  const sorted = clusters.slice().sort((a, b) => b.share - a.share);
  const groups: Cluster[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const c = sorted[i];
    const [sat] = rgbToSv(c.color[0], c.color[1], c.color[2]);
    let target = -1;

    for (let j = 0; j < groups.length; j += 1) {
      const g = groups[j];
      const [gSat] = rgbToSv(g.color[0], g.color[1], g.color[2]);
      const d = colorDist(c.color, g.color);
      const neutralMerge = sat < 0.16 && gSat < 0.16 && d < 0.085;
      const generalMerge = d < 0.052;
      if (neutralMerge || generalMerge) {
        target = j;
        break;
      }
    }

    if (target === -1) {
      groups.push({
        color: c.color.slice() as Vec3,
        share: c.share,
        anchor: c.anchor.slice() as Vec2,
        focus: c.focus
      });
    } else {
      const g = groups[target];
      const sum = g.share + c.share;
      g.color = [
        (g.color[0] * g.share + c.color[0] * c.share) / sum,
        (g.color[1] * g.share + c.color[1] * c.share) / sum,
        (g.color[2] * g.share + c.color[2] * c.share) / sum
      ];
      g.anchor = [
        (g.anchor[0] * g.share + c.anchor[0] * c.share) / sum,
        (g.anchor[1] * g.share + c.anchor[1] * c.share) / sum
      ];
      g.focus = (g.focus * g.share + c.focus * c.share) / sum;
      g.share = sum;
    }
  }

  return groups.sort((a, b) => b.share - a.share);
};

const adjustWeights = (groups: Cluster[]): WeightedCluster[] => {
  let backgroundIndex = -1;
  let backgroundShare = 0;

  for (let i = 0; i < groups.length; i += 1) {
    const c = groups[i].color;
    const [sat] = rgbToSv(c[0], c[1], c[2]);
    const lum = luminance(c[0], c[1], c[2]);
    if (lum > 0.72 && sat < 0.12 && groups[i].share > backgroundShare) {
      backgroundIndex = i;
      backgroundShare = groups[i].share;
    }
  }

  const out = groups.map((g, i) => {
    const c = g.color;
    const [sat] = rgbToSv(c[0], c[1], c[2]);
    const lum = luminance(c[0], c[1], c[2]);
    const fgSat = clamp01((sat - 0.08) / 0.45);
    const fgLum = clamp01((0.78 - lum) / 0.55);
    const fgScore = clamp01(0.62 * fgSat + 0.38 * fgLum);
    let w = g.share * (1 + 1.6 * fgScore + 0.9 * g.focus);

    if (i === backgroundIndex) {
      w *= 0.46;
    }

    return {
      color: g.color,
      anchor: g.anchor,
      focus: g.focus,
      weight: w
    };
  });

  let sum = 0;
  out.forEach((item) => {
    sum += item.weight;
  });
  const inv = sum > 0 ? 1 / sum : 1;
  out.forEach((item) => {
    item.weight *= inv;
  });

  return out;
};

const toSlots = (items: WeightedCluster[], slots: number): PaletteData => {
  const work = items
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((item) => ({ ...item, splits: 0 }));

  while (work.length > slots) {
    work.sort((a, b) => a.weight - b.weight);
    work.shift();
  }

  while (work.length < slots) {
    work.sort((a, b) => b.weight / (1 + b.splits) - a.weight / (1 + a.splits));
    const t = work[0];
    t.splits += 1;
    const j = 0.018 * (1 - t.focus);
    work.push({
      color: [clamp01(t.color[0] - j * 0.7), clamp01(t.color[1] + j * 0.2), clamp01(t.color[2] + j)],
      anchor: [clamp01(t.anchor[0] + j * 2), clamp01(t.anchor[1] - j * 1.8)],
      focus: t.focus,
      weight: t.weight,
      splits: t.splits
    });
  }

  const colors: Vec3[] = [];
  const anchors: Vec2[] = [];
  const focus: number[] = [];
  const weights: number[] = [];

  let sum = 0;
  work.forEach((item) => {
    colors.push(item.color);
    anchors.push(item.anchor);
    focus.push(item.focus);
    weights.push(item.weight);
    sum += item.weight;
  });

  const inv = sum > 0 ? 1 / sum : 1 / slots;
  for (let i = 0; i < weights.length; i += 1) {
    weights[i] *= inv;
  }

  return { colors, anchors, focus, weights };
};

const estimateSharpness = (sample: Sample): number => {
  const size = sample.size;
  const { data } = sample;
  let edgeSum = 0;
  let edgeCount = 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      if (data[i + 3] < 32) {
        continue;
      }
      const c: Vec3 = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];

      if (x + 1 < size) {
        const j = (y * size + x + 1) * 4;
        if (data[j + 3] >= 32) {
          edgeSum += colorDist(c, [data[j] / 255, data[j + 1] / 255, data[j + 2] / 255]);
          edgeCount += 1;
        }
      }

      if (y + 1 < size) {
        const j = ((y + 1) * size + x) * 4;
        if (data[j + 3] >= 32) {
          edgeSum += colorDist(c, [data[j] / 255, data[j + 1] / 255, data[j + 2] / 255]);
          edgeCount += 1;
        }
      }
    }
  }

  const avg = edgeCount > 0 ? edgeSum / edgeCount : 0;
  return clamp01(avg / 0.28);
};

const fallback = (slots: number): PaletteData => {
  const colors: Vec3[] = [];
  const anchors: Vec2[] = [];
  const focus: number[] = [];
  const weights: number[] = [];

  for (let i = 0; i < slots; i += 1) {
    const t = slots <= 1 ? 0 : i / (slots - 1);
    colors.push([0.15 + 0.5 * t, 0.16 + 0.5 * t, 0.18 + 0.5 * t]);
    anchors.push([0.5, 0.5]);
    focus.push(0.5);
    weights.push(1 / slots);
  }

  return { colors, anchors, focus, weights, sharpness: 0.5 };
};

export const extractPaletteData = (image: CanvasImageSource, k = 10): PaletteData => {
  const slots = typeof k === "number" ? k : 10;
  const sample = sampleImage(image, 64);
  const pixels = buildPixels(sample);
  if (!pixels.length) {
    return fallback(slots);
  }

  const internalK = Math.max(14, slots + 4);
  const kmeans = runKMeans(pixels, internalK);
  const merged = mergeClose(kmeans).filter((g) => g.share > 0.0025);
  if (!merged.length) {
    return fallback(slots);
  }

  const weighted = adjustWeights(merged);
  const slotted = toSlots(weighted, slots);
  const sharpness = estimateSharpness(sample);

  return {
    colors: slotted.colors,
    weights: slotted.weights,
    anchors: slotted.anchors,
    focus: slotted.focus,
    sharpness
  };
};

export const extractPalette = (image: CanvasImageSource, k = 10): Vec3[] => extractPaletteData(image, k).colors;
