export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export interface PaletteData {
  colors: Vec3[];
  weights: number[];
  anchors: Vec2[];
  focus: number[];
  sharpness?: number;
}

export interface RendererApi {
  setPaletteData(nextData: PaletteData): void;
  getPalette(): Vec3[];
  setTuning(nextTune: [number, number, number, number]): void;
}
