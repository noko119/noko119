/**
 * 接管端头剖面尺寸标注图
 * - 轴向分段标注在图上方
 * - 径向尺寸统一放在图下方分栏，避免重叠
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

function legendRow(items, y0) {
  // items: [{label, color}] 每行最多 4 个，绝不互相压字
  const colW = 175;
  const x0 = 24;
  return items
    .map((it, i) => {
      const x = x0 + (i % 4) * colW;
      const y = y0 + Math.floor(i / 4) * 16;
      return `<text x="${x}" y="${y}" fill="${it.color}" font-size="9" font-weight="600">${it.label}</text>`;
    })
    .join("");
}

/** 公扣（外螺纹）端头 */
export function renderMaleDiagram(r) {
  const W = 760;
  const H = 300;
  const axis = 175;
  const scaleY = 0.42;
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

  const xBody = 40;
  const wBody = 100;
  const wUg = 90;
  const wThr = 180;
  const wLoc = 110;
  const xUg = xBody + wBody;
  const xThr = xUg + wUg;
  const xLoc = xThr + wThr;
  const xEnd = xLoc + wLoc;

  const tooth = teethPolyline(xThr, xLoc, yMaj, yMin, 18);

  // 径向尺寸只画短引线到轮廓，数字全部在图下分栏
  const tick = (x, y) =>
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${axis}" stroke="#93a09a" stroke-width="0.8" stroke-dasharray="2 2"/>`;

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="公扣端头剖面尺寸图">
    <defs>
      <linearGradient id="maleFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d7e4de"/><stop offset="100%" stop-color="#b7ccc3"/>
      </linearGradient>
    </defs>
    <text x="20" y="18" fill="#2f4a56" font-size="12" font-weight="700">公扣（外螺纹）端头剖面 · ${r.designation}</text>
    <text x="20" y="34" fill="#5c6b64" font-size="9">本体 → 退刀槽 → 螺纹 → 子口（示意，非严格比例）</text>

    <path d="
      M ${xBody} ${yOd} L ${xUg} ${yOd} L ${xUg} ${yDf} L ${xThr} ${yDf}
      L ${xThr} ${yMaj} L ${xLoc} ${yMaj} L ${xLoc} ${yOd} L ${xEnd} ${yOd}
      L ${xEnd} ${yBore} L ${xBody} ${yBore} Z
    " fill="url(#maleFill)" stroke="#2f4a56" stroke-width="1.3"/>
    <polyline points="${tooth}" fill="none" stroke="#1f6f5b" stroke-width="1.5"/>
    <line x1="${xBody - 6}" y1="${axis}" x2="${xEnd + 10}" y2="${axis}" stroke="#5c6b64" stroke-dasharray="4 3"/>

    ${dimH(xUg, xThr, 52, `退刀槽 ${t(ug)}`, "#2f4a56")}
    ${dimH(xThr, xLoc, 52, `螺纹 ${t(thr)}`, "#c45c26")}
    ${dimH(xLoc, xEnd, 52, `子口 ${t(loc)}`, "#1f6f5b")}

    ${tick(xBody + 36, yOd)}
    ${tick(xUg + 28, yDf)}
    ${tick(xThr + 40, yMin)}
    ${tick(xEnd - 8, yMaj)}

    <text x="${(xUg + xThr) / 2}" y="${axis + 16}" text-anchor="middle" fill="#2f4a56" font-size="9">退刀槽</text>
    <text x="${(xThr + xLoc) / 2}" y="${axis + 16}" text-anchor="middle" fill="#c45c26" font-size="9">外螺纹</text>
    <text x="${(xLoc + xEnd) / 2}" y="${axis + 16}" text-anchor="middle" fill="#1f6f5b" font-size="9">子口</text>

    ${legendRow(
      [
        { label: `D₁ 外径 ø${t(od)}`, color: "#5c6b64" },
        { label: `大径 ø${t(major)}`, color: "#c45c26" },
        { label: `牙底/小径 ø${t(minor)}`, color: "#1f6f5b" },
        { label: `槽底 df ø${t(df)}`, color: "#2f4a56" },
        { label: `端头合计 ${t(loc)}+${t(thr)}+${t(ug)}=${t(r.maleEnd.total)}`, color: "#5c6b64" },
        { label: `退刀槽按 GB/T 3（P=${t(r.P)}）查表`, color: "#5c6b64" },
      ],
      axis + 36
    )}
  </svg>`;
}

/** 母扣（内螺纹）端头内腔 */
export function renderFemaleDiagram(r) {
  const W = 760;
  const H = 300;
  const axis = 175;
  const scaleY = 0.42;
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
  const wLoc = 110;
  const wThr = 180;
  const wUg = 90;
  const wBody = 150;
  const xThr = xFace + wLoc;
  const xUg = xThr + wThr;
  const xBody = xUg + wUg;
  const xEnd = xBody + wBody;

  const tooth = teethPolyline(xThr, xUg, yMin, yMaj, 18);
  const tick = (x, y) =>
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${axis}" stroke="#93a09a" stroke-width="0.8" stroke-dasharray="2 2"/>`;

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="母扣端头内腔剖面尺寸图">
    <defs>
      <linearGradient id="femFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e2ebe6"/><stop offset="100%" stop-color="#c5d6cc"/>
      </linearGradient>
    </defs>
    <text x="20" y="18" fill="#2f4a56" font-size="12" font-weight="700">母扣（内螺纹）端头内腔剖面 · ${r.designation}</text>
    <text x="20" y="34" fill="#5c6b64" font-size="9">子口接收 → 内螺纹 → 退刀槽（示意，非严格比例）</text>

    <path d="
      M ${xFace} ${yOd} L ${xEnd} ${yOd} L ${xEnd} ${yBore} L ${xBody} ${yBore}
      L ${xBody} ${yDg} L ${xUg} ${yDg} L ${xUg} ${yMaj} L ${xThr} ${yMaj}
      L ${xThr} ${yMin} L ${xFace} ${yMin} Z
    " fill="url(#femFill)" stroke="#2f4a56" stroke-width="1.3"/>
    <polyline points="${tooth}" fill="none" stroke="#c45c26" stroke-width="1.5"/>
    <line x1="${xFace - 6}" y1="${axis}" x2="${xEnd + 10}" y2="${axis}" stroke="#5c6b64" stroke-dasharray="4 3"/>

    ${dimH(xFace, xThr, 52, `子口接收 ${t(loc)}`, "#1f6f5b")}
    ${dimH(xThr, xUg, 52, `内螺纹 ${t(thr)}`, "#c45c26")}
    ${dimH(xUg, xBody, 52, `退刀槽 ${t(ug)}`, "#2f4a56")}

    ${tick(xFace + 28, yMin)}
    ${tick(xThr + 40, yMaj)}
    ${tick(xUg + 28, yDg)}
    ${tick(xBody + 50, yBore)}
    ${tick(xEnd - 10, yOd)}

    <text x="${(xFace + xThr) / 2}" y="${axis + 16}" text-anchor="middle" fill="#1f6f5b" font-size="9">子口接收</text>
    <text x="${(xThr + xUg) / 2}" y="${axis + 16}" text-anchor="middle" fill="#c45c26" font-size="9">内螺纹</text>
    <text x="${(xUg + xBody) / 2}" y="${axis + 16}" text-anchor="middle" fill="#2f4a56" font-size="9">退刀槽</text>

    ${legendRow(
      [
        { label: `D₂ 外径 ø${t(od)}`, color: "#5c6b64" },
        { label: `牙底大径 ø${t(major)}`, color: "#c45c26" },
        { label: `牙顶小径 ø${t(minor)}`, color: "#1f6f5b" },
        { label: `槽底 Dg ø${t(dg)}`, color: "#2f4a56" },
        { label: `内孔 ø${t(bore)}`, color: "#8a5a2a" },
        { label: `内腔合计 ${t(loc)}+${t(thr)}+${t(ug)}=${t(r.femaleEnd.total)}`, color: "#5c6b64" },
        { label: `校验：小径 ${t(minor)} ${r.wallCheck.pierceOk ? ">" : "≯"} 内孔 ${t(bore)}`, color: r.wallCheck.pierceOk ? "#1f6f5b" : "#8a2e0e" },
      ],
      axis + 36
    )}
  </svg>`;
}

/** 装配示意 */
export function renderAssemblyDiagram(r) {
  const W = 760;
  const H = 160;
  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="装配示意">
    <text x="20" y="18" fill="#2f4a56" font-size="12" font-weight="700">装配示意 · 止口导向后旋合 ${t(r.maleEnd.thread)} mm</text>
    <rect x="48" y="48" width="190" height="48" rx="4" fill="#d7e4de" stroke="#2f4a56"/>
    <text x="143" y="68" text-anchor="middle" fill="#2f4a56" font-size="10" font-weight="700">公扣 ${r.designation}</text>
    <text x="143" y="84" text-anchor="middle" fill="#5c6b64" font-size="9">子口${t(r.maleEnd.locator)} · 螺纹${t(r.maleEnd.thread)} · 退刀${t(r.maleEnd.undercutWidth)}</text>
    <path d="M255 72 L300 72" stroke="#c45c26" stroke-width="2" marker-end="url(#arr)"/>
    <defs><marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#c45c26"/></marker></defs>
    <text x="277" y="64" text-anchor="middle" fill="#c45c26" font-size="9">旋入</text>
    <rect x="320" y="40" width="260" height="64" rx="4" fill="#e8f0eb" stroke="#2f4a56"/>
    <rect x="336" y="52" width="190" height="40" rx="3" fill="#f7faf8" stroke="#1f6f5b" stroke-dasharray="3 2"/>
    <text x="450" y="70" text-anchor="middle" fill="#2f4a56" font-size="10" font-weight="700">母扣内腔</text>
    <text x="450" y="84" text-anchor="middle" fill="#5c6b64" font-size="9">接收${t(r.femaleEnd.locator)} · 内螺纹${t(r.femaleEnd.thread)} · 退刀${t(r.femaleEnd.undercutWidth)}</text>
    <text x="20" y="140" fill="#5c6b64" font-size="9">${r.checkPass ? "校验通过" : "校验警告"}：${r.checkMessage}</text>
  </svg>`;
}
