/**
 * 接管端头剖面尺寸标注图（公扣外螺纹 / 母扣内螺纹）
 */

function t(n) {
  const s = String(Number(Number(n).toFixed(3)));
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

function dimH(x1, x2, y, label, color = "#c45c26") {
  const mid = (x1 + x2) / 2;
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="1.2"/>
    <line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}" stroke="${color}" stroke-width="1.2"/>
    <line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}" stroke="${color}" stroke-width="1.2"/>
    <text x="${mid}" y="${y - 8}" text-anchor="middle" fill="${color}" font-size="12" font-weight="700">${label}</text>
  `;
}

function dimV(x, y1, y2, label, color = "#1f6f5b", align = "left") {
  const mid = (y1 + y2) / 2;
  const tx = align === "left" ? x - 6 : x + 8;
  const anchor = align === "left" ? "end" : "start";
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="1.2"/>
    <line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}" stroke="${color}" stroke-width="1.2"/>
    <line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}" stroke="${color}" stroke-width="1.2"/>
    <text x="${tx}" y="${mid + 4}" text-anchor="${anchor}" fill="${color}" font-size="12" font-weight="700">${label}</text>
  `;
}

function teethPolyline(x0, x1, yCrest, yRoot, pitchPx) {
  const pts = [];
  let x = x0;
  let up = true;
  pts.push([x, yCrest]);
  while (x < x1 - 1) {
    const nx = Math.min(x + pitchPx / 2, x1);
    pts.push([nx, up ? yRoot : yCrest]);
    up = !up;
    x = nx;
  }
  pts.push([x1, yCrest]);
  return pts.map(([a, b]) => `${a},${b}`).join(" ");
}

/** 公扣（外螺纹）端头：从右（端头）到左（本体）= 止口 | 螺纹 | 退刀槽 | 本体 */
export function renderMaleDiagram(r) {
  const W = 720;
  const H = 320;
  const axis = 210;
  const scaleY = 0.55; // 示意比例
  const od = r.D1;
  const major = r.majorDia;
  const minor = r.femaleInternal.minor;
  const df = r.maleEnd.undercutDf;
  const loc = r.maleEnd.locator;
  const thr = r.maleEnd.thread;
  const ug = r.maleEnd.undercutWidth;

  const yOd = axis - (od / 2) * scaleY;
  const yMaj = axis - (major / 2) * scaleY;
  const yMin = axis - (minor / 2) * scaleY;
  const yDf = axis - (df / 2) * scaleY;
  const yBore = axis - ((od - 2 * r.t1) / 2) * scaleY;

  // 轴向示意宽度（非严格比例，保证可读）
  const xBody = 40;
  const wBody = 120;
  const wUg = 70;
  const wThr = 160;
  const wLoc = 90;
  const xUg = xBody + wBody;
  const xThr = xUg + wUg;
  const xLoc = xThr + wThr;
  const xEnd = xLoc + wLoc;

  const tooth = teethPolyline(xThr, xLoc, yMaj, yMin, 22);

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="公扣端头剖面尺寸图">
    <defs>
      <linearGradient id="maleFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d7e4de"/><stop offset="100%" stop-color="#b7ccc3"/>
      </linearGradient>
    </defs>
    <text x="24" y="28" fill="#2f4a56" font-size="15" font-weight="700">公扣（外螺纹）端头剖面 · ${r.designation}</text>
    <text x="24" y="48" fill="#5c6b64" font-size="12">从本体向外：退刀槽 → 螺纹旋合段 → 定位止口（子口）· 示意比例</text>

    <!-- 上半壁实体 -->
    <path d="
      M ${xBody} ${yOd}
      L ${xUg} ${yOd}
      L ${xUg} ${yDf}
      L ${xThr} ${yDf}
      L ${xThr} ${yMaj}
      L ${xLoc} ${yMaj}
      L ${xLoc} ${yOd}
      L ${xEnd} ${yOd}
      L ${xEnd} ${yBore}
      L ${xBody} ${yBore}
      Z" fill="url(#maleFill)" stroke="#2f4a56" stroke-width="1.5"/>

    <!-- 螺纹牙型 -->
    <polyline points="${tooth}" fill="none" stroke="#1f6f5b" stroke-width="2"/>

    <!-- 轴线 -->
    <line x1="${xBody - 10}" y1="${axis}" x2="${xEnd + 20}" y2="${axis}" stroke="#5c6b64" stroke-dasharray="6 5"/>

    <!-- 分段竖线 -->
    <line x1="${xUg}" y1="${yOd - 8}" x2="${xUg}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.5"/>
    <line x1="${xThr}" y1="${yOd - 8}" x2="${xThr}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.5"/>
    <line x1="${xLoc}" y1="${yOd - 8}" x2="${xLoc}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.5"/>

    ${dimH(xUg, xThr, 70, `退刀槽 ${t(ug)}`, "#2f4a56")}
    ${dimH(xThr, xLoc, 70, `螺纹 ${t(thr)}`, "#c45c26")}
    ${dimH(xLoc, xEnd, 70, `子口 ${t(loc)}`, "#1f6f5b")}

    ${dimV(xEnd + 28, yMaj, axis, `大径 ø${t(major)}`, "#c45c26", "right")}
    ${dimV(xThr + 50, yMin, axis, `牙底/小径 ø${t(minor)}`, "#1f6f5b", "right")}
    ${dimV(xUg + 28, yDf, axis, `槽底 df ø${t(df)}`, "#2f4a56", "right")}
    ${dimV(xBody + 50, yOd, axis, `D₁ ø${t(od)}`, "#5c6b64", "right")}

    <text x="${xBody + 8}" y="${axis + 28}" fill="#5c6b64" font-size="12">本体（总长 210 含端头）</text>
    <text x="${(xUg + xThr) / 2}" y="${axis + 48}" text-anchor="middle" fill="#2f4a56" font-size="12" font-weight="700">退刀槽</text>
    <text x="${(xThr + xLoc) / 2}" y="${axis + 48}" text-anchor="middle" fill="#c45c26" font-size="12" font-weight="700">外螺纹 ${r.designation}</text>
    <text x="${(xLoc + xEnd) / 2}" y="${axis + 48}" text-anchor="middle" fill="#1f6f5b" font-size="12" font-weight="700">定位止口</text>
    <text x="24" y="${H - 16}" fill="#5c6b64" font-size="11">端头合计 = ${t(loc)}+${t(thr)}+${t(ug)} = ${t(r.maleEnd.total)} mm（计入 210）</text>
  </svg>`;
}

/** 母扣（内螺纹）端头内腔：从左（端面）向右（管内）= 止口接收 | 内螺纹 | 退刀槽 | 本体 */
export function renderFemaleDiagram(r) {
  const W = 720;
  const H = 320;
  const axis = 210;
  const scaleY = 0.55;
  const od = r.D2;
  const major = r.majorDia; // 内螺纹牙底大径
  const minor = r.femaleInternal.minor; // 内螺纹牙顶小径
  const dg = r.femaleEnd.undercutDg;
  const loc = r.femaleEnd.locator;
  const thr = r.femaleEnd.thread;
  const ug = r.femaleEnd.undercutWidth;
  const bore = r.largeBore;

  const yOd = axis - (od / 2) * scaleY;
  const yMaj = axis - (major / 2) * scaleY; // 牙底（靠外）
  const yMin = axis - (minor / 2) * scaleY; // 牙顶（靠内孔）
  const yDg = axis - (dg / 2) * scaleY;
  const yBore = axis - (bore / 2) * scaleY;

  const xFace = 50;
  const wLoc = 90;
  const wThr = 160;
  const wUg = 70;
  const wBody = 140;
  const xThr = xFace + wLoc;
  const xUg = xThr + wThr;
  const xBody = xUg + wUg;
  const xEnd = xBody + wBody;

  // 内螺纹牙：小径为牙顶（内孔侧），大径为牙底
  const tooth = teethPolyline(xThr, xUg, yMin, yMaj, 22);

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="母扣端头内腔剖面尺寸图">
    <defs>
      <linearGradient id="femFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e2ebe6"/><stop offset="100%" stop-color="#c5d6cc"/>
      </linearGradient>
    </defs>
    <text x="24" y="28" fill="#2f4a56" font-size="15" font-weight="700">母扣（内螺纹）端头内腔剖面 · ${r.designation}</text>
    <text x="24" y="48" fill="#5c6b64" font-size="12">从端面往管内：定位止口接收段 → 内螺纹旋合段 → 退刀槽 · 示意比例</text>

    <!-- 管壁实体（上半）：外轮廓到内腔阶梯 -->
    <path d="
      M ${xFace} ${yOd}
      L ${xEnd} ${yOd}
      L ${xEnd} ${yBore}
      L ${xBody} ${yBore}
      L ${xBody} ${yDg}
      L ${xUg} ${yDg}
      L ${xUg} ${yMaj}
      L ${xThr} ${yMaj}
      L ${xThr} ${yMin}
      L ${xFace} ${yMin}
      Z" fill="url(#femFill)" stroke="#2f4a56" stroke-width="1.5"/>

    <polyline points="${tooth}" fill="none" stroke="#c45c26" stroke-width="2"/>

    <line x1="${xFace - 10}" y1="${axis}" x2="${xEnd + 10}" y2="${axis}" stroke="#5c6b64" stroke-dasharray="6 5"/>

    <line x1="${xThr}" y1="${yOd - 8}" x2="${xThr}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.5"/>
    <line x1="${xUg}" y1="${yOd - 8}" x2="${xUg}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.5"/>
    <line x1="${xBody}" y1="${yOd - 8}" x2="${xBody}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.5"/>

    ${dimH(xFace, xThr, 70, `子口接收 ${t(loc)}`, "#1f6f5b")}
    ${dimH(xThr, xUg, 70, `内螺纹 ${t(thr)}`, "#c45c26")}
    ${dimH(xUg, xBody, 70, `退刀槽 ${t(ug)}`, "#2f4a56")}

    ${dimV(xFace + 36, yMin, axis, `牙顶小径 ø${t(minor)}`, "#1f6f5b", "right")}
    ${dimV(xThr + 55, yMaj, axis, `牙底大径 ø${t(major)}`, "#c45c26", "right")}
    ${dimV(xUg + 30, yDg, axis, `槽底 Dg ø${t(dg)}`, "#2f4a56", "right")}
    ${dimV(xEnd - 20, yOd, axis, `D₂ ø${t(od)}`, "#5c6b64", "left")}
    ${dimV(xEnd - 50, yBore, axis, `内孔 ø${t(bore)}`, "#8a5a2a", "left")}

    <text x="${(xFace + xThr) / 2}" y="${axis + 48}" text-anchor="middle" fill="#1f6f5b" font-size="12" font-weight="700">定位止口接收</text>
    <text x="${(xThr + xUg) / 2}" y="${axis + 48}" text-anchor="middle" fill="#c45c26" font-size="12" font-weight="700">内螺纹 ${r.designation}</text>
    <text x="${(xUg + xBody) / 2}" y="${axis + 48}" text-anchor="middle" fill="#2f4a56" font-size="12" font-weight="700">退刀槽</text>
    <text x="24" y="${H - 16}" fill="#5c6b64" font-size="11">内腔合计 = ${t(loc)}+${t(thr)}+${t(ug)} = ${t(r.femaleEnd.total)} mm（计入 210）· 校验：小径 ${t(minor)} ${r.wallCheck.pierceOk ? ">" : "≯"} 内孔 ${t(bore)}</text>
  </svg>`;
}

/** 装配对扣示意：公头插入母头 */
export function renderAssemblyDiagram(r) {
  const W = 720;
  const H = 200;
  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="装配示意">
    <text x="24" y="28" fill="#2f4a56" font-size="15" font-weight="700">装配示意 · 止口导向后旋合 ${t(r.maleEnd.thread)} mm</text>
    <rect x="60" y="70" width="200" height="60" rx="6" fill="#d7e4de" stroke="#2f4a56"/>
    <text x="160" y="105" text-anchor="middle" fill="#2f4a56" font-size="13" font-weight="700">公扣 ${r.designation}</text>
    <text x="160" y="122" text-anchor="middle" fill="#5c6b64" font-size="11">子口 ${t(r.maleEnd.locator)} · 螺纹 ${t(r.maleEnd.thread)} · 退刀 ${t(r.maleEnd.undercutWidth)}</text>

    <path d="M280 100 L330 100" stroke="#c45c26" stroke-width="2.5" marker-end="url(#arr)"/>
    <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#c45c26"/></marker></defs>
    <text x="305" y="88" text-anchor="middle" fill="#c45c26" font-size="11">旋入</text>

    <rect x="350" y="55" width="280" height="90" rx="6" fill="#e8f0eb" stroke="#2f4a56"/>
    <rect x="370" y="75" width="200" height="50" rx="4" fill="#f7faf8" stroke="#1f6f5b" stroke-dasharray="4 3"/>
    <text x="490" y="95" text-anchor="middle" fill="#2f4a56" font-size="13" font-weight="700">母扣内腔</text>
    <text x="490" y="114" text-anchor="middle" fill="#5c6b64" font-size="11">接收止口 ${t(r.femaleEnd.locator)} · 内螺纹 ${t(r.femaleEnd.thread)} · 退刀 ${t(r.femaleEnd.undercutWidth)}</text>
    <text x="24" y="180" fill="#5c6b64" font-size="12">${r.checkPass ? "校验通过" : "校验警告"}：${r.checkMessage}</text>
  </svg>`;
}
