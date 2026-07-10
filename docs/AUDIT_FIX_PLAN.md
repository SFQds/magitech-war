# 魔导工业革命 · 全面审计修复计划

> 审计日期：2026-07-10 | 设计文档对齐度：**约 35%** | 综合评分：**11/40**
>
> 审计依据：CODEX.md + GAME_DATA.md + ART_ASSETS.md
>
> 审计视角：世界观代入感 / 游戏性平衡 / 代码架构 / 系统合理性

---

## 🩸 P0 — 致命缺陷（代码行为不正确，必须立即修复）

### P0-1 联邦建筑造价 -20% 完全失效

- **来源**：系统性审计
- **位置**：`GameScene.ts:34-36`（BUILDING_COSTS 常量），`unitData.ts:189`（getBuildingCost 从未被调用）
- **影响**：联邦玩家白损失 20% 造价优势——所有建筑花费使用不含阵营倍率的 BUILDING_COSTS 常量
- **修复**：将所有 `BUILDING_COSTS[defId]` 替换为 `getBuildingCost(defId, faction)` 调用（confirmBuild / enterBuildMode / AI build 三处）

### P0-2 帝国研究+15% 仅对 AI 生效，玩家无效

- **来源**：系统性审计
- **位置**：`HUDScene.ts:178`（issueResearchCommand 直接使用 `td.time`）
- **影响**：帝国玩家享受不到研究速度被动——GameScene 的 research cmd 正确应用了倍率，但 HUDScene 的玩家路径绕过了
- **修复**：HUDScene 研究命令改用 `GameScene` 的 executeCommand 路径（已有正确实现），或在 HUDScene 中读取阵营倍率

### P0-3 步兵护甲+5 是死写入

- **来源**：系统性审计
- **位置**：`GameScene.ts:60-61`（applyTechToUnit 设置 armor=5），`Entity.ts:49`（takeDamage 只做 `hp -= amount`），`CombatSystem.ts:52-58`（calculateDamage 不读数字护甲）
- **影响**：`tech:infantry_armor` 对战斗零影响——Unit 类没有 `armor: number` 属性声明，Entity.takeDamage 没有护甲减伤计算
- **修复**：
  1. `Entity.ts`：已声明 `armor: number = 0` ✅
  2. `Entity.takeDamage`：已改为 `max(1, amount - this.armor)` ✅
  3. 需验证：CombatSystem 两处 `calculateDamage` 调用后，最终走 `target.takeDamage(damage)` 路径 → 护甲减伤应生效（需手动测试确认）

### P0-4 建筑在"建设中"期间即完全发挥作用

- **来源**：系统性审计
- **位置**：`Building.ts:14`（state=constructing 默认），`ResourceSystem.ts:112`（仅检查 isAlive），`ProductionSystem.ts:30-43`（生产推进不检查 building state）
- **影响**：建造计时器是纯装饰——建筑在放置的同一帧就提供满供给/工业/生产/HP
- **修复**：
  1. `ResourceSystem.updateResources`：过滤 `b.state === 'idle' || b.state === 'producing'`
  2. `ProductionSystem.updateProduction`：过滤 `b.state !== 'constructing'`
  3. 可选：建设中建筑 HP 降为 25%

### P0-5 开局建筑无科技效果回溯

- **来源**：系统性审计
- **位置**：`GameScene.ts:110-115`（techTree 在 addPlayer 之后创建，但 applyTechToBuilding 在 spawnFactionStartingUnits 中调用，此时 techEffects 全为默认值）
- **影响**：开局时所有科技效果缓存为默认值，起始 CC 未享受建筑 HP 加成（即使将来研究该科技）
- **修复**：在 `create()` 尾部对已有建筑调用 `applyTechToBuilding`（目前无影响因初期未研究任何科技，但逻辑正确性需要保证）

### P0-6 建造预览不跟随鼠标

- **来源**：玩家体验审查
- **位置**：`GameScene.ts:582` (update loop)
- **修复**：✅ 已在 update() 首行添加 `if (this.buildMode) this.updateBuildPreviewPosition();`

### P0-7 滚轮缩放无效

- **来源**：玩家体验审查
- **位置**：`GameScene.ts:setupKeyboard()`
- **修复**：✅ 已绑定 wheel 事件 → cameraCtrl.zoomAt()

### P0-8 场景启动竞态

- **来源**：玩家体验审查
- **位置**：`MenuScene.ts:201-206`
- **修复**：✅ MenuScene 只 start('GameScene')，GameScene 内部 launch('HUDScene')

### P0-9 EventBus 监听器泄漏

- **来源**：玩家体验审查
- **位置**：`EventBus.ts`，`HUDScene.ts:setupEvents()`
- **修复**：✅ 新增 offAll()，HUDScene 每次注册前先清理

---

## 🟡 P1 — 严重偏离（影响对局质量和设定一致性）

### P1-1 行会系统 MVP：奥术充能 + 流水线协议

- **来源**：世界观审计 #4.1 + 游戏性审计 #1
- **当前**：行会仅作为字符串存储，零功能代码
- **目标**：
  - 法师公会·奥术充能：每 30s 所有战斗法师/奥术单位 +1 充能层（最高 3），消耗层数释放护盾
  - 机械行会·流水线协议：工厂/车间支持 3 个相同单位并行训练
- **工作量**：~300 行（GuildChargeSystem + GuildProductionSystem + 数据配置）

### P1-2 L3 专属兵种：奥术守卫 + 铁锤步兵团

- **来源**：世界观审计 #3.4 + 游戏性审计 #6
- **当前**：10 个 L3 兵种零实现
- **目标**：
  - 奥术守卫：魔法/重甲+护盾，HP350/攻30/射1，护盾200 吸伤后 30s 再生，造价 500💎
  - 铁锤步兵团：物理/轻甲×5人编队，HP80×5/攻12×5/射5，AOE 独立计算，造价 350💎
- **工作量**：~150 行（UNIT_DEFS + CombatSystem 护盾逻辑 + AOE 编队逻辑）

### P1-3 帝国起始单位改为奥术守卫

- **来源**：世界观审计 #1.1
- **位置**：`unitData.ts:254`
- **修复**：`startingUnits: [['unit_worker', 3], ['unit_arcane_guard', 1]]`（需先实现 P1-2）

### P1-4 奥术重步属性回归设计规格

- **来源**：世界观审计 #3.1
- **位置**：`unitData.ts:70-75`
- **当前** vs **规格**：

| 属性 | 当前 | 规格 | 偏差 |
|------|------|------|------|
| 造价 | 600💎 | 350💎 | +71% |
| HP | 400 | 250 | +60% |
| 攻击 | 40 | 20 | +100% |
| 射程 | 2 | 4 | -50% |

- **修复**：回归 `{crystal:350, HP250, 攻20, 射4, 速1.8}`，定位为"防御型中距离步兵"而非"近战输出"

### P1-5 战斗法师用行会折扣价作基础价 → 改为基础价 300

- **来源**：世界观审计 #3.2
- **位置**：`unitData.ts:60`
- **修复**：`cost.crystal: 300, stats.damage: 25`（行会折扣在运行时计算）

### P1-6 水晶步枪兵伤害类型 physical → crystal

- **来源**：世界观审计 #2.1
- **位置**：`unitData.ts:55`
- **修复**：`dmgType: 'crystal'` ——让玩家从第一个单位就感受到水晶武器对机械 +25% 的独特属性

### P1-7 虚空伤害护甲穿透 50% 实现

- **来源**：游戏性审计 #1
- **位置**：`CombatSystem.ts:23`
- **当前**：`void: { light:1.0, heavy:1.0, shield:1.0, bio:1.25, structure:1.0, mechanical:1.0 }`
- **目标**：`void` 伤害应忽略目标 50% 的数字护甲值（`Entity.armor`），即 `target.armor * 0.5` 后参与减伤

### P1-8 AI 添加采矿场/科技研究/科技建筑建造

- **来源**：游戏性审计 #4.1-4.2
- **位置**：`EconomyAI.ts:102-118`
- **当前**：AI 只建兵营和工厂，不建采矿场/工业车间/科技建筑，不研究科技
- **修复**：
  1. 水晶 >500 时建造采矿场
  2. 水晶 >350 时建造科技建筑（古代典籍馆/流水线车间）
  3. 水晶 >300 时发起研究（倾向采集 → 高级采集，倾向防御 → 建筑加固）

### P1-9 AOE 伤害系统 + 掷弹兵

- **来源**：游戏性审计 #6.1
- **当前**：CombatSystem 完全没有范围伤害逻辑
- **目标**：
  1. `CombatSystem.calculateAOEDamage(center, radius)` → 对范围内所有敌对单位造成伤害
  2. 掷弹兵（250💎/炼金伤害/AOE半径2/攻30/射4）
- **工作量**：~80 行

### P1-10 伤害矩阵未使用护甲类型 mint shield/bio

- **来源**：系统性审计 #4
- **当前**：伤害矩阵定义了 shield/bio 的克制系数，但零单位使用这些护甲类型
- **修复**：P1-2 的奥术守卫使用 shield 护甲类型（护盾破碎后切换为 heavy），使矩阵中的护盾克制逻辑生效

---

## 🟢 P2 — 重要缺失（可排期，非阻塞性）

### P2-1 英雄系统 MVP — 伊莎贝尔 + 马库斯

- **来源**：世界观审计 #5.1
- **目标**：主基地训练、同时仅1英雄、死亡180s冷却、3主动+1被动、1-5级成长
- **工作量**：~400 行（Hero实体 + HeroSystem + AbilitySystem + HeroPanel UI）

### P2-2 工业产值恢复率调优

- **来源**：系统性审计 #3
- **当前**：`regenRate = 1 + cap * 0.1`→ 上限100时6秒回满，无约束力
- **建议**：`regenRate = 0.5 + cap * 0.03`→ 上限100时3.5/s≈29秒回满，产生有意义的等待

### P2-3 科技树解锁性 — 单位/建筑需要科技前提

- **来源**：游戏性审计 #3.3
- **当前**：所有单位无条件可训练
- **建议**：战斗法师需 `tech:battle_mage_training`、魔导机甲需 `tech:mech_assembly`，创造 timing attack 窗口

### P2-4 运输卡车装载/卸载机制

- **来源**：游戏性审计 #6.5
- **当前**：`Unit.cargo: Unit[]` 字段存在但无人使用
- **修复**：右键点击己方运输卡车 → 装载（最多12个步兵）；右键点击地面 → 卸载

### P2-5 三张地图添加中立建筑/野怪

- **来源**：游戏性审计 #9
- **当前**：所有地图 `neutralStructures: []`
- **修复**：在地图 JSON 中添加：废弃贸易站（中央）、远古符文遗迹（随机）、水晶精魄（矿脉旁）

### P2-6 小地图点击导航

- **来源**：玩家体验审查
- **位置**：`Minimap.ts`
- **修复**：`setInteractive()` + `pointerdown` → `cameraCtrl.centerOn()`

---

## 🔵 P3 — 代码架构债（P1 完成后启动）

### P3-1 拆分 GameScene（1435 行）

- **来源**：架构审计 #1
- **方案**：
  - `EntityManager` — 实体 CRUD + 快速查找 (~200 行)
  - `CommandExecutor` — executeCommand 全部逻辑 (~150 行)
  - `BuildController` — 建造模式状态机 (~100 行)
  - `ProjectileSystem` — 弹射物生成/更新/命中 (~120 行)
  - `FogRenderer` — 迷雾渲染 (~80 行)
- **工作量**：~650 行新代码 + 重构

### P3-2 EventBus 类型安全

- **来源**：架构审计 #2
- **方案**：泛型签名 `emit<T>(event, data: T)` + `EventDataMap` 映射
- **工作量**：~40 行

### P3-3 统一双类型系统

- **来源**：架构审计 #3
- **方案**：以 unitData.ts 为运行基线，合并 data.ts 中未实现字段（tier/techReq/favoredBy/exclusiveTo），删除 data.ts 重复接口
- **工作量**：~80 行

### P3-4 单元测试补全

- **来源**：架构审计 #9
- **优先级**：`MovementSystem.findPath()` > `CombatSystem.calculateDamage()` > `CombatSystem.findNearestEnemy()` > `ResourceSystem.gather()`
- **工具**：vitest + ts-jest
- **工作量**：~200 行测试代码

### P3-5 GameWorld 迁移为真·唯一状态源

- **来源**：架构审计 #10
- **方案**：新建 EntityRegistry，逐步迁移 units/buildings/fields/projectiles 数组
- **工作量**：~350 行 + 120 处引用替换

### P3-6 迷雾/小地图性能优化

- **来源**：系统性审计 #6-7
- **方案**：迷雾用 RenderTexture + 脏矩形、小地图地形层一次性烘焙
- **工作量**：~100 行

---

## 📊 工作量汇总

| 阶段 | 问题数 | 预估代码量 | 预估时间 |
|------|:--:|------|:--:|
| P0 致命修复 | 9 | ~80 行 | 0.5 天 |
| P1 严重偏离 | 10 | ~800 行 | 2 天 |
| P2 重要缺失 | 6 | ~600 行 | 1 天 |
| P3 架构债 | 6 | ~1400 行 | 2 天 |
| **合计** | **31** | **~2900 行** | **~5.5 天** |

---

## ✅ 已修复清单（本轮之前）

| 修复 | 状态 |
|------|:--:|
| 建造预览跟随鼠标 | ✅ |
| 滚轮缩放绑定 | ✅ |
| 场景启动竞态 | ✅ |
| EventBus 泄漏清理 | ✅ |
| 阵营魔法伤害 +10% 传参 | ✅ |
| AI 撤退方向修正 | ✅ |
| 步枪兵/法师数值平衡 | ✅ |
| 奥术重步性价比修复(造价→600,射程→2) | ✅ |
| AI 策略 fallback 修复 | ✅ |
| AI 后期重建建筑 | ✅ |
| 资源不足浮动提示 | ✅ |
| AI 建筑防叠放 | ✅ |
| 科技迁移至专属建筑 | ✅ |
| CC 移除 researches | ✅ |
| 5 张魔导工业精灵生成 | ✅ |
| 2 张阵营科技建筑精灵 | ✅ |

---

> **下一步**：确认 P0 修复范围后，按 P0 → P1 → P2 → P3 顺序执行。