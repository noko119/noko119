/**
 * 组装示意图：绿色连续内锥 + 彩色外套分段
 *
 * 节间公/母扣剖面（与 pipe-end-diagram / CAD 一致）：
 *   公扣（下套颈向上，尖端在上）：止口 → 外螺纹 → 外退刀槽(df) → 台肩
 *   母扣（上套孔口在下）：止口接收 → 内螺纹 → 内退刀槽(Dg)
 * 退刀槽是牙底处的小矩形槽，不是整段外壁台阶。
 */

function t(n) {
  const s = String(Number(Number(n).toFixed(3)));
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

function dimV(x, y1, y2, label, color = "#2f4a56", prefer = "auto") {
  const top = Math.min(y1, y2);
  const bot = Math.max(y1, y2);
  const mid = (top + bot) / 2;
  const h = bot - top;
  // 过短段：数字放到线段外侧，避免与相邻尺寸挤在一起
  if (h < 28) {
    let yLab;
    if (prefer === "above") yLab = top - 3;
    else if (prefer === "below") yLab = bot + 12;
    else yLab = mid < 280 ? top - 3 : bot + 12;
    return `
      <line x1="${x}" y1="${top}" x2="${x}" y2="${bot}" stroke="${color}" stroke-width="1"/>
      <line x1="${x - 4}" y1="${top}" x2="${x + 4}" y2="${top}" stroke="${color}" stroke-width="1"/>
      <line x1="${x - 4}" y1="${bot}" x2="${x + 4}" y2="${bot}" stroke="${color}" stroke-width="1"/>
      <text x="${x - 10}" y="${yLab}" text-anchor="end" fill="${color}" font-size="10" font-weight="700">${label}</text>
    `;
  }
  return `
    <line x1="${x}" y1="${top}" x2="${x}" y2="${bot}" stroke="${color}" stroke-width="1"/>
    <line x1="${x - 4}" y1="${top}" x2="${x + 4}" y2="${top}" stroke="${color}" stroke-width="1"/>
    <line x1="${x - 4}" y1="${bot}" x2="${x + 4}" y2="${bot}" stroke="${color}" stroke-width="1"/>
    <text x="${x - 10}" y="${mid + 4}" text-anchor="end" fill="${color}" font-size="11" font-weight="700">${label}</text>
  `;
}

/** 外螺纹牙型（大径↔小径） */
function extThreadZig(xMaj, xMin, y0, y1) {
  const n = Math.max(5, Math.round(Math.abs(y1 - y0) / 2.6));
  const dy = (y1 - y0) / n;
  let d = `M ${xMaj} ${y0}`;
  for (let i = 0; i < n; i++) {
    d += ` L ${xMin} ${y0 + (i + 0.5) * dy} L ${xMaj} ${y0 + (i + 1) * dy}`;
  }
  return `<path d="${d}" fill="none" stroke="#1f6f5b" stroke-width="1.15"/>`;
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

  const W = 1280;
  const bannerH = 68;
  const padT = 108; // 顶栏与图形拉开，避免压到锥上口
  const plotH = 520;
  const axis = 340; // 给左侧尺寸列留足空位
  const scaleY = plotH / Htot;
  const maxOut = Math.max(...sleeves.map((s) => s.outerOd), cone.topDia);
  const scaleR = Math.min(1.08, 128 / (maxOut / 2));

  const yAt = (z) => padT + z * scaleY;
  const xR = (d) => (d / 2) * scaleR;
  const hY = (mm) => Math.max(3.2, mm * scaleY);
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

  // 顶栏：两行固定行距（baseline 相差 ≥22），不再另起副标题叠在图形上
  const odBanner = `
    <rect x="16" y="8" width="${W - 32}" height="${bannerH}" rx="10" fill="#fff4e8" stroke="#c45c26" stroke-width="2"/>
    <text x="28" y="32" fill="#8a2e0e" font-size="13" font-weight="800">${sleeves
      .map((s) => `套${s.index}：ø${t(s.outerOd)}`)
      .join("　　")}　　止口${t(locatorH0)} · 旋合${t(engage0)} · 退刀槽${t(undercut0)}</text>
    <text x="28" y="58" fill="#2f4a56" font-size="12" font-weight="600">公扣：止口→外螺纹→外退刀槽(df)　·　母扣：止口接收→内螺纹→内退刀槽(Dg)</text>
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
  // 右两列：先外径竖列，再接头卡（折线引线绕开外径字）
  const labelColX = axis + maxOutR + 36;
  const labelBoxW = 160;
  const jointCardX = labelColX + labelBoxW + 32;
  const jointCardW = 200;
  const dimColor = "#c45c26";
  const LINE_H = 22;
  const CARD_PAD = 14;
  const CARD_GAP = 16;

  // 外套光筒
  const sleeveBodies = sleeves
    .map((s, i) => {
      const color = SLEEVE_COLORS[i % SLEEVE_COLORS.length];
      const yA = yAt(s.z0);
      const yB = yAt(s.z1);
      const out = xR(s.outerOd);
      const innA = xR(s.coneAtTop);
      const innB = xR(s.coneAtBot);
      return `
        <path d="M ${axis + innA} ${yA} L ${axis + out} ${yA} L ${axis + out} ${yB} L ${axis + innB} ${yB} Z"
          fill="${color}" fill-opacity="0.48" stroke="#2f4a56" stroke-width="0.85"/>
        <path d="M ${axis - innA} ${yA} L ${axis - out} ${yA} L ${axis - out} ${yB} L ${axis - innB} ${yB} Z"
          fill="${color}" fill-opacity="0.48" stroke="#2f4a56" stroke-width="0.85"/>
      `;
    })
    .join("");

  // 先算接头几何与标注行，再统一排布卡片 Y，避免互压
  const jointParts = [];
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
    const minor = joint.crest?.internal ?? major - 2.166;
    const df = joint.undercutDf ?? major - 3; // 公扣槽底
    const dg = joint.undercutDg ?? major + 3; // 母扣槽底

    const yLoc = hY(locH);
    const yEng = hY(engH);
    const yUnd = hY(undH);
    const yGap = hY(gapFace);

    // 公台肩 = 下套顶；尖端向上：止口 → 螺纹 → 退刀槽 → 台肩
    const yShoulder = yAt(lower.z0);
    const yUnd1 = yShoulder; // 退刀槽落到台肩
    const yEng1 = yUnd1 - yUnd; // 螺纹下沿 = 退刀槽上沿
    const yLoc1 = yEng1 - yEng; // 止口下沿 = 螺纹上沿
    const yTip = yLoc1 - yLoc; // 公扣尖端
    const yFemaleBot = yShoulder - yGap; // 母扣孔口底面（肩间隙）

    const xCone = axis + xR((upper.coneAtBot + lower.coneAtTop) / 2);
    const xOutU = axis + xR(upper.outerOd);
    const xOutL = axis + xR(lower.outerOd);
    const xMaj = axis + xR(major);
    const xMin = axis + xR(minor);
    const xDf = axis + xR(df);
    const xDg = axis + xR(Math.min(dg, upper.outerOd - 2));
    // 止口外圆：介于大径与下套外径之间（导向圆柱）
    const locOd = Math.min(lower.outerOd - 1, Math.max(major + 2, major + (lower.outerOd - major) * 0.35));
    const xLoc = axis + xR(locOd);
    const xLocF = xLoc + 1.1; // 母止口内孔略大

    const yMask0 = yTip - 4;
    const yMask1 = yShoulder + hY(12);
    const xEdge = Math.max(xOutU, xOutL);
    const mask = `
      <rect x="${axis - (xEdge - axis)}" y="${yMask0}" width="${2 * (xEdge - axis)}"
        height="${yMask1 - yMask0}" fill="#eef3ef"/>
    `;

    /*
     * 公扣右半：尖端止口(xLoc) → 螺纹大径(xMaj) → 退刀槽底(xDf，内凹小槽) → 台肩外径(xOutL)
     * 槽是「牙侧内凹」，不是整壁削到外径。
     */
    const maleR = `
      M ${xCone} ${yTip}
      L ${xLoc} ${yTip}
      L ${xLoc} ${yLoc1}
      L ${xMaj} ${yLoc1}
      L ${xMaj} ${yEng1}
      L ${xDf} ${yEng1}
      L ${xDf} ${yUnd1}
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
      L ${mirror(xDf)} ${yEng1}
      L ${mirror(xDf)} ${yUnd1}
      L ${mirror(xOutL)} ${yUnd1}
      L ${mirror(xOutL)} ${yMask1}
      L ${mirror(xCone)} ${yMask1}
      Z`;

    /*
     * 母扣右半（对标 CAD）：
     * 尖端深处 = 止口接收（包住公止口）
     * 中段 = 内螺纹
     * 近台肩 = 内退刀槽 Dg（外扩小槽，与公 df 内凹相对）
     * 孔口底面与公台肩留间隙
     */
    const femaleR = `
      M ${xCone} ${yMask0}
      L ${xOutU} ${yMask0}
      L ${xOutU} ${yFemaleBot}
      L ${xDg} ${yFemaleBot}
      L ${xDg} ${yEng1}
      L ${xMin} ${yEng1}
      L ${xMin} ${yLoc1}
      L ${xLocF} ${yLoc1}
      L ${xLocF} ${yTip}
      L ${xCone} ${yTip}
      Z`;
    const femaleL = `
      M ${mirror(xCone)} ${yMask0}
      L ${mirror(xOutU)} ${yMask0}
      L ${mirror(xOutU)} ${yFemaleBot}
      L ${mirror(xDg)} ${yFemaleBot}
      L ${mirror(xDg)} ${yEng1}
      L ${mirror(xMin)} ${yEng1}
      L ${mirror(xMin)} ${yLoc1}
      L ${mirror(xLocF)} ${yLoc1}
      L ${mirror(xLocF)} ${yTip}
      L ${mirror(xCone)} ${yTip}
      Z`;

    // 退刀槽：公 df 内凹窄槽；母 Dg 外扩窄槽（同轴带 yEng1~yUnd1）
    const maleGrooveR = `
      <path d="M ${xMaj} ${yEng1} L ${xDf} ${yEng1} L ${xDf} ${yUnd1} L ${xMaj} ${yUnd1} Z"
        fill="#2f4a56" fill-opacity="0.38" stroke="#2f4a56" stroke-width="0.9"/>`;
    const maleGrooveL = `
      <path d="M ${mirror(xMaj)} ${yEng1} L ${mirror(xDf)} ${yEng1} L ${mirror(xDf)} ${yUnd1} L ${mirror(xMaj)} ${yUnd1} Z"
        fill="#2f4a56" fill-opacity="0.38" stroke="#2f4a56" stroke-width="0.9"/>`;
    const femGrooveR = `
      <path d="M ${xMaj} ${yEng1} L ${xDg} ${yEng1} L ${xDg} ${yUnd1} L ${xMaj} ${yUnd1} Z"
        fill="#8a2e0e" fill-opacity="0.22" stroke="#8a2e0e" stroke-width="0.85"/>`;
    const femGrooveL = `
      <path d="M ${mirror(xMaj)} ${yEng1} L ${mirror(xDg)} ${yEng1} L ${mirror(xDg)} ${yUnd1} L ${mirror(xMaj)} ${yUnd1} Z"
        fill="#8a2e0e" fill-opacity="0.22" stroke="#8a2e0e" stroke-width="0.85"/>`;

    // 接头标注：收成一张卡片，行距固定，避免叠字
    const rows = [
      { x: xLoc, y: (yTip + yLoc1) / 2, color: "#1f6f5b", text: `止口 ${t(locH)}` },
      { x: xMaj, y: (yLoc1 + yEng1) / 2, color: "#8a2e0e", text: `螺纹 ${joint.designation} · ${t(engH)}` },
      { x: xDf, y: (yEng1 + yUnd1) / 2, color: "#2f4a56", text: `退刀槽 ${t(undH)}  df${t(df)}/Dg${t(dg)}` },
      { x: xOutL, y: (yUnd1 + yFemaleBot) / 2, color: "#c45c26", text: `肩间隙 ${t(gapFace)}` },
    ];
    const cardH = CARD_PAD * 2 + rows.length * LINE_H + 18;
    // 优先落在接头中段旁（外径标注在套中段，纵向错开）
    const preferY = (yTip + yShoulder) / 2 - cardH / 2;

    jointParts.push({
      joint,
      uColor,
      lColor,
      mask,
      femaleR,
      femaleL,
      maleR,
      maleL,
      maleGrooveR,
      maleGrooveL,
      femGrooveR,
      femGrooveL,
      xMaj,
      xMin,
      yLoc1,
      yEng1,
      rows,
      cardH,
      preferY,
    });
  });

  // 自上而下排布卡片，保证间距 ≥ CARD_GAP
  let cardCursor = padT + 8;
  jointParts.forEach((p) => {
    let cardY = Math.max(p.preferY, cardCursor);
    // 勿压到图底详情区
    const maxY = yH - p.cardH - 8;
    if (cardY > maxY) cardY = Math.max(padT + 8, maxY);
    p.cardY = cardY;
    cardCursor = cardY + p.cardH + CARD_GAP;
  });

  // 外径卡片：若与邻套间距过近则上下微移，避免互压
  const odBoxH = 44;
  const odMids = sleeves.map((s) => (yAt(s.z0) + yAt(s.z1)) / 2);
  const odYs = odMids.slice();
  for (let i = 1; i < odYs.length; i++) {
    const minGap = odBoxH + 10;
    if (odYs[i] - odYs[i - 1] < minGap) {
      odYs[i] = odYs[i - 1] + minGap;
    }
  }

  /** 引线穿越外径列时的避让 Y（不穿过 ø 卡片） */
  const dodgeOdY = (y) => {
    const half = odBoxH / 2 + 8;
    let yy = y;
    for (let pass = 0; pass < 4; pass++) {
      let hit = false;
      for (const oy of odYs) {
        if (Math.abs(yy - oy) < half) {
          yy = yy < oy ? oy - half : oy + half;
          hit = true;
          break;
        }
      }
      if (!hit) break;
    }
    return yy;
  };

  let jointSvg = "";
  jointParts.forEach((p) => {
    const titleY = p.cardY + CARD_PAD + 14;
    const row0Y = titleY + LINE_H + 2;
    const clearX = labelColX - 10; // 外径列左侧
    const elbowX = labelColX + labelBoxW + 16; // 外径列右侧
    let leaders = "";
    let rowTexts = "";
    p.rows.forEach((row, ri) => {
      const ty = row0Y + ri * LINE_H;
      const by = dodgeOdY(row.y);
      leaders += `
        <path d="M ${row.x} ${row.y} L ${clearX} ${row.y} L ${clearX} ${by} L ${elbowX} ${by} L ${jointCardX - 2} ${ty - 3}"
          fill="none" stroke="${row.color}" stroke-width="1.05" opacity="0.85"/>
        <circle cx="${row.x}" cy="${row.y}" r="2.2" fill="${row.color}"/>`;
      rowTexts += `
        <text x="${jointCardX + 10}" y="${ty}" fill="${row.color}" font-size="11" font-weight="800">${row.text}</text>`;
    });

    jointSvg += `
      ${p.mask}
      <path d="${p.femaleR}" fill="${p.uColor}" fill-opacity="0.9" stroke="#2f4a56" stroke-width="1.15"/>
      <path d="${p.femaleL}" fill="${p.uColor}" fill-opacity="0.9" stroke="#2f4a56" stroke-width="1.15"/>
      <path d="${p.maleR}" fill="${p.lColor}" fill-opacity="0.9" stroke="#2f4a56" stroke-width="1.15"/>
      <path d="${p.maleL}" fill="${p.lColor}" fill-opacity="0.9" stroke="#2f4a56" stroke-width="1.15"/>
      ${p.maleGrooveR}${p.maleGrooveL}
      ${p.femGrooveR}${p.femGrooveL}
      ${extThreadZig(p.xMaj, p.xMin, p.yLoc1, p.yEng1)}
      ${extThreadZig(mirror(p.xMaj), mirror(p.xMin), p.yLoc1, p.yEng1)}
      ${leaders}
      <rect x="${jointCardX}" y="${p.cardY}" width="${jointCardW}" height="${p.cardH}"
        rx="8" fill="#ffffff" stroke="#2f4a56" stroke-width="1.4"/>
      <text x="${jointCardX + 10}" y="${titleY}" fill="#2f4a56" font-size="11" font-weight="900">接头${p.joint.index} · ${p.joint.designation}</text>
      ${rowTexts}
    `;
  });

  const odCallouts = sleeves
    .map((s, i) => {
      const yMid = odMids[i];
      const yBox = odYs[i];
      const xWall = axis + xR(s.outerOd);
      return `
        <path d="M ${xWall} ${yMid} L ${xWall + ARROW_L} ${yMid - ARROW_W} L ${xWall + ARROW_L} ${yMid + ARROW_W} Z" fill="${dimColor}"/>
        <path d="M ${xWall + ARROW_L} ${yMid} L ${labelColX - 10} ${yMid} L ${labelColX - 10} ${yBox} L ${labelColX - 6} ${yBox}"
          fill="none" stroke="${dimColor}" stroke-width="1.4"/>
        <rect x="${labelColX}" y="${yBox - odBoxH / 2}" width="${labelBoxW}" height="${odBoxH}"
          rx="8" fill="#fff" stroke="${dimColor}" stroke-width="2"/>
        <text x="${labelColX + 12}" y="${yBox - 2}" fill="${dimColor}" font-size="16" font-weight="900">ø${t(s.outerOd)}</text>
        <text x="${labelColX + 12}" y="${yBox + 15}" fill="#2f4a56" font-size="11" font-weight="700">套${s.index} 管子外径</text>
      `;
    })
    .join("");

  let dims = "";
  // 左侧尺寸列：列距 ≥48；文字锚在线左侧，避免压线
  dims += dimV(48, y0, yH, `总高 ${t(Htot)}`, "#2f4a56");
  dims += dimV(96, yCone0, yCone1, `锥段 ${t(cone.height)}`, "#1f6f5b");
  dims += dimV(144, y0, yCone0, `上 ${t(topA)}`, "#c45c26", "above");
  dims += dimV(144, yCone1, yH, `下 ${t(botA)}`, "#c45c26", "below");
  sleeves.forEach((s) => {
    const lab =
      s.maleEndLen > 0
        ? `${t(s.partLength)}(含公${t(s.maleEndLen)})`
        : `${t(s.partLength ?? s.length)}`;
    dims += dimV(192, yAt(s.z0), yAt(s.z1), lab, "#8a5a2a");
  });

  const detail = renderJointDetail(16, yH + 40, joints[0], r.summary);
  const legendY = yH + 288;
  const items = [
    `内锥 ø${t(cone.topDia)}→ø${t(cone.bottomDia)} · ${t(cone.height)}mm`,
    ...sleeves.map((s) => {
      const pl = s.partLength ?? s.length;
      const male = s.maleEndLen > 0 ? `含公扣${t(s.maleEndLen)}` : "无公扣";
      return `套${s.index} ø${t(s.outerOd)} · 总高${t(pl)}（${male}）· ${s.kind}`;
    }),
    ...joints.map(
      (j) =>
        `接头${j.index} ${j.designation}：止口${t(j.locator)}+螺纹${t(j.engage)}+退刀${t(j.locatorDim?.undercut ?? undercut0)}(df${t(j.undercutDf)}/Dg${t(j.undercutDg)})`
    ),
  ];
  const legend = items
    .map((label, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      return `<text x="${20 + col * 560}" y="${legendY + row * 18}" fill="#5c6b64" font-size="11" font-weight="600">${label}</text>`;
    })
    .join("");
  const H = legendY + Math.ceil(items.length / 2) * 18 + 28;

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="锥管模具组装示意图（公母扣·止口·螺纹·退刀槽）">
    ${odBanner}
    ${sleeveBodies}
    ${jointSvg}
    ${green}
    ${odCallouts}
    ${dims}
    <text x="${axis}" y="${yCone0 - 16}" text-anchor="middle" fill="#e67e22" font-size="12" font-weight="800">锥上口 ø${t(cone.topDia)}</text>
    <text x="${axis}" y="${yH + 24}" text-anchor="middle" fill="#e67e22" font-size="12" font-weight="800">锥下口 ø${t(cone.bottomDia)}</text>
    <line x1="${axis}" y1="${y0}" x2="${axis}" y2="${yH}" stroke="#9aa8a1" stroke-dasharray="4 3"/>
    ${detail}
    ${legend}
  </svg>`;
}

/** 放大：与 pipe-end-diagram 同序的公/母扣对接剖面 */
function renderJointDetail(x0, y0, joint, summary) {
  const loc = joint?.locator ?? summary?.locator ?? 10;
  const eng = joint?.engage ?? summary?.engage ?? 12;
  const und = joint?.locatorDim?.undercut ?? summary?.undercut ?? 4;
  const gap = (joint?.gaps && joint.gaps[0]) || 1;
  const des = joint?.designation || "M×××2";
  const maj = joint?.majorDia ?? 190;
  const min = joint?.crest?.internal ?? maj - 2.2;
  const df = joint?.undercutDf ?? maj - 3;
  const dg = joint?.undercutDg ?? maj + 3;
  const formula = joint?.locatorDim?.formula || summary?.locatorFormula || "";

  const s = 2.4;
  const ax = 58;
  const yTip = 32;
  const yLoc1 = yTip + loc * s;
  const yEng1 = yLoc1 + eng * s;
  const yUnd1 = yEng1 + und * s;
  const ySh = yUnd1 + gap * s;

  const xCone = ax + 14;
  const xDf = ax + 34;
  const xMin = ax + 38;
  const xMaj = ax + 44;
  const xDg = ax + 52;
  const xLoc = ax + 50;
  const xLocF = ax + 52;
  const xOutL = ax + 64;
  const xOutU = ax + 78;

  // 公：止口→螺纹→df槽→台肩
  const male = `M ${xCone} ${yTip} L ${xLoc} ${yTip} L ${xLoc} ${yLoc1} L ${xMaj} ${yLoc1} L ${xMaj} ${yEng1} L ${xDf} ${yEng1} L ${xDf} ${yUnd1} L ${xOutL} ${yUnd1} L ${xOutL} ${ySh + 44} L ${xCone} ${ySh + 44} Z`;
  // 母：深处止口 → 螺纹 → 近肩 Dg 槽 → 孔口底面（对标 CAD）
  const female = `M ${xCone} 22 L ${xOutU} 22 L ${xOutU} ${ySh} L ${xDg} ${ySh} L ${xDg} ${yEng1} L ${xMin} ${yEng1} L ${xMin} ${yLoc1} L ${xLocF} ${yLoc1} L ${xLocF} ${yTip} L ${xCone} ${yTip} Z`;

  // 右侧说明：固定行距 26，①～④ 不叠字
  const labelX = 228;
  const labelRows = [
    { fx: xLoc, fy: (yTip + yLoc1) / 2, color: "#1f6f5b", text: `① 止口 ${t(loc)} · 公尖端 ↔ 母接收` },
    { fx: xMaj, fy: (yLoc1 + yEng1) / 2, color: "#8a2e0e", text: `② 螺纹 ${des} · 旋合 ${t(eng)}` },
    { fx: xDf, fy: (yEng1 + yUnd1) / 2, color: "#2f4a56", text: `③ 公退刀槽 ${t(und)} · df ø${t(df)}（内凹）` },
    { fx: xDg, fy: (yEng1 + yUnd1) / 2, color: "#8a2e0e", text: `③′ 母退刀槽 ${t(und)} · Dg ø${t(dg)}（外扩）` },
    { fx: xOutL, fy: (yUnd1 + ySh) / 2, color: "#c45c26", text: `④ 台肩装配间隙 ${t(gap)}` },
  ];
  const labels = labelRows
    .map((row, i) => {
      const ty = 44 + i * 26;
      return `
        <line x1="${row.fx}" y1="${row.fy}" x2="${labelX - 6}" y2="${ty - 4}" stroke="${row.color}" stroke-width="1" opacity="0.75"/>
        <circle cx="${row.fx}" cy="${row.fy}" r="2" fill="${row.color}"/>
        <text x="${labelX}" y="${ty}" fill="${row.color}" font-size="12" font-weight="800">${row.text}</text>`;
    })
    .join("");

  return `
  <g transform="translate(${x0},${y0})">
    <rect width="620" height="228" rx="8" fill="#fff" stroke="#2f4a56"/>
    <text x="12" y="18" fill="#2f4a56" font-size="12" font-weight="800">接头剖面放大 · ${des} · 公：止口→螺纹→外退刀槽(df)　母：止口→内螺纹→内退刀槽(Dg)</text>
    <path d="${female}" fill="#c45c5c" fill-opacity="0.78" stroke="#2f4a56"/>
    <path d="${male}" fill="#8a6bb8" fill-opacity="0.88" stroke="#2f4a56"/>
    <path d="M ${xMaj} ${yEng1} L ${xDf} ${yEng1} L ${xDf} ${yUnd1} L ${xMaj} ${yUnd1} Z" fill="#2f4a56" fill-opacity="0.4" stroke="#2f4a56"/>
    <path d="M ${xMaj} ${yEng1} L ${xDg} ${yEng1} L ${xDg} ${yUnd1} L ${xMaj} ${yUnd1} Z" fill="#8a2e0e" fill-opacity="0.22" stroke="#8a2e0e"/>
    ${extThreadZig(xMaj, xMin, yLoc1, yEng1)}
    <path d="M ${xCone - 10} 22 L ${xCone - 10} ${ySh + 44} L ${xCone} ${ySh + 44} L ${xCone} 22 Z" fill="#3d9b5f" stroke="#2f4a56"/>
    <line x1="${xCone}" y1="22" x2="${xCone}" y2="${ySh + 44}" stroke="#e67e22" stroke-width="2"/>
    ${labels}
    <text x="${labelX}" y="210" fill="#5c6b64" font-size="10">${formula} · 退刀槽为牙根小矩形槽</text>
  </g>`;
}

export const renderAssembledConeDiagram = renderConeMoldDiagram;
