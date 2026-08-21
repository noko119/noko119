(function () {
  const $ = function (id) { return document.getElementById(id); };
  const C = window.LineCalc;
  let state = C.defaults();

  function el(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function num(name, label, step) {
    return (
      '<label>' + escapeHtml(label) +
      '<input type="number" name="' + name + '" step="' + (step || "1") + '" value="' + state[name] + '" /></label>'
    );
  }

  function renderForm() {
    const walls = C.ODS.map(function (od) {
      return (
        '<label>Φ' + od + ' 壁厚 mm' +
        '<input type="number" name="wall-' + od + '" step="0.25" min="2" value="' + state.walls[od] + '" /></label>'
      );
    }).join("");
    $("paramForm").innerHTML =
      num("pipeLenMax", "钢管最大长度 mm") +
      num("pipeLenMin", "钢管最小长度 mm") +
      num("shaftLenMax", "轴最大长度 mm") +
      num("shaftDia", "轴径 Φ mm") +
      num("pipesPerTrip", "一次搬运根数") +
      num("speedMPerMin", "输送速度 m/min", "0.5") +
      num("specPowerKw", "系统功率预算 kW", "0.05") +
      num("airWorkMPa", "工作气压 MPa", "0.05") +
      num("airCheckMPa", "校核气压 MPa", "0.05") +
      num("liftStroke", "四缸行程 mm") +
      num("railLength", "地轨长度 mm") +
      num("cartTareKg", "小车自重 kg") +
      num("armKg", "托臂自重 kg") +
      num("nLoader", "上料机械手数") +
      '<div class="wall-grid">' + walls + "</div>";
  }

  function readForm() {
    const f = $("paramForm");
    const n = function (name) { return Number(f.elements[name].value); };
    state.pipeLenMax = n("pipeLenMax");
    state.pipeLenMin = n("pipeLenMin");
    state.shaftLenMax = n("shaftLenMax");
    state.shaftDia = n("shaftDia");
    state.pipesPerTrip = n("pipesPerTrip");
    state.speedMPerMin = n("speedMPerMin");
    state.specPowerKw = n("specPowerKw");
    state.airWorkMPa = n("airWorkMPa");
    state.airCheckMPa = n("airCheckMPa");
    state.liftStroke = n("liftStroke");
    state.railLength = n("railLength");
    state.cartTareKg = n("cartTareKg");
    state.armKg = n("armKg");
    state.nLoader = n("nLoader");
    C.ODS.forEach(function (od) {
      state.walls[od] = Number(f.elements["wall-" + od].value);
    });
  }

  function schematic(r) {
    const pipes = [];
    for (let i = 0; i < Math.min(r.p.pipesPerTrip, 4); i++) {
      const x = 150 + i * 90;
      pipes.push(
        '<ellipse cx="' + x + '" cy="78" rx="34" ry="14" fill="#8a93a0" stroke="#d7dde6" stroke-width="2"/>' +
        '<rect x="' + (x - 34) + '" y="78" width="68" height="10" fill="#6b7380"/>' +
        '<ellipse cx="' + x + '" cy="88" rx="34" ry="14" fill="#9aa3b0" stroke="#eceff3" stroke-width="1.5"/>'
      );
    }
    return (
      '<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="移载小车示意图">' +
      '<rect x="20" y="210" width="520" height="8" rx="2" fill="#3d3a36"/>' +
      '<rect x="20" y="218" width="520" height="6" fill="#c45c32"/>' +
      '<path d="M40 226 h480" stroke="#2a2a28" stroke-width="2" stroke-dasharray="12 8"/>' +
      '<rect x="70" y="168" width="400" height="42" rx="4" fill="#5b5f66"/>' +
      '<rect x="70" y="198" width="400" height="14" fill="#c4452b"/>' +
      '<g fill="#7a8088">' +
      '<rect x="118" y="108" width="28" height="62" rx="10"/>' +
      '<rect x="208" y="108" width="28" height="62" rx="10"/>' +
      '<rect x="308" y="108" width="28" height="62" rx="10"/>' +
      '<rect x="398" y="108" width="28" height="62" rx="10"/>' +
      "</g>" +
      '<rect x="100" y="92" width="340" height="22" rx="3" fill="#d94830"/>' +
      '<g fill="none" stroke="#f2c9b8" stroke-width="3">' +
      '<path d="M140 92 l16-18 l16 18"/>' +
      '<path d="M230 92 l16-18 l16 18"/>' +
      '<path d="M320 92 l16-18 l16 18"/>' +
      '<path d="M410 92 l16-18 l16 18"/>' +
      "</g>" +
      pipes.join("") +
      '<path d="M470 204 h90 v-40 h40" fill="none" stroke="#1f1f1f" stroke-width="10"/>' +
      '<path d="M470 204 h90 v-40 h40" fill="none" stroke="#4b5563" stroke-width="6"/>' +
      '<text x="24" y="20" fill="#b3a496" font-size="12">四缸 SI' + r.cyl.bore + "×" + r.cyl.stroke + " · 导柱 Φ" + r.rod.d + " · " + r.rail.model + "</text>" +
      '<text x="24" y="38" fill="#e8e0d6" font-size="12">一次 ' + r.p.pipesPerTrip + " 根 · 最重 Φ" + r.heaviest.od + "×" + r.heaviest.t + " ×" + r.p.pipeLenMax + " = " + r.heaviest.kgMax + " kg</text>" +
      "</svg>"
    );
  }

  function loadResult(r) {
    const warn = r.warnings.map(function (w) { return '<div class="warn-box">' + escapeHtml(w) + "</div>"; }).join("");
    const powerClass = r.travel.powerOk ? "ok-text" : "bad-text";
    const rows = r.pipes.map(function (p) {
      return "<tr><td>Φ" + p.od + "×" + p.t + "</td><td>" + p.kgPerM + "</td><td>" + p.kgMin + "</td><td>" + p.kgMax + "</td></tr>";
    }).join("");
    $("loadResult").innerHTML =
      '<h3>载荷与功率</h3>' +
      '<div class="stats">' +
      '<div class="stat"><span>最重单管</span><b>' + r.heaviest.kgMax + " kg</b></div>" +
      '<div class="stat"><span>一次举升</span><b>' + r.liftKg + " kg</b></div>" +
      '<div class="stat"><span>小车运动质量</span><b>' + r.movingKg + " kg</b></div>" +
      '<div class="stat"><span>水平计算功率</span><b class="' + powerClass + '">' + (r.travel.pNeedW / 1000).toFixed(2) + " kW</b></div>" +
      "</div>" +
      warn +
      (r.travel.powerOk ? '<div class="ok-box">水平牵引 ' + r.travel.pNeedW + " W，落在任务书约 " + r.p.specPowerKw + " kW 内。750 W 伺服裕量用于起停、齿条效率和拖链阻力。</div>" : "") +
      '<dl class="kv">' +
      "<div><dt>最长轴 Φ" + r.p.shaftDia + "</dt><dd>" + r.shaftKg + " kg（圆钢，不与四管同时满载计入举升）</dd></div>" +
      "<div><dt>四缸 0.5 MPa</dt><dd>单缸推力 " + r.cyl.oneN + " N · 四缸 " + r.cyl.pushN + " N · 校核 SF " + r.cyl.sf + " · 工作 SF " + r.cyl.workSF + "</dd></div>" +
      "<div><dt>15 m/min 牵引力</dt><dd>摩擦 " + r.travel.fFric + " N + 加速 " + r.travel.fAcc + " N = " + r.travel.fTravel + " N；齿条额定 " + r.travel.fRated + " N</dd></div>" +
      "<div><dt>横梁挠度</dt><dd>" + r.steel.name + "，偏载 1.8 倍后 δ=" + r.steel.defMm + " mm（限 " + r.steel.limitMm + " mm，L/800）</dd></div>" +
      "</dl>" +
      '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>规格</th><th>kg/m</th><th>最短单重 kg</th><th>最长单重 kg</th></tr></thead><tbody>' +
      rows + "</tbody></table></div>";
  }

  function picks(r) {
    const z = r.gantry.zModel;
    const items = [
      {
        tag: "直线导轨",
        title: "地轨 " + r.rail.model,
        model: r.rail.rail + " ×2 / " + r.rail.model + " ×4",
        why: "运动质量 " + r.movingKg + " kg、轨长 " + r.p.railLength + " mm，车间铁屑用地轨 45 法兰。空中机械手改 " + r.gantry.rail.model + "。替代：" + r.rail.alt + "。",
      },
      {
        tag: "气缸",
        title: "夹爪 / Z 向 / 分料",
        model: z + " + CQ2B63×50-S ×2 + HFZ20",
        why: "空中机械手 Z 向带导杆气缸；长管两端 V 型包络夹（Φ89–219 标准气爪行程不够）。上料工位用 HFZ 系列快换爪。",
      },
      {
        tag: "伺服电机",
        title: r.servo.kw + " kW 带刹车",
        model: r.servo.motor + " / " + r.servo.drive,
        why: "任务书 ≤15 m/min、约 0.75 kW。i=15 行星 + m=2 z=25 齿条，15 m/min 时电机约 " + r.travel.motorRpmAtSpec + " r/min。替代：台达 ECMA-C20807SS + ASD-B3-0721-L。",
      },
      {
        tag: "导向杆",
        title: "四导柱 Φ" + r.rod.d,
        model: "镀铬棒 Φ" + r.rod.d + " h6 ×" + r.rod.length + " ×4",
        why: "S45C/GCr15 硬铬，表面 ≥HRC58。四缸浮动接头，侧向力不进缸杆。长度 = 行程 " + r.p.liftStroke + " + 衬套与余量。",
      },
      {
        tag: "导向套",
        title: "无油衬套 " + r.rod.bush,
        model: r.rod.bush + " ×" + r.rod.nBush,
        why: "铁屑车间不用滚珠直线轴承。每柱上下两套，间距尽量拉开抗倾覆。替代：JDB 石墨铜套同规格。",
      },
      {
        tag: "底座型钢",
        title: r.steel.base,
        model: r.steel.frame + " · 托臂 " + r.steel.name,
        why: "地轨梁 " + r.steel.trackBeam + "，与预埋板焊接后二次灌浆。托臂跨距 " + r.steel.span + " mm，Q235B。",
      },
      {
        tag: "四缸",
        title: "同步升降 " + r.cyl.model,
        model: "亚德客 " + r.cyl.model + " ×4",
        why: "一阀带四缸 + 刚性横梁同步。0.5 MPa 校核 SF=" + r.cyl.sf + "，单次排气约 " + r.cyl.airVolL + " L。禁止四阀分控。替代：SMC C96SDB" + r.cyl.bore + "-" + r.cyl.stroke + "。",
      },
    ];
    $("pickGrid").innerHTML = items.map(function (it) {
      return (
        '<article class="pick-card"><div class="tag">' + escapeHtml(it.tag) + "</div><h3>" +
        escapeHtml(it.title) + '</h3><div class="model">' + escapeHtml(it.model) +
        '</div><p class="why">' + escapeHtml(it.why) + "</p></article>"
      );
    }).join("");

    $("pickDetail").innerHTML =
      "<h3>订货要点</h3><ul class='tight'>" +
      "<li>导轨精度 H，预压 ZA/Z0；地轨加防尘折布，滑块带刮片。轨可 6 m 对接，接头错开。</li>" +
      "<li>四缸带磁环（-S），两端 CS1-S / D-A93；缸杆端浮动接头 M20，切勿把缸杆当导柱。</li>" +
      "<li>伺服必须带抱闸；原点 + 正负限位硬件存在，工位定位用接近开关与编码器双校。</li>" +
      "<li>液压不进小车。压装工位另配 HOB80×200 + 2.2 kW / 16 MPa 泵站。</li>" +
      "</ul>";
  }

  function sysBody(r) {
    $("sysBody").innerHTML =
      '<div class="card sys-block"><h3>3.10 中间物流系统</h3>' +
      '<p class="note">移载小车平移输送；定长切割 / 镗孔 / 吹屑之间为空中移载机械手，伺服平移 + 气动夹爪。</p>' +
      '<ul class="tight">' +
      "<li><span class='badge mech'>机械</span>小车：" + r.rail.model + " 四滑块 + 模数 2 淬火齿条；托臂四 V 型托，按 Φ219 放样、Φ89 仍能定心。</li>" +
      "<li><span class='badge elec'>电气</span>汇川 " + r.servo.drive + " + " + r.servo.motor + "（刹车）+ PLE80-" + r.p.reducerI + "。联动/单机点动两套权限，≤15 m/min 无级。</li>" +
      "<li><span class='badge pneu'>气动</span>四缸 " + r.cyl.model + " 共用 4V410-15；空中 Z 向 " + r.gantry.zModel + "；夹爪 CQ2B63×50-S 两端 V 型包络。</li>" +
      "<li><span class='badge hyd'>液压</span>本系统不上液压。0.75 kW 带不动泵站。</li>" +
      "</ul></div>" +
      '<div class="card sys-block"><h3>3.11 机械手上料系统</h3>' +
      '<p class="note">轴承座、轴承+密封环、密封组件、防护罩的抓取放置；I/O 与控制柜握手调程序。</p>' +
      '<ul class="tight">' +
      "<li><span class='badge mech'>机械</span>每工位直角坐标：X 福誉 FSL80 / 上银 KK86（行程 800–1200）+ Z 向 MGPM32-100。爪库按零件分套。</li>" +
      "<li><span class='badge elec'>电气</span>400 W 伺服（X）+ 200 W（可选 Y）。握手：请求 / 允许 / 完成 / 故障 + 程序号 4 bit。数量 " + r.p.nLoader + " 台。</li>" +
      "<li><span class='badge pneu'>气动</span>HFZ20 / MHD2-16 平行爪 + 真空 ZP 吸防护罩；每台独立减压阀 0.35–0.45 MPa。</li>" +
      "<li><span class='badge hyd'>液压</span>上料机械手不压装。压装力走工位油缸，机械手只到位不出力。</li>" +
      "</ul></div>" +
      '<div class="card sys-block"><h3>3.12 智能料仓系统</h3>' +
      '<p class="note">钢管、轴、轴承座、轴承+密封环、密封组件、挡盖预置；计数、低位报警；按最大允许储量设计。</p>' +
      '<ul class="tight">' +
      "<li><span class='badge mech'>机械</span>管仓步进链或重力斜槽（V 型，兼容 Φ89–219）；轴仓 V 架；小件料盒可换隔板。</li>" +
      "<li><span class='badge elec'>电气</span>光电 / 光纤计数，掉电保持；低位阈值 HMI 可设；三色灯 + 蜂鸣；可接 MES 但本机可独立跑。</li>" +
      "<li><span class='badge pneu'>气动</span>分料推出 MAL25×50 / TN16×20，避免一次掉两件。</li>" +
      "<li><span class='badge hyd'>液压</span>料仓无液压。</li>" +
      "</ul></div>";
  }

  function buildBom(r) {
    const p = r.p;
    const nL = p.nLoader;
    const railMm = p.railLength;
    const items = [
      ["3.10 小车", "直线导轨", "法兰滑块", r.rail.model, "H 精度 ZA 预压 带刮片", 4 * p.nCart, "只", "HIWIN 上银", r.rail.alt.split(" / ")[0], "机械", "地轨四滑块"],
      ["3.10 小车", "直线导轨", "导轨", r.rail.rail + "-" + railMm, "可 6 m 对接，接头错开 250 mm", 2 * p.nCart, "根", "HIWIN 上银", r.rail.alt.split(" / ")[0], "机械", "长度现场定尺"],
      ["3.10 小车", "伺服电机", "伺服电机带刹车", r.servo.motor, p.specPowerKw + " kW 3000 r/min 2.39 N·m", p.nCart, "台", "汇川", "台达 ECMA-C20807SS", "电气", "必须带抱闸"],
      ["3.10 小车", "伺服电机", "伺服驱动器", r.servo.drive, "220V 单相/三相按柜", p.nCart, "台", "汇川", "台达 ASD-B3-0721-L", "电气", ""],
      ["3.10 小车", "伺服电机", "行星减速机", "PLE80-" + p.reducerI, "i=" + p.reducerI + " 输出轴带齿条齿轮", p.nCart, "台", "纽氏达特", "世协 WABR090-" + p.reducerI, "机械", ""],
      ["3.10 小车", "伺服电机", "齿条", "模数" + p.pinionM + " 20×20 淬火", "长度≈" + railMm + " mm", 1 * p.nCart, "根", "YYC / 国产", "精铣齿条", "机械", "与导轨平行度 ≤0.05/1000"],
      ["3.10 小车", "伺服电机", "齿轮", "m=" + p.pinionM + " z=" + p.pinionZ, "分度圆 " + r.travel.pinionD + " mm", p.nCart, "只", "YYC / 国产", "", "机械", ""],
      ["3.10 小车", "四缸", "标准气缸", "亚德客 " + r.cyl.model, "带磁环 外螺纹", r.cyl.nCyl ? r.cyl.nCyl : 4, "支", "AirTAC 亚德客", "SMC C96SDB" + r.cyl.bore + "-" + r.cyl.stroke, "气动", "一阀带四缸"],
      ["3.10 小车", "四缸", "浮动接头", "F-M" + r.cyl.rod, "防侧向力进缸杆", 4, "只", "AirTAC", "SMC", "气动", ""],
      ["3.10 小车", "四缸", "电磁阀", "4V410-15 DC24V 双电控", "3/8\" 通径", 1, "只", "AirTAC", "SMC VF3230", "气动", "禁止四阀分控"],
      ["3.10 小车", "四缸", "排气节流", "ASC300-03", "两端调速", 8, "只", "AirTAC", "SMC", "气动", ""],
      ["3.10 小车", "四缸", "磁开关", "CS1-S DC24V", "每缸上下到位", 8, "只", "AirTAC", "SMC D-A93", "电气", "四路与后才允许平移"],
      ["3.10 小车", "气缸", "气源三联件", "AC4010-04", "1/2\" 过滤减压油雾", 1, "套", "AirTAC", "SMC AC40", "气动", "工作 0.6 MPa"],
      ["3.10 小车", "导向杆", "镀铬棒", "Φ" + r.rod.d + "×" + r.rod.length + " h6", "硬铬 HRC≥58 Ra0.4", r.rod.nRod, "支", "国产 / 米思米", "GCr15 淬火棒", "机械", ""],
      ["3.10 小车", "导向套", "无油衬套", r.rod.bush, "每柱上下各一", r.rod.nBush, "只", "米思米 / 国产", "JDB 石墨铜套", "机械", "粉尘不用直线滚珠轴承"],
      ["3.10 小车", "底座型钢", "小车底板", "Q235B 板 20 mm", "约 800×500 按图", 1, "块", "本地钢厂", "", "机械", ""],
      ["3.10 小车", "底座型钢", "车架方管", "80×80×6 Q235B", "下料按图", 8, "m", "本地钢厂", "", "机械", ""],
      ["3.10 小车", "底座型钢", "托臂", r.steel.name + " Q235B", "长 " + r.steel.span + " mm", 1, "根", "本地钢厂", "可改箱型焊件", "机械", "四 V 托按 Φ219 放样"],
      ["3.10 小车", "底座型钢", "地轨梁", r.steel.trackBeam, "2 根通长 " + railMm + " mm", 2, "根", "本地钢厂", "", "机械", "预埋后二次灌浆"],
      ["3.10 小车", "底座型钢", "V 型托", "板 12 mm 折弯/机加", "淬火或堆焊耐磨", 4, "件", "自制", "", "机械", ""],
      ["3.10 小车", "其他", "拖链", "桥式 45×75 R100", "长≈轨长 + 折返", 1, "套", "易格斯 / 国产", "全封闭 45 系列", "电气", "照片可见地拖链"],
      ["3.10 小车", "其他", "电动润滑泵", "2 L 油脂泵 220V", "导轨/齿条定量", 1, "套", "国产", "赫格隆", "机械", "照片左侧油杯"],
      ["3.10 小车", "其他", "接近开关", "LJ18A3-8-Z/BX NPN", "工位双校验 + 原点/正负限", 16, "只", "欧姆龙/沪工", "E2E-X8", "电气", "多点限位"],
      ["3.10 机械手", "直线导轨", "空中导轨滑块", r.gantry.rail.model, "龙门平移", 4, "只", "HIWIN 上银", r.gantry.rail.alt.split(" / ")[0], "机械", ""],
      ["3.10 机械手", "直线导轨", "空中导轨", r.gantry.rail.rail + "-" + p.gantryTravel, "龙门跨切割-镗孔-吹屑", 2, "根", "HIWIN 上银", "", "机械", "跨距现场定"],
      ["3.10 机械手", "伺服电机", "平移伺服带刹车", r.servo.motor, "可与小车同型号减少备件", 1, "台", "汇川", "台达 750W", "电气", ""],
      ["3.10 机械手", "伺服电机", "驱动器", r.servo.drive, "", 1, "台", "汇川", "台达", "电气", ""],
      ["3.10 机械手", "气缸", "带导杆气缸", r.gantry.zModel + "-Z73", "Z 向升降", 1, "支", "SMC", "亚德客 TCM" + r.gantry.zBore.bore + "-200", "气动", ""],
      ["3.10 机械手", "气缸", "夹管气缸", "CQ2B63×50-S", "两端 V 型包络 Φ89–219", 2, "支", "SMC", "亚德客 SDA63×50", "气动", "标准气爪行程不够"],
      ["3.10 机械手", "底座型钢", "龙门立柱/横梁", "HW150 + 矩形管 200×150×8", "按跨距", 1, "套", "本地钢厂", "", "机械", ""],
      ["3.11 上料", "直线导轨", "模组滑台", "FSL80 / KK86 行程 1000", "X 向", nL, "套", "福誉 / 上银", "双轨模组", "机械", ""],
      ["3.11 上料", "伺服电机", "400W 带刹车", "MS1H4-40B30CB-A334Z", "X 向", nL, "台", "汇川", "台达 400W", "电气", ""],
      ["3.11 上料", "伺服电机", "400W 驱动", "SV660NS0R4I", "", nL, "台", "汇川", "台达", "电气", ""],
      ["3.11 上料", "气缸", "Z 向三轴缸", "MGPM32-100-Z73", "", nL, "支", "SMC", "亚德客 TCM32-100", "气动", ""],
      ["3.11 上料", "气缸", "平行气爪", "HFZ20 / MHD2-16", "轴承座/轴承/密封分爪", nL * 2, "只", "AirTAC / SMC", "", "气动", "快换爪"],
      ["3.11 上料", "气缸", "真空吸盘", "ZP32CN 带真空发生器", "防护罩/挡盖", nL, "套", "SMC", "亚德客", "气动", ""],
      ["3.11 上料", "其他", "I/O 模块", "16DI/16DO DC24V", "请求允许完成故障+程序号", nL, "套", "汇川 / 西门子", "", "电气", "与控制柜握手"],
      ["3.12 料仓", "气缸", "分料气缸", "MAL25×50-S", "管/轴/小件推出", 6, "支", "AirTAC", "SMC", "气动", "防双料"],
      ["3.12 料仓", "其他", "光电计数", "E3Z-D61 / 光纤", "每种物料独立", 6, "套", "欧姆龙", "沪工", "电气", "低位可设"],
      ["3.12 料仓", "底座型钢", "管仓 / 轴架", "V 型架 + 方管 60×60×4", "按最大储量", 1, "套", "自制", "", "机械", "兼容 Φ89–219"],
      ["3.12 料仓", "其他", "三色灯+蜂鸣", "LTA-505 DC24V", "低位补料", 1, "套", "可莱特 / 国产", "", "电气", ""],
      ["压装工位", "液压", "压装油缸", "HOB80×200", "16 MPa 约 80 kN", Math.max(nL, 1), "支", "国产 HOB", "榆次", "液压", "不进 0.75 kW 预算"],
      ["压装工位", "液压", "泵站", "2.2 kW 16 MPa 40 L", "叠加溢流+液控单向保压", Math.max(nL, 1), "套", "国产", "华德", "液压", "工位独立"],
    ];
    return items.map(function (row) {
      return {
        sys: row[0], cat: row[1], name: row[2], model: row[3], spec: row[4],
        qty: row[5], unit: row[6], brand: row[7], alt: row[8], disc: row[9], note: row[10],
      };
    });
  }

  function bomTable(r) {
    const items = buildBom(r);
    const head = "<thead><tr><th>系统</th><th>类别</th><th>名称</th><th>型号</th><th>规格</th><th>数量</th><th>品牌</th><th>替代</th><th>工种</th><th>备注</th></tr></thead>";
    const body = items.map(function (it) {
      return "<tr><td>" + escapeHtml(it.sys) + "</td><td>" + escapeHtml(it.cat) + "</td><td>" +
        escapeHtml(it.name) + "</td><td>" + escapeHtml(it.model) + "</td><td>" + escapeHtml(it.spec) +
        "</td><td>" + it.qty + " " + escapeHtml(it.unit) + "</td><td>" + escapeHtml(it.brand) +
        "</td><td>" + escapeHtml(it.alt) + "</td><td>" + escapeHtml(it.disc) + "</td><td>" +
        escapeHtml(it.note) + "</td></tr>";
    }).join("");
    $("bomTable").innerHTML = "<table>" + head + "<tbody>" + body + "</tbody></table>";
    window._bom = items;
  }

  function review(r) {
    const cards = [
      {
        cls: "mech", title: "机械设计高级工程师",
        body:
          "<p>地轨用 " + r.rail.model + " 不是因为静载不够 35，而是 12 m 级轨的刚度和铁屑槽。滑块四点、齿条靠一侧，导轨受倾覆。</p>" +
          "<p>四缸 " + r.cyl.model + " 只出轴向力，Φ" + r.rod.d + " 四导柱 + " + r.rod.bush + " 抗偏载。托臂 " + r.steel.name + "，V 托按 Φ219 放样。</p>" +
          "<p>空中机械手夹 Φ89–219 必须自制 V 型包络，不要买行程 20 mm 的标准气爪。型钢全部 Q235B，地轨梁灌浆后再上导轨。</p>",
      },
      {
        cls: "elec", title: "电气工程师",
        body:
          "<p>小车与空中平移统一 " + r.servo.kw + " kW 带刹车，备件一种。15 m/min 对应电机约 " + r.travel.motorRpmAtSpec + " r/min，用电子齿轮无级。计算轴功率 " + r.travel.pNeedW + " W，0.75 kW 预算成立。</p>" +
          "<p>联锁：四缸 8 个磁开关全到位 ∧ 对方工位允许，才使能水平伺服。每工位两个接近开关，与编码器位置互校。</p>" +
          "<p>3.11 握手四线 + 程序号；3.12 计数掉电保持、低位可设。液压站电机不进本柜 0.75 kW 回路。</p>",
      },
      {
        cls: "pneu", title: "气动工程师",
        body:
          "<p>气源按 " + r.p.airCheckMPa + " MPa 校核、" + r.p.airWorkMPa + " MPa 工作。四缸合用一只 4V410-15，排气节流，上升比下降慢。单次约 " + r.cyl.airVolL + " L，不要用 6 mm 气管。</p>" +
          "<p>夹管单独减压，薄壁 Φ89 防夹扁。Z 向用带导杆缸 " + r.gantry.zModel + "，不要用光杆缸去抗侧向。</p>" +
          "<p>粉尘：三联件过滤，导向用无油衬套。气缸磁开关接线进安全回路，不是只给 HMI 看。</p>",
      },
      {
        cls: "hyd", title: "液压工程师",
        body:
          "<p class='ok-box'>3.10 / 3.11 搬运、3.12 料仓全部不用液压。系统功率约 0.75 kW，上泵站是错配。</p>" +
          "<p>液压只给压装：HOB80×200，16 MPa，推力约 80 kN，覆盖轴承座/轴承/密封过盈。泵站 2.2 kW 独立配电，叠加溢流 + 液控单向保压。</p>" +
          "<p>两端同时压才加分流阀；单端压装不要同步块。机械手到位后油缸才加压，压力继电器作为完成信号给电气。</p>",
      },
    ];
    $("reviewBody").innerHTML = cards.map(function (c) {
      return '<article class="card review-card"><h3><span class="badge ' + c.cls + '">' +
        (c.cls === "mech" ? "机械" : c.cls === "elec" ? "电气" : c.cls === "pneu" ? "气动" : "液压") +
        "</span>" + c.title + "</h3>" + c.body + "</article>";
    }).join("");
  }

  function refresh() {
    const r = C.analyze(state);
    $("schematic").innerHTML = schematic(r);
    loadResult(r);
    picks(r);
    sysBody(r);
    bomTable(r);
    review(r);
    window._result = r;
  }

  function toCsv(items) {
    const h = ["系统", "类别", "名称", "型号", "规格", "数量", "单位", "品牌", "替代", "工种", "备注"];
    const lines = [h.join(",")];
    items.forEach(function (it) {
      const row = [it.sys, it.cat, it.name, it.model, it.spec, it.qty, it.unit, it.brand, it.alt, it.disc, it.note];
      lines.push(row.map(function (c) {
        const s = String(c == null ? "" : c).replace(/"/g, '""');
        return /[",\n]/.test(s) ? '"' + s + '"' : s;
      }).join(","));
    });
    return lines.join("\n");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      $("panel-" + btn.getAttribute("data-panel")).classList.add("active");
    });
  });

  $("paramForm").addEventListener("input", function () {
    readForm();
    refresh();
  });

  $("copyBtn").addEventListener("click", function () {
    const items = window._bom || [];
    const text = items.map(function (it) {
      return [it.sys, it.cat, it.name, it.model, it.spec, it.qty + it.unit, it.brand, it.note].join("\t");
    }).join("\n");
    copyText(text).then(function () { $("bomMsg").textContent = "已复制 " + items.length + " 行"; });
  });

  $("csvBtn").addEventListener("click", function () {
    const csv = "\ufeff" + toCsv(window._bom || []);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "托辊生产线部件选型BOM.csv";
    a.click();
    $("bomMsg").textContent = "已导出 CSV";
  });

  $("printBtn").addEventListener("click", function () { window.print(); });

  renderForm();
  refresh();
})();
