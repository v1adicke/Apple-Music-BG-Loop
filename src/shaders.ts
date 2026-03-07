export const VERT_SRC = `
attribute vec2 a_position;
void main(void) {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const FRAG_SRC = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_palette[10];
uniform float u_colorWeights[10];
uniform vec2 u_colorAnchors[10];
uniform float u_colorFocus[10];
uniform vec4 u_tune;
uniform float u_sharpness;
const float TAU = 6.283185307179586;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

mat2 rot2(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash12(i + vec2(0.0, 0.0));
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.56;
  vec2 q = p;
  v += a * valueNoise(q);
  q = rot2(0.83) * q * 2.01 + vec2(17.3, -9.2);
  a *= 0.5;
  v += a * valueNoise(q);
  q = rot2(-1.15) * q * 2.02 + vec2(-13.7, 21.5);
  a *= 0.5;
  v += a * valueNoise(q);
  return v / (0.56 + 0.28 + 0.14);
}

vec2 domainWarp(vec2 uv, float ph) {
  vec2 p = uv;
  vec2 o1 = vec2(cos(ph), sin(ph));
  vec2 o2 = vec2(cos(ph + 2.1), sin(ph + 2.1));
  p += vec2(0.05 * sin(ph + 0.9), 0.045 * cos(ph + 1.8)) * u_tune.y;
  float n1 = fbm((rot2(0.31) * p) * 1.08 + vec2(3.1, -2.6) + 0.18 * o1);
  float n2 = fbm((rot2(-0.57) * p) * 1.20 + vec2(-4.5, 5.7) + 0.18 * o2);
  p += (0.05 * u_tune.y) * vec2(n1 - 0.5, n2 - 0.5);
  float n3 = fbm((rot2(1.03) * p) * 1.72 + vec2(6.4, -7.1) + 0.10 * o2);
  float n4 = fbm((rot2(-1.21) * p) * 1.88 + vec2(-8.3, 3.9) + 0.10 * o1);
  p += (0.015 * u_tune.y) * vec2(n3 - 0.5, n4 - 0.5);
  return p;
}

void main(void) {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 uv01 = gl_FragCoord.xy / u_resolution.xy;
  vec2 uv = vec2((uv01.x - 0.5) * aspect, uv01.y - 0.5);
  float t = mod(u_time, 10.0);
  float ph = t * (TAU / 10.0);
  vec2 warped = domainWarp(uv * (1.18 + 0.10 * u_tune.y), ph);

  vec3 accum = vec3(0.0);
  float totalW = 0.0;
  vec3 avgPal = vec3(0.0);

  for (int i = 0; i < 10; i++) {
    vec3 pc = u_palette[i];
    avgPal += pc * u_colorWeights[i];
    float fi = float(i);
    vec2 anchor = u_colorAnchors[i];
    float focus = clamp(u_colorFocus[i], 0.0, 1.0);
    float sx = sin(ph + fi * 1.13);
    float cy = cos(ph + fi * 1.71);
    float sx2 = sin(2.0 * ph + fi * 0.57);
    float cy2 = cos(2.0 * ph + fi * 2.09);
    float amp1 = mix(0.11, 0.035, focus) * u_tune.x;
    float amp2 = mix(0.042, 0.014, focus) * u_tune.x;
    vec2 c = anchor;
    c += vec2(amp1 * sx + amp2 * sx2, amp1 * 0.92 * cy + amp2 * cy2);
    c += vec2(amp2 * sin(ph + fi * 0.41), amp2 * cos(2.0 * ph + fi * 1.33));
    c = clamp(c, vec2(0.04), vec2(0.96));
    c = vec2((c.x - 0.5) * aspect, c.y - 0.5);
    float d = length(warped - c);
    float sharpK = mix(2.48, 4.45, clamp(u_sharpness, 0.0, 1.0));
    float focusK = mix(1.04, 1.85, focus);
    float soft = exp(-(sharpK * focusK + 0.98 * u_tune.z) * d * d);
    float modN = 0.76 + 0.24 * fbm(warped * 1.24 + vec2(float(i) * 7.1, float(i) * 3.7) + vec2(cos(ph + float(i)), sin(ph - float(i))));
    float localBoost = mix(1.0, 1.64, focus);
    float w = (soft * modN * localBoost + (0.0035 - 0.0015 * u_tune.z)) * max(0.001, u_colorWeights[i]);
    accum += pc * w;
    totalW += w;
  }

  vec3 color = accum / max(totalW, 1e-5);
  float haze = 0.046 * fbm(warped * 0.92 + vec2(cos(ph), sin(ph)));
  float hazeMix = mix(0.012, 0.055, 1.0 - clamp(u_sharpness, 0.0, 1.0));
  color = mix(color, avgPal, haze * (hazeMix - 0.02 * u_tune.z));

  float frame = floor(t * 60.0);
  float grain = hash12(floor(gl_FragCoord.xy) + vec2(frame * 1.37, frame * 2.11)) - 0.5;
  color += grain * ((1.0 * u_tune.w) / 255.0);

  color = clamp(color, 0.0, 1.0);
  gl_FragColor = vec4(color, 1.0);
}
`;
