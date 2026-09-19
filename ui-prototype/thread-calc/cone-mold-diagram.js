/**
 * 组装示意图：绿色连续内锥 + 彩色外套分段
 * 节间局部剖面：止口 → 螺纹 → 退刀槽 → 肩间隙
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

function threadZigzag(xMajor, xMinor, y0, y1) {
  const h = Math.abs(y1 - y0);
  const n = Math.max(4, Math.round(h / 2.8));
  const dy = (y1 - y0) / n;
  let d = `M ${xMajor} ${y0}`;
  for (let i = 0; i < n; i++) {
    const yb = y0 + (i + 0.5) * dy;
    const yc = y0 + (i + 1) * dy;
    d += ` L ${xMinor} ${yb} L ${xMajor} ${yc}`;
  }
  return `<path d="${d}" fill="none" stroke="#2f4a56" stroke-width="1.1"/>`;
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

  const W = 1100;
  const padT = 72;
  const plotH = 520;
  const axis = 280;
  const scaleY = plotH / Htot;
  const maxOut = Math.max(...sleeves.map((s) => s.outerOd), cone.topDia);
  const scaleR = Math.min(1.2, 148 / (maxOut / 2));

  const yAt = (z) => padT + z * scaleY;
  const xR = (d) => (d / 2) * scaleR;
  const hY = (mm) => Math.max(3, mm * scaleY);
  const mirror = (x) => 2 * axis - x;

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
    <text x="28" y="30" fill="#8a2e0e" font-size="14" font-weight="800">管子外径（自动）· 节间剖面含 止口 / 螺纹 / 退刀槽</text>
    <text x="28" y="50" fill="#2f4a56" font-size="13" font-weight="700">${sleeves
      .map((s) => `套${s.index}：ø${t(s.outerOd)}`)
      .join("　　")}　　止口${t(locatorH0)} · 旋合${t(engage0)} · 退刀槽${t(undercut0)}</text>
  `;

  const green = `
    <path d="M ${axis - xR(cTop)} ${yCone0} L ${axis - xR(cBot)} ${yCone1} L ${axis - xR(iBot)} ${yCone1} L ${axis - xR(iTop)} ${yCone0} Z"
      fill="#3d9b5f" stroke="#2f4a56" stroke-width="1.1"/>
    <path d="M ${axis + xR(cTop)} ${yCone0} L ${axis + xR(cBot)} ${yCone1} L ${axis + xR(iBot)} ${yCone1} L ${axis + xR(iTop)} ${yCone0} Z"
      fill="#3d9b5f" stroke="#2f4a56" stroke-width="1.1"/>
    <line x1="${axis - xR(cTop)}" y1="${yCone0}" x2="${axis - xR(cBot)}" y2="${yCone1}" stroke="#e67e22" stroke-width="2"/>
    <line x1="${axis + xR(cTop)}" y1="${yCone0}" x2="${axis + xR(cBot)}" y2="${yCone1}" stroke="#e67e22" stroke-width="2"/>
  `;

  const maxOutR = xR(maxOut);
  const ARROW_L = 10;
  const ARROW_W = 5.5;
  const labelColX = axis + maxOutR + 100;
  const labelBoxW = 200;
  const dimColor = "#c45c26";

  // 外套光筒（底层）
  let sleeveBodies = sleeves
    .map((s, i) => {
      const color = SLEEVE_COLORS[i % SLEEVE_COLORS.length];
      const yA = yAt(s.z0);
      const yB = yAt(s.z1);
      const out = xR(s.outerOd);
      const innA = xR(s.coneAtTop);
      const innB = xR(s.coneAtBot);
      return `
        <path d="M ${axis + innA} ${yA} L ${axis + out} ${yA} L ${axis + out} ${yB} L ${axis + innB} ${yB} Z"
          fill="${color}" fill-opacity="0.5" stroke="#2f4a56" stroke-width="0.9"/>
        <path d="M ${axis - innA} ${yA} L ${axis - out} ${yA} L ${axis - out} ${yB} L ${axis - innB} ${yB} Z"
          fill="${color}" fill-opacity="0.5" stroke="#2f4a56" stroke-width="0.9"/>
      `;
    })
    .join("");

  // 节间局部：公颈（下→上）止口+螺纹+退刀槽，母腔包住
  let jointSvg = "";
  joints.forEach((joint, ji) => {
    const upper = sleeves[ji];
    const lower = sleeves[ji + 1];
    if (!upper || !lower) return;
    const uColor = SLEEVE_COLORS[ji % SLEEVE_COLORS.length];
    const lColor = SLEEVE_COLORS[(ji + 1) % SLEEVE_COLORS.length];

    const locH = joint.locator ?? locatorH0;
    const engH = joint.engage ?? engage0;
    const undH = joint.locatorDim?.undercut ?? undercut0;
    const gapFace = (joint.gaps && joint.gaps[0]) || 1;
    const major = joint.majorDia;
    const undDf = joint.undercutDf ?? major - 3;
    const minor = joint.crest?.internal ?? major - 2 * 1.083;

    const yLoc = hY(locH);
    const yEng = hY(engH);
    const yUnd = hY(undH);
    const yGap = hY(gapFace);

    // 公端肩 = 下套顶面；尖端向上：止口→螺纹→退刀槽→（肩间隙）→肩
    const yShoulder = yAt(lower.z0);
    const yUnd1 = yShoulder;
    const yEng1 = yUnd1 - yUnd;
    const yLoc1 = yEng1 - yEng;
    const yTip = yLoc1 - yLoc;
    const yFemaleBot = yShoulder - yGap;

    const xCone = axis + xR((upper.coneAtBot + lower.coneAtTop) / 2);
    const xOutU = axis + xR(upper.outerOd);
    const xOutL = axis + xR(lower.outerOd);
    const xMaj = axis + xR(major);
    const xMin = axis + xR(minor);
    const xUnd = axis + xR(undDf);
    const locOd = Math.min(lower.outerOd - 0.5, major + Math.max(4, (lower.outerOd - major) * 0.45));
    const xLoc = axis + xR(locOd);

    // 遮罩：擦掉接头区光筒
    const yMask0 = yTip - 3;
    const yMask1 = yShoulder + hY(10);
    const xMaskL = Math.min(xCone, mirror(Math.max(xOutU, xOutL)));
    const xMaskR = Math.max(xOutU, xOutL);
    const mask = `
      <rect x="${axis - (xMaskR - axis)}" y="${yMask0}"
        width="${2 * (xMaskR - axis)}" height="${yMask1 - yMask0}"
        fill="#eef3ef"/>
    `;

    // 母端局部（上套底）：外墙 + 止口内孔 + 螺纹内孔
    const femaleR = `
      M ${xCone} ${yMask0}
      L ${xOutU} ${yMask0}
      L ${xOutU} ${yFemaleBot}
      L ${xLoc + 1} ${yFemaleBot}
      L ${xLoc + 1} ${yTip}
      L ${xMaj + 1.5} ${yTip}
      L ${xMaj + 1.5} ${yEng1}
      L ${xCone} ${yEng1}
      Z`;
    const femaleL = `
      M ${mirror(xCone)} ${yMask0}
      L ${mirror(xOutU)} ${yMask0}
      L ${mirror(xOutU)} ${yFemaleBot}
      L ${mirror(xLoc + 1)} ${yFemaleBot}
      L ${mirror(xLoc + 1)} ${yTip}
      L ${mirror(xMaj + 1.5)} ${yTip}
      L ${mirror(xMaj + 1.5)} ${yEng1}
      L ${mirror(xCone)} ${yEng1}
      Z`;

    // 公端局部（下套顶）：止口→螺纹大径→退刀槽→外径肩→下延一点
    const maleR = `
      M ${xCone} ${yTip}
      L ${xLoc} ${yTip}
      L ${xLoc} ${yLoc1}
      L ${xMaj} ${yLoc1}
      L ${xMaj} ${yEng1}
      L ${xUnd} ${yEng1}
      L ${xUnd} ${yUnd1}
      L ${xOutL} ${yUnd1}
      L ${xOutL} ${yMask1}
      L ${xCone} ${yMask1}
      Z`;
    const maleL = `
      M ${mirror(xCone)} ${yTip}
      L ${mirror(xLoc)} ${yTip}
      L ${mirror(xLoc)} ${yLoc1}
      L ${mirror(xMaj)} ${yLoc1}
      L ${mirror(xMaj)} ${yEng1}
      L ${mirror(xUnd)} ${yEng1}
      L ${mirror(xUnd)} ${yUnd1}
      L ${mirror(xOutL)} ${yUnd1}
      L ${mirror(xOutL)} ${yMask1}
      L ${mirror(xCone)} ${yMask1}
      Z`;

    const callX = Math.max(xOutU, xOutL) + 8;
    const labelX = labelColX - 8;
    // 错开各接头标注，避免重叠
    const labelShift = ji * 14;

    jointSvg += `
      ${mask}
      <path d="${femaleR}" fill="${uColor}" fill-opacity="0.88" stroke="#2f4a56" stroke-width="1.2"/>
      <path d="${femaleL}" fill="${uColor}" fill-opacity="0.88" stroke="#2f4a56" stroke-width="1.2"/>
      <path d="${maleR}" fill="${lColor}" fill-opacity="0.88" stroke="#2f4a56" stroke-width="1.2"/>
      <path d="${maleL}" fill="${lColor}" fill-opacity="0.88" stroke="#2f4a56" stroke-width="1.2"/>
      <rect x="${xUnd}" y="${yEng1}" width="${Math.max(2, xOutL - xUnd)}" height="${yUnd}"
        fill="#1a1a1a" fill-opacity="0.2" stroke="#2f4a56" stroke-width="0.7"/>
      <rect x="${mirror(xOutL)}" y="${yEng1}" width="${Math.max(2, xOutL - xUnd)}" height="${yUnd}"
        fill="#1a1a1a" fill-opacity="0.2" stroke="#2f4a56" stroke-width="0.7"/>
      ${threadZigzag(xMaj, xMin, yLoc1, yEng1)}
      ${threadZigzag(mirror(xMaj), mirror(xMin), yLoc1, yEng1)}
      <line x1="${xLoc}" y1="${(yTip + yLoc1) / 2}" x2="${labelX}" y2="${(yTip + yLoc1) / 2 + labelShift}"
        stroke="#1f6f5b" stroke-width="1.15"/>
      <text x="${labelX + 4}" y="${(yTip + yLoc1) / 2 + labelShift + 4}" fill="#1f6f5b" font-size="11" font-weight="800">止口 ${t(locH)}</text>
      <line x1="${xMaj}" y1="${(yLoc1 + yEng1) / 2}" x2="${labelX}" y2="${(yLoc1 + yEng1) / 2 + labelShift}"
        stroke="#8a2e0e" stroke-width="1.15"/>
      <text x="${labelX + 4}" y="${(yLoc1 + yEng1) / 2 + labelShift + 4}" fill="#8a2e0e" font-size="11" font-weight="800">螺纹 ${joint.designation} · ${t(engH)}</text>
      <line x1="${xUnd}" y1="${(yEng1 + yUnd1) / 2}" x2="${labelX}" y2="${(yEng1 + yUnd1) / 2 + labelShift}"
        stroke="#5c6b64" stroke-width="1.15"/>
      <text x="${labelX + 4}" y="${(yEng1 + yUnd1) / 2 + labelShift + 4}" fill="#5c6b64" font-size="11" font-weight="700">退刀槽 ${t(undH)}</text>
      <line x1="${callX}" y1="${(yUnd1 + yShoulder) / 2}" x2="${callX + 36}" y2="${(yUnd1 + yShoulder) / 2}"
        stroke="#c45c26" stroke-width="1" stroke-dasharray="3 2"/>
      <text x="${callX + 40}" y="${(yUnd1 + yShoulder) / 2 + 3}" fill="#c45c26" font-size="9" font-weight="700">间隙${t(gapFace)}</text>
    `;
  });

  const odCallouts = sleeves
    .map((s) => {
      const yMid = (yAt(s.z0) + yAt(s.z1)) / 2;
      const xWall = axis + xR(s.outerOd);
      const boxH = 42;
      return `
        <path d="M ${xWall} ${yMid} L ${xWall + ARROW_L} ${yMid - ARROW_W} L ${xWall + ARROW_L} ${yMid + ARROW_W} Z" fill="${dimColor}"/>
        <line x1="${xWall + ARROW_L}" y1="${yMid}" x2="${labelColX - 6}" y2="${yMid}" stroke="${dimColor}" stroke-width="1.4"/>
        <rect x="${labelColX}" y="${yMid - boxH / 2}" width="${labelBoxW}" height="${boxH}"
          rx="8" fill="#ffffff" stroke="${dimColor}" stroke-width="2"/>
        <text x="${labelColX + 12}" y="${yMid - 3}" fill="${dimColor}" font-size="16" font-weight="900">ø${t(s.outerOd)}</text>
        <text x="${labelColX + 12}" y="${yMid + 14}" fill="#2f4a56" font-size="11" font-weight="700">套${s.index} 管子外径</text>
      `;
    })
    .join("");

  let dims = "";
  dims += dimV(78, y0, yH, `总高 ${t(Htot)}`, "#2f4a56");
  dims += dimV(110, yCone0, yCone1, `锥段 ${t(cone.height)}`, "#1f6f5b");
  dims += dimV(142, y0, yCone0, `上 ${t(topA)}`, "#c45c26");
  dims += dimV(142, yCone1, yH, `下 ${t(botA)}`, "#c45c26");
  sleeves.forEach((s) => {
    dims += dimV(174, yAt(s.z0), yAt(s.z1), `${t(s.length)}`, "#8a5a2a");
  });

  const detail = renderJointDetail(16, yH + 28, joints[0], r.summary);
  const legendY = yH + 230;
  const items = [
    `内锥 ø${t(cone.topDia)}→ø${t(cone.bottomDia)} · ${t(cone.height)}mm`,
    ...sleeves.map((s) => `套${s.index} ø${t(s.outerOd)} · ${t(s.length)}mm`),
    ...joints.map(
      (j) =>
        `接头${j.index} ${j.designation}：止口${t(j.locator)}+螺纹${t(j.engage)}+退刀槽${t(j.locatorDim?.undercut ?? undercut0)}`
    ),
  ];
  const legend = items
    .map((label, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      return `<text x="${20 + col * 500}" y="${legendY + row * 16}" fill="#5c6b64" font-size="10" font-weight="600">${label}</text>`;
    })
    .join("");
  const H = legendY + Math.ceil(items.length / 2) * 16 + 24;

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="锥管模具组装示意图（止口·螺纹·退刀槽）">
    ${odBanner}
    <text x="20" y="${padT - 8}" fill="#2f4a56" font-size="12" font-weight="700">组装示意图 · 节间：①止口 ②螺纹旋合 ③退刀槽 ④肩间隙</text>
    ${sleeveBodies}
    ${jointSvg}
    ${green}
    ${odCallouts}
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
  const gap = (joint?.gaps && joint.gaps[0]) || 1;
  const des = joint?.designation || "M×××2";
  const formula = joint?.locatorDim?.formula || summary?.locatorFormula || "";
  const maj = joint?.majorDia ?? 190;
  const undDf = joint?.undercutDf ?? maj - 3;
  const minor = joint?.crest?.internal ?? maj - 2.2;

  const s = 2.35;
  const ax = 64;
  const yTip = 34;
  const yLoc1 = yTip + loc * s;
  const yEng1 = yLoc1 + eng * s;
  const yUnd1 = yEng1 + und * s;
  const ySh = yUnd1 + gap * s;
  const xCone = ax + 16;
  const xMin = ax + 32;
  const xMaj = ax + 40;
  const xLoc = ax + 50;
  const xUnd = ax + 36;
  const xOutL = ax + 60;
  const xOutU = ax + 76;

  const female = `M ${xCone} 26 L ${xOutU} 26 L ${xOutU} ${ySh - gap * s} L ${xLoc + 2} ${ySh - gap * s} L ${xLoc + 2} ${yTip - 1} L ${xMaj + 3} ${yTip - 1} L ${xMaj + 3} ${yEng1} L ${xCone} ${yEng1} Z`;
  const male = `M ${xCone} ${yTip} L ${xLoc} ${yTip} L ${xLoc} ${yLoc1} L ${xMaj} ${yLoc1} L ${xMaj} ${yEng1} L ${xUnd} ${yEng1} L ${xUnd} ${yUnd1} L ${xOutL} ${yUnd1} L ${xOutL} ${ySh + 40} L ${xCone} ${ySh + 40} Z`;

  return `
  <g transform="translate(${x0},${y0})">
    <rect width="560" height="188" rx="8" fill="#fff" stroke="#2f4a56"/>
    <text x="12" y="18" fill="#2f4a56" font-size="12" font-weight="800">接头剖面放大 · ${des} · 止口${t(loc)} + 旋合${t(eng)} + 退刀槽${t(und)} + 间隙${t(gap)}</text>
    <path d="${female}" fill="#c45c5c" fill-opacity="0.8" stroke="#2f4a56"/>
    <path d="${male}" fill="#8a6bb8" fill-opacity="0.85" stroke="#2f4a56"/>
    <rect x="${xUnd}" y="${yEng1}" width="${xOutL - xUnd}" height="${und * s}" fill="#2f4a56" fill-opacity="0.25"/>
    ${threadZigzag(xMaj, xMin, yLoc1, yEng1)}
    <path d="M ${xCone - 10} 26 L ${xCone - 10} ${ySh + 40} L ${xCone} ${ySh + 40} L ${xCone} 26 Z" fill="#3d9b5f" stroke="#2f4a56"/>
    <line x1="${xCone}" y1="26" x2="${xCone}" y2="${ySh + 40}" stroke="#e67e22" stroke-width="2"/>

    <line x1="${xOutU + 4}" y1="${(yTip + yLoc1) / 2}" x2="220" y2="${(yTip + yLoc1) / 2}" stroke="#1f6f5b"/>
    <text x="224" y="${(yTip + yLoc1) / 2 + 4}" fill="#1f6f5b" font-size="12" font-weight="800">① 止口 ${t(loc)} mm（公端先导入）</text>
    <line x1="${xMaj + 2}" y1="${(yLoc1 + yEng1) / 2}" x2="220" y2="${(yLoc1 + yEng1) / 2}" stroke="#8a2e0e"/>
    <text x="224" y="${(yLoc1 + yEng1) / 2 + 4}" fill="#8a2e0e" font-size="12" font-weight="800">② 螺纹 ${des} · 有效旋合 ${t(eng)} mm</text>
    <line x1="${xUnd}" y1="${(yEng1 + yUnd1) / 2}" x2="220" y2="${(yEng1 + yUnd1) / 2}" stroke="#5c6b64"/>
    <text x="224" y="${(yEng1 + yUnd1) / 2 + 4}" fill="#5c6b64" font-size="12" font-weight="800">③ 退刀槽 ${t(und)} mm · df≈${t(undDf)}</text>
    <line x1="${xOutL}" y1="${(yUnd1 + ySh) / 2}" x2="220" y2="${(yUnd1 + ySh) / 2}" stroke="#c45c26"/>
    <text x="224" y="${(yUnd1 + ySh) / 2 + 4}" fill="#c45c26" font-size="12" font-weight="800">④ 肩部装配间隙 ${t(gap)} mm</text>
    <text x="224" y="178" fill="#5c6b64" font-size="10">${formula} · 牙底/牙顶示意非精确牙型</text>
  </g>`;
}

export const renderAssembledConeDiagram = renderConeMoldDiagram;
