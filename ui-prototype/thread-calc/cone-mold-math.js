/**
 * 锥管模具设计（正确模型）
 *
 * - 内件：连续外锥（绿）——上口/下口为锥面口径
 * - 外套：分段套筒套在锥上（红/青/紫…），节间止口嵌套
 * - 案例默认：总高 730，锥段 680，上 45，下 5，ø194→ø108，标准节总高 250（含公扣）
 * - 分段：由下往上铺标准节；节总高=体长+公扣（止口+螺纹+退刀槽）；余段在顶；余段>250 自动再拆
 * - 接头细节：旋合=圈数×P；止口=退刀槽宽+½旋合（自动，不固定10）；间隙默认1+1
 */

import {
  computePipeEndThread,
  PIPE_END_CONST,
  computeThreadEndCards,
  autoLocatorLen,
  undercutWidthP2,
} from "./pipe-end-math.js";

/**
 * 管子选型表（用户手写：名义ø / 内径 / 外径）
 * 选型规则：按本节最大锥径，选「内径 ≥ 锥径」的最小一档，取其外径做外套管外径
 */
export const PIPE_SIZE_TABLE = [
  { nom: 60, id: 60, od: 80 },
  { nom: 63.5, id: 63, od: 83 },
  { nom: 70, id: 70, od: 90 },
  { nom: 76, id: 80, od: 102 },
  { nom: 83, id: 85, od: 105 },
  { nom: 89, id: 90, od: 110 },
  { nom: 102, id: 105, od: 125 },
  { nom: 108, id: 110, od: 130 },
  { nom: 114, id: 115, od: 135 },
  { nom: 121, id: 120, od: 140 },
  { nom: 127, id: 130, od: 152 },
  { nom: 133, id: 135, od: 159 },
  { nom: 140, id: 140, od: 159 },
  { nom: 146, id: 150, od: 170 },
  { nom: 159, id: 160, od: 180 },
  { nom: 168, id: 170, od: 194 },
  { nom: 177, id: 180, od: 203 },
  { nom: 180, id: 180, od: 203 },
  { nom: 194, id: 200, od: 219 },
  { nom: 203, id: 210, od: 245 },
  { nom: 219, id: 220, od: 245 },
  { nom: 232, id: 240, od: 273 },
  { nom: 245, id: 250, od: 273 },
  { nom: 254, id: 260, od: 299 },
  { nom: 265, id: 270, od: 299 },
  { nom: 273, id: 280, od: 325 },
  { nom: 286, id: 290, od: 325 },
  { nom: 299, id: 300, od: 325 },
  { nom: 310, id: 310, od: 351 },
  { nom: 325, id: 330, od: 377 },
  { nom: 335, id: 340, od: 377 },
  { nom: 351, id: 350, od: 377 },
  { nom: 360, id: 360, od: 402 },
  { nom: 377, id: 380, od: 426 },
  { nom: 426, id: 450, od: 508 },
];

export const STD_PIPE_ODS = [...new Set(PIPE_SIZE_TABLE.map((x) => x.od))].sort((a, b) => a - b);

/**
 * 按螺距 / 旋合 / 退刀槽自动生成接头轴向栈（止口高度不写死）
 * 止口 = autoLocatorLen：退刀槽宽 + ½旋合长，夹在 [4P, 旋合长]
 */
export function buildJointStack(opt = {}) {
  const P = Number(opt.pitch ?? PIPE_END_CONST.pitch);
  const turns = Number(opt.turns ?? PIPE_END_CONST.turns);
  const engage = Number(opt.engageLen ?? turns * P);
  const gap = Number(opt.gap ?? 1);
  const grooveKind = opt.grooveKind || "normal";
  const locator = autoLocatorLen({ pitch: P, turns, engageLen: engage, grooveKind });
  const undercut = undercutWidthP2(grooveKind, "external");
  return {
    stack: [
      { key: "engage", name: "旋合", h: engage },
      { key: "gapA", name: "间隙", h: gap },
      { key: "locator", name: "止口", h: locator },
      { key: "gapB", name: "间隙", h: gap },
    ],
    engage,
    locator,
    gap,
    undercut,
    grooveKind,
    pitch: P,
    formula: `止口=${undercut}+${engage}/2 → ${locator}（退刀槽+½旋合，夹[${4 * P},${engage}]）`,
  };
}

/** 默认栈（normal 退刀槽）；实际设计时仍会再算一遍 */
export const JOINT_STACK_DEFAULT = buildJointStack().stack;

/**
 * 安装止口径向尺寸
 * - 轴向高度：见 autoLocatorLen / buildJointStack（随螺纹与退刀槽变）
 * - 径向壁 4～8：随上下节外径差取
 * - 径向间隙 0.2：装配导向间隙（直径方向 0.4）
 */
export const LOCATOR_DIM = {
  wallMin: 4,
  wallMax: 8,
  radialClearance: 0.2,
};

/** 由上下外套外径推止口径向壁厚 */
export function locatorWallFromOds(upperOd, lowerOd) {
  const step = (Number(upperOd) - Number(lowerOd)) / 2;
  if (Number.isFinite(step) && step > 0) {
    return round3(Math.min(LOCATOR_DIM.wallMax, Math.max(LOCATOR_DIM.wallMin, step)));
  }
  return LOCATOR_DIM.wallMin;
}

export const CONE_MOLD_DEFAULTS = {
  coneTopDia: 194,
  coneBottomDia: 108,
  totalHeight: 730,
  topAllowance: 45,
  bottomAllowance: 5,
  standardLen: 250,
  wall: 20, // 仅作校核参考；外径以选型表为准
  pitch: 2,
};

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

export function roundMajor05(n) {
  return Math.round(Number(n) / 5) * 5;
}

/**
 * 按锥径自动选管：内径 ≥ 锥径 的最小档 → 返回名义/内径/外径
 * @param {number} coneDia
 */
export function pickPipeByConeDia(coneDia, table = PIPE_SIZE_TABLE) {
  const need = Number(coneDia);
  const hit = table.find((row) => row.id + 1e-9 >= need);
  const row = hit || table[table.length - 1];
  return {
    nom: row.nom,
    id: row.id,
    od: row.od,
    coneDia: need,
    label: `ø${row.nom} → 内径${row.id} / 外径${row.od}`,
    auto: true,
    atLimit: !hit,
  };
}

/** @deprecated 旧接口：按需求外径就近 */
export function pickPipeOuter(needOuter) {
  const p = pickPipeByConeDia(Math.max(0, Number(needOuter) - 40));
  return { ...p, needOuter: Number(needOuter), mark: "", hotExpand: false, kind: "table" };
}

function nearestOdAtLeast(target) {
  return pickPipeByConeDia(target).od;
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

/**
 * 公扣端头轴向总长（止口 + 螺纹旋合 + 外退刀槽），计入节总高
 * 与 pipe-end-math maleEnd.total 一致
 */
export function maleEndHeight(opt = {}) {
  const P = Number(opt.pitch ?? PIPE_END_CONST.pitch);
  const turns = Number(opt.turns ?? PIPE_END_CONST.turns);
  const engage = Number(opt.engageLen ?? turns * P);
  const grooveKind = opt.grooveKind || "normal";
  const locator = autoLocatorLen({ pitch: P, turns, engageLen: engage, grooveKind });
  const undercut = undercutWidthP2(grooveKind, "external");
  return {
    locator,
    engage,
    undercut,
    total: round3(locator + engage + undercut),
    formula: `公扣=${locator}+${engage}+${undercut}=${locator + engage + undercut}`,
  };
}

/**
 * 由下往上按「节总高=标准长（含公扣）」分段：
 * - 有公扣的节：零件总高 S = 装配体长 + 公扣长；装配占位 assy = S − 公扣
 * - 自下连续铺标准节（含公扣），直到剩余 ≤ S（顶节无公扣，总高=装配长）
 * - 剩余 > S 则继续自动拆
 */
export function planSegmentLengths(totalHeight, standardLen = 250, maleEndLen = 26, minTop = 1) {
  const H = Number(totalHeight);
  const S = Number(standardLen);
  const maleH = Number(maleEndLen);
  if (!(H > 0) || !(S > 0)) return { ok: false, error: "总高与标准节长须大于 0" };
  if (!(maleH >= 0) || maleH >= S) {
    return { ok: false, error: `公扣长 ${maleH} 须小于标准节总高 ${S}` };
  }
  const stdAssy = round3(S - maleH); // 标准节在总装上的轴向占位（公扣插入上节）

  let rem = round3(H);
  const bottomAssy = [];
  while (rem > S + 1e-9) {
    bottomAssy.push(stdAssy);
    rem = round3(rem - stdAssy);
    if (bottomAssy.length > 40) {
      return { ok: false, error: `总高 ${H} 按标准长 ${S}（含公扣${maleH}）分段过多` };
    }
  }
  const topLen = rem; // 顶节无公扣，零件总高 = 装配长
  const lengths =
    topLen > 1e-9 ? [topLen, ...bottomAssy] : bottomAssy.slice();

  if (!lengths.length) return { ok: false, error: `总高 ${H} 过小` };
  if (topLen > 1e-9 && topLen < minTop) {
    return { ok: false, error: `顶部余段 ${topLen} 过短（标准节总高 ${S}，含公扣 ${maleH}）` };
  }

  const plan = {
    segmentCount: lengths.length,
    largeCount: bottomAssy.length,
    standardLen: S,
    maleEndLen: maleH,
    stdAssy,
    topLen: topLen > 1e-9 ? topLen : 0,
    smallLen: topLen > 1e-9 ? topLen : S,
    fromBottom: true,
    includesMale: true,
    lengths,
    inPrefer: topLen <= 1e-9 || (topLen >= 80 && topLen <= S),
    score: 0,
  };

  return { ok: true, plan, alternatives: [plan] };
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
  const grooveKind = input.grooveKind || "normal";
  const builtStack = buildJointStack({
    pitch: PIPE_END_CONST.pitch,
    turns: PIPE_END_CONST.turns,
    engageLen: PIPE_END_CONST.engageLen,
    grooveKind,
    gap: input.jointGap ?? 1,
  });
  const jointStack = input.jointStack || builtStack.stack;
  const jointH = jointStackHeight(jointStack);
  const locatorAuto = jointStack.find((x) => x.key === "locator")?.h ?? builtStack.locator;
  const engageAuto = jointStack.find((x) => x.key === "engage")?.h ?? builtStack.engage;

  if (!(coneTopDia > coneBottomDia)) return { ok: false, error: "锥上口须大于锥下口" };
  if (!(totalHeight > topAllowance + bottomAllowance)) {
    return { ok: false, error: "总高须大于上口余量+下口余量" };
  }
  if (!(wall > 0)) return { ok: false, error: "外套名义壁厚须大于 0" };

  const coneHeight = round3(totalHeight - topAllowance - bottomAllowance);
  const maleInfo = maleEndHeight({
    pitch: PIPE_END_CONST.pitch,
    turns: PIPE_END_CONST.turns,
    engageLen: PIPE_END_CONST.engageLen,
    grooveKind,
  });
  const maleH = maleInfo.total;

  const lengthPlan = planSegmentLengths(totalHeight, standardLen, maleH);
  if (!lengthPlan.ok) return lengthPlan;

  let lengths = lengthPlan.plan.lengths.slice();
  let segmentCount = lengths.length;
  const stdAssy = lengthPlan.plan.stdAssy;

  // 强制节数：由下往上铺「含公扣」标准节；顶节无公扣；顶节总高> S 则自动再拆
  if (input.segmentCount != null && Number(input.segmentCount) >= 1) {
    const forced = Number(input.segmentCount);
    if (forced === 1) {
      lengths = [round3(totalHeight)];
      if (lengths[0] > standardLen + 1e-9) {
        const auto = planSegmentLengths(totalHeight, standardLen, maleH);
        if (!auto.ok) return auto;
        lengths = auto.plan.lengths.slice();
      }
    } else {
      const bottomStd = forced - 1;
      const topLen = round3(totalHeight - bottomStd * stdAssy);
      if (topLen <= 0) {
        return { ok: false, error: `节数 ${forced} 过大（标准节总高 ${standardLen} 含公扣 ${maleH}）` };
      }
      if (topLen > standardLen + 1e-9) {
        const auto = planSegmentLengths(totalHeight, standardLen, maleH);
        if (!auto.ok) return auto;
        lengths = auto.plan.lengths.slice();
      } else {
        lengths = [topLen, ...Array.from({ length: bottomStd }, () => stdAssy)];
      }
    }
    segmentCount = lengths.length;
    lengthPlan.plan = {
      ...lengthPlan.plan,
      segmentCount,
      largeCount: Math.max(0, segmentCount - 1),
      topLen: lengths[0],
      smallLen: lengths[0],
      lengths: lengths.slice(),
      inPrefer: lengths[0] <= standardLen,
      score: 0,
    };
  }

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
    const coneNeed = Math.max(coneAtTop, coneAtBot);
    // 按选型表：内径≥锥径 → 取该档外径
    let pipe = pickPipeByConeDia(coneNeed);
    if (input.preferredOuterOds && input.preferredOuterOds[i] != null) {
      const forcedOd = Number(input.preferredOuterOds[i]);
      const byOd = PIPE_SIZE_TABLE.find((r) => r.od === forcedOd);
      const byNom = PIPE_SIZE_TABLE.find((r) => r.nom === forcedOd);
      pipe = byOd
        ? { ...byOd, coneDia: coneNeed, label: `ø${byOd.nom} → 内径${byOd.id} / 外径${byOd.od}`, auto: false }
        : byNom
          ? { ...byNom, coneDia: coneNeed, label: `ø${byNom.nom} → 内径${byNom.id} / 外径${byNom.od}`, auto: false }
          : { nom: forcedOd, id: forcedOd, od: forcedOd, coneDia: coneNeed, label: `外径${forcedOd}（手指定）`, auto: false };
    }
    const outerOd = pipe.od;
    const wallEff = round3((outerOd - coneNeed) / 2);
    const isFirst = i === 0;
    const isLast = i === segmentCount - 1;
    const hasMale = !isFirst; // 下节起有向上公扣，插入上一节母扣
    const maleEnd = hasMale ? maleH : 0;
    const partLength = round3(length + maleEnd); // 零件总高（含公扣）
    const isStandard = hasMale && Math.abs(partLength - standardLen) < 1e-9;
    return {
      index: i + 1,
      role: "sleeve",
      length, // 总装轴向占位（公扣插入上节，不另占总高）
      maleEndLen: maleEnd,
      partLength,
      kind: isStandard ? "标准" : "非标",
      kindNote: hasMale
        ? `总高${partLength}=体${length}+公扣${maleEnd}`
        : `总高${partLength}（无公扣）`,
      z0,
      z1,
      coneAtTop,
      coneAtBot,
      coneAtMid,
      coneNeed,
      pipeNom: pipe.nom,
      pipeId: pipe.id,
      pipeLabel: pipe.label,
      outerOd,
      wall: wallEff,
      wallNom: wall,
      od: outerOd,
      cavityTop: coneAtTop,
      cavityBottom: coneAtBot,
      femaleSleeve: !isLast,
      maleNeck: hasMale,
      topFaceOffset: isFirst ? topAllowance : null,
      belowTopFace: isFirst ? round3(length - topAllowance) : null,
      bottomFaceOffset: isLast ? bottomAllowance : null,
      aboveBottomFace: isLast ? round3(length - bottomAllowance) : null,
    };
  });

  for (let i = 1; i < sleeves.length; i++) {
    if (sleeves[i].outerOd > sleeves[i - 1].outerOd) {
      // 保持外径自上而下不增：升到上一档外径对应行
      const prevOd = sleeves[i - 1].outerOd;
      const row = PIPE_SIZE_TABLE.filter((r) => r.od <= prevOd).pop() || PIPE_SIZE_TABLE[0];
      sleeves[i].outerOd = row.od;
      sleeves[i].od = row.od;
      sleeves[i].pipeNom = row.nom;
      sleeves[i].pipeId = row.id;
      sleeves[i].pipeLabel = `ø${row.nom} → 内径${row.id} / 外径${row.od}（随上节收敛）`;
      sleeves[i].wall = round3((row.od - sleeves[i].coneNeed) / 2);
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

    // 安装止口：轴向由螺纹/退刀槽自动；径向壁随外径台阶；母止口内径 = 下套外径 + 2×间隙
    const locatorH = jointStack.find((x) => x.key === "locator")?.h ?? locatorAuto;
    const locatorWall = locatorWallFromOds(D2, D1);
    const locatorClear = LOCATOR_DIM.radialClearance;
    const locatorMaleOd = D1;
    const locatorFemaleId = round3(D1 + 2 * locatorClear);
    const locatorFemaleOd = round3(locatorFemaleId + 2 * locatorWall);

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
      locator: locatorH,
      engage: jointStack.find((x) => x.key === "engage")?.h ?? 12,
      gaps: jointStack.filter((x) => x.key.startsWith("gap")).map((x) => x.h),
      locatorDim: {
        height: locatorH,
        wall: locatorWall,
        radialClearance: locatorClear,
        maleOd: locatorMaleOd,
        femaleId: locatorFemaleId,
        femaleOd: locatorFemaleOd,
        undercut: builtStack.undercut,
        grooveKind,
        formula: builtStack.formula,
        note: `安装止口 高${locatorH}（自动）· 壁${locatorWall} · 间隙${locatorClear}`,
      },
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
      locator: locatorAuto,
      engage: engageAuto,
      undercut: builtStack.undercut,
      maleEndLen: maleH,
      maleEndFormula: maleInfo.formula,
      stdAssy: lengthPlan.plan.stdAssy,
      grooveKind,
      locatorFormula: builtStack.formula,
      nestNote: `内锥连续 + 外套分段；标准节总高 ${standardLen}=装配${lengthPlan.plan.stdAssy}+公扣${maleH}；接头 ${jointStack.map((x) => x.h).join("+")}`,
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
