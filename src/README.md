# 源代码文件管理规则

## 命名规范

- 文件名：PascalCase（类）/ camelCase（工具函数模块）
- 每个文件一个主要导出，文件名与导出类/接口名一致
- 目录下统一通过 `index.ts` 做桶导出（barrel export）

## 导入顺序

1. Phaser / 第三方库
2. 内部类型（`../types`）
3. 内部工具（`../utils`）
4. 同级模块

## 类型规范

- 禁用 `any`，使用 `unknown` + 类型守卫
- 所有导出接口/类必须有 JSDoc 注释
- 数据契约接口与 `GAME_DATA.md` 条目ID命名空间一致（`unit:{id}`, `building:{id}` 等）

## 提交规范

```
feat(scope): 简短描述

详细说明（可选）
```

scope 可选：`types`, `core`, `entities`, `systems`, `scenes`, `ai`, `ui`, `utils`, `data`

## 文件结构

```
src/
├── main.ts                入口: Phaser Game 配置
├── types/                 全局类型定义（零依赖）
│   ├── index.ts           桶导出
│   ├── data.ts            JSON 数据 Schema 接口
│   ├── entity.ts          Entity/Unit/Building 接口
│   ├── commands.ts        命令类型
│   └── events.ts          事件枚举
├── utils/                 工具模块
│   ├── index.ts
│   ├── EventBus.ts
│   ├── MathUtils.ts
│   ├── DataLoader.ts
│   └── ObjectPool.ts
├── core/                  核心系统
│   ├── index.ts
│   ├── GameWorld.ts        唯一状态源
│   ├── GameMap.ts          地图网格
│   ├── FogOfWar.ts         战争迷雾
│   ├── CameraController.ts
│   └── InputController.ts
├── entities/              实体类
│   ├── index.ts
│   ├── Entity.ts           基类
│   ├── Unit.ts             可移动战斗单位
│   ├── Building.ts         建筑
│   ├── ResourceField.ts    资源点
│   └── Projectile.ts       投射物
├── systems/               纯逻辑系统
│   ├── index.ts
│   ├── MovementSystem.ts   A* 寻路
│   ├── CombatSystem.ts     战斗判定
│   ├── ResourceSystem.ts   资源采集
│   ├── ProductionSystem.ts 建造/训练
│   └── TechTreeSystem.ts   科技解锁
├── scenes/                场景
│   ├── BootScene.ts       资源加载
│   ├── MenuScene.ts       主菜单
│   ├── GameScene.ts       游戏主场景
│   └── HUDScene.ts        UI 覆盖层
├── ai/                    AI 系统
│   ├── AIController.ts
│   ├── EconomyAI.ts
│   ├── MilitaryAI.ts
│   └── AIPlanner.ts
└── ui/                    UI 组件
    ├── Minimap.ts
    ├── SelectionPanel.ts
    ├── CommandCard.ts
    ├── ResourceDisplay.ts
    └── ProductionQueue.ts
```

## 测试约定

### 测试分层

| 层 | 覆盖范围 | 怎么测 | 自动化 |
|---|---|---|---|
| **L1 单元** | 纯逻辑函数/系统（寻路、伤害、采集、迷雾、科技、研究、资源、战斗） | 直接调用 + 断言输入输出 | 全自动 |
| **L2 集成** | 控制器+系统协作（CommandExecutor 全命令链、AI 行为矩阵、GameOver 胜负、DeathCleanup 退款） | 真实 GameWorld+EntityRegistry + 回调 stub | 全自动 |
| **L3 端到端** | 完整游戏循环 N 帧/整局（AI vs AI 歼灭、30 分钟限时、宽限翻盘） | HeadlessGameRunner 驱动 step* | 全自动 |
| **L4 人工** | 手感、视觉、输入响应、性能 | 启动 dev server 实玩 | 仅功能验收 |

**原则**：L1-L3 必须能在 CI 跑（`npx vitest run`），零人工。L4 仅在 L1-L3 无法覆盖的维度（渲染正确性、手感）由人工验收。

### 运行命令

```bash
npx vitest run          # 单次跑全量测试
npx vitest              # watch 模式
npx tsc --noEmit        # 类型检查（必须零错误）
```

### 夹具库（src/__fixtures__/）

- `factories.ts` - 共享工厂函数（makeWorld/makeUnit/makeBuilding/makeCommandCenter/makeResourceField/setupGame 等）。**禁止在各 *.test.ts 里重复定义工厂**，统一从夹具库 import。
- `phaserStub.ts` - 最小 Phaser scene stub，供 GameOverController/ProjectileController 等需 Phaser 的模块在 node 跑。
- `HeadlessGameRunner.ts` - 无头游戏循环内核，驱动完整游戏循环（跳过渲染/输入/镜头 4 个 Phaser 锁死 step）。

### 何时补测试

- 新增/修改纯逻辑系统 -> 补 **L1** 单元测试
- 新增/修改命令执行（CommandExecutor）-> 补 **L2** 集成测试
- 新增/修改 AI 行为 -> 补 **L2** 集成测试
- 修改胜负判定/游戏循环 -> 补 **L3** 端到端测试
- 修 bug -> 补对应层的回归测试（it 描述标注修复点，如「回归 P0-A2」）

### 命名约定

- 测试文件：*.test.ts，与被测代码同目录
- `describe("模块名 - 场景")` + `it("具体行为描述")`
- 回归测试在 it 描述里标注修复点（如「回归 P1-瞬移修复」）

### EventBus 清理约定

`EventBus` 是全局单例，**每个 it 前后必须 `EventBus.clear()`**（用 beforeEach/afterEach），否则监听器跨用例污染。
