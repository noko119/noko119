/**
 * 接管端头螺纹完整计算逻辑
 * - P=2 固定；60° 三角螺纹；牙型按 GB/T 196
 * - 螺纹中心线落在小管管壁中心；同时校验大管壁不击穿
 * - 螺纹大径就近取整数（不强制尾数 0/5）
 */

/** @typedef {{ D1: number, t1: number, D2: number, t2: number }} PipeEndInput */

export const PIPE_END_CONST = {
  locatorLen: 10, // 定位止口 mm
  pitch: 2, // 螺距 P mm
  turns: 6, // 旋合圈数
  engageLen: 12, // 6×P
  bodyTotalLen: 210, // 接管本体总长 mm
  tipAngle: 60,
  // GB/T 196 / 常用牙型系数（相对螺距）
  H_factor: 0.866, // 原始牙高 H = 0.8660×P
  h_factor: 0.5413, // 工作牙高 h
  R_factor: 0.144, // 牙底最大圆角 R
};

/** GB/T 3 退刀槽（P=2 常用） */
const UNDERCUT_P2 = {
  external: { g1: 4.0, g2: 3.0, g3: 6.0, k: 3.0, r: 0.8 },
  internal: { g1: 4.0, g2: 3.0, g3: 6.0, m: 3.0, r: 0.8 },
};

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function nearInt(n) {
  return Math.round(n);
}

/**
 * @param {PipeEndInput} input
 * @param {{ grooveKind?: 'normal'|'short'|'long' }} [opt]
 */
export function computePipeEndThread(input, opt = {}) {
  const { D1, t1, D2, t2 } = input;
  const errors = [];
  const warnings = [];

  if (!(D1 > 0) || !(t1 > 0) || !(D2 > 0) || !(t2 > 0)) {
    return { ok: false, error: "请完整填写 D₁、t₁、D₂、t₂（均须大于 0）" };
  }
  if (t1 * 2 >= D1) {
    return { ok: false, error: "小管壁厚无效：2×t₁ 不得大于等于 D₁" };
  }
  if (t2 * 2 >= D2) {
    return { ok: false, error: "大管壁厚无效：2×t₂ 不得大于等于 D₂" };
  }
  if (D1 >= D2) {
    warnings.push("通常公头小管外径 D₁ 应小于母头大管外径 D₂，请确认录入是否正确");
  }

  const P = PIPE_END_CONST.pitch;
  const H = round3(PIPE_END_CONST.H_factor * P);
  const h = round3(PIPE_END_CONST.h_factor * P);
  const R = round3(PIPE_END_CONST.R_factor * P);

  // 1. 小管管壁中心直径
  const smallCenterDia = round3(D1 - t1);

  // 3–4. 理论外螺纹大径 / 内螺纹小径
  const theoryMajor = round3(smallCenterDia + h);
  const theoryMinor = round3(smallCenterDia - h);

  // 5. 大管内孔
  const largeBore = round3(D2 - 2 * t2);

  // 6. 大径就近取整（无小数，不强制 0/5）
  const majorDia = nearInt(theoryMajor);
  const designation = `M${majorDia}×${P}`;

  // 选定规格后：母扣内螺纹小径按工作牙高对称匹配（大径 − 2h）
  const internalMinor = round3(majorDia - 2 * h);
  // GB/T 196 基本小径（对照）
  const gbD1 = round3(majorDia - 1.082531755 * P);
  const gbD2 = round3(majorDia - 0.649519053 * P);
  const gbD3 = round3(majorDia - 1.226869322 * P);

  // 校验：内螺纹小径须大于大管内孔，保证加工在实体内、不打穿
  const pierceOk = internalMinor > largeBore;
  // 螺纹不超出大管外径实体
  const withinLargeOd = majorDia < D2;
  // 螺纹大致落在大管壁厚实体带内（大径小于外径，啮合区高于内孔）
  const withinLargeWall = majorDia <= D2 && internalMinor >= largeBore;
  // 相对小管：大径不超过小管外径，小径不低于小管内孔
  const smallBore = round3(D1 - 2 * t1);
  const withinSmall = majorDia <= D1 && internalMinor >= smallBore;

  let checkPass = true;
  let checkMessage = "满足：内螺纹位于大管实体内，未击穿管壁";

  if (!pierceOk) {
    checkPass = false;
    checkMessage = "当前参数无法加工，管壁厚度不足";
    warnings.push(checkMessage);
  } else if (!withinLargeOd) {
    checkPass = false;
    checkMessage = "当前参数无法加工，管壁厚度不足（螺纹大径超出大管外径）";
    warnings.push(checkMessage);
  } else if (!withinSmall) {
    warnings.push("提示：螺纹相对小管壁中心偏移后，可能接近或超出小管壁实体边界，请复核");
  }

  const grooveKind = opt.grooveKind || "normal";
  const widthKey = grooveKind === "short" ? "g2" : grooveKind === "long" ? "g3" : "g1";
  const extGrooveW = UNDERCUT_P2.external[widthKey];
  const intGrooveW = UNDERCUT_P2.internal[widthKey];
  const extGrooveDf = round3(majorDia - UNDERCUT_P2.external.k);
  const intGrooveDg = round3(majorDia + UNDERCUT_P2.internal.m);

  const maleEndLen = round3(
    PIPE_END_CONST.locatorLen + PIPE_END_CONST.engageLen + extGrooveW
  );
  const femaleEndLen = round3(
    PIPE_END_CONST.locatorLen + PIPE_END_CONST.engageLen + intGrooveW
  );

  const fitInBody =
    maleEndLen <= PIPE_END_CONST.bodyTotalLen &&
    femaleEndLen <= PIPE_END_CONST.bodyTotalLen;
  if (!fitInBody) {
    warnings.push("端头结构长度超过接管总长 210mm，请检查退刀槽长度档");
  }

  const jointLabel = `${trim(D1)}×${trim(t1)} → ${trim(D2)}×${trim(t2)}`;
  const jointKind =
    D2 > D1 ? (D2 / D1 <= 1.25 ? "相邻规格对接" : "跨规格对接") : "对接组合";

  return {
    ok: true,
    checkPass,
    checkMessage,
    warnings,
    errors,
    constants: { ...PIPE_END_CONST, H, h, R },
    input: { D1, t1, D2, t2 },
    // 输出字段
    jointCombo: jointLabel,
    jointKind,
    D1,
    D2,
    t1,
    t2,
    P,
    H,
    h,
    R,
    smallCenterDia,
    theoryMajor,
    theoryMinor,
    largeBore,
    smallBore,
    majorDia,
    designation,
    femaleInternal: {
      designation,
      minor: internalMinor,
      pitchDia: gbD2,
      major: majorDia,
      note: "母扣内螺纹配套公扣所选规格，小径按中心对称（大径−2h）匹配",
    },
    gbBasic: { d: majorDia, d2: gbD2, d1: gbD1, d3: gbD3, D1: gbD1, D2: gbD2, D: majorDia },
    wallCheck: {
      pierceOk,
      withinLargeOd,
      withinLargeWall,
      withinSmall,
      pass: checkPass,
      message: checkMessage,
    },
    maleEnd: {
      locator: PIPE_END_CONST.locatorLen,
      thread: PIPE_END_CONST.engageLen,
      undercutWidth: extGrooveW,
      undercutDf: extGrooveDf,
      undercutR: UNDERCUT_P2.external.r,
      total: maleEndLen,
    },
    femaleEnd: {
      locator: PIPE_END_CONST.locatorLen,
      thread: PIPE_END_CONST.engageLen,
      undercutWidth: intGrooveW,
      undercutDg: intGrooveDg,
      undercutR: UNDERCUT_P2.internal.r,
      total: femaleEndLen,
    },
    bodyTotalLen: PIPE_END_CONST.bodyTotalLen,
    fitInBody,
    assemblyNote:
      "装配时公头定位止口先插入母扣止口导向，再旋入实现 12mm 完全啮合；退刀槽供车削退刀。工况：静止装配、无载荷、仅定位锁紧。",
  };
}

function trim(n) {
  const s = String(Number(Number(n).toFixed(3)));
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

/** 扁平输出表（便于复制） */
export function pipeEndToRows(r) {
  if (!r.ok) return [["错误", r.error]];
  return [
    ["对接组合", r.jointCombo],
    ["对接类型", r.jointKind],
    ["小管外径 D₁", `${r.D1} mm`],
    ["大管外径 D₂", `${r.D2} mm`],
    ["小管壁厚 t₁", `${r.t1} mm`],
    ["大管壁厚 t₂", `${r.t2} mm`],
    ["螺距 P", `${r.P} mm`],
    ["基础牙高 H", `${r.H} mm`],
    ["工作牙高 h", `${r.h} mm`],
    ["牙底圆角 R", `${r.R} mm`],
    ["小管壁中心径", `${r.smallCenterDia} mm`],
    ["理论外螺纹大径", `${r.theoryMajor} mm`],
    ["理论内螺纹小径", `${r.theoryMinor} mm`],
    ["螺纹大径（取整）", `${r.majorDia} mm`],
    ["螺纹规格标记", r.designation],
    ["母扣内螺纹", `${r.femaleInternal.designation}（小径 ${r.femaleInternal.minor} mm）`],
    ["校验结果", r.checkPass ? `通过：${r.checkMessage}` : `警告：${r.checkMessage}`],
    ["公扣端头总长（止口+螺纹+退刀槽）", `${r.maleEnd.total} mm`],
    ["母扣端头内腔总长（止口+内螺纹+内退刀槽）", `${r.femaleEnd.total} mm`],
    ["外螺纹退刀槽宽度", `${r.maleEnd.undercutWidth} mm`],
    ["内螺纹退刀槽宽度", `${r.femaleEnd.undercutWidth} mm`],
    ["接管本体总长", `${r.bodyTotalLen} mm`],
  ];
}
