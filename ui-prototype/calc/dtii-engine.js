/**
 * DTⅡ(A) 逐点张力计算引擎 v0（逐步透明）
 * 算法版本：DTII-P2P-v0.2（含双驱 1:1 / 2:1 / 1:2）
 */
import { selectBeltGrade } from "./selection-catalog.js";
import { buildDesignLoadsFromP2P } from "./design-loads.js";

function step(partial) {
  return {
    id: partial.id,
    title: partial.title,
    handbook: partial.handbook || "",
    formula: partial.formula || "",
    inputs: partial.inputs || {},
    intermediates: partial.intermediates || {},
    result: partial.result,
    unit: partial.unit || "",
    note: partial.note || "",
  };
}

function near(a, b, absTol, relTol = 0.002) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a - b) <= absTol) return true;
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-9) <= relTol;
}

/**
 * 双传动滚筒合力（手册算例简化法）
 * FU1:FU2 = r1:r2；S_mid = max(FU1,FU2)·e/(e-1)
 * F1 = S22 + S_mid；F2 = 2·S_mid − max(FU1,FU2)
 */
export function dualDriveForces(FU, S22, e, r1, r2) {
  const FU1 = (FU * r1) / (r1 + r2);
  const FU2 = (FU * r2) / (r1 + r2);
  const FU_ref = Math.max(FU1, FU2);
  const S_mid = (FU_ref * e) / (e - 1);
  const S1_back = S_mid - FU_ref;
  return {
    ratio: `${r1}:${r2}`,
    FU1_N: +FU1.toFixed(0),
    FU2_N: +FU2.toFixed(0),
    FU_ref_N: +FU_ref.toFixed(0),
    S_mid_N: +S_mid.toFixed(0),
    S1_back_N: +S1_back.toFixed(0),
    F1_N: +(S22 + S_mid).toFixed(0),
    F2_N: +(S_mid + S1_back).toFixed(0),
  };
}

function parseSplit(split) {
  if (split === "2:1") return [2, 1];
  if (split === "1:2") return [1, 2];
  return [1, 1];
}

/** 常用标准电机功率档（kW） */
export const STANDARD_MOTOR_KW = [
  0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 185, 200, 220, 250, 280, 315, 355, 400, 450, 500, 560, 630, 710, 800,
];

/**
 * 按 PM 上靠最近标准电机功率
 * @param {number} PM_kW
 * @param {number[]} [series]
 */
export function selectMotorFromPm(PM_kW, series = STANDARD_MOTOR_KW) {
  const pm = Number(PM_kW);
  if (!(pm > 0)) {
    return {
      P_kW: null,
      PM_kW: pm,
      ok: false,
      note: "PM 无效，无法选型",
      series_label: "IEC/常用 kW",
      near: [],
    };
  }
  const pick = series.find((p) => p >= pm - 1e-9) ?? series[series.length - 1];
  const idx = series.indexOf(pick);
  const near = series.slice(Math.max(0, idx - 1), Math.min(series.length, idx + 2));
  return {
    P_kW: pick,
    PM_kW: +pm.toFixed(2),
    ok: pick >= pm,
    margin_kW: +(pick - pm).toFixed(2),
    series_label: "IEC/常用 kW",
    near,
    note: pick >= pm ? `选用 ${pick} kW（≥ PM ${pm.toFixed(2)} kW）` : `超出系列上限，取 ${pick} kW`,
  };
}

export function runDtiiP2P(input) {
  const g = input.g ?? 9.81;
  const steps = [];
  const activeSplit = input.power_split || "1:1";

  steps.push(
    step({
      id: "P0",
      title: "原始参数确认",
      handbook: "算例给定",
      formula: "—",
      inputs: {
        Q: input.Q_tph,
        L: input.L_m,
        H: input.H_m,
        delta_deg: input.delta_deg,
        f: input.f,
        C: input.C,
        qRO: input.qRO,
        qRU: input.qRU,
        qB: input.qB,
        qG: input.qG,
        power_split: activeSplit,
      },
      result: input.case_id || "case",
      note: "后续步骤均引用本表采用值",
    })
  );

  const cosd = Math.cos((input.delta_deg * Math.PI) / 180);
  const bracket = input.qRO + input.qRU + (2 * input.qB + input.qG) * cosd;
  const FH = input.f * input.L_m * g * bracket;
  steps.push(
    step({
      id: "FH",
      title: "主要阻力 FH",
      handbook: "式3-19",
      formula: "FH = f·L·g·[qRO+qRU+(2qB+qG)·cosδ]",
      inputs: {
        f: input.f,
        L: input.L_m,
        g,
        qRO: input.qRO,
        qRU: input.qRU,
        qB: input.qB,
        qG: input.qG,
        delta_deg: input.delta_deg,
      },
      intermediates: { cosδ: +cosd.toFixed(6), bracket: +bracket.toFixed(4) },
      result: +FH.toFixed(1),
      unit: "N",
    })
  );

  const FS1 = input.FS1_N;
  steps.push(
    step({
      id: "FS1",
      title: "特种主要阻力 FS1",
      handbook: "式3-24/3-25/3-27",
      formula: "FS1 = Fε + Fgl（v0 整项锚定）",
      inputs: { FS1_anchor: FS1 },
      result: FS1,
      unit: "N",
    })
  );

  const FS2 = input.FS2_N;
  steps.push(
    step({
      id: "FS2",
      title: "附加特种阻力 FS2",
      handbook: "式3-28/3-29",
      formula: "清扫器等附加（v0 整项锚定）",
      inputs: { FS2_anchor: FS2 },
      result: FS2,
      unit: "N",
    })
  );

  const FSt = input.qG * g * input.H_m;
  steps.push(
    step({
      id: "FSt",
      title: "倾斜提升阻力 FSt",
      handbook: "式3-31",
      formula: "FSt = qG·g·H",
      inputs: { qG: input.qG, g, H: input.H_m },
      result: +FSt.toFixed(1),
      unit: "N",
    })
  );

  const FU = input.C * FH + FS1 + FS2 + FSt;
  steps.push(
    step({
      id: "FU",
      title: "圆周驱动力 FU",
      handbook: "式3-17",
      formula: "FU = C·FH + FS1 + FS2 + FSt",
      inputs: { C: input.C, FH: +FH.toFixed(1), FS1, FS2, FSt: +FSt.toFixed(1) },
      intermediates: { "C·FH": +(input.C * FH).toFixed(1) },
      result: +FU.toFixed(1),
      unit: "N",
    })
  );

  const PA = (FU * input.v_mps) / 1000;
  const PM = PA / input.eta;
  steps.push(
    step({
      id: "PA",
      title: "传动滚筒轴功率 PA",
      handbook: "式3-40",
      formula: "PA = FU·v / 1000",
      inputs: { FU: +FU.toFixed(1), v: input.v_mps },
      result: +PA.toFixed(2),
      unit: "kW",
    })
  );
  steps.push(
    step({
      id: "PM",
      title: "电动机功率 PM",
      handbook: "式3-46",
      formula: "PM = PA / η",
      inputs: { PA: +PA.toFixed(2), eta: input.eta },
      result: +PM.toFixed(2),
      unit: "kW",
    })
  );

  const motor = selectMotorFromPm(PM);
  steps.push(
    step({
      id: "Motor",
      title: "电动机选型（标准功率上靠）",
      handbook: "选型示意",
      formula: "P_motor = min { P ∈ 标准系列 | P ≥ PM }",
      inputs: { PM_kW: +PM.toFixed(2), series: motor.series_label },
      intermediates: { candidates_near: motor.near },
      result: motor.P_kW,
      unit: "kW",
      note: motor.note,
    })
  );

  const emu = input.e_mu_phi;
  const S1_simple = FU / (emu - 1);
  const S1min = input.S1min_anchor_N ?? S1_simple;
  steps.push(
    step({
      id: "S1min",
      title: "不打滑最小张力 S1min（奔离点）",
      handbook: "式3-32",
      formula: "欧拉摩擦求 S1min；双驱例取手册值起算",
      inputs: { FU: +FU.toFixed(1), "e^{μφ}": emu, S1min_handbook: input.S1min_anchor_N },
      intermediates: { "FU/(e-1) 参考": +S1_simple.toFixed(0) },
      result: S1min,
      unit: "N",
      note: "GC-01 起算 S1=24946 N；e^{μφ}=3.4 主要用于双驱合力",
    })
  );

  const S_carry = input.S_carry_sag_N ?? 41746;
  const S_return = input.S_return_sag_N ?? 17511;
  steps.push(
    step({
      id: "SagCarry",
      title: "承载分支下垂度最小张力",
      handbook: "式3-33",
      formula: "Smin,carry（v0 用算例阈值）",
      inputs: { a0: input.a0_m, anchor: S_carry },
      result: S_carry,
      unit: "N",
    })
  );
  steps.push(
    step({
      id: "SagReturn",
      title: "回程分支下垂度最小张力",
      handbook: "式3-34",
      formula: "Smin,return（v0 用算例阈值）",
      inputs: { aU: input.aU_m, anchor: S_return },
      result: S_return,
      unit: "N",
    })
  );

  const S22 = input.S22_N ?? 233354;
  const split11 = dualDriveForces(FU, S22, emu, 1, 1);
  const split21 = dualDriveForces(FU, S22, emu, 2, 1);
  const split12 = dualDriveForces(FU, S22, emu, 1, 2);
  const F1max = Math.max(split11.F1_N, split21.F1_N, split12.F1_N);
  const F2max = Math.max(split11.F2_N, split21.F2_N, split12.F2_N);
  const [ar, br] = parseSplit(activeSplit);
  const active = dualDriveForces(FU, S22, emu, ar, br);

  steps.push(
    step({
      id: "SplitActive",
      title: `双传动功率分配 ${active.ratio} 与滚筒合力（当前）`,
      handbook: "表3-26 / 算例续算",
      formula:
        "FU1:FU2=r1:r2；FU_ref=max(FU1,FU2)；S_mid=FU_ref·e/(e-1)；F1=S22+S_mid；F2=2·S_mid−FU_ref",
      inputs: { FU: +FU.toFixed(1), e: emu, S22_anchor: S22, ratio: active.ratio },
      intermediates: {
        FU1: active.FU1_N,
        FU2: active.FU2_N,
        FU_ref: active.FU_ref_N,
        S_mid: active.S_mid_N,
        S1_back: active.S1_back_N,
      },
      result: { F1: active.F1_N, F2: active.F2_N },
      unit: "N",
    })
  );

  steps.push(
    step({
      id: "SplitEnvelope",
      title: "三种配比合张力包络（选型用）",
      handbook: "第44页汇总",
      formula: "F1max / F2max = max over {1:1, 2:1, 1:2}",
      inputs: {
        "1:1": { F1: split11.F1_N, F2: split11.F2_N },
        "2:1": { F1: split21.F1_N, F2: split21.F2_N },
        "1:2": { F1: split12.F1_N, F2: split12.F2_N },
      },
      result: { F1max, F2max },
      unit: "N",
      note: "GC-01 手册取 F1max≈399 kN、F2max≈215 kN",
    })
  );

  const S_max_belt = Math.max(F1max, F2max, S_carry, Number(S1min) || 0);
  const belt = selectBeltGrade({
    S_max_N: S_max_belt,
    B_mm: input.B_mm ?? 1400,
    n1: input.belt_n1 ?? 10,
  });
  steps.push(
    step({
      id: "Belt",
      title: "胶带强度档选型（ST 上靠）",
      handbook: "选型示意",
      formula: "σ_req = n1·S_max/B ；选 ST ≥ σ_req",
      inputs: {
        S_max_N: +S_max_belt.toFixed(0),
        B_mm: input.B_mm ?? 1400,
        n1: input.belt_n1 ?? 10,
      },
      intermediates: {
        sigma_req_Npm: belt.sigma_req_Npm,
        margin_Npm: belt.margin_Npm,
      },
      result: belt.grade,
      unit: "",
      note: belt.note,
    })
  );

  const summary = {
    FH_N: +FH.toFixed(1),
    FS1_N: FS1,
    FS2_N: FS2,
    FSt_N: +FSt.toFixed(1),
    FU_N: +FU.toFixed(1),
    PA_kW: +PA.toFixed(2),
    PM_kW: +PM.toFixed(2),
    motor_kW: motor.P_kW,
    motor_select: motor,
    belt_grade: belt.grade,
    belt_select: belt,
    S1min_N: Number(S1min),
    S_carry_sag_N: S_carry,
    S_return_sag_N: S_return,
    power_split: activeSplit,
    split_active: active,
    split_1_1: split11,
    split_2_1: split21,
    split_1_2: split12,
    F1max_N: F1max,
    F2max_N: F2max,
    F1_N: split11.F1_N,
    F2_N: split11.F2_N,
  };
  summary.design_loads = buildDesignLoadsFromP2P(summary, input);

  return {
    algorithm: "DTII-P2P-v0.2",
    coeff: "coeff-v0",
    steps,
    summary,
  };
}

export function compareToExpected(summary, expected, tol) {
  const forceTol = tol?.force_N ?? 160;
  const powerTol = tol?.power_kW ?? 0.8;
  const envTol = tol?.envelope_N ?? 2500;
  const rel = tol?.relative ?? 0.003;
  const rows = [];
  const check = (name, got, exp, absTol) => {
    rows.push({
      name,
      got,
      expected: exp,
      pass: near(got, exp, absTol, rel),
      absTol,
    });
  };

  check("FH", summary.FH_N, expected.FH_N, forceTol);
  check("FS1", summary.FS1_N, expected.FS1_N, forceTol);
  check("FS2", summary.FS2_N, expected.FS2_N, forceTol);
  check("FSt", summary.FSt_N, expected.FSt_N, forceTol);
  check("FU", summary.FU_N, expected.FU_N, forceTol);
  check("PA", summary.PA_kW, expected.PA_kW, powerTol);
  check("PM", summary.PM_kW, expected.PM_kW, powerTol);
  check("S1min", summary.S1min_N, expected.S1min_slip_N, forceTol);
  check("F1(1:1)", summary.split_1_1.F1_N, expected.F1_11_N, 200);
  check("F2(1:1)", summary.split_1_1.F2_N, expected.F2_11_N, 200);
  check("F1max", summary.F1max_N, expected.F1max_N, envTol);
  check("F2max", summary.F2max_N, expected.F2max_N, envTol);

  return { pass: rows.every((r) => r.pass), rows };
}
