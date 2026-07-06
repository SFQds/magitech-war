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