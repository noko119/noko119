/**
 * 组装示意图：绿色连续内锥 + 彩色外套分段
 * 每节醒目标注自动选出的管子外径
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

  const W = 920;
  const padT = 72;
  const plotH = 520;
  const axis = 360;
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

  // 顶部外径汇总条（最显眼）
  const odBanner = `
    <rect x="16" y="8" width="${W - 32}" height="52" rx="10" fill="#fff4e8" stroke="#c45c26" stroke-width="2"/>
    <text x="28" y="30" fill="#8a2e0e" font-size="14" font-weight="800">自动选出的管子外径（每节）</text>
    <text x="28" y="50" fill="#2f4a56" font-size="13" font-weight="700">${sleeves
      .map((s) => `套${s.index}：ø${t(s.outerOd)}`)
      .join("　　")}</text>
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

  const sleevePaths = sleeves
    .map((s, i) => {
      const color = SLEEVE_COLORS[i % SLEEVE_COLORS.length];
      const yA = yAt(s.z0);
      const yB = yAt(s.z1);
      const out = xR(s.outerOd);
      const innA = xR(s.coneAtTop);
      const innB = xR(s.coneAtBot);
      const right = `M ${axis + innA} ${yA} L ${axis + out} ${yA} L ${axis + out} ${yB} L ${axis + innB} ${yB} Z`;
      const left = `M ${axis - innA} ${yA} L ${axis - out} ${yA} L ${axis - out} ${yB} L ${axis - innB} ${yB} Z`;
      let lip = "";
      if (s.femaleSleeve && i < sleeves.length - 1) {
        const nest = Math.min(18, (yB - yA) * 0.2);
        const lipIn = out - xR(6);
        lip = `
          <path d="M ${axis + lipIn} ${yB} L ${axis + out} ${yB} L ${axis + out} ${yB + nest} L ${axis + lipIn} ${yB + nest} Z"
            fill="${color}" stroke="#2f4a56" stroke-width="1" opacity="0.95"/>
          <path d="M ${axis - lipIn} ${yB} L ${axis - out} ${yB} L ${axis - out} ${yB + nest} L ${axis - lipIn} ${yB + nest} Z"
            fill="${color}" stroke="#2f4a56" stroke-width="1" opacity="0.95"/>
        `;
      }

      const yMid = (yA + yB) / 2;
      // 壁厚中间放白底大号外径牌
      const badgeX = axis + (innA + out) / 2;
      const badgeW = 86;
      const badgeH = 36;
      const odBadge = `
        <rect x="${badgeX - badgeW / 2}" y="${yMid - badgeH / 2}" width="${badgeW}" height="${badgeH}"
          rx="8" fill="#ffffff" stroke="#8a2e0e" stroke-width="2.5"/>
        <text x="${badgeX}" y="${yMid - 2}" text-anchor="middle" fill="#8a2e0e" font-size="15" font-weight="900">ø${t(s.outerOd)}</text>
        <text x="${badgeX}" y="${yMid + 14}" text-anchor="middle" fill="#2f4a56" font-size="10" font-weight="700">外径·自动</text>
      `;
      // 右侧再写一行全称
      const sideX = axis + out + 18;
      const side = `
        <text x="${sideX}" y="${yMid - 6}" fill="#8a2e0e" font-size="13" font-weight="800">套${s.index} 外径 ø${t(s.outerOd)}</text>
        <text x="${sideX}" y="${yMid + 12}" fill="#5c6b64" font-size="10" font-weight="600">${s.pipeLabel || ""}</text>
      `;

      return `
        <path d="${right}" fill="${color}" fill-opacity="0.72" stroke="#2f4a56" stroke-width="1.15"/>
        <path d="${left}" fill="${color}" fill-opacity="0.72" stroke="#2f4a56" stroke-width="1.15"/>
        ${lip}
        ${odBadge}
        ${side}
      `;
    })
    .join("");

  const jointLabels = joints
    .map((j) => {
      const y = yAt(j.z);
      const stack = (j.jointStack || []).map((x) => `${x.name}${x.h}`).join("+");
      return `
        <text x="24" y="${y - 2}" fill="#1f6f5b" font-size="9" font-weight="700">${j.designation}</text>
        <text x="24" y="${y + 11}" fill="#5c6b64" font-size="8">${stack}</text>
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

  const detail = renderJointDetail(680, yH - 130, joints[0]);

  const legendY = yH + 36;
  const items = [
    `内锥（绿）ø${t(cone.topDia)} → ø${t(cone.bottomDia)} · 高 ${t(cone.height)}`,
    ...sleeves.map((s) => `套${s.index} 管子外径 ø${t(s.outerOd)}（${s.pipeLabel || "自动"}）· ${t(s.length)}mm`),
    ...joints.map((j) => `接头${j.index} ${j.designation} @z=${t(j.z)}`),
  ];
  const legend = items
    .map((label, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      return `<text x="${20 + col * 440}" y="${legendY + row * 16}" fill="#5c6b64" font-size="10" font-weight="600">${label}</text>`;
    })
    .join("");
  const H = legendY + Math.ceil(items.length / 2) * 16 + 20;

  return `
  <svg viewBox="0 0 ${W} ${H}" class="diagram" role="img" aria-label="内锥加外套组装示意图（含管子外径）">
    ${odBanner}
    <text x="20" y="${padT - 8}" fill="#2f4a56" font-size="12" font-weight="700">组装示意图 · 白底红框数字 = 该节管子外径</text>
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

function renderJointDetail(x0, y0, joint) {
  const title = joint ? joint.designation : "12+1+10+1";
  return `
  <g transform="translate(${x0},${y0})">
    <rect width="220" height="112" rx="8" fill="#fff" stroke="#2f4a56"/>
    <text x="10" y="16" fill="#2f4a56" font-size="10" font-weight="700">接头细节 · ${title}</text>
    <path d="M24,28 L95,28 L95,70 L82,70 L82,52 L40,52 L40,70 L24,70 Z" fill="#c45c5c" stroke="#2f4a56"/>
    <path d="M40,40 L82,40 L78,100 L44,100 Z" fill="#3d9b5f" stroke="#2f4a56"/>
    <line x1="48" y1="40" x2="46" y2="100" stroke="#e67e22" stroke-width="1.6"/>
    <line x1="74" y1="40" x2="76" y2="100" stroke="#e67e22" stroke-width="1.6"/>
    <text x="108" y="40" fill="#c45c5c" font-size="9" font-weight="700">外套</text>
    <text x="108" y="56" fill="#5c6b64" font-size="8">旋合 12 · 间隙 1</text>
    <text x="108" y="70" fill="#5c6b64" font-size="8">止口 10 · 间隙 1</text>
    <text x="108" y="88" fill="#3d9b5f" font-size="9" font-weight="700">内锥贴合</text>
    <text x="108" y="102" fill="#e67e22" font-size="8">锥面连续</text>
  </g>`;
}

export const renderAssembledConeDiagram = renderConeMoldDiagram;
