/**
 * 锥管模具分段尺寸示意图
 * - 大→小：左→右（上口→下口）
 * - 轴向长度标在轮廓上方
 * - 外径 / 螺纹 / 余量放图下图例，避免压字
 */

function t(n) {
  const s = String(Number(Number(n).toFixed(3)));
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

function dimH(x1, x2, y, label, color = "#c45c26") {
  const mid = (x1 + x2) / 2;
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="1"/>
    <line x1="${x1}" y1="${y - 3}" x2="${x1}" y2="${y + 3}" stroke="${color}" stroke-width="1"/>
    <line x1="${x2}" y1="${y - 3}" x2="${x2}" y2="${y + 3}" stroke="${color}" stroke-width="1"/>
    <text x="${mid}" y="${y - 5}" text-anchor="middle" fill="${color}" font-size="9" font-weight="600">${label}</text>
  `;
}

function dimV(x, y1, y2, label, color = "#2f4a56", anchor = "start") {
  const mid = (y1 + y2) / 2;
  const tx = anchor === "end" ? x - 6 : x + 6;
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="1"/>
    <line x1="${x - 3}" y1="${y1}" x2="${x + 3}" y2="${y1}" stroke="${color}" stroke-width="1"/>
    <line x1="${x - 3}" y1="${y2}" x2="${x + 3}" y2="${y2}" stroke="${color}" stroke-width="1"/>
    <text x="${tx}" y="${mid + 3}" text-anchor="${anchor}" fill="${color}" font-size="9" font-weight="600">${label}</text>
  `;
}

function legendRow(items, y0) {
  const colW = 190;
  const x0 = 24;
  return items
    .map((it, i) => {
      const x = x0 + (i % 4) * colW;
      const y = y0 + Math.floor(i / 4) * 16;
      return `<text x="${x}" y="${y}" fill="${it.color}" font-size="9" font-weight="600">${it.label}</text>`;
    })
    .join("");
}

/**
 * @param {ReturnType<typeof import("./cone-mold-math.js").designConeMold>} r
 */
export function renderConeMoldDiagram(r) {
  if (!r?.ok) return "";

  const segments = r.segments;
  const joints = r.joints;
  const { moldHeight, faceToFace, expectedFaceToFace } = r.summary;
  const topA = r.input.topAllowance;
  const botA = r.input.bottomAllowance;

  const W = 780;
  const axis = 168;
  const maxOd = Math.max(...segments.map((s) => s.od));
  const scaleY = Math.min(0.48, 105 / (maxOd / 2));
  const plotLeft = 56;
  const plotRight = 700;
  const plotW = plotRight - plotLeft;
  const sumLen = segments.reduce((s, seg) => s + seg.length, 0) || 1;

  // 轴向按真实长度比例；径向按外径比例（示意，可压缩）
  const xs = [plotLeft];
  for (const seg of segments) {
    xs.push(xs[xs.length - 1] + (seg.length / sumLen) * plotW);
  }

  const yOd = (od) => axis - (od / 2) * scaleY;
  const yId = (od, wall) => axis - ((od - 2 * wall) / 2) * scaleY;

  // 外轮廓（上半 + 下半对称）
  const topPts = [];
  const botPts = [];
  for (let i = 0; i < segments.length; i++) {
    const od = segments[i].od;
    const y = yOd(od);
    topPts.push([xs[i], y], [xs[i + 1], y]);
    botPts.push([xs[i], 2 * axis - y], [xs[i + 1], 2 * axis - y]);
  }
  const pathOuter = [
    `M ${topPts[0][0]} ${topPts[0][1]}`,
    ...topPts.slice(1).map(([x, y]) => `L ${x} ${y}`),
    `L ${botPts[botPts.length - 1][0]} ${botPts[botPts.length - 1][1]}`,
    ...botPts
      .slice(0, -1)
      .reverse()
      .map(([x, y]) => `L ${x} ${y}`),
    "Z",
  ].join(" ");

  // 内孔折线（示意壁厚）
  const innerTop = [];
  for (let i = 0; i < segments.length; i++) {
    const y = yId(segments[i].od, segments[i].wall);
    innerTop.push([xs[i], y], [xs[i + 1], y]);
  }
  const pathInner = [
    `M ${innerTop[0][0]} ${innerTop[0][1]}`,
    ...innerTop.slice(1).map(([x, y]) => `L ${x} ${y}`),
    ...innerTop
      .slice()
      .reverse()
      .map(([x, y]) => `L ${x} ${2 * axis - y}`),
    "Z",
  ].join(" ");

  // 各节长度标注（上方错层，避免相邻太挤）
  const lenDims = segments
    .map((seg, i) => {
      const y = 48 + (i % 2) * 18;
      const color = seg.kind === "非标" ? "#8a5a2a" : "#c45c26";
      return dimH(xs[i], xs[i + 1], y, `L${seg.index} ${t(seg.length)}`, color);
    })
    .join("");

  // 段间螺纹标记（接头竖线 + 短标签）
  const jointMarks = joints
    .map((j, i) => {
      if (!j.ok) return "";
      const x = xs[i + 1];
      const yTop = yOd(Math.max(segments[i].od, segments[i + 1].od));
      const labelY = axis - 8 - (i % 2) * 12;
      return `
        <line x1="${x}" y1="${yTop - 4}" x2="${x}" y2="${2 * axis - yTop + 4}"
          stroke="#1f6f5b" stroke-width="1.2" stroke-dasharray="3 2"/>
        <text x="${x}" y="${labelY}" text-anchor="middle" fill="#1f6f5b" font-size="9" font-weight="700">${j.designation}</text>
      `;
    })
    .join("");

  // 上口 / 下口余量（在首末节内再画小段）
  const first = segments[0];
  const last = segments[segments.length - 1];
  const xTopFace = plotLeft + (topA / sumLen) * plotW;
  const xBotFace = plotRight - (botA / sumLen) * plotW;
  const allowMarks = `
    <line x1="${xTopFace}" y1="${yOd(first.od)}" x2="${xTopFace}" y2="${2 * axis - yOd(first.od)}"
      stroke="#2f4a56" stroke-width="1" stroke-dasharray="2 2"/>
    ${dimH(plotLeft, xTopFace, 88, `上口 ${t(topA)}`, "#2f4a56")}
    <line x1="${xBotFace}" y1="${yOd(last.od)}" x2="${xBotFace}" y2="${2 * axis - yOd(last.od)}"
      stroke="#2f4a56" stroke-width="1" stroke-dasharray="2 2"/>
    ${dimH(xBotFace, plotRight, 88, `下口 ${t(botA)}`, "#2f4a56")}
  `;

  // 总高 + 面距（图下方轴向）
  const overallDims = `
    ${dimH(plotLeft, plotRight, axis + 78, `模具总高 ${t(moldHeight)}`, "#2f4a56")}
    ${dimH(xTopFace, xBotFace, axis + 98, `面距 ${t(faceToFace)}（期望 ${t(expectedFaceToFace)}）`, "#1f6f5b")}
  `;

  // 节号 + φ 短标在轴线上（不放径向数字，避免挤）
  const segLabels = segments
    .map((seg, i) => {
      const mid = (xs[i] + xs[i + 1]) / 2;
      return `<text x="${mid}" y="${axis + 14}" text-anchor="middle" fill="#5c6b64" font-size="9">φ${t(seg.od)}</text>`;
    })
    .join("");

  const legendItems = [
    ...segments.map((s) => ({
      label: `第${s.index}节 φ${t(s.od)}×${t(s.length)}（${s.kind}）`,
      color: s.kind === "非标" ? "#8a5a2a" : "#2f4a56",
    })),
    ...joints
      .filter((j) => j.ok)
      .map((j) => ({
        label: `接头${j.index} ${j.designation}（φ${t(j.fromOd)}→φ${t(j.toOd)}）`,
        color: "#1f6f5b",
      })),
    { label: `上口余量 ${t(topA)}（计入大节）`, color: "#2f4a56" },
    { label: `下口余量 ${t(botA)}（计入小节）`, color: "#2f4a56" },
  ];

  const legendRows = Math.ceil(legendItems.length / 4);
  const H = axis + 118 + legendRows * 16 + 12;

  // 左右端径向示意（仅两端画短竖尺，数字进图例）
  const leftOdY = yOd(first.od);
  const rightOdY = yOd(last.od);
  const endOdTicks = `
    ${dimV(plotLeft - 14, leftOdY, 2 * axis - leftOdY, `φ${t(first.od)}`, "#5c6b64", "end")}
    ${dimV(plotRight + 14, rightOdY, 2 * axis - rightOdY, `φ${t(last.od)}`, "#5c6b64", "start")}
  `;

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="锥管模具组装后示意图">
    <defs>
      <linearGradient id="coneFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d7e4de"/><stop offset="100%" stop-color="#b7ccc3"/>
      </linearGradient>
    </defs>
    <text x="20" y="18" fill="#2f4a56" font-size="12" font-weight="700">组装后示意图 · φ${t(r.input.bigOd)} → φ${t(r.input.smallOd)}</text>
    <text x="20" y="34" fill="#5c6b64" font-size="9">左=上口大端 → 右=下口小端（各节已拧合；轴向按实长比例；径向示意）</text>

    <path d="${pathOuter}" fill="url(#coneFill)" stroke="#2f4a56" stroke-width="1.3"/>
    <path d="${pathInner}" fill="#f7faf8" stroke="#93a09a" stroke-width="0.9" stroke-dasharray="3 2" opacity="0.95"/>
    <line x1="${plotLeft - 8}" y1="${axis}" x2="${plotRight + 10}" y2="${axis}" stroke="#5c6b64" stroke-dasharray="4 3"/>

    ${lenDims}
    ${allowMarks}
    ${jointMarks}
    ${segLabels}
    ${endOdTicks}
    ${overallDims}

    ${legendRow(legendItems, axis + 118)}
  </svg>`;
}

/** 别名：组装后示意图（app 入口） */
export const renderAssembledConeDiagram = renderConeMoldDiagram;
