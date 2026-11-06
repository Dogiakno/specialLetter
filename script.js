window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("scene");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const hint = document.getElementById("hint");
  const replayBtn = document.getElementById("replay");

  const D2R = Math.PI / 180;
  const T_ENV_IN = 1.6;
  const T_CUR0 = 1.9;
  const T_CUR1 = 4.1;
  const T_CLICK = 4.55;
  const T_BURN = T_CLICK + 0.12;
  const T_SPREAD = 3.4;
  const T_R0 = T_BURN + 2.3;
  const T_FORM = 3.8;
  const T_GLOW = T_R0 + 1.8;
  const T_FIRE_END = T_BURN + T_SPREAD + 2.2;

  class LCG {
    constructor(seed = 21) {
      this.m = 0x80000000;
      this.a = 1103515245;
      this.c = 12345;
      this.state = seed;
    }
    random() {
      this.state = (this.a * this.state + this.c) % this.m;
      return this.state / (this.m - 1);
    }
    uniform(min, max) {
      return min + (max - min) * this.random();
    }
    randrange(max) {
      return Math.floor(this.random() * max);
    }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
  }

  let rng = new LCG(21);

  function clamp(v, lo = 0.0, hi = 1.0) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function ease(t) {
    t = clamp(t);
    return t * t * (3 - 2 * t);
  }

  function mix(a, b, k) {
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }

  function sc(c, k) {
    return [c[0] * k, c[1] * k, c[2] * k];
  }

  const LV = 40;
  const _hx = new Map();
  function hexc(c) {
    const k0 = Math.floor(clamp(c[0]) * (LV - 0.01));
    const k1 = Math.floor(clamp(c[1]) * (LV - 0.01));
    const k2 = Math.floor(clamp(c[2]) * (LV - 0.01));
    const key = (k0 << 12) | (k1 << 6) | k2;
    let s = _hx.get(key);
    if (!s) {
      const r = Math.floor(k0 * 255 / (LV - 1));
      const g = Math.floor(k1 * 255 / (LV - 1));
      const b = Math.floor(k2 * 255 / (LV - 1));
      s = `rgb(${r},${g},${b})`;
      _hx.set(key, s);
    }
    return s;
  }

  const BG = [0.010, 0.007, 0.012];

  const _P = Array.from({ length: 256 }, (_, i) => i);
  rng.shuffle(_P);
  const _N = Array.from({ length: 256 }, () => rng.uniform(-1, 1));

  function vn(x, y) {
    let xi = Math.floor(x);
    let yi = Math.floor(y);
    let xf = x - xi;
    let yf = y - yi;
    xi &= 255;
    yi &= 255;
    let x1 = (xi + 1) & 255;
    let y1 = (yi + 1) & 255;
    let u = xf * xf * (3 - 2 * xf);
    let v = yf * yf * (3 - 2 * yf);
    let a = _N[(_P[(_P[xi] + yi) & 255])];
    let b = _N[(_P[(_P[x1] + yi) & 255])];
    let c = _N[(_P[(_P[xi] + y1) & 255])];
    let d = _N[(_P[(_P[x1] + y1) & 255])];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  function nz(t, a = 1.0) {
    return (Math.sin(t * 2.1 * a) + 0.7 * Math.sin(t * 3.3 * a + 1.7) + 0.4 * Math.sin(t * 5.7 * a + 0.6)) / 2.1;
  }

  function ramp_lut(stops, n = 64) {
    let out = [];
    for (let i = 0; i < n; i++) {
      let v = i / (n - 1);
      for (let k = 0; k < stops.length - 1; k++) {
        let [a, ca] = stops[k];
        let [b, cb] = stops[k + 1];
        if (v <= b) {
          out.push(mix(ca, cb, (v - a) / (b - a)));
          break;
        }
      }
    }
    return out;
  }

  const FIRE = [
    [0.00, [0.30, 0.01, 0.00]],
    [0.18, [0.78, 0.05, 0.01]],
    [0.38, [1.00, 0.24, 0.02]],
    [0.60, [1.00, 0.52, 0.05]],
    [0.80, [1.00, 0.80, 0.26]],
    [1.00, [1.00, 0.98, 0.82]],
  ];
  const LUT = ramp_lut(FIRE);

  const REDS = [
    [0.00, [0.10, 0.00, 0.02]],
    [0.22, [0.34, 0.01, 0.05]],
    [0.45, [0.66, 0.04, 0.09]],
    [0.68, [0.90, 0.09, 0.15]],
    [0.88, [1.00, 0.24, 0.26]],
    [1.00, [1.00, 0.55, 0.52]],
  ];
  const RLUT = ramp_lut(REDS);
  const RCH = "-=+*#%&@8";
  const SMOKE_C = [0.50, 0.44, 0.44];

  const BLUES = [
    [0.00, [0.01, 0.03, 0.16]],
    [0.25, [0.03, 0.14, 0.52]],
    [0.50, [0.10, 0.38, 0.95]],
    [0.75, [0.50, 0.78, 1.00]],
    [1.00, [1.00, 1.00, 1.00]],
  ];
  const BLUE = ramp_lut(BLUES);

  const ROWS = 44;
  const CW = 11;
  const CH = 18;
  const COLS = Math.floor(ROWS * CH / CW);
  const W = COLS * CW;
  const H = ROWS * CH;
  const S = H / 640.0;

  canvas.width = W;
  canvas.height = H;

  const CX = W / 2.0;
  const EW = 0.76 * W;
  const EH = 0.74 * EW;
  const ECY = 0.55 * H;
  const EX0 = CX - EW / 2;
  const EX1 = CX + EW / 2;
  const EY0 = ECY - EH / 2;
  const EY1 = ECY + EH / 2;
  const FLAP_H = 0.50 * EH;
  const TIPY = EY0 + FLAP_H;
  const HR = 0.062 * H;
  const HCY = TIPY - 0.25 * HR;
  const XPL = CX - 0.17 * EW;
  const XPR = CX + 0.17 * EW;
  const YPL = EY0 + FLAP_H * (1 - 0.17 * EW / (EW / 2));
  const IGX = CX;
  const IGY = HCY;

  const GLYPH = {
    "F": ["###", "#..", "##.", "#..", "#.."],
    "O": ["###", "#.#", "#.#", "#.#", "###"],
    "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "Y": ["#.#", "#.#", ".#.", ".#.", ".#."],
    "U": ["#.#", "#.#", "#.#", "#.#", "###"],
    " ": ["...", "...", "...", "...", "..."],
  };
  const TEXT = "FOR YOU";
  let TXT = ["", "", "", "", ""];
  for (let _i = 0; _i < TEXT.length; _i++) {
    let _ch = TEXT[_i];
    for (let _k = 0; _k < 5; _k++) {
      TXT[_k] += GLYPH[_ch][_k] + (_i < TEXT.length - 1 ? "." : "");
    }
  }
  const TW = TXT[0].length;
  const TC0 = Math.floor(CX / CW - TW);
  const TR0 = Math.floor((HCY + 1.2 * HR) / CH) + 2;

  function ink(r, c) {
    let px = Math.floor((c - TC0) / 2);
    let py = r - TR0;
    return c >= TC0 && px >= 0 && px < TW && py >= 0 && py < 5 && TXT[py][px] === "#";
  }

  function heart_f(hx, hy, s) {
    let X = hx / s;
    let Y = (hy - 0.25) / s + 0.25;
    return Math.pow(X * X + Y * Y - 1, 3) - X * X * Math.pow(Y, 3);
  }

  function in_seal(x, y) {
    let hx_ = (x - CX) / HR;
    let hy_ = (HCY - y) / HR;
    return -1.4 < hx_ && hx_ < 1.4 && -1.3 < hy_ && hy_ < 1.6 && heart_f(hx_, hy_, 1.0) <= 0;
  }

  const PAPER = "#%&@8";
  const FLAPC = [0.85, 0.67, 0.44];
  const SIDEC = [0.66, 0.48, 0.29];
  const BOTC = [0.78, 0.60, 0.38];
  const INK = [0.14, 0.08, 0.05];
  const INKT = [0.24, 0.12, 0.06];
  const STRIPE = [[0.74, 0.17, 0.15], [0.93, 0.88, 0.76], [0.17, 0.29, 0.64]];

  function env_style(r, c, x, y, hs, hs2) {
    if (x < EX0 || x > EX1 || y < EY0 || y > EY1) return null;
    let hx_ = (x - CX) / HR;
    let hy_ = (HCY - y) / HR;
    if (-1.4 < hx_ && hx_ < 1.4 && -1.3 < hy_ && hy_ < 1.6 && heart_f(hx_, hy_, 1.0) <= 0) {
      let k = clamp(0.5 - 0.30 * hx_ + 0.28 * hy_);
      if (heart_f(hx_, hy_, 0.90) > 0) return ["#", [0.50, 0.13, 0.28]];
      if (heart_f(hx_, hy_, 0.70) > 0) return ["&%#"[Math.floor(hs * 3) % 3], mix([0.86, 0.40, 0.58], [1.0, 0.74, 0.86], k)];
      if (Math.pow(hx_ + 0.40, 2) + Math.pow(hy_ - 0.60, 2) < 0.045) return ["*", [1.0, 0.93, 0.97]];
      return ["@%"[hs2 > 0.82 ? 1 : 0], mix([0.74, 0.24, 0.44], [0.97, 0.60, 0.76], k)];
    }
    if (ink(r, c)) return ["@", INKT];
    if (ink(r - 1, c - 1)) return ["%", [0.45, 0.29, 0.15]];

    let fh = FLAP_H * (1 - Math.abs(x - CX) / (EW / 2));
    let dfl = EY0 + fh - y;
    if (Math.abs(dfl) < 0.45 * CH) return [x < CX ? "\\" : "/", INK];

    let side = false;
    if (dfl < 0) {
      if (x <= XPL) {
        let yl = EY1 + (YPL - EY1) * (x - EX0) / (XPL - EX0);
        if (Math.abs(y - yl) < 0.45 * CH) return ["/", INK];
        side = y < yl;
      } else if (x >= XPR) {
        let yr = YPL + (EY1 - YPL) * (x - XPR) / (EX1 - XPR);
        if (Math.abs(y - yr) < 0.45 * CH) return ["\\", INK];
        side = y < yr;
      }
    }

    if (x < EX0 + 1.3 * CW || x > EX1 - 1.3 * CW || y < EY0 + 0.9 * CH || y > EY1 - 0.9 * CH) {
      return ["/", STRIPE[Math.floor(((c + r) % 6) / 2)]];
    }

    let base = dfl >= 0 ? FLAPC : (side ? SIDEC : BOTC);
    let k = (1.06 - 0.20 * (y - EY0) / EH) * (0.88 + 0.24 * hs2);
    if (dfl < 0 && dfl > -1.4 * CH) {
      k *= 0.72 + 0.20 * (-dfl) / (1.4 * CH);
    } else if (0.45 * CH < dfl && dfl < 1.4 * CH) {
      k *= 1.07;
    }
    return [PAPER[Math.floor(hs * PAPER.length) % PAPER.length], [base[0] * k, base[1] * k, base[2] * k]];
  }

  const RX = CX;
  const RR = 0.175 * H;
  const RY = 0.290 * H;
  const STEM_Y1 = 0.885 * H;
  const HEAD_B = RY + 1.38 * RR;
  const TOP_Y = RY - 1.1 * RR;
  const STEM_HW = 0.80 * CW;

  const LAYERS = [
    [1.00, 5, 0.00, 0.17],
    [0.82, 5, 0.90, 0.16],
    [0.65, 4, 1.70, 0.15],
    [0.49, 3, 2.40, 0.13],
  ];
  const LBASE = [0.34, 0.40, 0.46, 0.52];
  const SPIR_R = 0.30;

  const SEPALS = [
    [-0.55, 1.00, 212, 1.00, 0.13, -0.10],
    [-0.22, 1.10, 245, 0.90, 0.11, -0.08],
    [0.55, 1.00, -32, 1.00, 0.13, 0.10],
    [0.22, 1.10, -65, 0.90, 0.11, 0.08],
    [0.00, 1.15, 270, 0.72, 0.10, 0.00],
  ];
  const LEAVES = [
    [2.10, 150, 1.55, 0.36, 0.16],
    [2.70, 28, 1.45, 0.33, -0.14],
    [3.10, 155, 1.10, 0.26, 0.12],
  ];
  const THORNS = [[0.60 * H, 1], [0.69 * H, -1], [0.77 * H, 1]];
  const GREEN_D = [0.03, 0.14, 0.05];
  const GREEN_L = [0.14, 0.45, 0.18];

  function stem_x(y) {
    return RX + 0.016 * H * Math.sin((y - RY) / (0.17 * H));
  }

  function leaf_hit(x, y, ax, ay, ang, L, Wd, bend) {
    let ca = Math.cos(ang * D2R), sa = Math.sin(ang * D2R);
    let dx = x - ax, dy = y - ay;
    let s = (dx * ca - dy * sa) / L;
    if (s < 0 || s > 1) return null;
    let v = dx * sa + dy * ca - bend * L * s * s;
    let w = Wd * Math.sin(Math.PI * Math.pow(s, 0.7)) * (1 + 0.07 * Math.sin(s * 38));
    if (w <= 0.3 || Math.abs(v) > w) return null;
    return [s, v / w];
  }

  function layer_b(k, th) {
    let [R, n, ph, amp] = LAYERS[k];
    let s = (((th + ph) * n / (2 * Math.PI)) % 1.0 + 1.0) % 1.0;
    return [R * (1 - amp * (1 - Math.pow(s, 0.55))), s];
  }

  function rose_sample(x, y) {
    let dx = x - RX, dy = y - RY;
    for (let s_ of SEPALS) {
      let [ax, ay, ang, L, Wd, bend] = s_;
      let h_ = leaf_hit(x, y, RX + ax * RR, RY + ay * RR, ang, L * RR, Wd * RR, bend);
      if (h_) return ["sepal", h_[0], h_[1]];
    }
    let ex = dx / RR, ey = dy / (RR * 0.84);
    let uu = Math.hypot(ex, ey);
    if (uu <= 1.18) {
      let th = Math.atan2(ey, ex);
      let Rth = 1 + 0.045 * Math.cos(5 * th + 0.7) + 0.03 * Math.cos(8 * th + 2.1);
      let u = uu / Rth;
      if (u <= 1.0) {
        if (u < SPIR_R) return ["spiral", u / SPIR_R, th];
        for (let k = LAYERS.length - 1; k >= 0; k--) {
          let [b] = layer_b(k, th);
          if (u <= b) return ["petal", k, u, th];
        }
      }
    }
    let cx2 = dx / (RR * 0.78);
    let cy2 = (dy - RR * 0.70) / (RR * 0.74);
    if (cx2 * cx2 + cy2 * cy2 <= 1) return ["cup", cx2, cy2];

    let rx_ = dx / (RR * 0.20), ry_ = (dy - RR * 1.42) / (RR * 0.18);
    if (rx_ * rx_ + ry_ * ry_ <= 1) return ["recept", rx_, ry_];

    if (HEAD_B - 0.1 * RR <= y && y <= STEM_Y1) {
      let sxv = stem_x(y);
      if (Math.abs(x - sxv) <= STEM_HW) return ["stem", (x - sxv) / STEM_HW, y];
      for (let [ty, sg] of THORNS) {
        let f = (y - ty) / (0.028 * H);
        if (0 <= f && f <= 1) {
          let e = (x - sxv) * sg - STEM_HW;
          if (0 <= e && e <= 2.6 * CW * f) return ["thorn", sg];
        }
      }
      for (let [ay, ang, L, Wd, bend] of LEAVES) {
        let ayy = RY + ay * RR;
        let h_ = leaf_hit(x, y, stem_x(ayy), ayy, ang, L * RR, Wd * RR, bend);
        if (h_) return ["leaf", h_[0], h_[1]];
      }
    }
    return null;
  }

  function rch(I) {
    return RCH[Math.floor(clamp(0.20 + 0.80 * I) * (RCH.length - 0.01))];
  }

  function contrast(I) {
    return clamp(0.52 + (I - 0.45) * 1.45);
  }

  function rose_style(smp, hs, hs2) {
    let kind = smp[0];
    if (kind === "spiral") {
      let [, u, th] = smp;
      let p = u * 2.6 + th / (2 * Math.PI);
      let f = p - Math.floor(p);
      let I = 0.26 + 0.62 * Math.pow(f, 1.3);
      if (f < 0.16) I *= 0.25 + f * 4.7;
      I *= 0.60 + 0.40 * u;
      I *= 0.74 + 0.52 * (0.5 + 0.5 * Math.cos(th + 2.36));
      I = contrast(clamp(I * (0.94 + 0.12 * hs)));
      return [rch(I), RLUT[Math.floor(I * 63)]];
    }
    if (kind === "petal") {
      let [, k, u, th] = smp;
      let [b, s] = layer_b(k, th);
      let w = u / b;
      let I = LBASE[k] + 0.30 * Math.pow(w, 2.0);
      if (w > 0.88) I += 0.34 * (w - 0.88) / 0.12;
      let bn = (k + 1 < LAYERS.length) ? layer_b(k + 1, th)[0] : SPIR_R;
      let g = u - bn;
      if (g < 0.10) I *= 0.25 + 7.5 * Math.max(0.0, g);
      if (s < 0.16) I *= 0.40 + 3.75 * s;
      else if (s > 0.92) I += 0.12;
      let lit = 0.5 + 0.5 * Math.cos(th + 2.36);
      I *= 0.72 + 0.56 * lit;
      I = contrast(clamp(I * (0.94 + 0.12 * hs)));
      if (hs2 > 0.985 && w > 0.5) return ["*", [1.0, 0.72, 0.66]];
      return [rch(I), RLUT[Math.floor(I * 63)]];
    }
    if (kind === "cup") {
      let [, cx2, cy2] = smp;
      let seam = Math.abs(Math.sin((cx2 * 1.6 + cy2 * 0.4) * Math.PI * 1.5));
      let I = 0.36 + 0.20 * (-cx2) + 0.08 * (-cy2);
      I *= 0.55 + 0.45 * Math.pow(seam, 0.6);
      I *= 1 - 0.35 * (cx2 * cx2 + cy2 * cy2) * 0.8;
      I = contrast(clamp(I * (0.9 + 0.2 * hs)));
      return [rch(I), RLUT[Math.floor(I * 63)]];
    }
    if (kind === "recept") {
      return ["@", mix([0.06, 0.20, 0.08], [0.14, 0.42, 0.17], clamp(0.5 - 0.5 * smp[1]))];
    }
    if (kind === "stem") {
      let v = smp[1];
      let col = mix(GREEN_D, GREEN_L, clamp(0.5 - 0.5 * v));
      return [hs < 0.85 ? "|" : ":", col];
    }
    if (kind === "thorn") {
      return [smp[1] > 0 ? ">" : "<", [0.62, 0.12, 0.08]];
    }
    let [, s, v] = smp;
    if (Math.abs(v) < 0.10) return [":", [0.22, 0.62, 0.28]];
    let vein = ((s * 7.0 - Math.abs(v) * 1.5) % 1.0 + 1.0) % 1.0;
    if (vein < 0.10 && kind === "leaf") return [":", [0.17, 0.52, 0.22]];
    let t_ = Math.pow(clamp(1 - Math.abs(v)), 1.2) * 0.8 + 0.2 * hs;
    t_ *= 0.8 + 0.4 * (0.5 + 0.5 * v);
    return ["#%&"[Math.floor(hs * 3) % 3], mix(GREEN_D, GREEN_L, clamp(t_))];
  }

  function bisectRight(arr, x) {
    let l = 0, r = arr.length;
    while (l < r) {
      let m = (l + r) >> 1;
      if (x < arr[m]) r = m;
      else l = m + 1;
    }
    return l;
  }

  const HS = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => rng.random()));
  const HS2 = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => rng.random()));

  let raw = [];
  let SHD = [];
  for (let r = 0; r < ROWS; r++) {
    let y = (r + 0.5) * CH;
    for (let c = 0; c < COLS; c++) {
      let x = (c + 0.5) * CW;
      let s_ = env_style(r, c, x, y, HS[r][c], HS2[r][c]);
      if (s_ !== null) {
        raw.push([r, c, s_[0], s_[1], x, y]);
      } else if (EX0 + 0.9 * CW <= x && x <= EX1 + 1.8 * CW && EY0 + 0.8 * CH <= y && y <= EY1 + 2.0 * CH) {
        SHD.push([r, c, x, y]);
      }
    }
  }

  let MAXD = 0;
  for (let e of raw) {
    let d = Math.hypot(e[4] - IGX, e[5] - IGY);
    if (d > MAXD) MAXD = d;
  }
  if (MAXD === 0) MAXD = 1;

  let ENVC = [];
  let SEALC = [];
  for (let [r, c, ch, col, x, y] of raw) {
    let d = Math.hypot(x - IGX, y - IGY);
    let nzv = vn(x * 0.035 + 4, y * 0.035 + 9) * 0.5 + 0.5;
    let tb = T_SPREAD * Math.pow(d / MAXD, 0.92) + 0.6 * nzv * Math.min(1.0, d / (0.12 * H));
    ENVC.push([r, c, ch, col, tb, HS[r][c], HS2[r][c], x, y]);
    if (in_seal(x, y)) SEALC.push([r, c]);
  }

  let ENV_SORTED = [...ENVC].sort((a, b) => a[4] - b[4]);
  let TBS = ENV_SORTED.map(e => e[4]);

  let SHDC = [];
  for (let [r, c, x, y] of SHD) {
    let d = Math.hypot(x - IGX, y - IGY);
    let tb = T_SPREAD * Math.pow(d / MAXD, 0.92);
    let ex = Math.max(0.0, x - EX1, EX0 - x);
    let ey = Math.max(0.0, y - EY1, EY0 - y);
    let f = 1 - clamp(Math.hypot(ex, ey) / (2.0 * CW));
    SHDC.push([r, c, f > 0.45 ? ":" : ".", sc([0.12, 0.08, 0.06], 0.35 + 0.65 * f), tb, HS[r][c]]);
  }

  let BED = [];
  let RB0 = Math.floor(EY1 / CH) + 1;
  for (let rr_ of [RB0, RB0 + 1]) {
    if (rr_ >= ROWS) continue;
    for (let c = 0; c < COLS; c++) {
      let x = (c + 0.5) * CW;
      let u = 1 - Math.pow((x - CX) / (EW * 0.50), 2);
      if (u > 0.12) {
        BED.push([rr_, c, Math.pow(u, 0.5), HS[rr_][c], rr_ === RB0]);
      }
    }
  }

  let RAWR = [];
  for (let r = 0; r < ROWS; r++) {
    let y = (r + 0.5) * CH;
    for (let c = 0; c < COLS; c++) {
      let x = (c + 0.5) * CW;
      let smp = rose_sample(x, y);
      if (smp !== null) RAWR.push([r, c, smp, HS[r][c], HS2[r][c], x, y]);
    }
  }

  let ROSEMASK = new Set(RAWR.map(e => `${e[0]},${e[1]}`));
  let EDGE = new Set();
  let HALO = new Set();
  for (let key of ROSEMASK) {
    let [r_, c_] = key.split(",").map(Number);
    for (let [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!ROSEMASK.has(`${r_ + dr},${c_ + dc}`)) EDGE.add(key);
    }
    for (let dr of [-1, 0, 1]) {
      for (let dc of [-1, 0, 1]) {
        let q = `${r_ + dr},${c_ + dc}`;
        if (!ROSEMASK.has(q)) HALO.add(q);
      }
    }
  }

  let ROSEC = [];
  for (let [r, c, smp, hs, hs2, x, y] of RAWR) {
    let [ch, col] = rose_style(smp, hs, hs2);
    let k = clamp((y - TOP_Y) / (STEM_Y1 - TOP_Y));
    let tk_ = T_R0 + 0.1 + k * T_FORM + rng.random() * 0.40;
    ROSEC.push([tk_, r, c, ch, col, x, y, EDGE.has(`${r},${c}`), hs]);
  }

  let RP = [];
  for (let [tk_, r, c, ch, col, x, y, ed, hs] of ROSEC) {
    let lim = tk_ - T_BURN - 0.85;
    let n = bisectRight(TBS, lim);
    let src = ENV_SORTED[rng.randrange(Math.max(1, n))];
    let sx_ = src[7], sy_ = src[8];
    let ts = Math.max(T_BURN + src[4] + 0.1, tk_ - 2.2);
    ts = Math.min(ts, tk_ - 0.75);
    let dx_ = x - sx_, dy_ = y - sy_;
    let dd = Math.hypot(dx_, dy_) + 1e-6;
    RP.push([ts, tk_, sx_, sy_, x, y, -dy_ / dd, dx_ / dd,
             rng.uniform(-0.12, 0.12) * dd, rng.uniform(0.05, 0.13) * H, rng.uniform(0, 6.28)]);
  }

  function fpos(f, s) {
    let [ts, tk_, sx_, sy_, tx, ty, nx, ny, amp, lift, ph] = f;
    let e = s * s * (3 - 2 * s);
    let sn = Math.sin(Math.PI * s);
    let x = sx_ + (tx - sx_) * e + nx * amp * sn + 3.0 * S * Math.sin(s * 13 + ph) * (1 - s);
    let y = sy_ + (ty - sy_) * e + ny * amp * sn - lift * sn;
    return [x, y];
  }

  const LX = RX, LY = RY;
  const NB = 720;
  let BGE = [];
  for (let r = 0; r < ROWS; r++) {
    let y = (r + 0.5) * CH;
    for (let c = 0; c < COLS; c++) {
      if (ROSEMASK.has(`${r},${c}`)) continue;
      let x = (c + 0.5) * CW;
      let dx_ = x - LX, dy_ = y - LY;
      let a_ = Math.atan2(dy_, dx_);
      let dn = Math.hypot(dx_, dy_) / (0.55 * H);
      let ab = (Math.floor(((a_ + Math.PI) / (2 * Math.PI)) * NB) % NB + NB) % NB;
      BGE.push([r, c, ab, dn, HALO.has(`${r},${c}`)]);
    }
  }

  const NCH = 3;
  let BGCH = Array.from({ length: NCH }, (_, i) => BGE.filter((_, idx) => idx % NCH === i));
  let BGC = {};
  let RAYF = new Float32Array(NB);
  let RAYM = new Float32Array(NB);
  const LIGHTC = [0.55, 0.75, 1.0];
  const WHITE = [0.95, 0.98, 1.0];
  const BGRAMP = ".:-=+*#";

  function bg_tables(tt) {
    for (let i = 0; i < NB; i++) {
      let a = -Math.PI + (i + 0.5) * (2 * Math.PI / NB);
      let r1 = Math.pow(0.5 + 0.5 * Math.sin(a * 23 + 1.6 * Math.sin(a * 3 + tt * 0.15) + tt * 0.10), 6);
      let r2 = Math.pow(0.5 + 0.5 * Math.sin(a * 47 - tt * 0.12 + 1.5 * Math.sin(a * 5 - tt * 0.10)), 9);
      let r3 = Math.pow(0.5 + 0.5 * Math.sin(a * 11 + tt * 0.08), 4);
      RAYF[i] = 0.55 * r1 + 0.50 * r2 + 0.20 * r3;
      let mn = 0.0;
      for (let k = 0; k < 8; k++) {
        let d = Math.abs(((a - k * Math.PI / 4 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
        if (d < 0.3) {
          mn += (k % 2 === 0 ? 1.0 : 0.65) * Math.exp(-Math.pow(d / 0.045, 2)) * (0.88 + 0.12 * Math.sin(tt * 0.9 + k * 1.3));
        }
      }
      RAYM[i] = mn;
    }
  }

  function bg_eval(e, tt, gt) {
    let [r, c, ab, dn, halo] = e;
    let core = Math.exp(-dn * 2.8);
    let glow = Math.exp(-dn * 1.3);
    let I = (0.95 * core + 0.16 * glow + 0.62 * RAYF[ab] * Math.exp(-dn * 1.9) + 0.85 * RAYM[ab] * Math.exp(-dn * 1.05)) * gt;
    if (halo) I *= 0.22;
    if (I < 0.05) return null;
    I = Math.min(I, 1.3);
    let ch = BGRAMP[Math.min(BGRAMP.length - 1, Math.floor(I * BGRAMP.length * 0.8))];
    return [ch, BLUE[Math.floor(clamp(I) * 63)]];
  }

  let MOTES = Array.from({ length: 46 }, () => [
    rng.uniform(0, W), rng.uniform(0, H), rng.uniform(0.01, 0.04) * H,
    rng.uniform(0, 6.28), rng.uniform(0.5, 1.0)
  ]);

  let STARS = [];
  for (let i = 0; i < 60; i++) {
    let rr_ = rng.randrange(ROWS), cc_ = rng.randrange(COLS);
    if (!ROSEMASK.has(`${rr_},${cc_}`)) {
      STARS.push([rr_, cc_, rng.uniform(0, 6.28), rng.uniform(0.6, 2.2)]);
    }
  }

  function draw_ambient(t, dt, gt, newMap) {
    let base = 0.20 + 0.80 * gt;
    for (let [rr, cc, ph, sp] of STARS) {
      let v = 0.5 + 0.5 * Math.sin(t * sp + ph);
      if (v > 0.35) {
        let a = base * (v - 0.35) / 0.65;
        let ch = v > 0.9 ? "*" : (v > 0.7 ? "+" : ".");
        newMap[`${rr},${cc}`] = [ch, sc(mix([0.70, 0.85, 1.0], WHITE, v), 0.25 + 0.75 * a)];
      }
    }
    if (gt < 0.02) return;
    for (let p of MOTES) {
      p[1] -= p[2] * dt;
      p[0] += 6 * S * Math.sin(t * 0.8 + p[3]) * dt;
      if (p[1] < -4) {
        p[1] = H + 4;
        p[0] = rng.uniform(0, W);
      }
      let rr = Math.floor(p[1] / CH), cc = Math.floor(p[0] / CW);
      if (0 <= rr && rr < ROWS && 0 <= cc && cc < COLS && !ROSEMASK.has(`${rr},${cc}`)) {
        let v = gt * p[4] * (0.5 + 0.5 * Math.sin(t * 1.7 + p[3]));
        if (v > 0.12) {
          newMap[`${rr},${cc}`] = [v < 0.5 ? "." : ":", sc(mix(LIGHTC, WHITE, p[4]), 0.4 + 0.6 * v)];
        }
      }
    }
  }

  const TGX = CX - 0.004 * W;
  const TGY = HCY - 0.015 * H;

  const ARW = [[0.0, 0.0], [0.0, 0.86], [0.19, 0.69], [0.31, 0.99], [0.44, 0.93], [0.32, 0.65], [0.58, 0.65]];
  const PH_ = 0.21 * H;
  const POLY = ARW.map(([x, y]) => [x * PH_, y * PH_]);

  function _pip(px, py) {
    let ins = false;
    let j = POLY.length - 1;
    for (let i = 0; i < POLY.length; i++) {
      let [xi, yi] = POLY[i];
      let [xj, yj] = POLY[j];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi) {
        ins = !ins;
      }
      j = i;
    }
    return ins;
  }

  function _pdist(px, py) {
    let best = 1e9;
    for (let i = 0; i < POLY.length; i++) {
      let [ax, ay] = POLY[i];
      let [bx, by] = POLY[(i + 1) % POLY.length];
      let vx = bx - ax, vy = by - ay;
      let L2 = vx * vx + vy * vy + 1e-9;
      let t_ = clamp(((px - ax) * vx + (py - ay) * vy) / L2);
      let d = Math.hypot(px - (ax + vx * t_), py - (ay + vy * t_));
      if (d < best) best = d;
    }
    return best;
  }

  let CUR_FILL = [], CUR_EDGE = [], CUR_GLOW = [], CUR_SHAD = [];
  let _occ = new Set();
  let _NC = Math.floor(0.58 * PH_ / CW) + 3;
  let _NR = Math.floor(PH_ / CH) + 3;

  for (let j = 0; j < _NR; j++) {
    for (let i = 0; i < _NC; i++) {
      let cin = 0, core = 0;
      for (let sy of [1/6, 3/6, 5/6]) {
        for (let sx of [1/6, 3/6, 5/6]) {
          let px = (i + sx) * CW, py = (j + sy) * CH;
          if (_pip(px, py)) {
            cin++;
            if (_pdist(px, py) > 0.9 * CW) core++;
          }
        }
      }
      let cxm = (i + 0.5) * CW, cym = (j + 0.5) * CH;
      let h_ = ((j * 7 + i * 13) % 10) / 10.0;
      if (core >= 5) {
        let t_ = clamp((cym / PH_) * 0.85 + (cxm / (0.58 * PH_)) * 0.15);
        let col = mix([0.52, 0.22, 0.97], [1.0, 0.42, 0.74], t_);
        let bev = _pdist(cxm, cym) < 1.8 * CW;
        if (bev) col = mix(col, [1.0, 0.92, 1.0], 0.20);
        CUR_FILL.push([j, i, bev ? "%" : "@", col, h_]);
        _occ.add(`${j},${i}`);
      } else if (cin >= 3) {
        CUR_EDGE.push([j, i, h_]);
        _occ.add(`${j},${i}`);
      } else {
        let d = _pdist(cxm, cym);
        if (d < 1.9 * CW) {
          CUR_GLOW.push([j, i, 1 - d / (1.9 * CW), h_]);
        }
      }
    }
  }

  for (let key of _occ) {
    let [j, i] = key.split(",").map(Number);
    if (!_occ.has(`${j + 1},${i + 1}`)) CUR_SHAD.push([j + 1, i + 1]);
  }

  function cursor_pos(t) {
    let s = clamp((t - T_CUR0) / (T_CUR1 - T_CUR0));
    let k = 1 - Math.pow(1 - s, 3.5);
    let p0 = [1.10 * W, 0.04 * H];
    let p1 = [0.95 * W, 0.80 * H];
    let p2 = [0.64 * W, 0.78 * H];
    let p3 = [TGX, TGY];
    let u = 1 - k;
    let x = Math.pow(u, 3) * p0[0] + 3 * u * u * k * p1[0] + 3 * u * k * k * p2[0] + Math.pow(k, 3) * p3[0];
    let y = Math.pow(u, 3) * p0[1] + 3 * u * u * k * p1[1] + 3 * u * k * k * p2[1] + Math.pow(k, 3) * p3[1];
    return [x, y];
  }

  let sparks = [];
  let smoke = [];
  let bits = [];
  let st = { burst: false, click: false, hot: false };
  let HEAT = Array.from({ length: ROWS + 2 }, () => new Float32Array(COLS));
  const FSET = { 1: ".'", 2: ":.", 3: "^'", 4: "^*", 5: "*(", 6: "(+)", 7: "%&", 8: "#%", 9: "#@", 10: "@" };
  let frameCount = 0;

  function bed_k(t) {
    let a = clamp((t - (T_BURN + 0.25)) / 1.2);
    let b = clamp((t - (T_BURN + T_SPREAD + 0.6)) / 1.6);
    return ease(a) * (1 - ease(b));
  }

  function fire_step(src, t) {
    let out = {};
    if (Object.keys(src).length === 0 && !st.hot) return out;
    let last = COLS - 1;
    let fr = frameCount;
    let anyhot = false;

    for (let r = 0; r < ROWS; r++) {
      let row = HEAT[r], b1 = HEAT[r + 1], b2 = HEAT[r + 2];
      for (let c = 0; c < COLS; c++) {
        let q = rng.random();
        let w = q < 0.27 ? c - 1 : (q > 0.73 ? c + 1 : c);
        if (w < 0) w = 0; else if (w > last) w = last;
        let cl = c > 0 ? c - 1 : 0;
        let cr = c < last ? c + 1 : last;
        let v = (b1[w] * 2 + b1[cl] + b1[cr] + b2[c]) * 0.2 - (0.030 + 0.062 * ((q * 7.0) % 1.0));
        row[c] = v > 0 ? v : 0.0;
      }
    }

    for (let key in src) {
      let [r, c] = key.split(",").map(Number);
      if (src[key] > HEAT[r][c]) HEAT[r][c] = src[key];
    }

    for (let r = 0; r < ROWS; r++) {
      let row = HEAT[r];
      for (let c = 0; c < COLS; c++) {
        let v = row[c];
        if (v > 0.10) {
          anyhot = true;
          let i = Math.min(10, Math.floor(v * 10.5));
          let s_ = FSET[i] || FSET[10];
          out[`${r},${c}`] = [s_[(c * 3 + r * 7 + fr) % s_.length], LUT[Math.floor(clamp(v) * 63)]];
        } else if (v > 0.01) {
          anyhot = true;
        }
      }
    }
    st.hot = anyhot;
    return out;
  }

  function draw_cursor(t, newMap) {
    let a = clamp((t - T_CUR0) / 0.3);
    let bt = t - T_BURN;
    if (a <= 0 || bt > 1.1) return;
    let [px, py] = cursor_pos(t);
    let c0 = Math.floor(px / CW), r0 = Math.floor(py / CH);
    let press = T_CLICK <= t && t < T_CLICK + 0.20;
    if (press) { c0 += 1; r0 += 1; }
    let bk = bt > 0 ? clamp(bt) : 0.0;

    if (T_CUR0 < t && t < T_CUR1 + 0.15) {
      for (let q = 1; q < 11; q++) {
        let [tx_, ty_] = cursor_pos(t - 0.05 * q);
        let rr = Math.floor(ty_ / CH), cc = Math.floor(tx_ / CW);
        if (0 <= rr && rr < ROWS && 0 <= cc && cc < COLS) {
          let v = (1 - q / 11.0) * 0.8;
          newMap[`${rr},${cc}`] = [q < 4 ? "+" : ".", [0.58 * v, 0.24 * v, 0.95 * v]];
        }
      }
    }

    for (let [j, i] of CUR_SHAD) {
      let rr = r0 + j, cc = c0 + i;
      if (0 <= rr && rr < ROWS && 0 <= cc && cc < COLS && bk < 0.5) {
        let und = newMap[`${rr},${cc}`];
        let ucol = und ? und[1] : BG;
        newMap[`${rr},${cc}`] = [":", mix(ucol, [0.03, 0.01, 0.06], 0.65 * a)];
      }
    }

    for (let [j, i, g, hh] of CUR_GLOW) {
      let rr = r0 + j, cc = c0 + i;
      if (0 <= rr && rr < ROWS && 0 <= cc && cc < COLS && hh < 0.7 && bk < 0.6) {
        let v = a * g * (1 - bk) * 0.85;
        newMap[`${rr},${cc}`] = [g > 0.5 ? ":" : ".", [0.55 * v, 0.18 * v, 0.78 * v]];
      }
    }

    for (let [j, i, hh] of CUR_EDGE) {
      if (hh < bk) continue;
      let rr = r0 + j, cc = c0 + i;
      if (0 <= rr && rr < ROWS && 0 <= cc && cc < COLS) {
        let col = press ? [1.0, 1.0, 1.0] : [0.98, 0.86, 1.0];
        if (bk > 0) col = mix(col, LUT[Math.floor(clamp(0.55 + 0.4 * (1 - hh)) * 63)], clamp(bk * 1.6));
        newMap[`${rr},${cc}`] = ["#", sc(col, a)];
      }
    }

    for (let [j, i, ch, col, hh] of CUR_FILL) {
      if (hh < bk) continue;
      let rr = r0 + j, cc = c0 + i;
      if (0 <= rr && rr < ROWS && 0 <= cc && cc < COLS) {
        if (press) col = mix(col, [1.0, 0.96, 1.0], 0.55);
        if (bk > 0) col = mix(col, LUT[Math.floor(clamp(0.55 + 0.4 * (1 - hh)) * 63)], clamp(bk * 1.6));
        newMap[`${rr},${cc}`] = [ch, sc(col, a)];
      }
    }
  }

  function* ring_cells(cx, cy, pad) {
    let minR = Math.max(0, Math.floor((cy - pad) / CH));
    let maxR = Math.min(ROWS - 1, Math.floor((cy + pad) / CH));
    let minC = Math.max(0, Math.floor((cx - pad) / CW));
    let maxC = Math.min(COLS - 1, Math.floor((cx + pad) / CW));

    for (let rr = minR; rr <= maxR; rr++) {
      let y = (rr + 0.5) * CH;
      for (let cc = minC; cc <= maxC; cc++) {
        yield [rr, cc, (cc + 0.5) * CW, y];
      }
    }
  }

  function draw_click(t, dt, newMap) {
    let a = t - T_CLICK;
    if (!st.click && a >= 0) {
      st.click = true;

      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([60, 80, 120, 100, 250]);
        }
      } catch (e) {}

      const stage = document.getElementById("scene") || canvas;
      if (stage) {
        stage.classList.remove("heartbeat-shake");
        void stage.offsetWidth;
        stage.classList.add("heartbeat-shake");
      }

      for (let i = 0; i < 52; i++) {
        let ang = rng.uniform(0, 2 * Math.PI);
        let sp = rng.uniform(120, 560) * S;
        bits.push([TGX, TGY, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.0, rng.uniform(0.5, 1.1)]);
      }
    }
    if (a < 0 || a > 1.2) return;

    if (a < 0.25) {
      let k = a / 0.25;
      let rad = 0.03 * H + 0.05 * H * k;
      for (let [rr, cc, x, y] of ring_cells(TGX, TGY, rad + CW)) {
        let d = Math.hypot(x - TGX, y - TGY);
        if (d < rad) {
          let v = (1 - k) * (1 - d / rad * 0.5);
          let und = newMap[`${rr},${cc}`];
          let col = mix([1.0, 0.9, 1.0], [0.85, 0.5, 1.0], k);
          newMap[`${rr},${cc}`] = [v > 0.5 ? "@" : "#", und ? mix(und[1], col, clamp(v * 1.3)) : sc(col, v)];
        }
      }
    }

    const rings = [
      [0.0, [0.65, 0.30, 1.0], [1.0, 0.55, 0.9]],
      [0.13, [0.55, 0.25, 0.95], [1.0, 0.65, 0.95]],
      [0.26, [0.50, 0.30, 1.0], [1.0, 0.85, 1.0]],
    ];
    for (let [d0, c0_, c1_] of rings) {
      let aa = a - d0;
      if (aa < 0 || aa > 0.9) continue;
      let k = aa / 0.9;
      let rad = 0.02 * H + 0.26 * H * (1 - Math.pow(1 - k, 2.2));
      let th = (1.7 - 1.0 * k) * CW;
      let al = Math.pow(1 - k, 1.2);
      let col = mix(c0_, c1_, k);
      for (let [rr, cc, x, y] of ring_cells(TGX, TGY, rad + th)) {
        let q = Math.abs(Math.hypot(x - TGX, y - TGY) - rad) / th;
        if (q >= 1) continue;
        let v = (1 - q) * al * 1.5;
        let c2 = sc(col, clamp(v));
        let und = newMap[`${rr},${cc}`];
        if (und) c2 = mix(und[1], col, clamp(v * 0.85));
        newMap[`${rr},${cc}`] = [q < 0.35 ? "O" : (q < 0.65 ? "o" : "."), c2];
      }
    }

    if (a < 0.55) {
      let k = a / 0.55;
      let l0 = 0.03 * H + 0.05 * H * k;
      let l1 = 0.06 * H + 0.24 * H * (1 - Math.pow(1 - k, 2));
      let steps = Math.floor((l1 - l0) / (CW * 0.9)) + 1;
      for (let n = 0; n < 14; n++) {
        let ang = n * 2 * Math.PI / 14 + 0.2;
        let ca = Math.cos(ang), sa = Math.sin(ang);
        let chr_ = Math.abs(ca) > 0.92 ? "-" : (Math.abs(sa) > 0.92 ? "|" : (ca * sa > 0 ? "\\" : "/"));
        for (let s_ = 0; s_ < steps; s_++) {
          let f = s_ / steps;
          let dist = l0 + (l1 - l0) * f;
          let rr = Math.floor((TGY + sa * dist) / CH);
          let cc = Math.floor((TGX + ca * dist) / CW);
          if (0 <= rr && rr < ROWS && 0 <= cc && cc < COLS) {
            let v = (1 - k) * (1 - 0.6 * f);
            newMap[`${rr},${cc}`] = [chr_, sc(mix([1.0, 0.9, 1.0], [0.7, 0.35, 1.0], f), clamp(v * 1.3))];
          }
        }
      }
    }

    let alive = [];
    for (let b of bits) {
      b[4] += dt;
      if (b[4] >= b[5]) continue;
      b[2] *= (1 - 2.0 * dt);
      b[3] = b[3] * (1 - 2.0 * dt) + 60 * S * dt;
      b[0] += b[2] * dt;
      b[1] += b[3] * dt;
      let k = b[4] / b[5];
      let rr = Math.floor(b[1] / CH), cc = Math.floor(b[0] / CW);
      if (0 <= rr && rr < ROWS && 0 <= cc && cc < COLS) {
        newMap[`${rr},${cc}`] = [k < 0.4 ? "*" : (k < 0.7 ? "+" : "."),
          sc(mix([1.0, 0.92, 1.0], [0.62, 0.28, 0.95], k), 1 - 0.5 * k)];
      }
      alive.push(b);
    }
    bits = alive;
  }

  let lastTime = performance.now();
  let startTime = performance.now();

  function restart() {
    startTime = performance.now();
    lastTime = startTime;
    st.burst = false;
    st.click = false;
    st.hot = false;
    sparks = [];
    smoke = [];
    bits = [];
    BGC = {};
    for (let row of HEAT) row.fill(0.0);
    for (let p of MOTES) p[1] = rng.uniform(0, H);
  }

  function frame() {
    const now = performance.now();
    const t = (now - startTime) / 1000;
    const dt = clamp((now - lastTime) / 1000, 0.0, 0.1);
    lastTime = now;
    frameCount++;

    let newMap = {};
    let gt = ease((t - T_GLOW) / 3.6);

    if (gt > 0.003) {
      if (frameCount % 3 === 0 || Object.keys(BGC).length === 0) {
        bg_tables(t);
      }
      for (let e of BGCH[frameCount % 3]) {
        let res = bg_eval(e, t, gt);
        if (res) BGC[`${e[0]},${e[1]}`] = res;
        else delete BGC[`${e[0]},${e[1]}`];
      }
      Object.assign(newMap, BGC);
    }

    draw_ambient(t, dt, gt, newMap);

    let tbn = t - T_BURN;
    let pin = clamp(t / T_ENV_IN);

    for (let [r, c, ch, col, tb, hs] of SHDC) {
      if (tbn - tb >= 0) continue;
      let vis = pin * 1.3 - hs * 0.5;
      if (vis > 0) newMap[`${r},${c}`] = [ch, sc(col, Math.min(1.0, vis * 1.6))];
    }

    let front = [];
    let src = {};

    for (let [r, c, ch, col, tb, hs, hs2, x, y] of ENVC) {
      let tau = tbn - tb;
      if (tau >= 1.35) continue;
      if (tau < 0) {
        let vis = pin * 1.3 - hs * 0.5;
        if (vis <= 0) continue;
        let k = Math.min(1.0, vis * 1.6);
        if (tbn > 0 && tau > -0.5) {
          let w = (tau + 0.5) * 2.0;
          col = mix(col, [0.30, 0.10, 0.03], w * 0.75);
          if (w > 0.6) col = mix(col, [1.0, 0.38, 0.05], (w - 0.6) * 1.3);
        }
        newMap[`${r},${c}`] = [ch, [col[0] * k, col[1] * k, col[2] * k]];
        continue;
      }
      if (tau < 0.50) {
        src[`${r},${c}`] = 0.72 + 0.28 * rng.random();
      } else if (tau < 0.95) {
        src[`${r},${c}`] = (0.45 + 0.15 * rng.random()) * (1 - (tau - 0.50) / 0.45);
      }
      if (tau < 0.38) {
        let q = tau / 0.38;
        let T = clamp(0.98 - 0.62 * q + 0.14 * nz(t * 9 + hs * 20));
        let ch2 = (q < 0.6 ? "@#&%" : "#%=")[Math.floor(hs2 * 4) % 4];
        newMap[`${r},${c}`] = [ch2, LUT[Math.floor(T * 63)]];
        front.push([x, y]);
      } else {
        let a = 1 - (tau - 0.38) / 0.97;
        if (hs2 > Math.pow(a, 0.7)) continue;
        if (((hs * 37.0 + t * 1.6) % 1.0) > 0.84 - 0.08 * a) {
          newMap[`${r},${c}`] = ["*", LUT[Math.floor(clamp(0.28 + 0.5 * a) * 63)]];
        } else {
          let kk = 0.45 + 0.9 * a;
          newMap[`${r},${c}`] = ["%#="[Math.floor(hs * 3) % 3], [0.13 * kk, 0.07 * kk, 0.05 * kk]];
        }
      }
    }

    if (T_CUR1 - 0.3 <= t && t < T_BURN + 0.02) {
      let mf;
      if (t < T_CLICK) {
        let k = 0.28 * ease((t - (T_CUR1 - 0.3)) / 0.3) * (0.8 + 0.2 * Math.sin(t * 9));
        mf = col => mix(col, [1.0, 0.85, 1.0], k);
      } else if (t < T_CLICK + 0.20) {
        mf = col => sc(col, 0.62);
      } else {
        let k = 0.7 * (1 - clamp((t - T_CLICK - 0.2) / 0.15));
        mf = col => mix(col, [1.0, 0.9, 0.8], k);
      }
      for (let [r, c] of SEALC) {
        let v = newMap[`${r},${c}`];
        if (v) newMap[`${r},${c}`] = [v[0], mf(v[1])];
      }
    }

    let bk = bed_k(t);
    if (bk > 0.01) {
      for (let [rr, cc, shp, hs, top] of BED) {
        let fl = 0.5 + 0.5 * Math.sin(t * 6 + hs * 40);
        let T = clamp(bk * shp * (0.25 + 0.45 * fl + 0.2 * hs));
        if (T > 0.08) newMap[`${rr},${cc}`] = ["=%#@"[Math.floor(hs * 4) % 4], LUT[Math.floor(T * 63)]];
        if (top) src[`${rr},${cc}`] = bk * shp * (0.50 + 0.38 * rng.random());
      }
      for (let [rr, cc, shp, hs, top] of BED) {
        if (top && rng.random() < 0.5 * dt * 10 * bk * shp) {
          front.push([(cc + 0.5) * CW, (rr + 0.5) * CH]);
        }
      }
    }

    Object.assign(newMap, fire_step(src, t));

    let rim = 0.65 * gt;
    for (let [tk_, r, c, ch, col, x, y, ed, hs] of ROSEC) {
      if (t < tk_) continue;
      let heat = 1.0 - (t - tk_);
      if (heat > 0) {
        let hh = Math.pow(heat, 1.4);
        col = mix(col, LUT[Math.floor(clamp(0.35 + 0.65 * hh) * 63)], clamp(hh * 1.15));
        if (hh > 0.5) ch = "@";
      } else if (ed && rim > 0.01) {
        col = mix(col, [0.72, 0.88, 1.0], rim);
        if (hs > 0.9 && Math.sin(t * 3 + hs * 40) > 0.85) {
          ch = "*";
          col = [0.88, 0.96, 1.0];
        }
      }
      newMap[`${r},${c}`] = [ch, col];
    }

    for (let f of RP) {
      let [ts, tk_] = f;
      if (t < ts || t >= tk_) continue;
      let s = (t - ts) / (tk_ - ts);
      for (let [lag, chh, dim] of [[0.0, "*", 1.0], [0.06, "+", 0.8], [0.12, ".", 0.6]]) {
        let ss = s - lag;
        if (ss < 0) break;
        let [x_, y_] = fpos(f, ss);
        let rr = Math.floor(y_ / CH), cc = Math.floor(x_ / CW);
        if (0 <= rr && rr < ROWS && 0 <= cc && cc < COLS) {
          let T = clamp((0.45 + 0.55 * s) * dim);
          newMap[`${rr},${cc}`] = [chh, LUT[Math.floor(T * 63)]];
        }
      }
    }

    if (t >= T_BURN && !st.burst) {
      st.burst = true;
      for (let i = 0; i < 150; i++) {
        let a_ = rng.uniform(-170, -10) * D2R;
        let sp_ = rng.uniform(100, 560) * S;
        sparks.push([IGX, IGY, Math.cos(a_) * sp_, Math.sin(a_) * sp_, 0.0,
                     rng.uniform(0.6, 1.6), -rng.uniform(20, 120) * S]);
      }
    }

    if (front.length > 0 && t < T_FIRE_END) {
      let n = Math.floor(380 * dt * Math.min(1.0, front.length / 50.0) + rng.random());
      for (let i = 0; i < n; i++) {
        let [x_, y_] = front[rng.randrange(front.length)];
        let a_ = rng.uniform(-125, -55) * D2R;
        let sp_ = rng.uniform(60, 360) * S;
        sparks.push([x_, y_, Math.cos(a_) * sp_, Math.sin(a_) * sp_, 0.0,
                     rng.uniform(0.7, 1.9), -rng.uniform(25, 140) * S]);
      }
      if (rng.random() < 22 * dt) {
        let [x_, y_] = front[rng.randrange(front.length)];
        smoke.push([x_, y_ - 0.05 * H, rng.uniform(-6, 6) * S, -rng.uniform(25, 55) * S, 0.0,
                    rng.uniform(1.8, 3.2), rng.uniform(0, 6.28), SMOKE_C]);
      }
    }

    if (t > T_R0 + T_FORM && gt > 0.2) {
      let n = Math.floor(6 * dt + rng.random());
      for (let i = 0; i < n; i++) {
        sparks.push([RX + rng.uniform(-0.9, 0.9) * RR, RY + rng.uniform(-0.6, 0.9) * RR,
                     rng.uniform(-12, 12) * S, -rng.uniform(25, 70) * S, 0.0,
                     rng.uniform(1.2, 2.4), -8 * S]);
      }
    }

    if (sparks.length > 1600) sparks.splice(0, sparks.length - 1600);

    let aliveSparks = [];
    for (let s of sparks) {
      s[4] += dt;
      if (s[4] >= s[5]) continue;
      s[2] = s[2] * (1 - 1.3 * dt) + 55 * S * Math.sin(s[4] * 7 + s[5] * 20) * dt;
      s[3] += s[6] * dt;
      s[0] += s[2] * dt;
      s[1] += s[3] * dt;
      let k = 1 - s[4] / s[5];
      let rr = Math.floor(s[1] / CH), cc = Math.floor(s[0] / CW);
      if (0 <= rr && rr < ROWS && 0 <= cc && cc < COLS) {
        newMap[`${rr},${cc}`] = [k > 0.55 ? "*" : (k > 0.30 ? "+" : "."),
          LUT[Math.floor(clamp(0.15 + 0.85 * k) * 63)]];
      }
      aliveSparks.push(s);
    }
    sparks = aliveSparks;

    let aliveSmoke = [];
    for (let s of smoke) {
      s[4] += dt;
      if (s[4] >= s[5]) continue;
      let k = s[4] / s[5];
      s[0] += (s[2] + 14 * S * Math.sin(s[4] * 2.2 + s[6])) * dt;
      s[1] += s[3] * dt;
      let al = Math.sin(Math.PI * k) * 0.5;
      let rr = Math.floor(s[1] / CH), cc = Math.floor(s[0] / CW);
      if (al > 0.10 && 0 <= rr && rr < ROWS && 0 <= cc && cc < COLS) {
        let und = newMap[`${rr},${cc}`];
        let ucol = und ? und[1] : BG;
        newMap[`${rr},${cc}`] = [".:;+"[Math.min(3, Math.floor(al * 7))], mix(ucol, s[7], al)];
      }
      aliveSmoke.push(s);
    }
    smoke = aliveSmoke;

    draw_click(t, dt, newMap);
    draw_cursor(t, newMap);

    ctx.fillStyle = hexc(BG);
    ctx.fillRect(0, 0, W, H);
    ctx.font = `bold ${Math.floor(CH * 0.90)}px "Courier New", Courier, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let key in newMap) {
      let [ch, col] = newMap[key];
      let [r, c] = key.split(",").map(Number);
      ctx.fillStyle = hexc(col);
      ctx.fillText(ch, (c + 0.5) * CW, (r + 0.5) * CH);
    }

    if (t > T_BURN && t < T_R0) {
      hint.textContent = "Ateşten doğan bir şey var... ✨";
      hint.style.opacity = "1";
    } else if (t >= T_R0 && t < T_GLOW + 2.0) {
      hint.textContent = "Senin için ❤️";
      hint.style.opacity = "1";
    } else if (t >= T_GLOW + 4.0) {
      hint.style.opacity = "0.3";
    }

    requestAnimationFrame(frame);
  }

  if (replayBtn) replayBtn.addEventListener("click", restart);
  restart();
  requestAnimationFrame(frame);
});
