/**
 * Deterministic procedural mathematics.
 * All noise here is seeded, finite and independent of the DOM / renderer.
 * Perlin gradients use the improved fade curve 6t^5 - 15t^4 + 10t^3.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
};
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a || 1e-9), 0, 1);

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD2 = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface NoiseField {
  perlin2: (x: number, y: number) => number;
  simplex2: (x: number, y: number) => number;
  fbm: (x: number, y: number, octaves?: number, lacunarity?: number, gain?: number) => number;
  ridged: (x: number, y: number, octaves?: number) => number;
  warp: (x: number, y: number, amount: number, scale: number) => [number, number];
  cellular: (x: number, y: number) => { f1: number; f2: number; edge: number; cellX: number; cellY: number };
  noise01: (x: number, y: number) => number;
}

export function createNoise(seed: number): NoiseField {
  const rand = mulberry32(seed);
  const perm = new Uint16Array(512);
  const p = new Uint16Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

  const perlin2 = (x: number, y: number): number => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const grad = (hash: number, gx: number, gy: number) => {
      const g = GRAD2[perm[hash] & 7];
      return g[0] * gx + g[1] * gy;
    };
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    // Empirically bounded by ±0.86 for the 8-gradient set. Deliberately un-scaled
    // so the contract [-1, 1] holds without clipping and FBM stays unbiased.
    return lerp(x1, x2, v);
  };

  const simplex2 = (xin: number, yin: number): number => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    const corner = (x: number, y: number, gi: number) => {
      const tt = 0.5 - x * x - y * y;
      if (tt <= 0) return 0;
      const g = GRAD2[gi & 7];
      return tt * tt * tt * tt * (g[0] * x + g[1] * y);
    };
    n += corner(x0, y0, perm[ii + perm[jj]]);
    n += corner(x1, y1, perm[ii + i1 + perm[jj + j1]]);
    n += corner(x2, y2, perm[ii + 1 + perm[jj + 1]]);
    return clamp(n * 70, -1, 1);
  };

  const fbm = (x: number, y: number, octaves = 5, lacunarity = 2.03, gain = 0.5): number => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let o = 0; o < octaves; o++) {
      sum += perlin2(fx, fy) * amp;
      norm += amp;
      amp *= gain;
      fx *= lacunarity;
      fy *= lacunarity;
      fx += 13.71;
      fy -= 7.37;
    }
    return clamp(sum / (norm || 1), -1, 1);
  };

  const ridged = (x: number, y: number, octaves = 5): number => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(perlin2(fx, fy));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.52;
      fx *= 2.07;
      fy *= 2.07;
    }
    return clamp(sum / (norm || 1), 0, 1);
  };

  const warp = (x: number, y: number, amount: number, scale: number): [number, number] => {
    const qx = fbm(x * scale + 5.2, y * scale + 1.3, 4);
    const qy = fbm(x * scale + 9.2, y * scale + 7.7, 4);
    return [x + qx * amount, y + qy * amount];
  };

  const cellular = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let f1 = Infinity;
    let f2 = Infinity;
    let cellX = xi;
    let cellY = yi;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox;
        const cy = yi + oy;
        const px = cx + hash2(cx, cy, seed) * 0.94 + 0.03;
        const py = cy + hash2(cx + 911, cy - 733, seed) * 0.94 + 0.03;
        const d = Math.hypot(px - x, py - y);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          cellX = cx;
          cellY = cy;
        } else if (d < f2) f2 = d;
      }
    }
    return { f1, f2, edge: f2 - f1, cellX, cellY };
  };

  const noise01 = (x: number, y: number) => perlin2(x, y) * 0.5 + 0.5;

  return { perlin2, simplex2, fbm, ridged, warp, cellular, noise01 };
}

/** Indexed deterministic RNG streams — sampling does not perturb terrain noise. */
export function seededStream(seed: number, stream: number): () => number {
  return mulberry32((Math.imul(seed, 2654435761) ^ Math.imul(stream + 1, 40503)) >>> 0);
}

export function fnv1a(data: ArrayLike<number>): string {
  let h = 0x811c9dc5;
  const stride = Math.max(1, Math.floor(data.length / 200000));
  for (let i = 0; i < data.length; i += stride) {
    const v = Math.round((data[i] as number) * 1000) & 0xffffffff;
    h ^= v;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
