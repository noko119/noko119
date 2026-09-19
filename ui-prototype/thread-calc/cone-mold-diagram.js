/**
 * 组装示意图：绿色连续内锥 + 彩色外套分段
 * - 右侧竖列：自动选出的管子外径（箭头贴外圆）
 * - 节间：安装止口按螺纹/退刀槽自动高度标注
 */

function t(n) {
  const s = String(Number(Number(n).toFixed(3)));
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

function dimV(x, y1, y2, label, color = "#2f4a56") {
  const mid = (y1 + y2) / 2;
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="1"/>
    <line x1="${x - 3}" y1="${y1}" x2="${x + 3}" y2="${y1}" stroke="${color}" stroke-width="1"/>
    <line x1="${x - 3}" y1="${y2}" x2="${x + 3}" y2="${y2}" stroke="${color}" stroke-width="1"/>
    <text x="${x - 6}" y="${mid + 3}" text-anchor="end" fill="${color}" font-size="9" font-weight="600">${label}</text>
  `;
}

const SLEEVE_COLORS = ["#c45c5c", "#6ab0c9", "#8a6bb8", "#c49a6c", "#5cbf8a"];

export function renderConeMoldDiagram(r) {
  if (!r?.ok || !r.sleeves?.length) return "";

  const sleeves = r.sleeves;
  const cone = r.cone;
  const joints = (r.joints || []).filter((j) => j.ok);
  const Htot = r.summary.totalHeight;
  const topA = r.input.topAllowance;
  const botA = r.input.bottomAllowance;
  const locatorH0 = r.summary.locator ?? joints[0]?.locator ?? 10;
  const engage0 = r.summary.engage ?? 12;
  const undercut0 = r.summary.undercut ?? 4;

  const W = 1040;
  const padT = 72;
  const plotH = 520;
  const axis = 300;
  const scaleY = plotH / Htot;
  const maxOut = Math.max(...sleeves.map((s) => s.outerOd), cone.topDia);
  const scaleR = Math.min(1.15, 140 / (maxOut / 2));

  const yAt = (z) => padT + z * scaleY;
  const xR = (d) => (d / 2) * scaleR;

  const y0 = yAt(0);
  const yH = yAt(Htot);
  const yCone0 = yAt(cone.z0);
  const yCone1 = yAt(cone.z1);

  const coneWall = Math.max(6, r.input.wall * 0.35);
  const cTop = cone.topDia;
  const cBot = cone.bottomDia;
  const iTop = Math.max(cTop - 2 * coneWall, cBot * 0.5);
  const iBot = Math.max(cBot - 2 * coneWall, 20);

  const odBanner = `
    <rect x="16" y="8" width="${W - 32}" height="52" rx="10" fill="#fff4e8" stroke="#c45c26" stroke-width="2"/>
    <text x="28" y="30" fill="#8a2e0e" font-size="14" font-weight="800">管子外径（自动）· 安装止口高 ${t(locatorH0)}（退刀槽${t(undercut0)}+½旋合${t(engage0)}）</text>
    <text x="28" y="50" fill="#2f4a56" font-size="13" font-weight="700">${sleeves
      .map((s) => `套${s.index}：ø${t(s.outerOd)}`)
      .join("　　")}　　接头 ${joints.map((j) => `止口${t(j.locator)}`).join(" / ")}</text>
  `;

  const green = `
    <path d="
      M ${axis - xR(cTop)} ${yCone0}
      L ${axis - xR(cBot)} ${yCone1}
      L ${axis - xR(iBot)} ${yCone1}
      L ${axis - xR(iTop)} ${yCone0}
      Z" fill="#3d9b5f" stroke="#2f4a56" stroke-width="1.1"/>
    <path d="
      M ${axis + xR(cTop)} ${yCone0}
      L ${axis + xR(cBot)} ${yCone1}
      L ${axis + xR(iBot)} ${yCone1}
      L ${axis + xR(iTop)} ${yCone0}
      Z" fill="#3d9b5f" stroke="#2f4a56" stroke-width="1.1"/>
    <line x1="${axis - xR(cTop)}" y1="${yCone0}" x2="${axis - xR(cBot)}" y2="${yCone1}"
      stroke="#e67e22" stroke-width="2"/>
    <line x1="${axis + xR(cTop)}" y1="${yCone0}" x2="${axis + xR(cBot)}" y2="${yCone1}"
      stroke="#e67e22" stroke-width="2"/>
  `;

  const maxOutR = xR(maxOut);
  // 外径箭头图尺寸
  const ARROW_L = 10;
  const ARROW_W = 5.5;
  const labelColX = axis + maxOutR + 78;
  const labelBoxW = 220;
  const dimColor = "#c45c26";
  const locColor = "#1f6f5b";

  const jointByZ = new Map(joints.map((j) => [j.z, j]));

  const sleevePaths = sleeves
    .map((s, i) => {
      const color = SLEEVE_COLORS[i % SLEEVE_COLORS.length];
      const yA = yAt(s.z0);
      const yB = yAt(s.z1);
      const out = xR(s.outerOd);
      const innA = xR(s.coneAtTop);
      const innB = xR(s.coneAtBot);
      const xWall = axis + out;
      const right = `M ${axis + innA} ${yA} L ${xWall} ${yA} L ${xWall} ${yB} L ${axis + innB} ${yB} Z`;
      const left = `M ${axis - innA} ${yA} L ${axis - out} ${yA} L ${axis - out} ${yB} L ${axis - innB} ${yB} Z`;

      let lip = "";
      let locatorCallout = "";
      if (s.femaleSleeve && i < sleeves.length - 1) {
        const next = sleeves[i + 1];
        const joint = jointByZ.get(next.z0) || joints[i];
        const locH = joint?.locatorDim?.height ?? joint?.locator ?? locatorH0;
        const locWall = joint?.locatorDim?.wall ?? 5;
        const nest = Math.max(8, locH * scaleY); // 按真实止口高缩放
        const lipIn = Math.max(out - xR(locWall * 2), xR(next.outerOd) + 1);
        lip = `
          <path d="M ${axis + lipIn} ${yB} L ${xWall} ${yB} L ${xWall} ${yB + nest} L ${axis + lipIn} ${yB + nest} Z"
            fill="${color}" stroke="#2f4a56" stroke-width="1" opacity="0.95"/>
          <path d="M ${axis - lipIn} ${yB} L ${axis - out} ${yB} L ${axis - out} ${yB + nest} L ${axis - lipIn} ${yB + nest} Z"
            fill="${color}" stroke="#2f4a56" stroke-width="1" opacity="0.95"/>
        `;
        // 箭头指向止口底面（安装止口肩）
        const faceY = yB + nest;
        const tipX = axis + (xWall + axis + lipIn) / 2;
        const shaft1 = tipX + 52;
        locatorCallout = `
          <line x1="${axis + lipIn}" y1="${faceY}" x2="${xWall}" y2="${faceY}"
            stroke="${locColor}" stroke-width="1.4"/>
          <path d="M ${tipX} ${faceY} L ${tipX + 9} ${faceY - 5} L ${tipX + 9} ${faceY + 5} Z" fill="${locColor}"/>
          <line x1="${tipX + 9}" y1="${faceY}" x2="${shaft1}" y2="${faceY}" stroke="${locColor}" stroke-width="1.4"/>
          <rect x="${shaft1 + 2}" y="${faceY - 22}" width="118" height="44" rx="6"
            fill="#ffffff" stroke="${locColor}" stroke-width="1.6"/>
          <text x="${shaft1 + 10}" y="${faceY - 4}" fill="${locColor}" font-size="13" font-weight="900">止口 ${t(locH)}</text>
          <text x="${shaft1 + 10}" y="${faceY + 14}" fill="#2f4a56" font-size="10" font-weight="600">壁${t(locWall)} · 自动</text>
        `;
      }

      const yMid = (yA + yB) / 2;
      const boxH = 46;
      const tipX = xWall;
      const shaft0 = tipX + ARROW_L;
      const shaft1 = labelColX - 6;
      const odCallout = `
        <path d="M ${tipX} ${yMid} L ${tipX + ARROW_L} ${yMid - ARROW_W} L ${tipX + ARROW_L} ${yMid + ARROW_W} Z"
          fill="${dimColor}"/>
        <line x1="${shaft0}" y1="${yMid}" x2="${shaft1}" y2="${yMid}"
          stroke="${dimColor}" stroke-width="1.5"/>
        <line x1="${xWall}" y1="${yMid - 12}" x2="${xWall}" y2="${yMid + 12}"
          stroke="${dimColor}" stroke-width="1" opacity="0.85"/>
        <rect x="${labelColX}" y="${yMid - boxH / 2}" width="${labelBoxW}" height="${boxH}"
          rx="8" fill="#ffffff" stroke="${dimColor}" stroke-width="2"/>
        <text x="${labelColX + 14}" y="${yMid - 5}" fill="${dimColor}" font-size="17" font-weight="900">ø${t(s.outerOd)}</text>
        <text x="${labelColX + 14}" y="${yMid + 14}" fill="#2f4a56" font-size="11" font-weight="700">套${s.index} 管子外径</text>
      `;

      return `
        <path d="${right}" fill="${color}" fill-opacity="0.72" stroke="#2f4a56" stroke-width="1.15"/>
        <path d="${left}" fill="${color}" fill-opacity="0.72" stroke="#2f4a56" stroke-width="1.15"/>
        ${lip}
        ${locatorCallout}
        ${odCallout}
      `;
    })
    .join("");

  const jointLabels = joints
    .map((j) => {
      const y = yAt(j.z);
      const stack = (j.jointStack || []).map((x) => `${x.name}${x.h}`).join("+");
      const formula = j.locatorDim?.formula ? ` · ${j.locatorDim.formula}` : "";
      return `
        <text x="24" y="${y - 2}" fill="#1f6f5b" font-size="9" font-weight="700">${j.designation}</text>
        <text x="24" y="${y + 11}" fill="#5c6b64" font-size="8">${stack}${formula}</text>
      `;
    })
    .join("");

  let dims = "";
  dims += dimV(86, y0, yH, `总高 ${t(Htot)}`, "#2f4a56");
  dims += dimV(118, yCone0, yCone1, `锥段 ${t(cone.height)}`, "#1f6f5b");
  dims += dimV(150, y0, yCone0, `上 ${t(topA)}`, "#c45c26");
  dims += dimV(150, yCone1, yH, `下 ${t(botA)}`, "#c45c26");
  sleeves.forEach((s) => {
    dims += dimV(182, yAt(s.z0), yAt(s.z1), `${t(s.length)}`, "#8a5a2a");
  });

  const detail = renderJointDetail(20, yH + 28, joints[0], r.summary);

  const legendY = yH + 168;
  const items = [
    `内锥（绿）ø${t(cone.topDia)} → ø${t(cone.bottomDia)} · 高 ${t(cone.height)}`,
    ...sleeves.map((s) => `套${s.index} 管子外径 ø${t(s.outerOd)}（${s.pipeLabel || "自动"}）· ${t(s.length)}mm`),
    ...joints.map(
      (j) =>
        `接头${j.index} ${j.designation} · 止口${t(j.locator)}壁${t(j.locatorDim?.wall ?? "—")} @z=${t(j.z)}`
    ),
  ];
  const legend = items
    .map((label, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      return `<text x="${20 + col * 460}" y="${legendY + row * 16}" fill="#5c6b64" font-size="10" font-weight="600">${label}</text>`;
    })
    .join("");
  const H = legendY + Math.ceil(items.length / 2) * 16 + 20;

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="内锥加外套组装示意图（含管子外径与安装止口）">
    ${odBanner}
    <text x="20" y="${padT - 8}" fill="#2f4a56" font-size="12" font-weight="700">组装示意图 · 外径箭头右列对齐 · 绿箭头标安装止口底面</text>
    ${sleevePaths}
    ${green}
    ${jointLabels}
    ${dims}
    <text x="${axis}" y="${yCone0 - 8}" text-anchor="middle" fill="#e67e22" font-size="11" font-weight="800">锥上口 ø${t(cone.topDia)}</text>
    <text x="${axis}" y="${yH + 16}" text-anchor="middle" fill="#e67e22" font-size="11" font-weight="800">锥下口 ø${t(cone.bottomDia)}</text>
    <line x1="${axis}" y1="${y0}" x2="${axis}" y2="${yH}" stroke="#9aa8a1" stroke-dasharray="4 3"/>
    ${detail}
    ${legend}
  </svg>`;
}

function renderJointDetail(x0, y0, joint, summary) {
  const loc = joint?.locator ?? summary?.locator ?? 10;
  const eng = joint?.engage ?? summary?.engage ?? 12;
  const und = joint?.locatorDim?.undercut ?? summary?.undercut ?? 4;
  const wall = joint?.locatorDim?.wall ?? 5;
  const stack = joint?.jointStack?.map((x) => `${x.name}${x.h}`).join("+") || `${eng}+1+${loc}+1`;
  const formula = joint?.locatorDim?.formula || summary?.locatorFormula || "";
  return `
  <g transform="translate(${x0},${y0})">
    <rect width="320" height="124" rx="8" fill="#fff" stroke="#2f4a56"/>
    <text x="10" y="16" fill="#2f4a56" font-size="10" font-weight="700">接头细节 · ${stack}</text>
    <path d="M24,28 L95,28 L95,70 L82,70 L82,52 L40,52 L40,70 L24,70 Z" fill="#c45c5c" stroke="#2f4a56"/>
    <path d="M40,40 L82,40 L78,100 L44,100 Z" fill="#3d9b5f" stroke="#2f4a56"/>
    <line x1="48" y1="40" x2="46" y2="100" stroke="#e67e22" stroke-width="1.6"/>
    <line x1="74" y1="40" x2="76" y2="100" stroke="#e67e22" stroke-width="1.6"/>
    <text x="108" y="40" fill="#c45c5c" font-size="9" font-weight="700">外套嵌套</text>
    <text x="108" y="56" fill="#5c6b64" font-size="8">旋合 ${t(eng)} · 间隙 1</text>
    <text x="108" y="70" fill="#1f6f5b" font-size="9" font-weight="800">安装止口 ${t(loc)} · 壁 ${t(wall)}</text>
    <text x="108" y="86" fill="#5c6b64" font-size="8">退刀槽 ${t(und)} → 止口=槽+½旋合</text>
    <text x="108" y="102" fill="#5c6b64" font-size="7">${formula}</text>
  </g>`;
}

export const renderAssembledConeDiagram = renderConeMoldDiagram;
