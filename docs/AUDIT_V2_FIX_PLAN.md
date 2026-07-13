# 审计修复计划 V2 — 四维综合审计 (2026-07-11)

> 来源：设定一致性、游戏性平衡、代码架构、性能优化 四项独立审计
> 发现问题 36 项，按 P0/P1/P2 分级
> **已通过独立子代理审查并修订**

---

## 子代理审查意见（已纳入修订）

| 反馈 | 处理 |
|------|------|
| P0-8: 死英雄会被 `cleanupDeadEntities()` 清理掉 → 复活逻辑永远不触发 | ✅ 修订：复活步移到清理之前，Hero 在 reviveTimer≥0 时跳过清理 |
| P0-6: TechTree 拆分是最高风险项，应最后执行 | ✅ 修订：执行顺序改为数据优先→架构最后 |
| P0-2: 水晶伤害仅弱化 heavy+structure 可能不够，需增加第三个弱点 | ✅ 修订：增加 `bio: 0.75` |
| P1-8: 盾甲对 magic 从 1.5→0.75 过于激进 | ✅ 修订：改为 1.0x |
| P1-2: 行会系统升级是新功能非修复，应降低优先级 | ✅ 修订：降为 P2-15 |
| P2-10: O(N) findEntity 在热路径，应升 P1 | ✅ 修订：升为 P1-13 |
| V1 P0-2 (玩家研究速度) 需确认 HUD 是否走 CommandExecutor | ✅ 已验证：上次重构已改为 CommandExecutor 派发 |

---

## P0 — 致命缺陷（10 项）：必须立即修复

### P0-1. 数值护甲系统归零 → 全部单位实装护甲

**现状**：`Entity.armor` 默认 0，从未赋值。只有 `tech:infantry_armor` +5。设计文档规定了具体护甲值（scout=2, transport=5, turret=8, arcane_guard=15, isabelle=8, marcus=25）。

**修复**：
1. `src/config/unitData.ts` `UnitDefData.stats` 新增 `armorValue?: number` 字段
2. 为所有单位填充设计文档规定的护甲值
3. `src/controllers/UnitSpawner.ts` `spawnUnit()` 创建单位时设置 `unit.armor = def.stats.armorValue ?? 0`
4. `src/config/heroData.ts` 英雄定义新增 `armorValue` 字段并设置设计值
5. 修改 `Entity.takeDamage()`：`effectiveArmor` = `target.armor`（基础值）+ 科技加成（原有逻辑保持不变）

---

### P0-2. 水晶步枪兵伤害过高 → 降低水晶伤害矩阵

**现状**：水晶伤害只有盾甲 0.5x 弱点，通吃所有护甲类型。DPS/成本比是第二名 1.6 倍。

**修复**：
1. `src/systems/CombatSystem.ts` `DAMAGE_MATRIX` 水晶行修改：
   - `heavy: 0.75`（与 physical 对齐）
   - `structure: 0.5`（与 physical 对齐）
   - `bio: 0.75`（新增弱点，与 physical heavy 对称）
2. 步枪兵属性微调：训练时间 10→8s（对齐设计文档），伤害保持 16

---

### P0-3. AI 不训练 faction 专属单位 → 按阵营差异化

**现状**：`StrategyManager.preferredUnits` 硬编码，不含 `unit_arcane_guard` 和 `unit_hammer_squad`。

**修复**：
1. `src/ai/StrategyManager.ts` `preferredUnits` 改为 `getPreferredUnits(faction)` 函数
2. 帝国 late-game → `[unit_magitech_mech, unit_arcane_guard, unit_battle_mage]`
3. 联邦 late-game → `[unit_magitech_mech, unit_hammer_squad, unit_rifleman]`
4. `EconomyAI` 传入 faction 信息

---

### P0-4. 联邦开局碾压帝国 → 重新平衡起始资源

**现状**：联邦 +60% 工业、+100% 战斗单位、+33% 工人、-20% 建筑费、+15% 生产速度。

**修复**：
1. 联邦起始工业 80→65（-19%）
2. 帝国起始工业 50→55（+10%）
3. 帝国 CC 工业产出 50→65（+30%）
4. 联邦建筑费折扣 -20%→-15%（buildCostMult 0.8→0.85）
5. 帝国生产速度加入小幅加成（productionSpeedMult 1.0→0.95，即 +5%）
6. `src/config/unitData.ts` `FACTION_DEFS` 更新上述值

**平衡验证**：修改后联邦工业优势从 60% 降至 ~18%，帝国获得魔法伤害+研究速度作为补偿。

---

### P0-5. GameScene 上帝对象 → 主循环拆分

**现状**：952 行，200 行 `update()` 含 11 个步骤。

**修复**：
1. 提取 `GameLoop` 类：接收 step 函数列表，按序执行
2. `update()` 缩减为 ~60 行：初始化 deltaSec → 调用 `gameLoop.run()`
3. 每个 step 定义为独立 private 方法（或提取为小模块）：
   - `stepBuildPreview()`
   - `stepCamera()`
   - `stepMovement()`
   - `stepAI()`
   - `stepFogOfWar()`
   - `stepCombat()`
   - `stepGuildAndHero()`
   - `stepGathering()`
   - `stepProduction()`
   - `stepResearch()`
   - `stepProjectiles()`
   - `stepCleanup()`
   - `stepRender()`
4. 目标：GameScene ≤ 750 行，`update()` ≤ 60 行

---

### P0-6. 双方共用 TechTree → 每玩家独立实例

**现状**：`GameScene.techTree` 一个实例服务两个玩家。

**修复**：
1. `src/core/GameWorld.ts` 新增 `Map<number, TechTreeSystem>` `playerTechTrees`
2. `GameScene` 移除共享 `techTree`，改为 `getTechTree(playerIndex)`
3. `CommandExecutor.execResearch()` 使用对应玩家 TechTree
4. `techEffects` 配合 AI/玩家分离
5. 科技效果回溯应用（infantry_armor）按玩家区分

---

### P0-7. 迷雾每帧全图 fillRect → 渲染优化

**现状**：4096 次 `fillRect` 调用每帧。

**修复**：
1. `src/rendering/FogRenderer.ts` 改为维护 `Phaser.GameObjects.Image[]` 网格（每格一个半透明黑色方块）
2. 初始化时创建一次，之后只切换 visible/alpha
3. 只更新状态变化的瓦片（利用 FogOfWar 通知或脏标记）
4. 预期：GPU draw call 从 4096 降至 ~200（只修改可见边缘），或由 Phaser 自动批处理

---

### P0-8. 英雄复活系统 → 实装复活生成

**现状**：计时器到 0 后置 -999，永不生成。

**修复**：
1. `src/systems/HeroSystem.ts` 复活逻辑扩展：
   - 当 `reviveTimer === -999` 且 `hp <= 0` 时，在 CC 附近重新 spawn 英雄
   - 设置 `reviveTimer = heroDef.reviveCooldown`
   - 通过 EventBus 向 GameScene 发送 `HERO_REVIVE` 事件
   - GameScene 通过 `UnitSpawner.spawnUnit()` 生成新英雄实例
   - 复活成本 ×2（对齐设计）
2. **关键**：`GameScene.update()` 中复活检查步骤移到 `cleanupDeadEntities()` **之前**
3. `cleanupDeadEntities()` 不清理 `state === 'dead'` 且 `reviveTimer >= 0` 的 Hero
4. 复活时将旧 Hero 的 `reviveTimer` 重置到 > 0（防止重复复活）

---

### P0-9. Marcus 被动光环 → 实装局部 buff

**现状**：注释说"已由 faction 加成覆盖"，实际无位置判定无叠加。

**修复**：
1. `src/systems/HeroSystem.ts` marcus 被动逻辑：
   - 每帧检查周围 12 格范围内己方生产建筑
   - 对范围内的建筑设置 `productionSpeedBonus += 0.20`
   - 离开范围时移除 bonus
2. `src/entities/Building.ts` 新增 `productionSpeedBonus: number = 0`
3. `src/systems/ProductionSystem.ts` 生产 tick 时乘以 `(1 + building.productionSpeedBonus)`

---

### P0-10. A* 二叉堆优化

**现状**：open list 用线性扫描找最小值（O(N²) 总复杂度）。

**修复**：
1. `src/systems/MovementSystem.ts` 新增 `BinaryHeap<T>` 工具类（或在 `utils/` 下）
2. `findPath()` 内用二叉堆替代 `openList[]` 线性扫描
3. 预期：路径计算时间减少 50-80%

---

## P1 — 严重偏差（12 项）：优先在 P0 完成后处理

### P1-1. 无单位碰撞 → 加 tile-based 占用

**修复**：
1. `src/core/GameMap.ts` 新增 `occupiedTiles: Set<string>`（`"x,y"` 格式）
2. `isPassable()` 额外检查占用（但允许工人通过——防止卡采集）
3. `MovementSystem` 路径规划时跳过已占用瓦片
4. `addUnit()` 时标记（仅 combat 单位），`removeUnit()` 时清除

---

### P1-2. 补给泄漏 → 追踪每个单位的实际补给消耗

**修复**：
1. `Unit` 新增 `supplyCost: number` 字段
2. 创建时记录实际消耗
3. 死亡时返还实际消耗而非固定 1

---

### P1-3. AI 建造防御 + 侦查 + 英雄

**修复**：
1. `EconomyAI.ts` 新增 `buildWall()` 和 `buildTurret()` 决策（当压力高或水晶富余时）
2. 新增 `trainScout()` 决策（至少 1 辆侦察摩托）
3. 新增 `trainHero()` 决策（当水晶 ≥ 800 且尚未拥有英雄时）

---

### P1-4. 帝国开局单位修正

**修复**：
1. `FACTION_DEFS.arcane_empire.startingUnits` 改为 `[['unit_worker', 3], ['unit_arcane_guard', 1]]`

---

### P1-5. 建筑费用对齐设计

**修复**：
1. `BUILDING_DEFS.bld_barracks.cost`: 时间 15→20, industry 0→20
2. `BUILDING_DEFS.bld_refinery.cost`: industry 0→30

---

### P1-6. 英雄数据对齐设计文档

**修复**：
1. Isabelle: range 6→7, cooldown 1.2→1.5, armor=8
2. Marcus: cooldown 2.0→2.5, armor=25
3. Marcus 被动描述改为"训练消耗 -10%"（与设计一致）
4. 英雄主动技能加 20s 持续时间限制

---

### P1-7. arcane_guard 盾甲重平衡

**修复**：
1. 盾甲修改：magic 0.75x（从 1.5x 降），alchemy 1.25x（从 2.0x 降）
   - 审查反馈：magic 1.0x 更安全（arcane_guard 自身用 magic，1.0x 让镜像战斗不过度激烈）
   - 最终方案：magic 1.0x

---

### P1-8. battle_mage 性价比调整

**修复**：
1. 伤害 25→35（+40%）
2. 科技成本 250→200

---

### P1-9. 消灭 `as any` → 正确类型化

**修复**：
1. `Unit` 类声明 `gatherTimer: number = 0` 和 `unloadTarget: Point | null = null`
2. `FactionId` 从 getter 返回时保证类型（加类型守卫）
3. HUDScene 创建 `GameSceneAPI` interface 消除跨场景 `as any`

---

### P1-10. 消除 EconomyAI 重复的 UNIT_COSTS

**修复**：
1. 删除 `EconomyAI.UNIT_CRYSTAL_COST`
2. 改为从 `UNIT_DEFS[unitDefId].cost.crystal` 动态读取

---

### P1-11. aliveUnits getter 缓存优化

**修复**：
1. `EntityRegistry` 新增 `aliveUnitsCache: Unit[]`，在 `addUnit/removeUnit` 时维护
2. `get aliveUnits()` 改为返回缓存引用
3. `aliveBuildings`、`activeFields` 同理

---

### P1-12. CombatSystem.findEntity O(N) → O(1) Map 查找

**审查反馈**：原 P2-10 升为 P1——该函数在热路径（每单位每帧调用），修复简单。

**修复**：
1. `CombatSystem.updateCombat()` 改为接收 `EntityRegistry` 或接受 Map 参数
2. `findEntity()` 用 `unitMap.get(id) ?? buildingMap.get(id)` 替代数组 `.find()`

---

## P2 — 值得修复（15 项）：后续迭代做

| # | 问题 | 方向 |
|---|------|------|
| P2-1 | 唯一致胜条件 | 加 30 分钟分数胜利 |
| P2-2 | AI 难度无策略差异 | Hard 更早进攻、更激进扩张 |
| P2-3 | AI resourceMultiplier 无效 | 接入 EconomyAI 资源收入 |
| P2-4 | 英雄 XP 来源 | 击杀 +XP、时间 +XP |
| P2-5 | SoundBindings 泄漏 | 加 dispose() |
| P2-6 | HUDScene 跨场景耦合 | 建 GameSceneAPI interface |
| P2-7 | 建造逻辑重复 | 提取 createBuildingFromDef() 工厂 |
| P2-8 | UI 元素复用 | CommandCard + ProductionQueue 缓存 |
| P2-9 | 迷雾 FogOfWar O(W*H) | 脏列表优化 |
| P2-10 | Array.splice O(N) | swap-with-last |
| P2-11 | 每帧 array.map 分配 | 预分配缓冲区 |
| P2-12 | 缺失单位/建筑/科技 | 按 GAME_DATA.md 逐步补齐 |
| P2-13 | 科技树建筑归位 | 通用科技移回 CC |
| P2-14 | 水晶伤害可能仍需微调 | 游戏实测后确定是否需要更多弱点 |
| P2-15 | 行会系统从占位符升级为设计版 | 审查意见：需要玩家交互 + Building 结构变更，是新功能非修复。P2 后续迭代 |

---

## 执行顺序（已修订：数据优先→架构最后）

```
第1轮 (P0 致命):      P0-1 → P0-4 → P0-2 → P0-10 → P0-7 → P0-3 → P0-9 → P0-8 → P0-6 → P0-5
                      理由: 数据先行(低风险) → 工具优化 → AI → 英雄 → 架构(最高风险最后)

第2轮 (P1 严重):      P1-13 → P1-1 → P1-9 → P1-8 → P1-4 → P1-6 → P1-7 → P1-3 → P1-5 → P1-10 → P1-11 → P1-12
                      理由: 热路径性能 → 系统 → 平衡 → 数据 → AI → 代码质量

第3轮 (P2 值得):      根据时间逐一处理，P2-5/6/7/8 低风险可穿插进行
```

---

## 验收标准（每轮）

- [ ] `npx tsc --noEmit` 零错误
- [ ] 游戏可启动进入地图
- [ ] 单位可移动/攻击/建造/采集
- [ ] 建筑可建造且进度条显示
- [ ] 科技可研究且进度条显示
- [ ] AI 正常运作（建造+训练+进攻）
- [ ] 迷雾/小地图/血条正常渲染
- [ ] 60 FPS 稳定（无帧率下降）