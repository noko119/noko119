/**
 * 锥管模具设计（正确模型）
 *
 * - 内件：连续外锥（绿）——上口/下口为锥面口径
 * - 外套：分段套筒套在锥上（红/青/紫…），节间止口嵌套
 * - 案例默认：总高 730，锥段 680，上 45，下 5，ø194→ø108，节长 210
 * - 接头细节默认：12（旋合）+ 1（间隙）+ 10（止口）+ 1（间隙）
 */

import { computePipeEndThread, PIPE_END_CONST, computeThreadEndCards } from "./pipe-end-math.js";

export const STD_PIPE_ODS = [
  89, 102, 108, 114, 121, 127, 133, 140, 152, 159, 168, 180, 194, 203, 219, 245, 273, 299, 325, 351, 377,
];

/** 接头轴向细节（自上而下） */
export const JOINT_STACK_DEFAULT = [
  { key: "engage", name: "旋合", h: 12 },
  { key: "gapA", name: "间隙", h: 1 },
  { key: "locator", name: "止口", h: 10 },
  { key: "gapB", name: "间隙", h: 1 },
];

export const CONE_MOLD_DEFAULTS = {
  coneTopDia: 194,
  coneBottomDia: 108,
  totalHeight: 730,
  topAllowance: 45,
  bottomAllowance: 5,
  standardLen: 210,
  wall: 20,
  pitch: 2,
};

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

export function roundMajor05(n) {
  return Math.round(Number(n) / 5) * 5;
}

function nearestOdAtLeast(target, catalog = STD_PIPE_ODS) {
  const hit = catalog.find((d) => d >= target);
  if (hit != null) return hit;
  return catalog[catalog.length - 1];
}

/** 锥面直径：z 从装配顶向下；锥段在 [topAllowance, totalHeight-bottomAllowance] */
export function coneDiaAt(z, input) {
  const topA = Number(input.topAllowance);
  const botA = Number(input.bottomAllowance);
  const H = Number(input.totalHeight);
  const d0 = Number(input.coneTopDia);
  const d1 = Number(input.coneBottomDia);
  const zCone0 = topA;
  const zCone1 = H - botA;
  const L = zCone1 - zCone0;
  if (L <= 0) return d0;
  if (z <= zCone0) return d0;
  if (z >= zCone1) return d1;
  return round3(d0 + (d1 - d0) * ((z - zCone0) / L));
}

export function planSegmentLengths(totalHeight, standardLen = 210, minSmall = 80, maxSmall = 450) {
  const H = Number(totalHeight);
  const S = Number(standardLen);
  if (!(H > 0) || !(S > 0)) return { ok: false, error: "总高与标准节长须大于 0" };
  const candidates = [];
  for (let k = 1; k <= 12; k++) {
    const smallLen = round3(H - k * S);
    if (smallLen <= 0) break;
    const inPrefer = smallLen >= 150 && smallLen <= 310;
    const inAllow = smallLen >= minSmall && smallLen <= maxSmall;
    if (!inAllow) continue;
    candidates.push({
      segmentCount: k + 1,
      largeCount: k,
      standardLen: S,
      smallLen,
      inPrefer,
      score: inPrefer ? Math.abs(smallLen - 210) : 100 + Math.abs(smallLen - 210) + k,
    });
  }
  if (!candidates.length) {
    return { ok: false, error: `总高 ${H} 无法用大节 ${S} + 小节非标凑齐` };
  }
  candidates.sort((a, b) => a.score - b.score || a.segmentCount - b.segmentCount);
  return { ok: true, plan: candidates[0], alternatives: candidates.slice(0, 6) };
}

export function minFemaleWall(D1, t1, D2, majorDia) {
  for (let t2 = 4; t2 <= 80; t2 += 0.5) {
    const r = computePipeEndThread({ D1, t1, D2, t2 }, majorDia != null ? { majorDia } : {});
    if (r.ok && r.checkPass) return t2;
  }
  return null;
}

function jointStackHeight(stack = JOINT_STACK_DEFAULT) {
  return round3(stack.reduce((s, x) => s + Number(x.h), 0));
}

/**
 * @param {object} input
 */
export function designConeMold(input = {}) {
  const coneTopDia = Number(input.coneTopDia ?? input.cavityTop ?? input.bigOd ?? CONE_MOLD_DEFAULTS.coneTopDia);
  const coneBottomDia = Number(
    input.coneBottomDia ?? input.cavityBottom ?? input.smallOd ?? CONE_MOLD_DEFAULTS.coneBottomDia
  );
  const totalHeight = Number(input.totalHeight ?? input.moldHeight ?? CONE_MOLD_DEFAULTS.totalHeight);
  const topAllowance = Number(input.topAllowance ?? CONE_MOLD_DEFAULTS.topAllowance);
  const bottomAllowance = Number(input.bottomAllowance ?? CONE_MOLD_DEFAULTS.bottomAllowance);
  const standardLen = Number(input.standardLen ?? CONE_MOLD_DEFAULTS.standardLen);
  const wall = Number(input.wall ?? CONE_MOLD_DEFAULTS.wall);
  const roundThread = input.roundThread !== false;
  const jointStack = input.jointStack || JOINT_STACK_DEFAULT;
  const jointH = jointStackHeight(jointStack);

  if (!(coneTopDia > coneBottomDia)) return { ok: false, error: "锥上口须大于锥下口" };
  if (!(totalHeight > topAllowance + bottomAllowance)) {
    return { ok: false, error: "总高须大于上口余量+下口余量" };
  }
  if (!(wall > 0)) return { ok: false, error: "外套名义壁厚须大于 0" };

  const coneHeight = round3(totalHeight - topAllowance - bottomAllowance);

  const lengthPlan = planSegmentLengths(totalHeight, standardLen);
  if (!lengthPlan.ok) return lengthPlan;

  let segmentCount = lengthPlan.plan.segmentCount;
  if (input.segmentCount != null && Number(input.segmentCount) >= 2) {
    const forced = Number(input.segmentCount);
    const smallLen = round3(totalHeight - (forced - 1) * standardLen);
    if (smallLen <= 0) return { ok: false, error: `节数 ${forced} 过大` };
    segmentCount = forced;
    lengthPlan.plan = {
      segmentCount: forced,
      largeCount: forced - 1,
      standardLen,
      smallLen,
      inPrefer: smallLen >= 150 && smallLen <= 310,
      score: 0,
    };
  }

  const lengths = Array.from({ length: segmentCount }, (_, i) =>
    i === segmentCount - 1 ? lengthPlan.plan.smallLen : standardLen
  );

  const base = {
    coneTopDia,
    coneBottomDia,
    totalHeight,
    topAllowance,
    bottomAllowance,
  };

  let z = 0;
  const sleeves = lengths.map((length, i) => {
    const z0 = z;
    const z1 = round3(z + length);
    z = z1;
    const coneAtTop = coneDiaAt(z0, base);
    const coneAtBot = coneDiaAt(z1, base);
    const coneAtMid = coneDiaAt((z0 + z1) / 2, base);
    // 外套内孔贴锥：外圆 ≈ 本节最大锥径 + 2×壁厚
    const needOuter = Math.max(coneAtTop, coneAtBot) + 2 * wall;
    let outerOd = nearestOdAtLeast(needOuter);
    if (input.preferredOuterOds && input.preferredOuterOds[i] != null) {
      outerOd = Number(input.preferredOuterOds[i]);
    }
    const isFirst = i === 0;
    const isLast = i === segmentCount - 1;
    return {
      index: i + 1,
      role: "sleeve",
      length,
      kind: isLast ? "非标" : "标准",
      z0,
      z1,
      coneAtTop,
      coneAtBot,
      coneAtMid,
      outerOd,
      wall,
      // 兼容旧表
      od: outerOd,
      cavityTop: coneAtTop,
      cavityBottom: coneAtBot,
      femaleSleeve: !isLast,
      maleNeck: !isFirst,
      topFaceOffset: isFirst ? topAllowance : null,
      belowTopFace: isFirst ? round3(length - topAllowance) : null,
      bottomFaceOffset: isLast ? bottomAllowance : null,
      aboveBottomFace: isLast ? round3(length - bottomAllowance) : null,
    };
  });

  for (let i = 1; i < sleeves.length; i++) {
    if (sleeves[i].outerOd > sleeves[i - 1].outerOd) {
      sleeves[i].outerOd = sleeves[i - 1].outerOd;
      sleeves[i].od = sleeves[i].outerOd;
    }
  }

  const cone = {
    role: "innerCone",
    topDia: coneTopDia,
    bottomDia: coneBottomDia,
    height: coneHeight,
    z0: topAllowance,
    z1: round3(totalHeight - bottomAllowance),
    totalWithEnds: totalHeight,
  };

  const joints = [];
  for (let i = 0; i < sleeves.length - 1; i++) {
    const upper = sleeves[i];
    const lower = sleeves[i + 1];
    const zJoint = lower.z0;
    const coneD = coneDiaAt(zJoint, base);
    const D1 = lower.outerOd;
    const D2 = upper.outerOd;
    const t1 = round3((D1 - coneD) / 2);
    if (!(t1 > 1)) {
      joints.push({
        ok: false,
        index: i + 1,
        error: `接头${i + 1}壁厚不足（锥径 ${coneD} / 外圆 ${D1}）`,
        z: zJoint,
        coneDia: coneD,
      });
      continue;
    }
    const auto = computePipeEndThread({ D1, t1, D2, t2: 50 });
    if (!auto.ok) {
      joints.push({ ok: false, index: i + 1, error: auto.error, z: zJoint, coneDia: coneD });
      continue;
    }
    let major = roundThread ? roundMajor05(auto.recommendedMajor) : auto.recommendedMajor;
    if (major >= D1) major = roundMajor05(D1 - 5);
    if (major <= coneD) major = roundMajor05(coneD + 5);
    const minT2 = minFemaleWall(D1, t1, D2, major);
    const check = computePipeEndThread({ D1, t1, D2, t2: minT2 || 50 }, { majorDia: major });
    const cards = computeThreadEndCards(`M${major}×${PIPE_END_CONST.pitch}`);

    joints.push({
      ok: true,
      index: i + 1,
      z: zJoint,
      coneDia: coneD,
      cavityAtJoint: coneD,
      fromOd: D2,
      toOd: D1,
      upperOuter: D2,
      lowerOuter: D1,
      maleWall: t1,
      jointStack,
      jointStackHeight: jointH,
      nestStyle: "外套节间嵌套（上套下）· 内锥连续贯穿",
      autoDesignation: auto.recommendedDesignation,
      designation: `M${major}×${PIPE_END_CONST.pitch}`,
      majorDia: major,
      crest: check.crest,
      root: check.root,
      undercutDf: major - 3,
      undercutDg: major + 3,
      endStructure: jointH,
      locator: jointStack.find((x) => x.key === "locator")?.h ?? 10,
      engage: jointStack.find((x) => x.key === "engage")?.h ?? 12,
      gaps: jointStack.filter((x) => x.key.startsWith("gap")).map((x) => x.h),
      minFemaleWall: minT2,
      checkPass: !!minT2,
      checkMessage: minT2
        ? `外套局部壁厚建议 ≥ ${minT2} mm`
        : "外套壁厚无法满足螺纹实体",
      maleCard: cards.ok ? cards.male : null,
      femaleCard: cards.ok ? cards.female : null,
      theoryMajor: auto.theoryMajor,
      smallCenterDia: auto.smallCenterDia,
    });
  }

  const sumLen = round3(sleeves.reduce((s, x) => s + x.length, 0));

  return {
    ok: true,
    model: "inner-cone-outer-sleeves",
    input: {
      coneTopDia,
      coneBottomDia,
      totalHeight,
      topAllowance,
      bottomAllowance,
      standardLen,
      wall,
      roundThread,
      // 兼容旧字段
      bigOd: coneTopDia,
      smallOd: coneBottomDia,
      moldHeight: totalHeight,
      cavityTop: coneTopDia,
      cavityBottom: coneBottomDia,
    },
    cone,
    sleeves,
    segments: sleeves, // 兼容旧 UI
    segmentCount,
    joints,
    summary: {
      moldHeight: sumLen,
      totalHeight: sumLen,
      heightOk: Math.abs(sumLen - totalHeight) < 1e-6,
      coneHeight,
      faceToFace: coneHeight,
      expectedFaceToFace: coneHeight,
      cavityTop: coneTopDia,
      cavityBottom: coneBottomDia,
      coneTopDia,
      coneBottomDia,
      taperPerMm: round3((coneTopDia - coneBottomDia) / coneHeight),
      jointCount: joints.length,
      jointStack,
      jointStackHeight: jointH,
      pitch: PIPE_END_CONST.pitch,
      locator: 10,
      engage: 12,
      undercut: 4,
      nestNote: "内锥连续 + 外套分段套装；接头 12+1+10+1",
    },
    alternatives: lengthPlan.alternatives,
  };
}

export function pickSegmentOds() {
  return { ok: false, error: "已改为内锥+外套模型，请用 designConeMold" };
}

export function cavityDiaAt(z, top, bottom, H) {
  // 兼容旧签名
  if (typeof top === "object") return coneDiaAt(z, top);
  return coneDiaAt(z, {
    coneTopDia: top,
    coneBottomDia: bottom,
    totalHeight: H,
    topAllowance: 0,
    bottomAllowance: 0,
  });
}
