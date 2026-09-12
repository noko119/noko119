/**
 * P2P 计算结果 → 竖曲线 Rmin / 包角不打滑 设计荷载桥接
 * 优先用 runDtiiP2P.summary；无计算时回退 GC-01/默认
 */

export const DESIGN_LOADS_STORAGE_KEY = "pidm.design.loads.v0";

/**
 * @param {object} [summary] runDtiiP2P().summary
 * @param {object} [input] 计算输入（含 qB/qG/v/a0…）
 */
export function buildDesignLoadsFromP2P(summary = {}, input = {}) {
  const S1 = Number(summary.S1min_N ?? input.S1min_anchor_N ?? 24946);
  const FU = Number(summary.FU_N ?? 175621);
  const S_carry = Number(summary.S_carry_sag_N ?? input.S_carry_sag_N ?? 41746);
  const S_return = Number(summary.S_return_sag_N ?? input.S_return_sag_N ?? 17511);
  const split = summary.split_active || {};
  const S_mid = Number(split.S_mid_N);
  const S_back = Number(split.S1_back_N);

  const hasP2P = Number.isFinite(summary.FU_N);
  const S_tight = Number.isFinite(S_mid) ? S_mid : FU + S1;
  const S_slack = Number.isFinite(S_back) ? S_back : S1;
  const T_curve = Math.max(S_carry, S1);

  return {
    v_mps: Number(input.v_mps ?? 2),
    T_N: T_curve,
    qB: Number(input.qB ?? 47.6),
    qG: Number(input.qG ?? 236.1),
    a_idler_m: Number(input.a0_m ?? 1.2),
    aU_m: Number(input.aU_m ?? 3.0),
    B_mm: Number(input.B_mm ?? 1400),
    mu: Number(input.mu ?? 0.3),
    S_tight_N: +S_tight.toFixed(1),
    S_slack_N: +S_slack.toFixed(1),
    FU_N: +FU.toFixed(1),
    S1min_N: +S1.toFixed(1),
    S_carry_sag_N: +S_carry.toFixed(1),
    S_return_sag_N: +S_return.toFixed(1),
    F1_N: Number.isFinite(split.F1_N) ? split.F1_N : summary.F1_N ?? null,
    F2_N: Number.isFinite(split.F2_N) ? split.F2_N : summary.F2_N ?? null,
    PM_kW: summary.PM_kW ?? null,
    motor_kW: summary.motor_kW ?? summary.motor_select?.P_kW ?? null,
    source: hasP2P ? "p2p_summary" : "defaults",
    note: hasP2P
      ? "荷载来自 P2P 摘要（竖曲线用 max(S_carry,S1)；不打滑用 S_mid/S_back）"
      : "荷载为默认/锚定值；请先在计算页运行 P2P 并冻结/同步",
  };
}

export function saveDesignLoads(loads, storage = globalThis.sessionStorage) {
  if (!storage) return loads;
  try {
    storage.setItem(
      DESIGN_LOADS_STORAGE_KEY,
      JSON.stringify({ ...loads, saved_at: new Date().toISOString() })
    );
  } catch {
    /* ignore quota */
  }
  return loads;
}

export function loadDesignLoads(storage = globalThis.sessionStorage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DESIGN_LOADS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * 路径编辑器取用：优先 session 中的 P2P 荷载，否则用 input 默认构造
 */
export function resolveDesignLoads(input = {}, storage = globalThis.sessionStorage) {
  const saved = loadDesignLoads(storage);
  if (saved && saved.source === "p2p_summary") {
    return {
      ...buildDesignLoadsFromP2P({}, input),
      ...saved,
      source: "p2p_summary",
    };
  }
  return buildDesignLoadsFromP2P({}, input);
}
