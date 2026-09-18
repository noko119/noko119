/**
 * 接管端头剖面尺寸标注图（公扣外螺纹 / 母扣内螺纹）
 * 字号偏小，径向标注错开，避免重叠
 */

function t(n) {
  const s = String(Number(Number(n).toFixed(3)));
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

function dimH(x1, x2, y, label, color = "#c45c26") {
  const mid = (x1 + x2) / 2;
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="1"/>
    <line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}" stroke="${color}" stroke-width="1"/>
    <line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}" stroke="${color}" stroke-width="1"/>
    <text x="${mid}" y="${y - 6}" text-anchor="middle" fill="${color}" font-size="10" font-weight="600">${label}</text>
  `;
}

/**
 * 竖向尺寸。labelMode:
 * - mid: 标在尺寸线中部旁（默认）
 * - top: 标在尺寸线上端外侧
 * - bottom: 标在尺寸线下端（靠近轴线）外侧
 * - out: 引出到画布外固定 x
 */
function dimV(x, y1, y2, label, color = "#1f6f5b", opts = {}) {
  const {
    align = "right",
    labelMode = "mid",
    outX = null,
    fontSize = 10,
  } = opts;
  const mid = (y1 + y2) / 2;
  let tx;
  let ty;
  let anchor;
  let leader = "";

  if (labelMode === "top") {
    tx = align === "right" ? x + 6 : x - 6;
    ty = Math.min(y1, y2) - 4;
    anchor = align === "right" ? "start" : "end";
  } else if (labelMode === "bottom") {
    tx = align === "right" ? x + 6 : x - 6;
    ty = Math.max(y1, y2) - 4;
    anchor = align === "right" ? "start" : "end";
  } else if (labelMode === "out" && outX != null) {
    tx = outX;
    ty = mid + 3;
    anchor = "start";
    leader = `<line x1="${x}" y1="${mid}" x2="${outX - 4}" y2="${mid}" stroke="${color}" stroke-width="0.8" stroke-dasharray="2 2"/>`;
  } else {
    tx = align === "right" ? x + 6 : x - 6;
    ty = mid + 3;
    anchor = align === "right" ? "start" : "end";
  }

  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="1"/>
    <line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}" stroke="${color}" stroke-width="1"/>
    <line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}" stroke="${color}" stroke-width="1"/>
    ${leader}
    <text x="${tx}" y="${ty}" text-anchor="${anchor}" fill="${color}" font-size="${fontSize}" font-weight="600">${label}</text>
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

/** 公扣（外螺纹）端头 */
export function renderMaleDiagram(r) {
  const W = 780;
  const H = 340;
  const axis = 220;
  const scaleY = 0.5;
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

  const xBody = 36;
  const wBody = 110;
  const wUg = 78;
  const wThr = 170;
  const wLoc = 100;
  const xUg = xBody + wBody;
  const xThr = xUg + wUg;
  const xLoc = xThr + wThr;
  const xEnd = xLoc + wLoc;

  const tooth = teethPolyline(xThr, xLoc, yMaj, yMin, 20);

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="公扣端头剖面尺寸图">
    <defs>
      <linearGradient id="maleFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d7e4de"/><stop offset="100%" stop-color="#b7ccc3"/>
      </linearGradient>
    </defs>
    <text x="20" y="22" fill="#2f4a56" font-size="13" font-weight="700">公扣（外螺纹）端头剖面 · ${r.designation}</text>
    <text x="20" y="40" fill="#5c6b64" font-size="10">本体 → 退刀槽 → 螺纹 → 子口（示意比例）</text>

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
      Z" fill="url(#maleFill)" stroke="#2f4a56" stroke-width="1.4"/>

    <polyline points="${tooth}" fill="none" stroke="#1f6f5b" stroke-width="1.6"/>
    <line x1="${xBody - 8}" y1="${axis}" x2="${xEnd + 16}" y2="${axis}" stroke="#5c6b64" stroke-dasharray="5 4"/>

    <line x1="${xUg}" y1="${yOd - 6}" x2="${xUg}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.45"/>
    <line x1="${xThr}" y1="${yOd - 6}" x2="${xThr}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.45"/>
    <line x1="${xLoc}" y1="${yOd - 6}" x2="${xLoc}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.45"/>

    ${dimH(xUg, xThr, 62, `退刀槽 ${t(ug)}`, "#2f4a56")}
    ${dimH(xThr, xLoc, 62, `螺纹 ${t(thr)}`, "#c45c26")}
    ${dimH(xLoc, xEnd, 62, `子口 ${t(loc)}`, "#1f6f5b")}

    ${dimV(xBody + 40, yOd, axis, `D₁ ø${t(od)}`, "#5c6b64", { labelMode: "top" })}
    ${dimV(xUg + 24, yDf, axis, `df ø${t(df)}`, "#2f4a56", { labelMode: "top" })}
    ${dimV(xThr + 48, yMin, axis, `牙底 ø${t(minor)}`, "#1f6f5b", { labelMode: "bottom" })}
    ${dimV(xEnd + 18, yMaj, axis, `大径 ø${t(major)}`, "#c45c26", { labelMode: "top" })}

    <text x="${xBody + 6}" y="${axis + 22}" fill="#5c6b64" font-size="10">本体（210 含端头）</text>
    <text x="${(xUg + xThr) / 2}" y="${axis + 40}" text-anchor="middle" fill="#2f4a56" font-size="10" font-weight="600">退刀槽</text>
    <text x="${(xThr + xLoc) / 2}" y="${axis + 40}" text-anchor="middle" fill="#c45c26" font-size="10" font-weight="600">外螺纹 ${r.designation}</text>
    <text x="${(xLoc + xEnd) / 2}" y="${axis + 40}" text-anchor="middle" fill="#1f6f5b" font-size="10" font-weight="600">定位止口</text>
    <text x="20" y="${H - 14}" fill="#5c6b64" font-size="10">端头合计 ${t(loc)}+${t(thr)}+${t(ug)} = ${t(r.maleEnd.total)} mm</text>
  </svg>`;
}

/** 母扣（内螺纹）端头内腔 */
export function renderFemaleDiagram(r) {
  const W = 820;
  const H = 360;
  const axis = 230;
  const scaleY = 0.5;
  const od = r.D2;
  const major = r.majorDia;
  const minor = r.femaleInternal.minor;
  const dg = r.femaleEnd.undercutDg;
  const loc = r.femaleEnd.locator;
  const thr = r.femaleEnd.thread;
  const ug = r.femaleEnd.undercutWidth;
  const bore = r.largeBore;

  const yOd = axis - (od / 2) * scaleY;
  const yMaj = axis - (major / 2) * scaleY;
  const yMin = axis - (minor / 2) * scaleY;
  const yDg = axis - (dg / 2) * scaleY;
  const yBore = axis - (bore / 2) * scaleY;

  const xFace = 40;
  const wLoc = 100;
  const wThr = 170;
  const wUg = 80;
  const wBody = 160;
  const xThr = xFace + wLoc;
  const xUg = xThr + wThr;
  const xBody = xUg + wUg;
  const xEnd = xBody + wBody;

  const tooth = teethPolyline(xThr, xUg, yMin, yMaj, 20);

  // 右侧直径标注分三档：上 / 中 / 下，并拉开水平位置
  const xDg = xUg + 22;
  const xBore = xBody + 70;
  const xOd = xEnd + 14;

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="母扣端头内腔剖面尺寸图">
    <defs>
      <linearGradient id="femFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e2ebe6"/><stop offset="100%" stop-color="#c5d6cc"/>
      </linearGradient>
    </defs>
    <text x="20" y="22" fill="#2f4a56" font-size="13" font-weight="700">母扣（内螺纹）端头内腔剖面 · ${r.designation}</text>
    <text x="20" y="40" fill="#5c6b64" font-size="10">端面 → 子口接收 → 内螺纹 → 退刀槽（示意比例）</text>

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
      Z" fill="url(#femFill)" stroke="#2f4a56" stroke-width="1.4"/>

    <polyline points="${tooth}" fill="none" stroke="#c45c26" stroke-width="1.6"/>
    <line x1="${xFace - 8}" y1="${axis}" x2="${xEnd + 28}" y2="${axis}" stroke="#5c6b64" stroke-dasharray="5 4"/>

    <line x1="${xThr}" y1="${yOd - 6}" x2="${xThr}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.45"/>
    <line x1="${xUg}" y1="${yOd - 6}" x2="${xUg}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.45"/>
    <line x1="${xBody}" y1="${yOd - 6}" x2="${xBody}" y2="${axis}" stroke="#2f4a56" stroke-dasharray="3 3" opacity="0.45"/>

    ${dimH(xFace, xThr, 62, `子口接收 ${t(loc)}`, "#1f6f5b")}
    ${dimH(xThr, xUg, 62, `内螺纹 ${t(thr)}`, "#c45c26")}
    ${dimH(xUg, xBody, 62, `退刀槽 ${t(ug)}`, "#2f4a56")}

    ${dimV(xFace + 28, yMin, axis, `牙顶 ø${t(minor)}`, "#1f6f5b", { labelMode: "top" })}
    ${dimV(xThr + 50, yMaj, axis, `牙底 ø${t(major)}`, "#c45c26", { labelMode: "bottom" })}

    ${dimV(xDg, yDg, axis, `Dg ø${t(dg)}`, "#2f4a56", { labelMode: "top" })}
    ${dimV(xBore, yBore, axis, `内孔 ø${t(bore)}`, "#8a5a2a", { labelMode: "bottom" })}
    ${dimV(xOd, yOd, axis, `D₂ ø${t(od)}`, "#5c6b64", { labelMode: "top" })}

    <text x="${(xFace + xThr) / 2}" y="${axis + 40}" text-anchor="middle" fill="#1f6f5b" font-size="10" font-weight="600">定位止口接收</text>
    <text x="${(xThr + xUg) / 2}" y="${axis + 40}" text-anchor="middle" fill="#c45c26" font-size="10" font-weight="600">内螺纹 ${r.designation}</text>
    <text x="${(xUg + xBody) / 2}" y="${axis + 40}" text-anchor="middle" fill="#2f4a56" font-size="10" font-weight="600">退刀槽</text>
    <text x="20" y="${H - 14}" fill="#5c6b64" font-size="10">内腔合计 ${t(loc)}+${t(thr)}+${t(ug)} = ${t(r.femaleEnd.total)} mm · 校验：小径 ${t(minor)} ${r.wallCheck.pierceOk ? ">" : "≯"} 内孔 ${t(bore)}</text>
  </svg>`;
}

/** 装配对扣示意 */
export function renderAssemblyDiagram(r) {
  const W = 780;
  const H = 180;
  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="装配示意">
    <text x="20" y="22" fill="#2f4a56" font-size="13" font-weight="700">装配示意 · 止口导向后旋合 ${t(r.maleEnd.thread)} mm</text>
    <rect x="50" y="55" width="200" height="54" rx="5" fill="#d7e4de" stroke="#2f4a56"/>
    <text x="150" y="78" text-anchor="middle" fill="#2f4a56" font-size="11" font-weight="700">公扣 ${r.designation}</text>
    <text x="150" y="94" text-anchor="middle" fill="#5c6b64" font-size="9">子口 ${t(r.maleEnd.locator)} · 螺纹 ${t(r.maleEnd.thread)} · 退刀 ${t(r.maleEnd.undercutWidth)}</text>

    <path d="M270 82 L320 82" stroke="#c45c26" stroke-width="2" marker-end="url(#arr)"/>
    <defs><marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#c45c26"/></marker></defs>
    <text x="295" y="72" text-anchor="middle" fill="#c45c26" font-size="10">旋入</text>

    <rect x="340" y="42" width="280" height="80" rx="5" fill="#e8f0eb" stroke="#2f4a56"/>
    <rect x="358" y="58" width="200" height="48" rx="3" fill="#f7faf8" stroke="#1f6f5b" stroke-dasharray="3 2"/>
    <text x="480" y="78" text-anchor="middle" fill="#2f4a56" font-size="11" font-weight="700">母扣内腔</text>
    <text x="480" y="94" text-anchor="middle" fill="#5c6b64" font-size="9">接收 ${t(r.femaleEnd.locator)} · 内螺纹 ${t(r.femaleEnd.thread)} · 退刀 ${t(r.femaleEnd.undercutWidth)}</text>
    <text x="20" y="160" fill="#5c6b64" font-size="10">${r.checkPass ? "校验通过" : "校验警告"}：${r.checkMessage}</text>
  </svg>`;
}
