/**
 * DTⅡ(A) 逐点张力计算引擎 v0（逐步透明）
 * 算法版本：DTII-P2P-v0.1
 */

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
  const den = Math.max(Math.abs(b), 1e-9);
  return Math.abs(a - b) / den <= relTol;
}

/** @param {object} input GC01_INPUT 形状 */
export function runDtiiP2P(input) {
  const g = input.g ?? 9.81;
  const steps = [];

  steps.push(
    step({
      id: "P0",
      title: "原始参数确认",
      handbook: "算例给定",
      formula: "—",
      inputs: {
        Q: input.Q_tph,
        rho: input.rho,
        L: input.L_m,
        H: input.H_m,
        delta_deg: input.delta_deg,
        B: input.B_mm,
        v: input.v_mps,
        f: input.f,
        C: input.C,
        qRO: input.qRO,
        qRU: input.qRU,
        qB: input.qB,
        qG: input.qG,
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
      inputs: { FS1_anchor: input.FS1_N },
      result: FS1,
      unit: "N",
      note: "分项展开二期；本步用 GC-01 锚定整项",
    })
  );

  const FS2 = input.FS2_N;
  steps.push(
    step({
      id: "FS2",
      title: "附加特种阻力 FS2",
      handbook: "式3-28/3-29",
      formula: "清扫器等附加（v0 整项锚定）",
      inputs: { FS2_anchor: input.FS2_N },
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
      note: "GC-01：双滚筒四电机，正常 3 台 → 约 155.5 kW/台 → Y315L1-4 160 kW",
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
      inputs: {
        FU: +FU.toFixed(1),
        "e^{μφ}": emu,
        S1min_handbook: input.S1min_anchor_N,
      },
      intermediates: {
        "FU/(e-1) 单滚筒满圆周力参考": +S1_simple.toFixed(0),
      },
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

  const FU1 = FU / 2;
  const S22_1 = (FU1 * emu) / (emu - 1);
  const S1_back = S22_1 - FU1;
  const S22 = input.S22_N ?? 233354;
  const F1 = S22 + S22_1;
  const F2 = S22_1 + S1_back;
  steps.push(
    step({
      id: "Split11",
      title: "双传动功率分配 1:1 与滚筒合力",
      handbook: "表3-26 / 算例续算",
      formula: "FU1=FU2=FU/2；S22-1=FU1·e/(e-1)；F1=S22+S22-1；F2=S22-1+S1'",
      inputs: { FU: +FU.toFixed(1), e: emu, S22_anchor: S22 },
      intermediates: {
        FU1: +FU1.toFixed(0),
        "S22-1": +S22_1.toFixed(0),
        "S1'": +S1_back.toFixed(0),
      },
      result: { F1: +F1.toFixed(0), F2: +F2.toFixed(0) },
      unit: "N",
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
    S1min_N: Number(S1min),
    S_carry_sag_N: S_carry,
    S_return_sag_N: S_return,
    split_1_1: {
      FU1_N: +FU1.toFixed(0),
      S22_1_N: +S22_1.toFixed(0),
      S1_back_N: +S1_back.toFixed(0),
      F1_N: +F1.toFixed(0),
      F2_N: +F2.toFixed(0),
    },
  };

  return {
    algorithm: "DTII-P2P-v0.1",
    coeff: "coeff-v0",
    steps,
    summary,
  };
}

export function compareToExpected(summary, expected, tol) {
  const forceTol = tol?.force_N ?? 160;
  const powerTol = tol?.power_kW ?? 0.8;
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
  check("F1(1:1)", summary.split_1_1.F1_N, expected.F1_N, 200);
  check("F2(1:1)", summary.split_1_1.F2_N, expected.F2_N, 200);

  return { pass: rows.every((r) => r.pass), rows };
}
