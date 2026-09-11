/**
 * GC-01 锚定输入与期望输出
 * 来源：docs/golden-cases/GC-01_blast_furnace_feeder.md
 * 地位：v1 唯一黄金算例（2026-09-11 确认）
 */

export const GC01_INPUT = {
  case_id: "GC-01",
  name: "某钢铁厂高炉带式上料机（例2）",
  Q_tph: 1700,
  rho: 1800,
  Ln_m: 304.88,
  H_m: 57.051,
  delta_deg: 10.4278,
  B_mm: 1400,
  v_mps: 2,
  a0_m: 1.2,
  aU_m: 3.0,
  trough_deg: 35,
  f: 0.023,
  C: 1.3,
  L_m: 310,
  qRO: 29.1,
  qRU: 10,
  qB: 47.6,
  qG: 236.1,
  FS1_N: 6100,
  FS2_N: 4200,
  eta: 0.88,
  g: 9.81,
  e_mu_phi: 3.4,
  S1min_anchor_N: 24946,
  S_carry_sag_N: 41746,
  S_return_sag_N: 17511,
  S22_N: 233354,
  power_split: "1:1",
};

/**
 * 手册约等号。FH/FU 与精确浮点会有约 100N 级差，容差见 GC01_TOL。
 */
export const GC01_EXPECTED = {
  FH_N: 25525,
  FS1_N: 6100,
  FS2_N: 4200,
  FSt_N: 132138.2,
  FU_N: 175621,
  PA_kW: 351.2,
  PM_kW: 399.1,
  S1min_slip_N: 24946,
  S_carry_sag_N: 41746,
  S_return_sag_N: 17511,
  FU1_N: 87811,
  S22_1_N: 124399,
  S1_back_N: 36588,
  F1_N: 357753,
  F2_N: 160987,
};

export const GC01_TOL = {
  force_N: 160, // 手册约等号 vs 浮点展开
  power_kW: 0.8,
  relative: 0.003,
};
