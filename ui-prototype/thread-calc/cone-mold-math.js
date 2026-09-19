/**
 * 锥管模具设计（正确模型）
 *
 * - 内件：连续外锥（绿）——上口/下口为锥面口径
 * - 外套：分段套筒套在锥上（红/青/紫…），节间止口嵌套
 * - 案例默认：总高 730，锥段 680，上 45，下 5，ø194→ø108，标准节总高 250（含公扣）
 * - 分段：由下往上铺标准节；节总高=体长+公扣（止口+螺纹+退刀槽）；余段在顶；余段>250 自动再拆
 * - 外套外径：仅从用户规格目录 Φ60…Φ426 选取（含热扩档）
 */

import {
  computePipeEndThread,
  PIPE_END_CONST,
  computeThreadEndCards,
  autoLocatorLen,
  undercutWidthP2,
} from "./pipe-end-math.js";

/**
 * 外套管外径规格（按用户提供清单；Φ 即为管外径，只能从本表选取）
 * mark: star=常用 / diamond=中间档；hotExpand=模具热扩常用
 */
export const PIPE_OD_CATALOG = [
  { od: 60, mark: "star" },
  { od: 63.5, mark: "diamond" },
  { od: 70, mark: "diamond" },
  { od: 76, mark: "star" },
  { od: 83, mark: "diamond" },
  { od: 89, mark: "star" },
  { od: 102, mark: "diamond" },
  { od: 108, mark: "star" },
  { od: 114, mark: "star" },
  { od: 121, mark: "diamond" },
  { od: 127, mark: "diamond" },
  { od: 133, mark: "star" },
  { od: 140, mark: "star" },
  { od: 146, mark: "diamond" },
  { od: 159, mark: "star" },
  { od: 168, mark: "star" },
  { od: 177.8, mark: "diamond" },
  { od: 180, mark: "star" },
  { od: 194, mark: "star" },
  { od: 203, mark: "diamond" },
  { od: 219, mark: "star" },
  { od: 232, mark: "diamond", hotExpand: true },
  { od: 245, mark: "star" },
  { od: 254, mark: "diamond", hotExpand: true, note: "常用热扩" },
  { od: 265, mark: "diamond", hotExpand: true },
  { od: 273, mark: "star" },
  { od: 286, mark: "diamond", hotExpand: true },
  { od: 299, mark: "star" },
  { od: 310, mark: "diamond", hotExpand: true },
  { od: 325, mark: "star" },
  { od: 335, mark: "diamond", hotExpand: true },
  { od: 351, mark: "star" },
  { od: 360, mark: "diamond", hotExpand: true },
  { od: 377, mark: "star" },
  { od: 426, mark: "star" },
];

/** @deprecated 兼容旧名；现为外径目录 */
export const PIPE_SIZE_TABLE = PIPE_OD_CATALOG.map((r) => ({
  nom: r.od,
  id: r.od, // 目录项即外径；内径按锥径校核
  od: r.od,
  mark: r.mark,
  hotExpand: !!r.hotExpand,
  note: r.note || "",
}));

export const STD_PIPE_ODS = PIPE_OD_CATALOG.map((r) => r.od);

/** 外套最小壁厚（外径 − 锥径）/2 下限，用于从外径目录选型 */
export const PIPE_OD_MIN_WALL = 8;

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
  // 聚氨酯制品尺寸（放大前）
  puTopDia: 194,
  puBottomDia: 108,
  puConeHeight: 680,
  // 兼容旧字段名（= 聚氨酯口径）
  coneTopDia: 194,
  coneBottomDia: 108,
  totalHeight: 730, // 系数=1 时的模具总高 = 45+680+5
  topAllowance: 45,
  bottomAllowance: 5,
  standardLen: 250,
  wall: 20, // 仅作校核参考；外径以选型表为准
  pitch: 2,
  /** 模具相对聚氨酯的放大系数：模具尺寸 = 聚氨酯尺寸 × 系数 */
  scaleFactor: 1.01,
};

/**
 * 推荐放大系数（按缩水经验：模具 = 制品 × (1+缩水率)）
 * 实际以配方/试模为准，可手填微调。
 */
export const SCALE_FACTOR_PRESETS = [
  { value: 1.005, label: "1.005", note: "硬泡偏低缩 ≈0.5%" },
  { value: 1.008, label: "1.008", note: "硬泡常用" },
  { value: 1.01, label: "1.010", note: "推荐默认 ≈1%", recommend: true },
  { value: 1.015, label: "1.015", note: "硬泡偏高 / 自结皮偏低" },
  { value: 1.02, label: "1.020", note: "自结皮常用 ≈2%" },
  { value: 1.025, label: "1.025", note: "自结皮偏高 ≈2.5%" },
];

export const RECOMMENDED_SCALE_FACTOR = 1.01;

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** 由聚氨酯尺寸 × 放大系数 → 模具内锥/锥段/总高 */
export function scalePuToMold(pu, factor, topAllowance, bottomAllowance) {
  const k = Number(factor);
  const topA = Number(topAllowance);
  const botA = Number(bottomAllowance);
  const puTop = Number(pu.topDia);
  const puBot = Number(pu.bottomDia);
  const puConeH = Number(pu.coneHeight);
  if (!(k > 0)) return { ok: false, error: "放大系数须大于 0" };
  if (!(puTop > puBot)) return { ok: false, error: "聚氨酯上口须大于下口" };
  if (!(puConeH > 0)) return { ok: false, error: "聚氨酯锥段高度须大于 0" };
  const moldTopDia = round3(puTop * k);
  const moldBottomDia = round3(puBot * k);
  const moldConeHeight = round3(puConeH * k);
  const moldTotalHeight = round3(topA + moldConeHeight + botA);
  return {
    ok: true,
    scaleFactor: k,
    shrinkagePct: round3((k - 1) * 100),
    pu: { topDia: puTop, bottomDia: puBot, coneHeight: puConeH },
    mold: {
      topDia: moldTopDia,
      bottomDia: moldBottomDia,
      coneHeight: moldConeHeight,
      totalHeight: moldTotalHeight,
      topAllowance: topA,
      bottomAllowance: botA,
    },
    formula: `模具 = 聚氨酯 × ${k}（约缩水 ${round3((k - 1) * 100)}%）`,
  };
}

export function roundMajor05(n) {
  return Math.round(Number(n) / 5) * 5;
}

/**
 * 按锥径从外径目录选型：选「外径 ≥ 锥径 + 2×最小壁厚」的最小一档
 * 外径只能取自 PIPE_OD_CATALOG（用户清单）
 * @param {number} coneDia
 * @param {{ minWall?: number, catalog?: typeof PIPE_OD_CATALOG }} [opt]
 */
export function pickPipeByConeDia(coneDia, opt = {}) {
  const needCone = Number(coneDia);
  const minWall = Number(opt.minWall ?? PIPE_OD_MIN_WALL);
  const catalog = opt.catalog || PIPE_OD_CATALOG;
  const needOd = needCone + 2 * minWall;
  const hit = catalog.find((row) => row.od + 1e-9 >= needOd);
  const row = hit || catalog[catalog.length - 1];
  const wall = round3((row.od - needCone) / 2);
  const tag = row.hotExpand ? "热扩" : row.mark === "star" ? "常用" : "中间档";
  return {
    nom: row.od,
    id: round3(row.od - 2 * Math.max(wall, 0)), // 名义内孔（按贴锥壁厚反推）
    od: row.od,
    coneDia: needCone,
    wall,
    minWall,
    needOd,
    hotExpand: !!row.hotExpand,
    mark: row.mark,
    label: `外径ø${row.od}${row.note ? `（${row.note}）` : `（${tag}）`}`,
    auto: true,
    atLimit: !hit,
  };
}

/** 在目录中找 ≤ maxOd 的最大外径（自上而下收敛用） */
export function pickPipeOdAtMost(maxOd, catalog = PIPE_OD_CATALOG) {
  const limit = Number(maxOd);
  let best = catalog[0];
  for (const row of catalog) {
    if (row.od <= limit + 1e-9) best = row;
    else break;
  }
  return best;
}

/** @deprecated 旧接口：按需求外径就近 */
export function pickPipeOuter(needOuter) {
  const catalog = PIPE_OD_CATALOG;
  const need = Number(needOuter);
  const hit = catalog.find((row) => row.od + 1e-9 >= need) || catalog[catalog.length - 1];
  return {
    ...pickPipeByConeDia(Math.max(0, hit.od - 2 * PIPE_OD_MIN_WALL)),
    needOuter: need,
    mark: hit.mark,
    hotExpand: !!hit.hotExpand,
    kind: "catalog",
  };
}

function nearestOdAtLeast(target) {
  const hit = PIPE_OD_CATALOG.find((row) => row.od + 1e-9 >= Number(target));
  return (hit || PIPE_OD_CATALOG[PIPE_OD_CATALOG.length - 1]).od;
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
 * - 聚氨酯：puTopDia / puBottomDia / puConeHeight（或兼容 coneTopDia / coneBottomDia）
 * - scaleFactor：放大系数，模具 = 聚氨酯 × 系数（默认推荐 1.01）
 * - topAllowance / bottomAllowance：模具工艺余量（不乘系数）
 * - 若显式传入 totalHeight/moldHeight 且 scaleFactor===1，可直接当模具总高（兼容旧调用）
 */
export function designConeMold(input = {}) {
  const topAllowance = Number(input.topAllowance ?? CONE_MOLD_DEFAULTS.topAllowance);
  const bottomAllowance = Number(input.bottomAllowance ?? CONE_MOLD_DEFAULTS.bottomAllowance);
  const standardLen = Number(input.standardLen ?? CONE_MOLD_DEFAULTS.standardLen);
  const wall = Number(input.wall ?? CONE_MOLD_DEFAULTS.wall);
  const roundThread = input.roundThread !== false;
  const grooveKind = input.grooveKind || "normal";
  const scaleFactor = Number(
    input.scaleFactor ?? input.enlargeFactor ?? CONE_MOLD_DEFAULTS.scaleFactor
  );

  const puTopDia = Number(
    input.puTopDia ?? input.coneTopDia ?? input.cavityTop ?? input.bigOd ?? CONE_MOLD_DEFAULTS.puTopDia
  );
  const puBottomDia = Number(
    input.puBottomDia ??
      input.coneBottomDia ??
      input.cavityBottom ??
      input.smallOd ??
      CONE_MOLD_DEFAULTS.puBottomDia
  );

  // 聚氨酯锥段高：优先 puConeHeight；否则由总高−余量反推；再否则默认 680
  let puConeHeight;
  if (input.puConeHeight != null && Number(input.puConeHeight) > 0) {
    puConeHeight = Number(input.puConeHeight);
  } else if (input.coneHeight != null && Number(input.coneHeight) > 0) {
    puConeHeight = Number(input.coneHeight);
  } else if (input.totalHeight != null || input.moldHeight != null) {
    const rawH = Number(input.totalHeight ?? input.moldHeight);
    // 旧接口：传入的是「已是模具总高」且系数按 1 用时，锥段 = 总高−余量后再÷系数
    puConeHeight = round3((rawH - topAllowance - bottomAllowance) / scaleFactor);
  } else {
    puConeHeight = CONE_MOLD_DEFAULTS.puConeHeight;
  }

  const scaled = scalePuToMold(
    { topDia: puTopDia, bottomDia: puBottomDia, coneHeight: puConeHeight },
    scaleFactor,
    topAllowance,
    bottomAllowance
  );
  if (!scaled.ok) return scaled;

  const coneTopDia = scaled.mold.topDia;
  const coneBottomDia = scaled.mold.bottomDia;
  const totalHeight = scaled.mold.totalHeight;
  const coneHeight = scaled.mold.coneHeight;

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

  if (!(coneTopDia > coneBottomDia)) return { ok: false, error: "模具锥上口须大于锥下口" };
  if (!(totalHeight > topAllowance + bottomAllowance)) {
    return { ok: false, error: "模具总高须大于上口余量+下口余量" };
  }
  if (!(wall > 0)) return { ok: false, error: "外套名义壁厚须大于 0" };

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
    let pipe = pickPipeByConeDia(coneNeed, { minWall: Math.min(wall, PIPE_OD_MIN_WALL) });
    if (input.preferredOuterOds && input.preferredOuterOds[i] != null) {
      const forcedOd = Number(input.preferredOuterOds[i]);
      const byOd = PIPE_OD_CATALOG.find((r) => Math.abs(r.od - forcedOd) < 1e-6);
      if (byOd) {
        const w = round3((byOd.od - coneNeed) / 2);
        pipe = {
          nom: byOd.od,
          id: round3(byOd.od - 2 * Math.max(w, 0)),
          od: byOd.od,
          coneDia: coneNeed,
          wall: w,
          hotExpand: !!byOd.hotExpand,
          mark: byOd.mark,
          label: `外径ø${byOd.od}（手指定${byOd.hotExpand ? "·热扩" : ""}）`,
          auto: false,
          atLimit: false,
        };
      } else {
        pipe = {
          nom: forcedOd,
          id: forcedOd,
          od: forcedOd,
          coneDia: coneNeed,
          wall: round3((forcedOd - coneNeed) / 2),
          label: `外径${forcedOd}（不在目录，手指定）`,
          auto: false,
          atLimit: false,
        };
      }
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
      // 保持外径自上而下不增：取目录中 ≤ 上节外径的最大档
      const row = pickPipeOdAtMost(sleeves[i - 1].outerOd);
      sleeves[i].outerOd = row.od;
      sleeves[i].od = row.od;
      sleeves[i].pipeNom = row.od;
      sleeves[i].pipeId = round3(row.od - 2 * Math.max(0, (row.od - sleeves[i].coneNeed) / 2));
      sleeves[i].pipeLabel = `外径ø${row.od}（随上节收敛${row.hotExpand ? "·热扩" : ""}）`;
      sleeves[i].wall = round3((row.od - sleeves[i].coneNeed) / 2);
      sleeves[i].hotExpand = !!row.hotExpand;
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
      puTopDia,
      puBottomDia,
      puConeHeight,
      scaleFactor,
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
    pu: scaled.pu,
    scale: {
      factor: scaleFactor,
      shrinkagePct: scaled.shrinkagePct,
      formula: scaled.formula,
      presets: SCALE_FACTOR_PRESETS,
      recommended: RECOMMENDED_SCALE_FACTOR,
    },
    mold: scaled.mold,
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
      puTopDia,
      puBottomDia,
      puConeHeight,
      scaleFactor,
      shrinkagePct: scaled.shrinkagePct,
      scaleFormula: scaled.formula,
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
      nestNote: `聚氨酯 ø${puTopDia}→ø${puBottomDia}×${puConeHeight} ×${scaleFactor} → 模具 ø${coneTopDia}→ø${coneBottomDia}×${coneHeight}；标准节总高 ${standardLen}=装配${lengthPlan.plan.stdAssy}+公扣${maleH}`,
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
