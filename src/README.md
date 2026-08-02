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
    ├── theme/                UI 主题与皮肤化基础设施
    │   ├── UITheme.ts        色彩/字体/半径常量 (T.Color / T.ColorHex / T.Font)
    │   ├── UIWidget.ts       面板/按钮绘制: Graphics 纯色 + NineSlice 皮肤双路径
    │   ├── UITheme.test.ts
    │   └── UIWidget.test.ts
    ├── Minimap.ts            小地图 (雕花边框 ui_minimap_frame)
    ├── SelectionPanel.ts     选中实体面板 (skin_panel_console)
    ├── CommandCard.ts        命令卡片 (三态按钮 + skin_card 槽底)
    ├── ResourceDisplay.ts    顶栏资源显示 (ui_icon_* 替换 emoji)
    ├── ProductionQueue.ts    生产队列 (skin_panel_console 小卡)
    ├── HeroPanel.ts          英雄面板 (头像金框 ui_frame_portrait)
    ├── SuperWeaponBar.ts     超武栏 (三态按钮)
    ├── Tooltip.ts            悬浮提示 (skin_panel_console)
    ├── PauseMenu.ts          暂停菜单 (skin_panel_console)
    └── FpsCounter.ts         帧率计数 (纯文字, 无需皮肤化)
```

## UI 皮肤化模式（UIWidget 双路径）

`src/ui/theme/UIWidget.ts` 提供面板/按钮的绘制辅助，遵循**双路径**模式以保证向后兼容：

- **皮肤路径**：调用 `drawPanelSkin(scene, {skinKey, ...})` / `drawButtonSkin(scene, {skinNormal, skinHover, skinActive, ...})`，当 `scene.textures.exists(skinKey)` 为真时，用 Phaser NineSlice 渲染豆包生成的皮肤纹理（暗紫魔导渐变 + 金描边，可九宫格拉伸）。
- **回退路径**：纹理缺失时自动回退到 `drawPanel` / `drawButton` 的纯色 Graphics 绘制（原塑料感方案），保证测试 stub（`textures.exists: () => false`）和无资产环境仍可运行。
- **状态切换**：`setButtonSkinState(ns, opts, state)` 通过 `ns.setTexture(key)` 切换 hover/active 态皮肤。
- **光影辅助**：`drawOuterGlow` / `drawInsetShadow` 用多层 Graphics 模拟外发光与内阴影，补充纯贴图不够的光影。

### 皮肤资产约定

- 皮肤纹理 key 集中定义在 `src/config/sprites.ts` 的 `UI_SKIN_KEYS`（15 个：`skin_panel_console/top`、`skin_btn_normal/hover/active`、`skin_card`、`ui_icon_crystal/industry/supply/timer`、`ui_deco_gear`、`ui_frame_portrait`、`ui_minimap_frame`、`ui_menu_bg`、`ui_logo`）。
- `BootScene` 对 `UI_SKIN_KEYS` 调用 `setFilter(LINEAR)`，避免 `pixelArt: true` 的 nearest 采样让皮肤纹理模糊；单位/建筑精灵仍保持 nearest 像素风。
- 资产生成流程见根目录 `AGENTS.md`。

## 测试约定

### 当前成绩单

| 指标 | 数值 |
|------|------|
| 测试文件 | 62 |
| 总用例 | 1519 |
| tsc | 零错误 |
| vitest | 1519 全部通过 |

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

### L4 人工验收清单（不写自动化测试）

以下模块本质上是 Phaser 渲染/交互/入口，单元测试 ROI 极低，由人工在 dev server 实玩验收：

| 模块 | 原因 |
|------|------|
| `rendering/*` (FogRenderer/HpBarRenderer/SpriteRenderer/SoundBindings) | 纯 Phaser graphics/sound 调用，无分支逻辑 |
| `scenes/*` (BootScene/GameScene/HUDScene/MenuScene) | Phaser 生命周期 + 事件协调 |
| `ui/CommandCard.ts`, `ui/Minimap.ts` | 全是 fillRect/fillCircle 绘制 |
| `utils/AssetGenerator.ts` | 全是 generateTexture 绘制 |
| `main.ts` | 入口启动代码 |
| `*/index.ts` | 桶导出，零逻辑 |

### 命名约定

- 测试文件：*.test.ts，与被测代码同目录
- `describe("模块名 - 场景")` + `it("具体行为描述")`
- 回归测试在 it 描述里标注修复点（如「回归 P1-瞬移修复」）

### EventBus 清理约定

`EventBus` 是全局单例，**每个 it 前后必须 `EventBus.clear()`**（用 beforeEach/afterEach），否则监听器跨用例污染。
