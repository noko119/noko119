/**
 * Excel 兼容 CSV 导入导出（对标大厂表输入）
 * 真 .xlsx 可后接 SheetJS；v0 用 UTF-8 CSV（Excel 可直接开）
 */

function esc(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text) {
  const rows = [];
  let i = 0;
  const src = String(text || "").replace(/^\uFEFF/, "");
  while (i < src.length) {
    const row = [];
    while (i < src.length) {
      if (src[i] === '"') {
        i += 1;
        let cell = "";
        while (i < src.length) {
          if (src[i] === '"' && src[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          if (src[i] === '"') {
            i += 1;
            break;
          }
          cell += src[i++];
        }
        row.push(cell);
      } else {
        let cell = "";
        while (i < src.length && src[i] !== "," && src[i] !== "\n" && src[i] !== "\r") {
          cell += src[i++];
        }
        row.push(cell.trim());
      }
      if (src[i] === ",") {
        i += 1;
        continue;
      }
      if (src[i] === "\r") i += 1;
      if (src[i] === "\n") {
        i += 1;
        break;
      }
      break;
    }
    if (row.length && row.some((c) => c !== "")) rows.push(row);
  }
  return rows;
}

/** 节点 → CSV */
export function nodesToCsv(nodes) {
  const header = ["seq", "id", "type", "branch", "x", "y", "z", "drum_D_mm", "mainDrive", "label"];
  const lines = [header.join(",")];
  nodes.forEach((n, i) => {
    lines.push(
      [
        i + 1,
        n.id,
        n.type,
        n.branch || "carry",
        n.x,
        n.y,
        n.z,
        n.drum_D_mm ?? "",
        n.mainDrive ? 1 : 0,
        n.label ?? "",
      ]
        .map(esc)
        .join(",")
    );
  });
  return lines.join("\n") + "\n";
}

/** CSV → 节点 */
export function csvToNodes(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV：无数据行");
  const header = rows[0].map((h) => h.toLowerCase());
  const idx = (name) => header.indexOf(name);
  const need = ["x", "y", "z"];
  for (const k of need) {
    if (idx(k) < 0) throw new Error(`CSV：缺少列 ${k}`);
  }
  return rows.slice(1).map((r, i) => {
    const get = (name, d = "") => {
      const j = idx(name);
      return j >= 0 ? r[j] : d;
    };
    const type = get("type", "node") || "node";
    const branch = get("branch", "carry") || "carry";
    return {
      id: get("id") || `csv_${i}`,
      x: parseFloat(get("x")) || 0,
      y: parseFloat(get("y")) || 0,
      z: parseFloat(get("z")) || 0,
      type,
      branch,
      strand: branch,
      drum_D_mm: get("drum_d_mm") !== "" ? parseFloat(get("drum_d_mm")) : undefined,
      mainDrive: get("maindrive") === "1" || get("maindrive") === "true",
      label: get("label") || undefined,
      source: "excel_csv",
    };
  });
}

/** Flight → CSV */
export function flightsToCsv(flights) {
  const header = [
    "seq",
    "id",
    "branch",
    "major_id",
    "sub_id",
    "L_m",
    "Ln_m",
    "H_m",
    "delta_deg",
    "a_idler_m",
    "R_m",
    "curve_kind",
    "paired_flight_id",
    "loading",
    "classify_status",
  ];
  const lines = [header.join(",")];
  for (const f of flights) {
    lines.push(
      [
        f.seq,
        f.id,
        f.branch,
        f.major_id,
        f.sub_id,
        f.L_m,
        f.Ln_m,
        f.H_m,
        f.delta_deg,
        f.a_idler_m,
        f.R_m ?? "",
        f.curve_kind ?? "",
        f.paired_flight_id ?? "",
        f.loading ? 1 : 0,
        f.classify_status,
      ]
        .map(esc)
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

/** 从 Flight CSV 更新 overrides（按 id） */
export function csvToFlightOverrides(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("Flight CSV：无数据");
  const header = rows[0].map((h) => h.toLowerCase());
  const idx = (name) => header.indexOf(name);
  if (idx("id") < 0) throw new Error("Flight CSV：缺少 id");
  const o = {};
  for (const r of rows.slice(1)) {
    const id = r[idx("id")];
    if (!id) continue;
    const num = (name) => {
      const j = idx(name);
      if (j < 0 || r[j] === "") return undefined;
      const v = parseFloat(r[j]);
      return Number.isFinite(v) ? v : undefined;
    };
    const str = (name) => {
      const j = idx(name);
      return j >= 0 && r[j] !== "" ? r[j] : undefined;
    };
    o[id] = {
      branch: str("branch"),
      major_id: str("major_id"),
      sub_id: str("sub_id"),
      a_idler_m: num("a_idler_m"),
      R_m: num("r_m"),
      curve_kind: str("curve_kind"),
      paired_flight_id: str("paired_flight_id"),
      loading: str("loading") === "1" || str("loading") === "true",
      classify_status: str("classify_status"),
    };
  }
  return o;
}
