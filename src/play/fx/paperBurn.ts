// A card burning like paper, drawn on a canvas over its picture: the fire starts at one corner and
// eats its way across, its front ragged as real paper burns (the distance from the corner bent by
// fractal noise). Behind the front the card is gone; on it a thin black char line and a glowing
// orange edge; ahead of it the paper browns.

/** Smoothed value noise on a grid of `cell` px, 0..1, from `random`. */
function valueNoise(w: number, h: number, cell: number, random: () => number): Float32Array {
  const gw = Math.ceil(w / cell) + 2
  const gh = Math.ceil(h / cell) + 2
  const grid = Float32Array.from({ length: gw * gh }, random)
  const out = new Float32Array(w * h)
  const smooth = (t: number) => t * t * (3 - 2 * t)
  for (let y = 0; y < h; y++) {
    const gy = y / cell
    const y0 = Math.floor(gy)
    const ty = smooth(gy - y0)
    for (let x = 0; x < w; x++) {
      const gx = x / cell
      const x0 = Math.floor(gx)
      const tx = smooth(gx - x0)
      const a = grid[y0 * gw + x0]
      const b = grid[y0 * gw + x0 + 1]
      const c = grid[(y0 + 1) * gw + x0]
      const d = grid[(y0 + 1) * gw + x0 + 1]
      out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty
    }
  }
  return out
}

/** mulberry32, so a card burns the same way each time it is drawn. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The bands behind and ahead of the fire front, in "burn time" (0 = the corner, 1 = the far end).
const CHAR = 0.012
const FIRE = 0.03
const SCORCH = 0.13

/**
 * Burn `img` away on `canvas` (laid over it, the same size) in `ms`, from `corner` (fractions of
 * the width and height: [0, 1] is the bottom-left). Returns a function that stops it. False when
 * the picture can't be read (then the caller fades the card instead).
 */
export function burnPaper(img: HTMLImageElement, canvas: HTMLCanvasElement, corner: [number, number], ms: number, seed = 1): (() => void) | false {
  const scale = Math.min(window.devicePixelRatio || 1, 1.25)
  const w = Math.max(1, Math.round(img.clientWidth * scale))
  const h = Math.max(1, Math.round(img.clientHeight * scale))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  let src: Uint8ClampedArray
  try {
    ctx.drawImage(img, 0, 0, w, h)
    src = ctx.getImageData(0, 0, w, h).data
  } catch {
    return false
  }

  // When each pixel catches fire: its distance from the corner, bent by noise at three scales
  // (big tongues of fire, smaller bites, a fine fray along the edge).
  const random = rng(seed)
  const k = w / 340
  const n1 = valueNoise(w, h, Math.max(4, 70 * k), random)
  const n2 = valueNoise(w, h, Math.max(3, 24 * k), random)
  const n3 = valueNoise(w, h, Math.max(2, 7 * k), random)
  const cx = corner[0] * w
  const cy = corner[1] * h
  const far = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy))
  const at = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const noise = n1[i] * 0.55 + n2[i] * 0.3 + n3[i] * 0.15
      at[i] = (Math.hypot(x - cx, y - cy) / far) * 0.75 + noise * 0.3
    }

  const frame = ctx.createImageData(w, h)
  const out = frame.data
  const start = performance.now()
  let raf = 0
  const draw = (now: number) => {
    // the front sweeps past every pixel (their times run from about 0 to 1.05), slow to catch
    const p = Math.min(1, (now - start) / ms)
    const t = -0.05 + 1.2 * (p * p * (1.6 - 0.6 * p))
    const flicker = 0.85 + 0.15 * Math.sin(now / 37)
    for (let i = 0, j = 0; i < at.length; i++, j += 4) {
      const v = at[i] - t
      let r = src[j]
      let g = src[j + 1]
      let b = src[j + 2]
      let a = src[j + 3]
      if (v < -CHAR) a = 0
      else if (v < 0) {
        // the char line: black, crumbling into nothing
        const f = 1 + v / CHAR
        r = 18 * f
        g = 8 * f
        b = 4 * f
        a = a * Math.min(1, f * 1.6)
      } else if (v < FIRE) {
        // the glowing edge: white-yellow at the front, orange, then red into the paper
        const f = v / FIRE
        const hot = (1 - f) * flicker
        r = 255
        g = 90 + 160 * hot
        b = 20 + 120 * hot * hot
      } else if (v < SCORCH) {
        // scorched paper: brown and dark next to the fire, back to the picture further on
        const f = (v - FIRE) / (SCORCH - FIRE)
        const dark = 0.25 + 0.75 * f
        const tint = 1 - f
        r = r * dark + 60 * tint * (1 - dark)
        g = g * dark * (1 - 0.15 * tint)
        b = b * dark * (1 - 0.4 * tint)
      }
      out[j] = r
      out[j + 1] = g
      out[j + 2] = b
      out[j + 3] = a
    }
    ctx.putImageData(frame, 0, 0)
    if (p < 1) raf = requestAnimationFrame(draw)
  }
  raf = requestAnimationFrame(draw)
  return () => cancelAnimationFrame(raf)
}
