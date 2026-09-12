/**
 * 简易 DXF 导入（对标 Belt Analyst / Helix DXF）
 * 支持 ASCII DXF：LINE、LWPOLYLINE（2D）；映射为承载中心线节点
 * 平面：xy → (X,Y,Z=0)；xz → (X,0,Z)
 */

/**
 * @param {string} text
 * @param {{plane?:'xy'|'xz', unit_scale?:number, close_polyline?:boolean}} [opts]
 * @returns {{points: Array<{x:number,y:number,z:number}>, meta: object}}
 */
export function parseDxfPolylines(text, opts = {}) {
  const plane = opts.plane === "xz" ? "xz" : "xy";
  const scale = Number.isFinite(opts.unit_scale) && opts.unit_scale > 0 ? opts.unit_scale : 1;
  const lines = String(text || "").split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1] ?? "";
    pairs.push({ code, value: value.trim() });
  }

  /** @type {Array<Array<{x:number,y:number,z:number}>>} */
  const polylines = [];
  let i = 0;
  while (i < pairs.length) {
    const p = pairs[i];
    if (p.code === "0" && p.value === "LINE") {
      let x1, y1, z1 = 0, x2, y2, z2 = 0;
      i += 1;
      while (i < pairs.length && pairs[i].code !== "0") {
        const c = pairs[i].code;
        const v = parseFloat(pairs[i].value);
        if (c === "10") x1 = v;
        else if (c === "20") y1 = v;
        else if (c === "30") z1 = v;
        else if (c === "11") x2 = v;
        else if (c === "21") y2 = v;
        else if (c === "31") z2 = v;
        i += 1;
      }
      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        polylines.push([
          mapPt(x1, y1, z1, plane, scale),
          mapPt(x2, y2, z2, plane, scale),
        ]);
      }
      continue;
    }
    if (p.code === "0" && p.value === "LWPOLYLINE") {
      const pts = [];
      let x, y;
      let closed = false;
      i += 1;
      while (i < pairs.length && pairs[i].code !== "0") {
        const c = pairs[i].code;
        const raw = pairs[i].value;
        const v = parseFloat(raw);
        if (c === "70" && (parseInt(raw, 10) & 1)) closed = true;
        if (c === "10") x = v;
        if (c === "20") {
          y = v;
          if (Number.isFinite(x) && Number.isFinite(y)) {
            pts.push(mapPt(x, y, 0, plane, scale));
            x = undefined;
            y = undefined;
          }
        }
        i += 1;
      }
      if (closed && opts.close_polyline !== false && pts.length >= 2) {
        const a = pts[0];
        const b = pts[pts.length - 1];
        if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 1e-6) pts.push({ ...a });
      }
      if (pts.length >= 2) polylines.push(pts);
      continue;
    }
    i += 1;
  }

  // 取最长折线作为主路径
  let best = [];
  for (const pl of polylines) {
    if (pl.length > best.length) best = pl;
  }
  // 合并共线 LINE 为折线（首尾相接）
  if (best.length < 2 && polylines.length) {
    best = stitchLines(polylines);
  }

  return {
    points: best,
    meta: {
      entity_count: polylines.length,
      point_count: best.length,
      plane,
      unit_scale: scale,
      source: "dxf_import",
    },
  };
}

function mapPt(x, y, z, plane, scale) {
  if (plane === "xz") {
    return {
      x: +(x * scale).toFixed(6),
      y: 0,
      z: +((Number.isFinite(z) && z !== 0 ? z : y) * scale).toFixed(6),
    };
  }
  return {
    x: +(x * scale).toFixed(6),
    y: +(y * scale).toFixed(6),
    z: +(z * scale).toFixed(6),
  };
}

function stitchLines(polylines) {
  const segs = polylines.filter((p) => p.length === 2);
  if (!segs.length) return polylines[0] || [];
  const pts = [segs[0][0], segs[0][1]];
  const used = new Set([0]);
  let guard = 0;
  while (used.size < segs.length && guard++ < 1000) {
    const last = pts[pts.length - 1];
    let found = false;
    for (let i = 0; i < segs.length; i++) {
      if (used.has(i)) continue;
      const [a, b] = segs[i];
      if (nearPt(last, a)) {
        pts.push(b);
        used.add(i);
        found = true;
        break;
      }
      if (nearPt(last, b)) {
        pts.push(a);
        used.add(i);
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  return pts;
}

function nearPt(a, b, tol = 1e-4) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= tol;
}

/**
 * DXF 点列 → 承载节点（首尾标为 tail/head）
 */
export function dxfPointsToCarryNodes(points) {
  if (!points || points.length < 2) {
    throw new Error("DXF：有效折线不足 2 点");
  }
  return points.map((p, i) => {
    const isFirst = i === 0;
    const isLast = i === points.length - 1;
    return {
      id: `dxf_${i}`,
      x: p.x,
      y: p.y,
      z: p.z,
      type: isFirst ? "tail" : isLast ? "head" : "node",
      branch: "carry",
      strand: "carry",
      mainDrive: isLast,
      drum_D_mm: isFirst || isLast ? 800 : undefined,
      label: isFirst ? "尾（DXF）" : isLast ? "头（DXF）" : `DXF${i}`,
      source: "dxf",
    };
  });
}
