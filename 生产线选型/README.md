# 托辊加工生产线部件选型

按任务书 **3.10 中间物流 / 3.11 机械手上料 / 3.12 智能料仓** 做可改参数的选型页。

四工种会审（Cursor 子代理，也可当驻场身份）：

- 机械设计高级工程师：`.cursor/agents/line-mechanical-engineer.md`
- 电气工程师：`.cursor/agents/line-electrical-engineer.md`
- 气动工程师：`.cursor/agents/line-pneumatic-engineer.md`
- 液压工程师：`.cursor/agents/line-hydraulic-engineer.md`

## 打开

```bash
cd 生产线选型 && ./start.sh
```

浏览器：http://127.0.0.1:8083/

或直接打开 `index.html`。

## 默认结论（任务书工况）

| 类别 | 首选 |
| --- | --- |
| 直线导轨 | 地轨 HGW45CC ×4 + HGR45R ×2；空中 HGW30CC |
| 气缸 | 空中 Z：MGPM63-200；夹管 CQ2B63×50-S ×2；上料 HFZ20 |
| 伺服电机 | 汇川 750 W 带刹车 MS1H4-75B30CB-A334Z + SV660NS0R7I，i=15 |
| 导向杆 | 镀铬棒 Φ35×500 ×4 |
| 导向套 | 无油衬套 MPBZ35-50 ×8 |
| 底座型钢 | 槽钢 20# 地轨梁 + 方管 80×80×6 车架 + 矩形管 160×80×6 托臂 |
| 四缸 | 亚德客 SI63×250-S-CM ×4，一阀同步 |

液压：**搬运系统不上**。压装工位独立 HOB80×200 + 2.2 kW 泵站。

计算书：[`选型计算书.md`](./选型计算书.md)

校核：`node verify.js`
