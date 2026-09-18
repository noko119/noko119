/**
 * 普通螺纹（公制 ISO / GB/T 192·196·3）尺寸推导
 * - 牙顶 / 牙底 / 中径
 * - 外螺纹 / 内螺纹
 * - 退刀槽（按 GB/T 3 常用表，未知螺距插值）
 */

const SQRT3_2 = Math.sqrt(3) / 2; // H = (√3/2)·P

/** 常用公称直径 → 粗牙螺距（GB/T 193） */
export const COARSE_PITCH = {
  1: 0.25, 1.2: 0.25, 1.4: 0.3, 1.6: 0.35, 1.8: 0.35,
  2: 0.4, 2.5: 0.45, 3: 0.5, 3.5: 0.6, 4: 0.7,
  5: 0.8, 6: 1, 7: 1, 8: 1.25, 9: 1.25, 10: 1.5,
  11: 1.5, 12: 1.75, 14: 2, 16: 2, 18: 2.5, 20: 2.5,
  22: 2.5, 24: 3, 27: 3, 30: 3.5, 33: 3.5, 36: 4,
  39: 4, 42: 4.5, 45: 4.5, 48: 5, 52: 5, 56: 5.5,
  60: 5.5, 64: 6, 68: 6, 72: 6, 76: 6, 80: 6,
  85: 6, 90: 6, 95: 6, 100: 6,
};

/** 常用细牙螺距选项（按公称直径范围） */
export const FINE_PITCH_OPTIONS = [
  0.2, 0.25, 0.35, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4,
];

/**
 * GB/T 3 外螺纹退刀槽常用尺寸（按螺距）
 * g1 普通 / g2 短 / g3 长；df = d − k；r 圆角
 */
const EXT_UNDERCUT = [
  { p: 0.25, g1: 0.8, g2: 0.5, g3: 1.2, k: 0.4, r: 0.1 },
  { p: 0.3, g1: 0.9, g2: 0.6, g3: 1.5, k: 0.5, r: 0.1 },
  { p: 0.35, g1: 1.0, g2: 0.7, g3: 1.6, k: 0.6, r: 0.1 },
  { p: 0.4, g1: 1.2, g2: 0.8, g3: 2.0, k: 0.7, r: 0.2 },
  { p: 0.45, g1: 1.2, g2: 0.9, g3: 2.0, k: 0.7, r: 0.2 },
  { p: 0.5, g1: 1.6, g2: 1.0, g3: 2.5, k: 0.8, r: 0.2 },
  { p: 0.6, g1: 1.6, g2: 1.2, g3: 2.5, k: 0.9, r: 0.3 },
  { p: 0.7, g1: 2.0, g2: 1.5, g3: 3.0, k: 1.1, r: 0.3 },
  { p: 0.75, g1: 2.0, g2: 1.5, g3: 3.0, k: 1.2, r: 0.3 },
  { p: 0.8, g1: 2.0, g2: 1.6, g3: 3.0, k: 1.3, r: 0.3 },
  { p: 1.0, g1: 2.5, g2: 2.0, g3: 4.0, k: 1.6, r: 0.5 },
  { p: 1.25, g1: 3.2, g2: 2.5, g3: 5.0, k: 2.0, r: 0.5 },
  { p: 1.5, g1: 3.2, g2: 2.5, g3: 5.0, k: 2.3, r: 0.5 },
  { p: 1.75, g1: 4.0, g2: 3.0, g3: 6.0, k: 2.6, r: 0.8 },
  { p: 2.0, g1: 4.0, g2: 3.0, g3: 6.0, k: 3.0, r: 0.8 },
  { p: 2.5, g1: 5.0, g2: 4.0, g3: 8.0, k: 3.6, r: 1.0 },
  { p: 3.0, g1: 5.0, g2: 4.0, g3: 8.0, k: 4.4, r: 1.0 },
  { p: 3.5, g1: 6.0, g2: 5.0, g3: 10.0, k: 5.0, r: 1.2 },
  { p: 4.0, g1: 6.0, g2: 5.0, g3: 10.0, k: 5.7, r: 1.2 },
  { p: 4.5, g1: 8.0, g2: 6.0, g3: 12.0, k: 6.4, r: 1.6 },
  { p: 5.0, g1: 8.0, g2: 6.0, g3: 12.0, k: 7.0, r: 1.6 },
  { p: 5.5, g1: 10.0, g2: 8.0, g3: 14.0, k: 7.7, r: 2.0 },
  { p: 6.0, g1: 10.0, g2: 8.0, g3: 14.0, k: 8.3, r: 2.0 },
];

/**
 * GB/T 3 内螺纹退刀槽常用尺寸
 * D_g 槽底直径 ≈ D + m；宽度同外螺纹量级
 */
const INT_UNDERCUT = [
  { p: 0.25, g1: 0.8, g2: 0.5, g3: 1.2, m: 0.4, r: 0.1 },
  { p: 0.3, g1: 0.9, g2: 0.6, g3: 1.5, m: 0.5, r: 0.1 },
  { p: 0.35, g1: 1.0, g2: 0.7, g3: 1.6, m: 0.6, r: 0.1 },
  { p: 0.4, g1: 1.2, g2: 0.8, g3: 2.0, m: 0.7, r: 0.2 },
  { p: 0.45, g1: 1.2, g2: 0.9, g3: 2.0, m: 0.7, r: 0.2 },
  { p: 0.5, g1: 1.6, g2: 1.0, g3: 2.5, m: 0.8, r: 0.2 },
  { p: 0.6, g1: 1.6, g2: 1.2, g3: 2.5, m: 0.9, r: 0.3 },
  { p: 0.7, g1: 2.0, g2: 1.5, g3: 3.0, m: 1.1, r: 0.3 },
  { p: 0.75, g1: 2.0, g2: 1.5, g3: 3.0, m: 1.2, r: 0.3 },
  { p: 0.8, g1: 2.0, g2: 1.6, g3: 3.0, m: 1.3, r: 0.3 },
  { p: 1.0, g1: 2.5, g2: 2.0, g3: 4.0, m: 1.6, r: 0.5 },
  { p: 1.25, g1: 3.2, g2: 2.5, g3: 5.0, m: 2.0, r: 0.5 },
  { p: 1.5, g1: 3.2, g2: 2.5, g3: 5.0, m: 2.3, r: 0.5 },
  { p: 1.75, g1: 4.0, g2: 3.0, g3: 6.0, m: 2.6, r: 0.8 },
  { p: 2.0, g1: 4.0, g2: 3.0, g3: 6.0, m: 3.0, r: 0.8 },
  { p: 2.5, g1: 5.0, g2: 4.0, g3: 8.0, m: 3.6, r: 1.0 },
  { p: 3.0, g1: 5.0, g2: 4.0, g3: 8.0, m: 4.4, r: 1.0 },
  { p: 3.5, g1: 6.0, g2: 5.0, g3: 10.0, m: 5.0, r: 1.2 },
  { p: 4.0, g1: 6.0, g2: 5.0, g3: 10.0, m: 5.7, r: 1.2 },
  { p: 4.5, g1: 8.0, g2: 6.0, g3: 12.0, m: 6.4, r: 1.6 },
  { p: 5.0, g1: 8.0, g2: 6.0, g3: 12.0, m: 7.0, r: 1.6 },
  { p: 5.5, g1: 10.0, g2: 8.0, g3: 14.0, m: 7.7, r: 2.0 },
  { p: 6.0, g1: 10.0, g2: 8.0, g3: 14.0, m: 8.3, r: 2.0 },
];

function round(n, digits = 3) {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lookupPitchRow(table, pitch) {
  if (!table.length) return null;
  if (pitch <= table[0].p) return { ...table[0] };
  if (pitch >= table[table.length - 1].p) return { ...table[table.length - 1] };
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (pitch >= a.p && pitch <= b.p) {
      if (Math.abs(pitch - a.p) < 1e-9) return { ...a };
      if (Math.abs(pitch - b.p) < 1e-9) return { ...b };
      const t = (pitch - a.p) / (b.p - a.p);
      const out = { p: pitch };
      for (const key of Object.keys(a)) {
        if (key === "p") continue;
        out[key] = round(lerp(a[key], b[key], t), 3);
      }
      return out;
    }
  }
  return { ...table[table.length - 1] };
}

/** 解析螺纹代号：M20 / M20x1.5 / M320X2 / M195×2 / m12*1.25 */
export function parseThreadSpec(raw) {
  let s = String(raw || "").trim();
  if (!s) return { ok: false, error: "请输入螺纹规格，例如 M20、M320X2、M195×2" };

  // 全角/杂字符归一：乘号、连字符、字母 X
  s = s
    .replace(/\s+/g, "")
    .replace(/[×✕✖ｘＸxX＊*－—–−-]/g, "x")
    .replace(/ｍ/gi, "M");

  const m = s.match(/^M(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?$/i);
  if (!m) {
    return {
      ok: false,
      error: "无法识别规格。支持：M20、M320X2、M195×2、M16*1.5",
    };
  }

  const d = Number(m[1]);
  const pitchGiven = m[2] != null ? Number(m[2]) : null;
  if (!(d > 0)) return { ok: false, error: "公称直径无效" };
  if (pitchGiven != null && !(pitchGiven > 0)) {
    return { ok: false, error: "螺距无效" };
  }

  return { ok: true, d, pitchGiven };
}

export function defaultPitch(d) {
  if (d > 100) return 6; // 大直径常用粗牙上限（无专用表时）
  const keys = Object.keys(COARSE_PITCH).map(Number).sort((a, b) => a - b);
  if (COARSE_PITCH[d] != null) return COARSE_PITCH[d];
  let best = keys[0];
  let bestDist = Math.abs(d - best);
  for (const k of keys) {
    const dist = Math.abs(d - k);
    if (dist < bestDist) {
      best = k;
      bestDist = dist;
    }
  }
  return COARSE_PITCH[best];
}

export function suggestFinePitches(d) {
  const coarse = defaultPitch(d);
  return FINE_PITCH_OPTIONS.filter((p) => p < coarse && p < d / 2);
}

/**
 * 基本牙型与内外螺纹尺寸（公称，未加公差）
 */
export function computeBasicProfile(d, pitch) {
  const P = pitch;
  const H = SQRT3_2 * P;
  // ISO 724 / GB/T 196
  const d2 = d - (3 / 4) * H; // = d − 0.649519053·P
  const d1 = d - (5 / 4) * H; // = d − 1.082531755·P  基本小径
  const d3 = d - 1.226869322 * P; // 外螺纹牙底（圆底）常用

  const D = d;
  const D2 = d2;
  const D1 = d1;

  return {
    d,
    P,
    H: round(H, 4),
    // 外螺纹
    external: {
      crest: round(d, 3), // 牙顶 = 大径 d
      root: round(d3, 3), // 牙底 = 小径 d3（圆底）
      minorBasic: round(d1, 3), // 基本小径 d1
      pitch: round(d2, 3), // 中径 d2
      labels: {
        crest: "牙顶 d（大径）",
        root: "牙底 d3（小径·圆底）",
        pitch: "中径 d2",
      },
    },
    // 内螺纹
    internal: {
      crest: round(D1, 3), // 牙顶 = 小径 D1
      root: round(D, 3), // 牙底 = 大径 D
      pitch: round(D2, 3), // 中径 D2
      labels: {
        crest: "牙顶 D1（小径）",
        root: "牙底 D（大径）",
        pitch: "中径 D2",
      },
    },
  };
}

/**
 * 退刀槽（推导槽）尺寸
 * @param {"normal"|"short"|"long"} lengthKind
 */
export function computeUndercut(d, pitch, lengthKind = "normal") {
  const ext = lookupPitchRow(EXT_UNDERCUT, pitch);
  const int = lookupPitchRow(INT_UNDERCUT, pitch);
  const widthKey = lengthKind === "short" ? "g2" : lengthKind === "long" ? "g3" : "g1";

  const external = {
    diameter: round(d - ext.k, 3),
    width: round(ext[widthKey], 3),
    radius: round(ext.r, 3),
    note: "外螺纹退刀槽直径 df ≈ d − k（GB/T 3）",
  };

  const internal = {
    diameter: round(d + int.m, 3),
    width: round(int[widthKey], 3),
    radius: round(int.r, 3),
    note: "内螺纹退刀槽直径 Dg ≈ D + m（GB/T 3）",
  };

  return { external, internal, lengthKind, pitchRef: round(pitch, 3) };
}

/**
 * 加工参考：外螺纹毛坯 / 内螺纹底孔
 */
export function computeMachiningHints(d, pitch) {
  const basic = computeBasicProfile(d, pitch);
  // 内螺纹底孔常用 ≈ D1（或略大，视材料；此处给基本小径）
  const tapDrill = basic.internal.crest;
  // 外螺纹车前毛坯 ≈ d（留倒角）
  const blankOd = d;
  return {
    externalBlankOd: round(blankOd, 3),
    internalTapDrill: round(tapDrill, 3),
    externalRootTurning: basic.external.root,
    tipAngle: 60,
  };
}

/** 一次出全表 */
export function computeThread(spec, options = {}) {
  const parsed = typeof spec === "string" ? parseThreadSpec(spec) : spec;
  if (!parsed.ok) return parsed;

  const d = options.d ?? parsed.d;
  const pitch =
    options.pitch ??
    parsed.pitchGiven ??
    defaultPitch(d);
  const lengthKind = options.lengthKind || "normal";
  const isFine = parsed.pitchGiven != null && Math.abs(pitch - defaultPitch(d)) > 1e-9;

  const designation =
    Math.abs(pitch - defaultPitch(d)) < 1e-9
      ? `M${trimNum(d)}`
      : `M${trimNum(d)}×${trimNum(pitch)}`;

  const basic = computeBasicProfile(d, pitch);
  const undercut = computeUndercut(d, pitch, lengthKind);
  const machining = computeMachiningHints(d, pitch);

  return {
    ok: true,
    designation,
    d: round(d, 3),
    pitch: round(pitch, 3),
    isFine,
    isCoarse: !isFine,
    basic,
    undercut,
    machining,
    formula: {
      H: "H = (√3/2)·P",
      d2: "d2 = d − (3/4)·H = d − 0.64952·P",
      d1: "d1 = d − (5/4)·H = d − 1.08253·P",
      d3: "d3 = d − 1.22687·P（外螺纹牙底）",
      D1: "D1 = d1（内螺纹牙顶）",
      D: "D = d（内螺纹牙底）",
    },
  };
}

function trimNum(n) {
  const s = String(round(Number(n), 4));
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

export function listCommonSpecs() {
  return Object.entries(COARSE_PITCH).map(([d, p]) => ({
    d: Number(d),
    pitch: p,
    label: `M${d}`,
  }));
}
