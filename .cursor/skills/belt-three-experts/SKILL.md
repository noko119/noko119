---
name: belt-three-experts
description: >-
  Before any code changes on the DTII(A) idler/belt-conveyor selection tool,
  run a three-expert consensus review (工艺工程师, 机械工程师, 计算机工程师)
  and present the agreed opinion to the user. Use for all implementation,
  refactors, and feature additions in this project—do not wait for the user
  to ask again.
---

# 托辊工具 · 写码前三专家一致意见

## 何时使用

在本仓库（DTII(A) 托辊选型计算工具及相关皮带机 PIDM 工作）中，**每次准备写代码、改逻辑、加功能之前**必须先走本流程。用户不会每次重复提醒。

## 必须执行的流程

1. **先讨论，后写码**：未给出三专家意见并形成一致结论前，不改代码、不提交。
2. **三位角色分别表态**（简短、专业、针对当前议题）：
   - **工艺工程师**：运量、物料、粒度、带速/带宽推荐与工艺可行性
   - **机械工程师**：DTII(A)/GB 手册尺寸、托辊/轴承/轴、力学校核、标准件边界
   - **计算机工程师**：页面交互、数据模型、可维护性、计算顺序与校验提示
3. **达成一致**：写出 1 段「一致意见」（做什么 / 不做什么 / 推荐与自定义如何并存）。
4. **等用户确认或继续指令后再实现**；若用户已明确说「按此实现/写吧」，再编码。
5. 实现时严格按一致意见执行；若实现中发现冲突，停下来再次走三专家流程。

## 输出格式（写码前固定使用）

```markdown
### 三专家意见

**工艺工程师：** …
**机械工程师：** …
**计算机工程师：** …

**一致意见：** …
（待你确认后再写代码）
```

## 范围提醒

- 本工具**只做托辊**，不做驱动/改向滚筒，除非用户明确扩大范围。
- 直径等产品规格只出手册标准档；计算值（如 D_min）可作为选型依据，不作为非标产品结果滥出。
- 推荐值与自定义值应并存，自定义后必须校核并提示不合格项。
