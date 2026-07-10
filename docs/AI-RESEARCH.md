# RTS AI 机制调研报告

> 调研日期：2026-07-09 | 来源：经典 RTS 游戏 AI 体系 (StarCraft/SC2, Age of Empires 2/4, Warcraft 3, C&C 系列) + 学术界 RTS AI 文献

---

## 一、主流 RTS AI 架构模式

### 1. 三层分层架构（最成熟）

几乎所有商业 RTS 的 AI 都采用三层架构，每一层时间粒度不同：

```
┌─────────────────────────────────────┐
│  Strategy Layer  (每 30-60s)        │
│  - 选择科技路线                      │
│  - 决定扩张时机                      │
│  - 部署兵种组合比例                  │
│  - 评估对手策略→反制转型             │
├─────────────────────────────────────┤
│  Operational Layer  (每 3-10s)      │
│  - 编队分组（主力/骚扰/防守）        │
│  - 目标分配（谁打谁）                │
│  - 区域控制（防御/进攻/侦察分区）     │
├─────────────────────────────────────┤
│  Tactical Layer  (每帧 or 每 0.5s)  │
│  - 个体移动、攻击                    │
│  - 微操（hit-and-run, focus fire）   │
│  - 撤退/追击判断                     │
│  - 技能使用时机                      │
└─────────────────────────────────────┘
```

**关键洞察：** 当前项目已有 Tactical Layer（CombatSystem.findNearestEnemy），和 Strategy Layer 的雏形（EconomyAI.evaluate 选 build/train），**但完全缺失 Operational Layer**——这正是最影响玩家感知的层。

### 2. 经典 RTS AI 架构对比

| 游戏 | 架构 | 特点 |
|------|------|------|
| StarCraft: Brood War | 硬编码 FSM（有限状态机） | 脚本化 build order + 触发条件进攻 |
| StarCraft 2 | 策略池 + 轻量行为树 + 硬编码微操 | 多 AI 性格（经济型/快攻型/科技型） |
| Age of Empires 2 DE | GOAP（目标导向行动规划）+ 行为树 | 24 个 AI 性格（官方最新版） |
| Warcraft 3 | 触发器 + 有限单位控制 | 英雄作为战术核心节点 |
| Supreme Commander | 分层次决策 + SQLite 状态记忆 | 唯一无战争迷雾作弊的主流 AI |
| 0 A.D. (开源) | 行为树 (JavaScript) | Petra AI 是完全开放源码的参考实现 |
| Command & Conquer 3 | 硬编码状态机 + 难度调参 | 简单但高效 |

**结论：** 对于本项目（2D, 单人, 单位池小），**状态机 + 优先级行为树**是最合适的组合——比纯 FSM 灵活，比纯 Utility AI 简单。

---

## 二、目标选择与战斗决策

### StarCraft 2 AI 的目标选择优先级（简化版）

```
1. 正在攻击己方高价值单位的敌人  （保护优先）
2. 高 DPS 单位且可被秒杀          （优先减员）
3. 治疗/维修单位                   （切断续航）
4. 低血量单位 (<30%)              （收割）
5. 最近单位                        （默认行为）
```

**关键机制：威胁值（Threat Value）**  
很多 AI 为每个潜在目标计算威胁值 = DPS * 剩余血量 / 距离，选最高的攻击。这比单纯"找最近的"合理得多。

### Age of Empires 2 DE 的目标选择机制

AOE2 DE 的 AI 在攻击时考虑：
- **单位类型克制**：长枪兵优先攻击骑兵，掷矛兵优先攻击弓兵
- **资源价值**：优先攻击正在采集黄金的村民（黄金 > 石料 > 木材 > 食物）
- **位置价值**：优先攻击孤立单位（附近无敌方单位防守）
- **推进路线上**：清路的优先级高于追杀

### 威胁映射（Threat Map）— 经典技术

这是一种广泛使用的战术推理技术：

```
将地图划分为网格，每个格子累加：
  + 敌方单位 DPS × 射程覆盖
  + 敌方伤害减速光环
  - 己方单位 DPS × 射程覆盖
= 该格子的净威胁值

用途：
  - 选择低威胁路径推进
  - 决定撤退方向（向己方高威胁区走）
  - 判断"这里能不能打架"
```

---

## 三、编队与兵力分配

### StarCraft 经典编队模式

```
MainArmy    (70% 兵力) — 主力推进，正面战斗
HarassSquad (15% 兵力) — 多线骚扰矿区
DefenseSquad(10% 兵力) — 防守关键位置
ScoutUnit   (5% 兵力)  — 侦察/控图
```

编队不是一次性固定的——每次 Operational Layer 触发时重新评估兵力分布。

### AOE2 DE 的兵力分组

AOE2 DE 根据地图态势动态分组：
1. **进攻组**：目标是最有价值敌方建筑
2. **防守组**：目标是在己方核心区域消除威胁
3. **突袭组**：目标是最近的敌方经济区
4. **侦察组**：目标是扩大视野覆盖

每组独立选择目标、独立路径规划，互不干扰。

---

## 四、防御与撤退

### StarCraft 2 的撤退条件

```
撤退触发条件（任一条满足）：
1. 编队兵力 < 敌方在该区域兵力的 60%
2. 己方 3 秒内损失 > 20% 单位
3. 关键单位 (英雄/高价值) HP < 30%
4. 基地被攻击且进攻编队距离基地 > 30 tiles
```

### 防守优先级阶梯

```
Level 1: 基地受威胁 → 最近作战单位回防
Level 2: 矿区受威胁 → 调拨 20% 防守兵力
Level 3: 关键建筑受威胁 → 全体回防（最后手段）
Level 4: 全面撤退 → 保存有生力量
```

### Warcraft 3 的防守机制

由于英雄是关键单位，WC3 AI 防守逻辑和玩家接近：
- 城镇传送卷轴（Town Portal）：AI 在基地被攻击且前线优势不大时使用
- 民兵（Militia）：基地周围农民自动转换为民兵参战
- 防御塔优先攻击攻击己方农民的敌人

---

## 五、实施建议 — 针对本项目的改进路径

### 阶段 1：战术层补完（~200 行，MilitaryAI.ts）

**基于优先级权重化目标选择（替换当前盲目选择）：**

```
computeTargetScore(entity, refUnit):
  basePriority = entity.isBuilding 
    ? (CC→100, production→60, defense→40, other→20)
    : (attackingOurBase→90, highDPS→50, lowHP→70, normal→30)
  score = priority / (manhattanDistance + 1)
  return score

selectBestTarget(units, buildings):
  对所有敌方实体计算分数 → 选最高的
```

**持续管理单位（不再流放）：**

```
manageActiveUnits(units, target):
  for each unit:
    if unit.target is dead → reassign
    if unit.hpPercent < 0.3 → retreat toward nearest CC
    if unit is being kited (targetDistance unchanged for 3 ticks) → switch to nearest closer enemy
```

**基础防守触发：**

```
checkDefenseThreat(buildings, enemies):
  for each ownBuilding:
    nearbyEnemies = enemies within 6 tiles
    if nearbyEnemies.length > 0:
      idleCombatUnits = find idle or nearby combat units
      issue defend command
```

### 阶段 2：运营层构建（~300 行）

- 编队分组（主力/防守/侦察）
- 区域威胁评估
- 动态目标分配（各组独立目标）

### 阶段 3：策略层扩展（~200 行）

- 多 AI 性格（rush/balanced/boom）
- 反制对手策略检测
- 难度曲线

---

## 六、关键设计原则（从经典 RTS 总结）

1. **分时决策**：不同层以不同频率运行（策略 30s、运营 5s、战术 0.5s）
2. **状态回访**：AI 必须持续监控已发出的命令，不是发出就忘
3. **优先级驱动**：目标选择用权重而非硬编码分支
4. **防守优先**：防守决策优先级高于进攻
5. **难度不是数值**：easy AI 不是"资源少 30%"，而是"故意犯错"（慢反应、不集火、不撤退）
6. **可预测性**：AI 应该有可被玩家理解的"性格"，而非随机行为