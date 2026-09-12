/**
 * 默认系数 / 工况面板字段（对齐 GC-01 + dtii-engine 输入名）
 */
import { GC01_INPUT } from "./gc01-case.js";

/** 标准空载/满载 f 工况预设 */
export const F_DUTY_PRESETS = {
  empty: { id: "empty", label: "空载", f: 0.02, note: "空载示意摩擦系数" },
  full: { id: "full", label: "满载", f: 0.023, note: "满载（GC-01 采用）" },
  heavy: { id: "heavy", label: "重载偏保守", f: 0.025, note: "偏保守工况" },
};

/**
 * 与 runDtiiP2P 对齐的默认可覆盖系数
 */
export const DEFAULT_COEFFS = {
  f: GC01_INPUT.f,
  C: GC01_INPUT.C,
  eta: GC01_INPUT.eta,
  mu: 0.3,
  v_mps: GC01_INPUT.v_mps,
  qRO: GC01_INPUT.qRO,
  qRU: GC01_INPUT.qRU,
  qB: GC01_INPUT.qB,
  qG: GC01_INPUT.qG,
  FS1_N: GC01_INPUT.FS1_N,
  FS2_N: GC01_INPUT.FS2_N,
  duty: "full",
  f_duty: "full",
  e_mu_phi: GC01_INPUT.e_mu_phi,
  g: GC01_INPUT.g,
};

export const COEFF_FREEZE_KEY = "pidm.coeff.freeze.v0";

/**
 * 面板覆盖 → runDtiiP2P 输入字段
 * @param {object} coeffs
 * @param {object} [base] 基底输入（GC-01 或路径提取）
 */
export function coeffsToCalcInput(coeffs = {}, base = {}) {
  const c = { ...DEFAULT_COEFFS, ...coeffs };
  const dutyKey = c.f_duty || c.duty;
  const preset = F_DUTY_PRESETS[dutyKey];
  // 仅当面板显式给 f 时保留；否则跟随工况预设
  const f =
    coeffs.f != null && Number.isFinite(Number(coeffs.f))
      ? Number(coeffs.f)
      : preset?.f ?? Number(c.f) ?? DEFAULT_COEFFS.f;
  let qG = Number(c.qG);
  if (dutyKey === "empty" && coeffs.qG == null) qG = 0;
  return {
    ...base,
    f,
    C: Number(c.C),
    eta: Number(c.eta),
    mu: Number(c.mu),
    v_mps: Number(c.v_mps),
    qRO: Number(c.qRO),
    qRU: Number(c.qRU),
    qB: Number(c.qB),
    qG,
    FS1_N: Number(c.FS1_N),
    FS2_N: Number(c.FS2_N),
    e_mu_phi: Number.isFinite(Number(c.e_mu_phi)) ? Number(c.e_mu_phi) : base.e_mu_phi,
    g: Number.isFinite(Number(c.g)) ? Number(c.g) : base.g ?? 9.81,
    duty: dutyKey || null,
    f_duty: dutyKey || null,
    coeff_source: "panel",
  };
}

export function loadFrozenCoeffs(storage = typeof sessionStorage !== "undefined" ? sessionStorage : null) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(COEFF_FREEZE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function freezeCoeffs(coeffs, storage = typeof sessionStorage !== "undefined" ? sessionStorage : null) {
  const snap = {
    ...DEFAULT_COEFFS,
    ...coeffs,
    frozen_at: new Date().toISOString(),
    schema: COEFF_FREEZE_KEY,
  };
  if (storage) storage.setItem(COEFF_FREEZE_KEY, JSON.stringify(snap));
  return snap;
}
