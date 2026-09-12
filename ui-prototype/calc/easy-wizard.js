/**
 * Easy 向导（对标 Sidewinder Easy）
 * 少参数快搭：水平机长 Ln、提升 H、回程间距 → 承载折线 + Auto Return 闭环
 */

import { buildAutoReturnLoop } from "./auto-return.js";

/**
 * @param {{
 *   Ln_m?: number,
 *   H_m?: number,
 *   return_offset_m?: number,
 *   mid_points?: number,
 *   head_overhang_m?: number,
 *   drive_at?: 'head'|'tail',
 * }} opts
 */
export function buildEasyInclineConveyor(opts = {}) {
  const Ln = Number.isFinite(opts.Ln_m) ? opts.Ln_m : 100;
  const H = Number.isFinite(opts.H_m) ? opts.H_m : 20;
  const offset = Number.isFinite(opts.return_offset_m) ? opts.return_offset_m : 1.2;
  const mids = Math.max(0, Math.min(8, Math.floor(opts.mid_points ?? 2)));
  const overhang = Number.isFinite(opts.head_overhang_m) ? opts.head_overhang_m : 2;
  const driveAt = opts.drive_at === "tail" ? "tail" : "head";

  if (!(Ln > 0)) throw new Error("Easy 向导：Ln 必须 > 0");

  const carry = [];
  const push = (partial) => {
    carry.push({
      id: partial.id,
      x: +partial.x.toFixed(4),
      y: 0,
      z: +partial.z.toFixed(4),
      type: partial.type || "node",
      branch: "carry",
      strand: "carry",
      mainDrive: !!partial.mainDrive,
      drum_D_mm: partial.drum_D_mm,
      label: partial.label,
    });
  };

  push({
    id: "easy_tail",
    x: 0,
    z: 0,
    type: "tail",
    label: "尾滚筒",
    drum_D_mm: 800,
    mainDrive: driveAt === "tail",
  });

  for (let i = 1; i <= mids; i++) {
    const t = i / (mids + 1);
    push({
      id: `easy_mid_${i}`,
      x: Ln * t,
      z: H * t,
      type: "node",
      label: `承载${i}`,
    });
  }

  if (driveAt === "head") {
    push({
      id: "easy_drive",
      x: Ln,
      z: H,
      type: "drive",
      label: "传动（主驱）",
      drum_D_mm: 1000,
      mainDrive: true,
    });
    push({
      id: "easy_head",
      x: Ln + overhang,
      z: H,
      type: "head",
      label: "头滚筒",
      drum_D_mm: 800,
    });
  } else {
    push({
      id: "easy_head",
      x: Ln,
      z: H,
      type: "head",
      label: "头滚筒",
      drum_D_mm: 800,
    });
  }

  const { nodes, meta } = buildAutoReturnLoop(carry, {
    offset_m: offset,
    mode: "auto",
  });

  return {
    nodes,
    meta: {
      ...meta,
      source: "easy_wizard",
      wizard: "incline_simple",
      Ln_m: Ln,
      H_m: H,
      delta_deg: +((Math.atan2(H, Ln) * 180) / Math.PI).toFixed(4),
      note: "Easy 向导生成：可继续在编辑器精修，或切 Advanced 改回程",
    },
  };
}

/** 机型库快搭（对标 Sidewinder Easy 模板） */
export const EASY_PRESETS = [
  {
    id: "incline_short",
    name: "短斜坡上运",
    desc: "Ln=80 m · H=15 m · 头驱",
    opts: { Ln_m: 80, H_m: 15, return_offset_m: 1.2, mid_points: 2, drive_at: "head" },
  },
  {
    id: "incline_gc01_like",
    name: "高炉上料级斜坡（示意）",
    desc: "Ln=305 m · H=57 m · 头驱",
    opts: { Ln_m: 304.88, H_m: 57.051, return_offset_m: 1.8, mid_points: 3, drive_at: "head" },
  },
  {
    id: "flat_transfer",
    name: "近水平转载",
    desc: "Ln=120 m · H=3 m · 头驱",
    opts: { Ln_m: 120, H_m: 3, return_offset_m: 1.0, mid_points: 1, drive_at: "head" },
  },
  {
    id: "tail_drive_decline",
    name: "下运尾驱",
    desc: "Ln=100 m · H=-20 m · 尾驱",
    opts: { Ln_m: 100, H_m: -20, return_offset_m: 1.2, mid_points: 2, drive_at: "tail" },
  },
];

export function buildEasyFromPreset(presetId, overrides = {}) {
  const p = EASY_PRESETS.find((x) => x.id === presetId);
  if (!p) throw new Error("未知 Easy 机型：" + presetId);
  const out = buildEasyInclineConveyor({ ...p.opts, ...overrides });
  out.meta.preset_id = p.id;
  out.meta.preset_name = p.name;
  return out;
}
