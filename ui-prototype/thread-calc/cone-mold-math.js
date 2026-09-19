/**
 * 锥管模具分段设计（内锥型腔 + 外圈嵌套）
 *
 * 正确模型：
 * - 上口/下口是型腔口径（连续内锥），不是外径阶梯接管
 * - 模具沿高度分段；上段套下段（止口嵌套 + 螺纹）
 * - 内壁跨接头连续共线；外壁台阶嵌套（见接头细节）
 * - 大节标准长 210（含上口余量）；小节非标凑总高（含下口余量）
 */

import { computePipeEndThread, PIPE_END_CONST, computeThreadEndCards } from "./pipe-end-math.js";

/** 常用管坯外径，用于模具外圆就近取材 */
export const STD_PIPE_ODS = [
  89, 102, 108, 114, 121, 127, 133, 140, 152, 159, 168, 180, 194, 203, 219, 245, 273, 299, 325, 351, 377,
];

export const CONE_MOLD_DEFAULTS = {
  cavityTop: 219,
  cavityBottom: 108,
  moldHeight: 930,
  topAllowance: 45,
  bottomAllowance: 5,
  standardLen: 210,
  wall: 25, // 型腔到外圆名义壁厚
  nestSleeve: 8, // 上段外套止口径向厚度（示意）
  pitch: 2,
};

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

export function roundMajor05(n) {
  return Math.round(Number(n) / 5) * 5;
}

function nearestOd(target, catalog = STD_PIPE_ODS) {
  let best = catalog[0];
  let bestD = Math.abs(catalog[0] - target);
  for (const od of catalog) {
    const d = Math.abs(od - target);
    if (d < bestD || (d === bestD && od >= target)) {
      best = od;
      bestD = d;
    }
  }
  return best;
}

/** 沿模具轴向 z（自上而下 0…H）的型腔直径 */
export function cavityDiaAt(z, cavityTop, cavityBottom, moldHeight) {
  const H = Number(moldHeight);
  const zt = Math.min(Math.max(Number(z), 0), H);
  return round3(cavityTop + (cavityBottom - cavityTop) * (zt / H));
}

/**
 * 大节=standardLen，小节=剩余非标
 */
export function planSegmentLengths(moldHeight, standardLen = 210, minSmall = 120, maxSmall = 400) {
  const H = Number(moldHeight);
  const S = Number(standardLen);
  if (!(H > 0) || !(S > 0)) return { ok: false, error: "模具总高与标准节长须大于 0" };

  const candidates = [];
  for (let k = 1; k <= 12; k++) {
    const smallLen = round3(H - k * S);
    if (smallLen <= 0) break;
    const n = k + 1;
    const inPrefer = smallLen >= 150 && smallLen <= 210;
    const inAllow = smallLen >= minSmall && smallLen <= maxSmall;
    if (!inAllow) continue;
    candidates.push({
      segmentCount: n,
      largeCount: k,
      standardLen: S,
      smallLen,
      inPrefer,
      score: inPrefer ? 0 : Math.min(Math.abs(smallLen - 150), Math.abs(smallLen - 210)) + (n > 5 ? n : 0),
    });
  }
  if (!candidates.length) {
    return {
      ok: false,
      error: `总高 ${H} 无法用「大节 ${S} + 小节非标」凑齐（小节需在 ${minSmall}～${maxSmall}）`,
    };
  }
  candidates.sort((a, b) => a.score - b.score || a.segmentCount - b.segmentCount);
  return { ok: true, plan: candidates[0], alternatives: candidates.slice(0, 5) };
}

export function minFemaleWall(D1, t1, D2, majorDia) {
  for (let t2 = 4; t2 <= 80; t2 += 0.5) {
    const r = computePipeEndThread(
      { D1, t1, D2, t2 },
      majorDia != null ? { majorDia } : {}
    );
    if (r.ok && r.checkPass) return t2;
  }
  return null;
}

/**
 * @param {{
 *   cavityTop?: number, cavityBottom?: number,
 *   bigOd?: number, smallOd?: number, // 兼容旧字段名=型腔上/下口
 *   moldHeight: number,
 *   topAllowance?: number, bottomAllowance?: number,
 *   standardLen?: number, segmentCount?: number,
 *   wall?: number, nestSleeve?: number,
 *   preferredOuterOds?: number[],
 *   roundThread?: boolean
 * }} input
 */
export function designConeMold(input) {
  const cavityTop = Number(input.cavityTop ?? input.bigOd ?? CONE_MOLD_DEFAULTS.cavityTop);
  const cavityBottom = Number(input.cavityBottom ?? input.smallOd ?? CONE_MOLD_DEFAULTS.cavityBottom);
  const moldHeight = Number(input.moldHeight);
  const topAllowance = Number(input.topAllowance ?? CONE_MOLD_DEFAULTS.topAllowance);
  const bottomAllowance = Number(input.bottomAllowance ?? CONE_MOLD_DEFAULTS.bottomAllowance);
  const standardLen = Number(input.standardLen ?? CONE_MOLD_DEFAULTS.standardLen);
  const wall = Number(input.wall ?? CONE_MOLD_DEFAULTS.wall);
  const nestSleeve = Number(input.nestSleeve ?? CONE_MOLD_DEFAULTS.nestSleeve);
  const roundThread = input.roundThread !== false;

  if (!(cavityTop > cavityBottom)) return { ok: false, error: "型腔上口须大于下口" };
  if (!(moldHeight > 0)) return { ok: false, error: "模具总高须大于 0" };
  if (!(wall > 0)) return { ok: false, error: "名义壁厚须大于 0" };
  if (topAllowance < 0 || bottomAllowance < 0) return { ok: false, error: "上/下余量不能为负" };
  if (topAllowance >= standardLen) {
    return { ok: false, error: `上口余量 ${topAllowance} 须小于标准节长 ${standardLen}` };
  }

  const lengthPlan = planSegmentLengths(moldHeight, standardLen);
  if (!lengthPlan.ok) return lengthPlan;

  let segmentCount = lengthPlan.plan.segmentCount;
  if (input.segmentCount != null && Number(input.segmentCount) >= 2) {
    const forced = Number(input.segmentCount);
    const smallLen = round3(moldHeight - (forced - 1) * standardLen);
    if (smallLen <= 0) return { ok: false, error: `节数 ${forced} 过大，剩余小节长度不足` };
    segmentCount = forced;
    lengthPlan.plan = {
      segmentCount: forced,
      largeCount: forced - 1,
      standardLen,
      smallLen,
      inPrefer: smallLen >= 150 && smallLen <= 210,
      score: 0,
    };
  }

  const smallLen = lengthPlan.plan.smallLen;
  const lengths = Array.from({ length: segmentCount }, (_, i) =>
    i === segmentCount - 1 ? smallLen : standardLen
  );

  // 累计轴向（自上而下）
  let z = 0;
  const segments = lengths.map((length, i) => {
    const z0 = z;
    const z1 = round3(z + length);
    z = z1;
    const cavTop = cavityDiaAt(z0, cavityTop, cavityBottom, moldHeight);
    const cavBot = cavityDiaAt(z1, cavityTop, cavityBottom, moldHeight);
    const cavMid = cavityDiaAt((z0 + z1) / 2, cavityTop, cavityBottom, moldHeight);
    // 外圆：按本节最大型腔 + 2壁厚，就近标准管坯（保证外套得住）
    const needOuter = cavTop + 2 * wall;
    let outerOd = nearestOd(needOuter);
    if (outerOd < needOuter) {
      const bigger = STD_PIPE_ODS.find((d) => d >= needOuter);
      if (bigger != null) outerOd = bigger;
    }
    const isFirst = i === 0;
    const isLast = i === segmentCount - 1;
    return {
      index: i + 1,
      length,
      kind: isLast ? "非标" : "标准",
      z0,
      z1,
      cavityTop: cavTop,
      cavityBottom: cavBot,
      cavityMid: cavMid,
      outerOd,
      wall,
      // 嵌套：上段有下母套，下段有上公颈
      femaleSleeve: !isLast,
      maleNeck: !isFirst,
      topFaceOffset: isFirst ? topAllowance : null,
      belowTopFace: isFirst ? round3(length - topAllowance) : null,
      bottomFaceOffset: isLast ? bottomAllowance : null,
      aboveBottomFace: isLast ? round3(length - bottomAllowance) : null,
      // 兼容旧 UI 字段
      od: outerOd,
    };
  });

  // 可选强制外圆序列
  if (input.preferredOuterOds && input.preferredOuterOds.length === segmentCount) {
    input.preferredOuterOds.forEach((od, i) => {
      segments[i].outerOd = Number(od);
      segments[i].od = Number(od);
    });
  }

  // 保证外圆自上而下非增（嵌套外观）
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].outerOd > segments[i - 1].outerOd) {
      segments[i].outerOd = segments[i - 1].outerOd;
      segments[i].od = segments[i].outerOd;
    }
  }

  const faceToFace = round3(moldHeight - topAllowance - bottomAllowance);
  const taper = round3((cavityTop - cavityBottom) / moldHeight); // 每 mm 收径

  const joints = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const upper = segments[i];
    const lower = segments[i + 1];
    const zJoint = lower.z0;
    const cavAtJoint = cavityDiaAt(zJoint, cavityTop, cavityBottom, moldHeight);

    // 嵌套公颈外径 ≈ 下节外圆；外套内径侧壁落在公颈上
    const D1 = lower.outerOd; // 公（下）
    const D2 = upper.outerOd; // 母（上）外套外径
    // 公壁厚：外圆到型腔
    const t1 = round3((D1 - cavAtJoint) / 2);
    if (!(t1 > 1)) {
      joints.push({
        ok: false,
        index: i + 1,
        error: `第${i + 1}道接头壁厚不足（型腔 ${cavAtJoint} / 外圆 ${D1}）`,
        cavityAtJoint: cavAtJoint,
      });
      continue;
    }

    const auto = computePipeEndThread({ D1, t1, D2, t2: 40 });
    if (!auto.ok) {
      joints.push({ ok: false, index: i + 1, error: auto.error, cavityAtJoint: cavAtJoint });
      continue;
    }
    let major = roundThread ? roundMajor05(auto.recommendedMajor) : auto.recommendedMajor;
    if (!(major > 0)) major = auto.recommendedMajor;
    // 螺纹须落在公颈实体：小于 D1，且大于型腔
    if (major >= D1) major = roundMajor05(D1 - 5);
    if (major <= cavAtJoint) major = roundMajor05(cavAtJoint + 5);

    const minT2 = minFemaleWall(D1, t1, D2, major);
    const check = computePipeEndThread({ D1, t1, D2, t2: minT2 || Math.max(40, nestSleeve * 2) }, { majorDia: major });
    const cards = computeThreadEndCards(`M${major}×${PIPE_END_CONST.pitch}`);

    joints.push({
      ok: true,
      index: i + 1,
      z: zJoint,
      cavityAtJoint: cavAtJoint,
      fromOd: D2,
      toOd: D1,
      upperOuter: D2,
      lowerOuter: D1,
      maleWall: t1,
      nestSleeve,
      nestStyle: "上段外套止口 + 下段公颈（内壁连续锥）",
      autoDesignation: auto.recommendedDesignation,
      designation: `M${major}×${PIPE_END_CONST.pitch}`,
      majorDia: major,
      crest: check.crest,
      root: check.root,
      undercutDf: major - 3,
      undercutDg: major + 3,
      endStructure: PIPE_END_CONST.locatorLen + PIPE_END_CONST.engageLen + 4,
      locator: PIPE_END_CONST.locatorLen,
      engage: PIPE_END_CONST.engageLen,
      undercut: 4,
      minFemaleWall: minT2,
      checkPass: !!minT2,
      checkMessage: minT2
        ? `外套止口局部壁厚建议 ≥ ${minT2} mm（螺纹 ${`M${major}×2`}）`
        : "外套止口壁厚无法满足螺纹实体，请加厚或改外圆",
      maleCard: cards.ok ? cards.male : null,
      femaleCard: cards.ok ? cards.female : null,
      theoryMajor: auto.theoryMajor,
      smallCenterDia: auto.smallCenterDia,
    });
  }

  const sumLen = round3(segments.reduce((s, seg) => s + seg.length, 0));

  return {
    ok: true,
    model: "cavity-cone-nested",
    input: {
      cavityTop,
      cavityBottom,
      moldHeight,
      topAllowance,
      bottomAllowance,
      standardLen,
      wall,
      nestSleeve,
      roundThread,
      // 兼容
      bigOd: cavityTop,
      smallOd: cavityBottom,
    },
    segmentCount,
    segments,
    joints,
    summary: {
      moldHeight: sumLen,
      heightOk: Math.abs(sumLen - moldHeight) < 1e-6,
      faceToFace,
      expectedFaceToFace: faceToFace,
      cavityTop,
      cavityBottom,
      taperPerMm: taper,
      jointCount: joints.length,
      pitch: PIPE_END_CONST.pitch,
      locator: PIPE_END_CONST.locatorLen,
      engage: PIPE_END_CONST.engageLen,
      undercut: 4,
      nestNote: "接头：上母套 / 下公颈；型腔内壁连续共锥",
    },
    alternatives: lengthPlan.alternatives,
  };
}

/** @deprecated 旧外径阶梯选取，保留导出以免旧引用报错 */
export function pickSegmentOds(bigOd, smallOd, count, catalog = STD_PIPE_ODS) {
  const big = Number(bigOd);
  const small = Number(smallOd);
  if (!(big > small) || count < 2) return { ok: false, error: "参数无效" };
  const ods = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    ods.push(i === 0 ? big : i === count - 1 ? small : nearestOd(big + (small - big) * t, catalog));
  }
  return { ok: true, ods };
}
