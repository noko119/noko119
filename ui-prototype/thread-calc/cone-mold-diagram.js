/**
 * 锥管模具 — 组装后嵌套剖面示意图
 * - 竖直：上大口 / 下小口
 * - 内壁：连续共锥
 * - 外壁：分段台阶 + 上套下止口嵌套（接头细节）
 */

function t(n) {
  const s = String(Number(Number(n).toFixed(3)));
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

function dimV(x, y1, y2, label, color = "#c45c26") {
  const mid = (y1 + y2) / 2;
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="1"/>
    <line x1="${x - 3}" y1="${y1}" x2="${x + 3}" y2="${y1}" stroke="${color}" stroke-width="1"/>
    <line x1="${x - 3}" y1="${y2}" x2="${x + 3}" y2="${y2}" stroke="${color}" stroke-width="1"/>
    <text x="${x - 6}" y="${mid + 3}" text-anchor="end" fill="${color}" font-size="9" font-weight="600">${label}</text>
  `;
}

const SEG_COLORS = ["#c45c5c", "#b8a06a", "#6a9ec9", "#5cbf6a", "#c49a6c", "#8a7bb8"];

/**
 * @param {object} r designConeMold 成功返回值
 */
export function renderConeMoldDiagram(r) {
  if (!r?.ok || !r.segments?.length) return "";

  const segs = r.segments;
  const joints = (r.joints || []).filter((j) => j.ok);
  const Hmold = r.summary.moldHeight;
  const topA = r.input.topAllowance ?? 0;
  const botA = r.input.bottomAllowance ?? 0;
  const nestH = r.summary.locator + r.summary.engage; // 止口+旋合示意重叠
  const sleeveT = r.input.nestSleeve ?? 8;

  const W = 760;
  const padT = 40;
  const plotH = 480;
  const axis = 400;
  const scaleY = plotH / Hmold;
  const maxOuter = Math.max(...segs.map((s) => s.outerOd));
  const scaleR = Math.min(1.15, 150 / (maxOuter / 2));

  const yAt = (z) => padT + z * scaleY;
  const xR = (dia) => (dia / 2) * scaleR;

  // 连续内锥左右壁
  const cavTop = r.input.cavityTop;
  const cavBot = r.input.cavityBottom;
  const y0 = yAt(0);
  const yH = yAt(Hmold);
  const innerL = [
    [axis - xR(cavTop), y0],
    [axis - xR(cavBot), yH],
  ];
  const innerR = [
    [axis + xR(cavTop), y0],
    [axis + xR(cavBot), yH],
  ];

  // 各节实体：左/右对称多边形（含下端外套唇 / 上端公颈台阶）
  const bodies = segs
    .map((s, i) => {
      const color = SEG_COLORS[i % SEG_COLORS.length];
      const yA = yAt(s.z0);
      const yB = yAt(s.z1);
      const out = xR(s.outerOd);
      const cavA = xR(s.cavityTop);
      const cavB = xR(s.cavityBottom);

      // 下端若有外套：唇伸入下一节 nestH
      const hasSleeve = s.femaleSleeve && i < segs.length - 1;
      const hasNeck = s.maleNeck && i > 0;
      const nestPx = Math.min(nestH * scaleY, (yB - yA) * 0.35);
      const sleeveIn = xR(sleeveT);

      // 右侧轮廓点（顺时针，从左上内壁开始绕外）
      // 简化为左右各一块 path
      let rightOuter = [];
      let leftOuter = [];

      if (hasNeck) {
        // 公颈：顶部缩进
        const neckOut = out - sleeveIn;
        rightOuter.push([axis + neckOut, yA], [axis + neckOut, yA + nestPx], [axis + out, yA + nestPx]);
        leftOuter.push([axis - neckOut, yA], [axis - neckOut, yA + nestPx], [axis - out, yA + nestPx]);
      } else {
        rightOuter.push([axis + out, yA]);
        leftOuter.push([axis - out, yA]);
      }

      if (hasSleeve) {
        rightOuter.push([axis + out, yB], [axis + out, yB + nestPx], [axis + out - sleeveIn, yB + nestPx], [axis + out - sleeveIn, yB]);
        leftOuter.push([axis - out, yB], [axis - out, yB + nestPx], [axis - (out - sleeveIn), yB + nestPx], [axis - (out - sleeveIn), yB]);
      } else {
        rightOuter.push([axis + out, yB]);
        leftOuter.push([axis - out, yB]);
      }

      // 闭合：外轮廓 → 底部内壁 → 顶部内壁
      const rightPath = [
        ...rightOuter.map((p, idx) => (idx ? `L${p[0]},${p[1]}` : `M${p[0]},${p[1]}`)),
        `L${axis + cavB},${yB}`,
        `L${axis + cavA},${yA}`,
        "Z",
      ].join(" ");
      const leftPath = [
        ...leftOuter.map((p, idx) => (idx ? `L${p[0]},${p[1]}` : `M${p[0]},${p[1]}`)),
        `L${axis - cavB},${yB}`,
        `L${axis - cavA},${yA}`,
        "Z",
      ].join(" ");

      return `
        <path d="${rightPath}" fill="${color}" fill-opacity="0.85" stroke="#2f4a56" stroke-width="1.2"/>
        <path d="${leftPath}" fill="${color}" fill-opacity="0.85" stroke="#2f4a56" stroke-width="1.2"/>
        <text x="${axis + out + 8}" y="${(yA + yB) / 2 + 4}" fill="#2f4a56" font-size="10" font-weight="700">§${s.index}</text>
      `;
    })
    .join("");

  // 内锥强调线
  const coneLines = `
    <line x1="${innerL[0][0]}" y1="${innerL[0][1]}" x2="${innerL[1][0]}" y2="${innerL[1][1]}"
      stroke="#e67e22" stroke-width="2.2"/>
    <line x1="${innerR[0][0]}" y1="${innerR[0][1]}" x2="${innerR[1][0]}" y2="${innerR[1][1]}"
      stroke="#e67e22" stroke-width="2.2"/>
  `;

  // 接头螺纹标注
  const jointLabels = joints
    .map((j) => {
      const y = yAt(j.z);
      return `<text x="${axis - xR(maxOuter) - 10}" y="${y + 3}" text-anchor="end"
        fill="#1f6f5b" font-size="9" font-weight="700">${j.designation}</text>`;
    })
    .join("");

  // 尺寸
  let dims = dimV(70, y0, yH, `总高 ${t(Hmold)}`, "#2f4a56");
  segs.forEach((s) => {
    dims += dimV(100, yAt(s.z0), yAt(s.z1), `${t(s.length)}`, "#c45c26");
  });
  if (topA > 0) dims += dimV(130, y0, yAt(topA), `上 ${t(topA)}`, "#1f6f5b");
  if (botA > 0) dims += dimV(130, yAt(Hmold - botA), yH, `下 ${t(botA)}`, "#1f6f5b");
  dims += dimV(48, yAt(topA), yAt(Hmold - botA), `面距 ${t(r.summary.faceToFace)}`, "#5c6b64");

  // 型腔口径
  const cavLabels = `
    <text x="${axis}" y="${y0 - 10}" text-anchor="middle" fill="#e67e22" font-size="11" font-weight="800">型腔上口 ø${t(cavTop)}</text>
    <text x="${axis}" y="${yH + 18}" text-anchor="middle" fill="#e67e22" font-size="11" font-weight="800">型腔下口 ø${t(cavBot)}</text>
  `;

  // 接头细节小图（右下）
  const detail = renderJointDetailInset(520, yH - 110, joints[0]);

  const legendY = yH + 36;
  const legendItems = [
    ...segs.map(
      (s, i) =>
        `§${s.index} 外圆ø${t(s.outerOd)} · 型腔 ${t(s.cavityTop)}→${t(s.cavityBottom)} · ${t(s.length)}mm（${s.kind}）`
    ),
    ...joints.map((j) => `接头${j.index} ${j.designation} @z=${t(j.z)} 型腔ø${t(j.cavityAtJoint)}`),
    `橙线=连续内锥；外套止口嵌套（上母下公）`,
  ];
  const legend = legendItems
    .map((label, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      return `<text x="${24 + col * 360}" y="${legendY + row * 15}" fill="#5c6b64" font-size="9" font-weight="600">${label}</text>`;
    })
    .join("");
  const legendRows = Math.ceil(legendItems.length / 2);
  const H = legendY + legendRows * 15 + 20;

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="锥管模具组装后嵌套示意图">
    <text x="20" y="22" fill="#2f4a56" font-size="13" font-weight="800">组装后示意图 · 内锥型腔 + 止口嵌套</text>
    <text x="20" y="36" fill="#5c6b64" font-size="9">内壁连续共锥；外壁分段外套（细节见图中接头示意）</text>
    ${bodies}
    ${coneLines}
    ${jointLabels}
    ${dims}
    ${cavLabels}
    <line x1="${axis}" y1="${y0}" x2="${axis}" y2="${yH}" stroke="#9aa8a1" stroke-dasharray="4 3"/>
    ${detail}
    ${legend}
  </svg>`;
}

/** 接头局部：上外套 / 下公颈 / 内锥连续 */
function renderJointDetailInset(x0, y0, joint) {
  if (!joint) return "";
  const w = 200;
  const h = 100;
  return `
    <g transform="translate(${x0},${y0})">
      <rect x="0" y="0" width="${w}" height="${h}" rx="8" fill="#fff" stroke="#2f4a56" stroke-width="1"/>
      <text x="10" y="16" fill="#2f4a56" font-size="10" font-weight="700">接头细节 · ${joint.designation || ""}</text>
      <!-- 上段（母套） -->
      <path d="M30,28 L90,28 L90,55 L78,55 L78,48 L42,48 L42,55 L30,55 Z" fill="#c45c5c" stroke="#2f4a56"/>
      <!-- 下段（公颈） -->
      <path d="M42,48 L78,48 L78,55 L88,55 L88,88 L32,88 L32,55 L42,55 Z" fill="#b8a06a" stroke="#2f4a56"/>
      <!-- 内锥线 -->
      <line x1="55" y1="28" x2="48" y2="88" stroke="#e67e22" stroke-width="2"/>
      <line x1="65" y1="28" x2="72" y2="88" stroke="#e67e22" stroke-width="2"/>
      <text x="100" y="42" fill="#c45c5c" font-size="9" font-weight="700">上段外套</text>
      <text x="100" y="58" fill="#5c6b64" font-size="8">止口坐肩</text>
      <text x="100" y="78" fill="#b8a06a" font-size="9" font-weight="700">下段公颈</text>
      <text x="100" y="92" fill="#e67e22" font-size="8">内壁连续锥</text>
    </g>
  `;
}

export const renderAssembledConeDiagram = renderConeMoldDiagram;
