/**
 * 简易选型库：电动机标准功率 + 钢丝绳芯胶带强度档
 */

/** IEC/常用三相异步电动机功率档 (kW) */
export const MOTOR_KW_SERIES = [
  0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90,
  110, 132, 160, 185, 200, 220, 250, 280, 315, 355, 400, 450, 500, 560, 630, 710, 800,
];

/**
 * 钢丝绳芯胶带常用强度档（示意，N/mm）
 * 选取规则：所需强度 σ_req = n1 · S_max / B ，上靠到档位
 */
export const BELT_ST_SERIES = [
  { grade: "ST1000", strength_Npm: 1000 },
  { grade: "ST1250", strength_Npm: 1250 },
  { grade: "ST1400", strength_Npm: 1400 },
  { grade: "ST1600", strength_Npm: 1600 },
  { grade: "ST2000", strength_Npm: 2000 },
  { grade: "ST2500", strength_Npm: 2500 },
  { grade: "ST3150", strength_Npm: 3150 },
  { grade: "ST3500", strength_Npm: 3500 },
  { grade: "ST4000", strength_Npm: 4000 },
  { grade: "ST5000", strength_Npm: 5000 },
];

export function selectMotorKw(PM_kW, series = MOTOR_KW_SERIES) {
  const pm = Number(PM_kW);
  if (!(pm > 0)) {
    return { ok: false, P_kW: null, PM_kW: pm, note: "PM 无效" };
  }
  const hit = series.find((p) => p >= pm - 1e-9);
  if (hit == null) {
    return {
      ok: false,
      P_kW: null,
      PM_kW: +pm.toFixed(2),
      note: `超出系列上限 ${series[series.length - 1]} kW`,
      series,
    };
  }
  const i = series.indexOf(hit);
  return {
    ok: true,
    P_kW: hit,
    PM_kW: +pm.toFixed(2),
    margin_kW: +(hit - pm).toFixed(2),
    near: series.slice(Math.max(0, i - 1), i + 2),
    series_label: "IEC/常用 kW",
    note: `选用 ${hit} kW（≥ PM ${pm.toFixed(2)} kW）`,
  };
}

/**
 * @param {{S_max_N:number, B_mm:number, n1?:number}} opts
 */
export function selectBeltGrade(opts = {}) {
  const S_max = Number(opts.S_max_N);
  const B = Number(opts.B_mm);
  const n1 = Number.isFinite(opts.n1) ? opts.n1 : 10;
  if (!(S_max > 0) || !(B > 0)) {
    return { ok: false, grade: null, note: "缺少 S_max 或带宽 B" };
  }
  const sigma_req = (n1 * S_max) / B; // N/mm
  const hit = BELT_ST_SERIES.find((g) => g.strength_Npm >= sigma_req - 1e-9);
  if (!hit) {
    return {
      ok: false,
      grade: null,
      sigma_req_Npm: +sigma_req.toFixed(1),
      note: `所需 ${sigma_req.toFixed(1)} N/mm 超出 ST5000`,
      n1,
      S_max_N: S_max,
      B_mm: B,
    };
  }
  return {
    ok: true,
    grade: hit.grade,
    strength_Npm: hit.strength_Npm,
    sigma_req_Npm: +sigma_req.toFixed(1),
    margin_Npm: +(hit.strength_Npm - sigma_req).toFixed(1),
    n1,
    S_max_N: S_max,
    B_mm: B,
    note: `选用 ${hit.grade}（σ_req=${sigma_req.toFixed(1)} N/mm，n1=${n1}）`,
  };
}
