/**
 * 局部路径模板（对标 Sidewinder 模板快搭 + Belt Analyst Advanced）
 * 规则：插入后并入路径，允许再改；不是整机预制。
 * 单位：m；branch 默认 return（复杂回程局部块）
 */

/**
 * 双驱蛇形绕法模板（局部）
 * @param {{x:number,z:number,y?:number}} anchor 锚点（驱动站附近）
 * @param {{mainFirst?:boolean}} [opts]
 */
export function buildDualDriveWrapTemplate(anchor = { x: 64, z: 8 }, opts = {}) {
  const xd = anchor.x;
  const yd = anchor.y ?? 0;
  const zd = anchor.z;
  const mainFirst = opts.mainFirst !== false;
  return [
    {
      x: xd + 3.2,
      y: yd,
      z: zd + 1.6,
      type: "drive",
      branch: "return",
      label: "传动2",
      mainDrive: mainFirst,
      drum_D_mm: 1250,
      template: "dual_drive_wrap",
    },
    {
      x: xd + 1.0,
      y: yd,
      z: zd + 0.2,
      type: "bend",
      branch: "return",
      label: "改向21",
      drum_D_mm: 800,
      template: "dual_drive_wrap",
    },
    {
      x: xd - 0.8,
      y: yd,
      z: zd + 1.4,
      type: "bend",
      branch: "return",
      label: "改向22",
      drum_D_mm: 800,
      template: "dual_drive_wrap",
    },
    {
      x: xd - 2.8,
      y: yd,
      z: zd + 0.3,
      type: "drive",
      branch: "return",
      label: "传动1",
      mainDrive: !mainFirst,
      drum_D_mm: 1250,
      template: "dual_drive_wrap",
    },
    {
      x: xd - 4.5,
      y: yd,
      z: zd + 1.5,
      type: "bend",
      branch: "return",
      label: "改向3",
      drum_D_mm: 800,
      template: "dual_drive_wrap",
    },
  ];
}

/**
 * 垂直重锤拉紧模板（局部）
 * @param {{x:number,z:number,y?:number}} anchor 上改向附近
 * @param {number} [travel_m=10.5] 重锤行程示意
 */
export function buildGravityTakeupTemplate(anchor = { x: 58, z: 10 }, travel_m = 10.5) {
  const xt = anchor.x;
  const yt = anchor.y ?? 0;
  const ztTop = anchor.z;
  const ztBot = ztTop - travel_m;
  return [
    {
      x: xt + 2.0,
      y: yt,
      z: ztTop,
      type: "bend",
      branch: "return",
      label: "拉紧4",
      drum_D_mm: 630,
      template: "gravity_takeup",
    },
    {
      x: xt + 0.6,
      y: yt,
      z: ztTop - 0.3,
      type: "bend",
      branch: "return",
      label: "拉紧5",
      drum_D_mm: 630,
      template: "gravity_takeup",
    },
    {
      x: xt - 0.2,
      y: yt,
      z: ztBot,
      type: "takeup",
      branch: "return",
      label: "重锤6",
      drum_D_mm: 800,
      takeup_kind: "gravity",
      template: "gravity_takeup",
    },
    {
      x: xt - 1.2,
      y: yt,
      z: ztTop - 0.2,
      type: "bend",
      branch: "return",
      label: "拉紧7",
      drum_D_mm: 630,
      template: "gravity_takeup",
    },
    {
      x: xt - 2.4,
      y: yt,
      z: ztTop,
      type: "bend",
      branch: "return",
      label: "拉紧8",
      drum_D_mm: 630,
      template: "gravity_takeup",
    },
    {
      x: xt - 3.6,
      y: yt,
      z: ztTop - 0.5,
      type: "bend",
      branch: "return",
      label: "拉紧9",
      drum_D_mm: 630,
      template: "gravity_takeup",
    },
  ];
}

export const PATH_TEMPLATE_IDS = ["dual_drive_wrap", "gravity_takeup"];
