# 架构重构计划 — GameScene 拆分 + 类型系统统一

> 计划日期：2026-07-11 | 风险等级：**高** | 预估工作量：~1200 行

---

## 一、目标

1. GameScene 从 1450 行缩减到 ~600 行（纯编排调度）
2. 消除 `src/types/data.ts` 与 `src/config/unitData.ts` 的双重类型系统

---

## 二、GameScene 拆分方案

### 2.1 现状诊断

`GameScene.ts` 当前包含以下职责混合（按行数）：

| 职责块 | 行数 | 应归属模块 |
|------|:--:|------|
| 实体管理（CRUD + Map索引 + 精灵绑定） | ~120 | `EntityManager` |
| 命令执行（9种命令switch-case） | ~140 | `CommandExecutor` |
| 建造系统（模式/预览/确认/进度） | ~100 | `BuildController` |
| 弹射物系统（生成/追踪/命中/清理） | ~100 | `ProjectileController` |
| 地图+迷雾渲染 | ~80 | `FogRenderer` |
| 血条绘制 | ~60 | `HpBarRenderer` |
| 输入回调（单击/框选/右键/键盘） | ~180 | 保留在GameScene（编排层） |
| 主循环update（调用各系统+事件转发了） | ~150 | 保留在GameScene |
| 声音监听设置 | ~40 | `SoundBindings` |
| 单位生成/起始单位 | ~90 | `UnitSpawner` |
| 科技系统 | ~60 | 保留部分在GameScene |
| 场景创建/初始化 | ~120 | 保留在GameScene |
| 私有字段声明 | ~80 | 精简 |

### 2.2 拆分目标架构

```
src/
├── scenes/
│   └── GameScene.ts          ~600行 (编排调度)
├── controllers/
│   ├── EntityManager.ts      ~180行 (实体CRUD+Map)
│   ├── CommandExecutor.ts    ~150行 (9种命令)
│   ├── BuildController.ts    ~100行 (建造模式)
│   ├── ProjectileController.ts ~100行 (弹射物)
│   └── UnitSpawner.ts        ~90行 (单位生成)
├── rendering/
│   ├── FogRenderer.ts        ~80行 (迷雾)
│   └── HpBarRenderer.ts      ~60行 (血条)
```

### 2.3 迁移步骤（严格顺序，每步后编译验证）

**Step 1: EntityManager (风险：中)**
- 从 GameScene 提取：`units/builldings/fields/projectiles` 数组 → `Map` 索引 → `addUnit/removeUnit/addBuilding/...` 方法
- 精灵（`unitSprites/buildingSprites/...`）保留在 GameScene（依赖 Phaser）
- GameScene 新增 `this.entities = new EntityManager()`
- 所有 `this.units` → `this.entities.units` 全局替换

**Step 2: CommandExecutor (风险：中)**
- 提取 `executeCommand()` 整个 switch-case
- 依赖注入：`world`, `entities`, `techTree`, `unitMap`, `buildingMap`
- 外部通过构造函数传入

**Step 3: BuildController (风险：低)**
- 提取 `enterBuildMode/cancelBuildMode/confirmBuild/updateBuildPreviewPosition/updateBuildingConstruction`
- 自身维护 `buildMode` + `buildPreview` 状态

**Step 4: ProjectileController (风险：低)**
- 提取 `spawnProjectile/updateProjectiles`
- 自身维护 `projectiles[]` + `projectileSprites` Map

**Step 5: UnitSpawner (风险：低)**
- 提取 `spawnUnit/spawnFactionStartingUnits/placeStartingUnits`

**Step 6: 渲染器 (风险：低)**
- `renderFogOfWar` → `FogRenderer.render(map, fog)`
- 血条 → `HpBarRenderer.draw/clear`

**Step 7: 清理 GameScene (风险：低)**
- 删除已迁移的代码，只保留编排调用
- 验证所有引用路径

### 2.4 每步后验证清单

- [ ] `npx tsc --noEmit` 编译零错误
- [ ] 游戏可启动进入地图
- [ ] 单位可移动/攻击/采集
- [ ] 建筑可建造
- [ ] 迷雾正常渲染
- [ ] 小地图正常

---

## 三、类型系统统一方案

### 3.1 现状

| | data.ts (设计契约) | unitData.ts (实际运行) |
|----|----|----|
| 单位 | `UnitDef` (20字段) | `UnitDefData` (11字段) |
| 建筑 | `BuildingDef` | `BuildingDefData` |
| 阵营 | `FactionDef` | `FactionDefData` |
| 属性名 | `attackDamage/attackRange` | `damage/range` |

**矛盾**：设计契约没人用，运行类型不包含扩展字段。

### 3.2 合并策略

**以 unitData.ts 为生存基线，吸收 data.ts 的扩展字段**：

1. 将 `data.ts` 中的 `tier`, `techReq`, `favoredBy`, `exclusiveTo`, `spriteSheet` 等字段合并到 `UnitDefData`
2. 将 `data.ts` 中 `BuildingDef.type`, `BuildingDef.exclusiveTo` 等合并到 `BuildingDefData`
3. 统一字段命名：`data.ts` 的 `attackDamage` → 改为 `unitData.ts` 的 `damage`（或反之——推荐以 unitData 为准，因改动量小）
4. 删除 `data.ts` 中与 `unitData.ts` 重复的 interface，只保留纯枚举和 `MapData/CrystalFieldDef` 等数据契约
5. 让 `types/data.ts` 重新 export `unitData.ts` 的类型（或反过来）

### 3.3 影响范围

- `src/types/data.ts` — 合并后删除 ~60 行重复类型
- `src/config/unitData.ts` — 新增 `tier/techReq/favoredBy` 字段 ~20 行
- 零业务代码改动（因所有业务代码只用 `unitData.ts`）

---

## 四、风险与回滚预案

| 风险 | 概率 | 缓解措施 |
|------|:--:|------|
| 拆分后引用遗漏导致运行时crash | 中 | 每步后完整烟雾测试，git commit 前确认零问题 |
| EntityManager 与现有代码不兼容 | 低 | 保留原方法签名作为 wrapper |
| 单元测试缺失导致回归不可检测 | 高 | 拆分前先为关键逻辑(combat/movement)补测试 |
| 类型合并引入兼容性问题 | 低 | `npx tsc --noEmit` 全程零错误才推进 |

**回滚**：每一步独立 commit，出问题 `git revert` 单步即可。

---

## 五、推荐执行顺序

```
Day 1 上午: 补关键单元测试 (CombatSystem/A*/ResourceSystem)  ~2h
Day 1 下午: EntityManager 拆分 + 验证                      ~3h
Day 2 上午: CommandExecutor + BuildController 拆分          ~3h
Day 2 下午: ProjectileController + UnitSpawner + 渲染器     ~3h
Day 3 上午: GameScene 清理 + 全量回归测试                   ~2h
Day 3 下午: 类型系统统一                                   ~1h
```

---

## 六、验收标准

- [ ] GameScene ≤ 650 行
- [ ] `npx tsc --noEmit` 零错误
- [ ] 所有已有功能正常（移动/攻击/建造/科技/英雄/行会/采集/迷雾/小地图）
- [ ] `FactionDefData` 包含 `tier/techReq/favoredBy` 等扩展字段
- [ ] `data.ts` 不再包含与 `unitData.ts` 重复的类型定义
- [ ] 新增模块全有 JSDoc 注释