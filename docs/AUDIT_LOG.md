# 调研日志 · 优化建议汇总

> 本文档持续记录每一轮系统调研给出的优化建议。
> 策略：**先充分调研并落到文档，收集齐全后统一实施**。
>
> - 记录风格：每轮列出 方向 / 发现 / 证据(file:line) / 严重度 / 改进建议。
> - 状态前缀：🔴=待实施 · 🟢=已实施 · ➖=已评估暂不采纳
> - 约定：只改体验/质量/性能，**不改游戏数值与平衡**，不更换美术资源。

---

## 第一轮 · 游戏体验 / 玩法手感 / 性能（2026-08-04）

> 三路并行调研：① UI/UX 与反馈 ② 玩法系统与手感 ③ 性能与技术。
> 本轮为全项目横向摸底，覆盖每个子系统各 1 个方向。

### A. UI / UX 与反馈

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| UX-1 | 完全缺失新手引导/帮助入口。全部核心操作(右键移动、S/H/A、1-4超武、Q/R公会技能、Shift加选)只存在于代码,游戏内从未向玩家展示 | `GameScene.ts:785-926` | 🔴 高 | 首局边缘操作提示 + 暂停菜单可关闭的「操作说明」面板 + 空闲工人提示 |
| UX-2 | 命令卡溢出屏幕:工人选中列出全部 BUILDING_DEFS,第二行 y=660 底边 724 超出 720 视口,第 9+ 个按钮落在可视区外 | `HUDScene.ts:286-293`、`CommandCard.ts:58-61` | 🔴 高 | 封顶/滚动/自适应缩按钮,行数钳制在面板内 |
| UX-3 | 命令确认反馈缺失:右键移动/攻击无音效、无落点 ping,只有单位真动起来才知成功 | 选中有音效+tint(`SpriteRenderer.ts:82`),移动无 | 🟠 中 | ack 音效 + 落点标记 |
| UX-4 | 资源不足交互粗粝:按钮不按"买得起"置灰,点下去只弹屏中央 toast,toast 无排队互相覆盖 | `HUDScene.ts:329` | 🟠 中 | 按钮按可负担性置灰 |
| UX-5 | 无控制组(Ctrl+1..9)、无键盘平移(WASD/方向键);只有边缘滚动+滚轮缩放 | `CameraController.ts:26-42` | 🟠 中 | 加控制组与键盘平移 |
| UX-6 | Q/R 公会技能无对应行会/无选中时静默返回,玩家以为技能坏了;技能/建造/训练按钮不显示热键徽标(仅 S/H/A 有) | `GameScene.ts:882,905`、`HUDScene.ts:561-580` | 🟠 中 | 失败反馈 toast + 补齐热键徽标 |
| UX-7 | 小地图无「基地受袭」警报 | `Minimap.ts:77-83` | 🟠 中 | 受攻击时小地图闪烁 |
| UX-8 | 多选头像网格与单选框坐标重叠,切换时元素跳动 | `SelectionPanel.ts:46,60,87-92` | 🟡 低 | 坐标避让 |
| UX-9 | 游戏光标从不随模式变化(建造/瞄准/攻击移动无专属光标) | 全局无 `setDefaultCursor` | 🟡 低 | 按模式切换光标 |
| UX-10 | 暂停重启依赖 `registry.get('lastStartData')` 非空断言,key 未设置时可能用空 init 重启 | `HUDScene.ts:122` | 🟡 低 | 兜底默认值 |
| UX-11 | 队列命令死代码:`InputController.commandQueue/pushCommand/popCommands` 只被测试调用,Shift 队列未实现 | `InputController.ts:150-161` | 🟠 中 | 实现 shift 追加命令栈 |

### B. 玩法系统与手感

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| FEEL-1 | 单位行军互相穿透、无分离力:移动推进 tileX/Y 完全不查碰撞,占用检测只在路径点/终点到达时发生,靠 `_applyScatterOffset`(半径≤3)收尾 → 大军行进"一坨" | `MovementSystem.ts:331-348,286,316,356-383` | 🔴 高 | 移动分支加 per-tile 占用检查或 steering/separation |
| FEEL-2 | 矿场满员时工人停下干等:`field.currentGatherers>=maxGatherers` 直接 idle,不自动等空位、不返回主基地 | `GameScene.ts:1289-1291` | 🔴 高 | 排队工人在节点附近徘徊,空位释放自动进入 |
| FEEL-3 | 路径中途被堵会整路 A* 重规划,挡路者也移动时可能来回震动 | `MovementSystem.ts:289-308` | 🟠 中 | 顶几格而非整路重规划 |
| FEEL-4 | `_applyScatterOffset` 3 格内无空位时最终仍叠在同一格(永久重叠) | `MovementSystem.ts:382` | 🟡 低 | 累积时间让步进 |
| FEEL-5 | 腐蚀减甲用"每帧改回去再改"的临时手法,脆弱但当前正确 | `CombatSystem.ts:193-201` | 🟡 低 | 改为显式 debuff 字段 |

### C. 性能与技术

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| PERF-1 | 渲染对象爆炸:64×64 terrain=4096 Image + 4096 fog Image,叠加单位/建筑/血条,显示列表与 draw 开销大 | `GameScene.ts:424-438`、`FogRenderer.ts:41-53` | 🔴 高 | 地形用 TileSprite/Shader;雾用裁剪离屏纹理 |
| PERF-2 | 全量序列化过重(联机 10fps 快照):每次重建完整 64×64 地形 + 每单位全字段(含 path/cargoIds/buff),静态信息每个快照都一样 | `SaveLoadSystem.ts:112-195` | 🔴 高 | 一次性静态载荷 + 每帧增量,跳过 path/buff |
| PERF-3 | 每帧对象分配:`distance()`/`tileToWorld()` 每次 new 闭包对象,`updateCombat` 大量调用;`SpriteRenderer.sync` 每单位每帧 new;`queryCombatCandidates` 每次返回新数组 | `MathUtils.ts:20-40` | 🔴 高 | 传原始坐标 + 复用 scratch 数组/对象,热点内联 |
| PERF-4 | `markCombatIndexDirty` 每帧无条件整表重建 O(N) | `EntityRegistry.ts:58-78` | 🟠 中 | 复用桶而非 clear+repush |
| PERF-5 | 空间索引过度包含:`spread=ceil(radius/8)+1`,攻城单位动辄扫 7×7 格块,大军时每帧每单位扫描成本可观 | `EntityRegistry.ts:82-107` | 🟠 中 | 评估缩放,正确性安全纯性能优化 |
| PERF-6 | 每帧 `setTint/clearTint/setAlpha` 无变化也调用,脏化 WebGL batch | `SpriteRenderer.ts:75-141` | 🟠 中 | 加 last-applied 守卫 |
| PERF-7 | 血条满血即 destroy Graphics、受伤再重建 → 闪烁且频繁分配 | `HpBarRenderer.ts:37-43` | 🟡 低 | 池化/alpha=0 |
| PERF-8 | `EventBus.emit` 每次 `Array.from(callbacks)` 复制 | `EventBus.ts:48` | 🟡 低 | 原地遍历 + 守卫 flag |
| PERF-9 | `ResourceSystem.updateGathering` 每 tick `filter` 重查铁矿/共鸣器列表 | `ResourceSystem.ts:55,89-91,122-124` | 🟡 低 | 缓存静态列表 |

---

## 第二轮 · 代码质量 / 存档 / 联机鲁棒性 / 测试覆盖（2026-08-04）

> 四路并行调研。本轮聚焦"改起来稳不稳"——架构、持久化、联机可靠性、回归防线。

### D. 代码质量与架构

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| ARCH-1 | HUDScene→GameScene 硬编码 `as any` 耦合 23 处,直达私有字段/方法,违反 README「禁用 any」;时序/命名一变即静默 undefined | `HUDScene.ts:122,146,186,219,310,317,333,369,403,453,459,472,513,521,530,540,589,594,626,637`、`Minimap.ts:126`、`ProductionQueue.ts:54` | 🔴 高 | 建类型化 `GameSceneFacade` 接口,暴露 getter/事件查询层 |
| ARCH-2 | `currentGatherers` 递减逻辑 6+ 处复制同一段 `if(oldField&&oldField.currentGatherers>0)--` | `CommandExecutor.ts:175,197,272,381`、`GameScene.ts:1226`、`ResourceSystem.ts:75,153`、`DeathCleanupSystem.ts:75` | 🟠 中 | 抽 `ResourceField.releaseGatherer(unit)` 统一调用 |
| ARCH-3 | `exclusiveTo` 阵营/行会门控谓词在 HUD 与 CommandExecutor 复制粘贴(74 处引用) | `HUDScene.ts:289-290,323-325,342-346`、`CommandExecutor.ts:114-121,214-222,295-300` | 🟠 中 | 抽 `canUnitForFaction`/`canTechForPlayer` 助手 |
| ARCH-4 | 生产队列退款逻辑在 CommandExecutor 与 DeathCleanup 两份(分支 UNIT_DEFS/HERO_DEFS + 阵营倍率) | `CommandExecutor.ts:143-153`、`DeathCleanupSystem.ts:135-143` | 🟡 低 | 抽 `computeItemRefund(...)` |
| ARCH-5 | HUD 直接读 `players[0].faction` 而非 `localPlayerIndex`,客户端联机会跑偏 | `HUDScene.ts:284-285,318-319,335-336` | 🟠 中 | 统一走本地玩家索引 getter |
| ARCH-6 | 死代码:InputController 命令队列、`UNIT_COSTS.category`、`GameScene.getTechTree`(仅 HUD 外用)、`HUDScene.updateResources`、`getDisplayName` 的恒真 `gs.entities?` 分支 | `InputController.ts:26,152-161`、`CommandExecutor.ts:31-39`、`GameScene.ts:134`、`HUDScene.ts:599,630-632` | 🟡 低 | 删除 |
| ARCH-7 | 实体源不一致:`this.units` vs `this.entities.units`、`gs._entities ?? gs.entities` 双源易漂移 | `GameScene.ts:348` vs `:1764`、`HUDScene.ts:654` | 🟡 低 | 收敛单一数据源 |
| ARCH-8 | 同一事件注册两个 BUILDING_SELECTED 处理器,顺序依赖难推理 | `HUDScene.ts:308,367` | 🟡 低 | 合并成一个 |
| ARCH-9 | 生产代码 146 处 `any`,违反 README 规范 | 全仓库 | 🟡 低 | 分批收敛 |

### E. 存档 / 序列化

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| SAVE-1 | 往返漂移:`_chargeStrikeUses` 未序列化/还原,载入后法师保持加强攻击永不复原;`_frostBastionTimer` 未序列化 → 磐石壁垒护甲翻倍 buff 载入即丢 | `Unit.ts:58,76`、`GuildSystem.ts:221-229`、`HeroSystem.ts:1195` | 🟢 已实施(包1) | `SerializeInput`+`SerializeUnit` 补 `frostBastionTimer`/`chargeStrikeUses` 字段、serialize/deserialize 恢复 |
| SAVE-2 | 迷雾不持久化:`world.fogOfWar` explored/visible 无序列化钩子,单机读档要么全黑要么全亮 | `GameWorld.ts:18`、`FogOfWar.ts`、`SaveData.ts` | 🟢 已实施(包1) | `SaveData.fogExplored` 布尔掩膜;`serialize(includeFog)` 仅磁盘存档启用(联机快照跳过防泄漏);`deserialize` 恢复 explored |
| SAVE-3 | `SAVE_VERSION=1` 仅拒绝不迁移;`deserialize` 在 createFromSave/applySnapshot 未 try/catch,损坏/版本不符存档直接 crash | `SaveLoadSystem.ts:348-350,592-594`、`GameScene.ts:1673` | 🟢 已实施(包1) | deserialize 结构校验+缺省数组置空;`createFromSave` 失败回退新局、`applySnapshot` 失败丢弃该帧
| SAVE-4 | 客户端 `applySnapshot` 只换 world/entities,不重建子系统(tech/AI/gameover/deathcleanup),且 HUD/选择/高亮等对象身份跨快照断裂 | `GameScene.ts:1102-1116` | 🟠 中 | 子系统中注入新引用或原地突变 |
| SAVE-5 | 每 100ms 全量快照重建 64×64 地形 + 全实体 + `createdAt:Date.now()` 抖动 | `GameScene.ts:1014-1019`、`SaveLoadSystem.ts:113-123` | 🟠 中 | 静态载荷分离 + 增量快照 |

### F. 联机鲁棒性

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| NET-1 | 英雄技能完全绕过网络:HUDScene 直接调 `HeroSystem.activateSkill` 改本地状态 → 主机看不见,下个快照回滚,客户端技能"白按" | `HUDScene.ts:259` | 🔴 高 | 走 `execButtonCommand({type:'use_ability'})` |
| NET-2 | 建造放置绕过网络:`confirmBuild` 直接 `buildController.confirm` 改本地 world | `GameScene.ts:1620`、`HUDScene.ts:588` | 🔴 高 | 建造改为命令走主机 |
| NET-3 | 超武白名单缺 `'superweapon'`:客户端发的超武被主机静默丢弃 | `GameScene.ts:1192` vs `:1041` | 🟠 中 | 加入 SAFE 白名单 |
| NET-4 | 白名单 `'ability'` 与执行器 `'use_ability'` 不一致(永不可执行);`rally_point` 等死条目 | `GameScene.ts:919,1192`、`CommandExecutor.ts:66` | 🟡 低 | 对齐 + 清理 |
| NET-5 | 客户端掉线时主机 `onPeerDisconnect` 空操作,游戏静默继续 | `GameScene.ts:1043` | 🟡 低 | 主机暂停/判负 |
| NET-6 | 中继第二个客户端被拒(旧 close 事件滞后),可撞自动重连竞态;建议镜像主机槽位接管 | `NetClient.ts:61`、vite.config.mts | 🟠 中 | 客户端槽位也接管 |
| NET-7 | 无 WebSocket maxPayload/消息限速;`hello.role` 自声明可冒充主机抢槽 | vite.config.mts | 🟡 低 | maxPayload + 限速 + 槽位绑定首次来源 |
| NET-8 | 主机对客户端命令无节流(token bucket) | 主机 execute 每帧可被刷 | 🟡 低 | 每客户端令牌桶 |

### G. 测试覆盖

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| TEST-1 | NetServer/NetClient 零直接测试(唯一 LanSyncCore.test 只测存档往返 + 一个空转 JSON 往返) | `src/net/*` | 🔴 高 | fake WebSocket stub 测 hello→snapshot→disconnect→重连退避 |
| TEST-2 | 场景管线全无测试(Game/Lobby/HUD/Menu/Boot/Codex) | 无 `*Scene.test.ts` | 🟠 中 | Lobby 状态机与关键胶水补测 |
| TEST-3 | 战斗管线缺攻防边界用例:pursue 超时、30 帧 retick、近战 mark 加成、腐蚀叠层、aura | `CombatSystem.ts:113-116,133-149,173,199-205` | 🟠 中 | 补回归测试 |
| TEST-4 | CommandExecutor 的 deploy/use_ability/attack_move/superweapon 零用例 | `CommandExecutor.test.ts` | 🟠 中 | 补用例 |
| TEST-5 | 空间索引只断言超集(容忍过度包含),不断言精确集合 | `EntityRegistry.test.ts:333-369` | 🟡 低 | 补精确集合断言 |
| TEST-6 | 伤害矩阵 30 格只全测 9 格;部分测试与内部实现耦合 | `CombatSystem.test.ts:32-72` | 🟡 低 | 补全 30 格 + 解耦内部顺序断言 |

## 第三轮 · 美术 / 世界观 / 可访问性 / 公平性（2026-08-04）

> 四路并行调研。本轮聚焦内容完整性、一致性、与玩家无障碍。

### H. 美术资源清单

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| ART-1 | 无缺失 key:59/59 def → PNG 存在,78/78 装载 key → PNG 存在;0 个运行期占位生成 | codex.ts / PNG_SPRITE_KEYS / 磁盘对比 | 🟢 通过 | — |
| ART-2 | **13 张"假实图"为纯色实心块**:7 个中立单位 + 6 个 UI 皮肤(panel_console/panel_top/btn_normal/hover/active/card)均为单色,渲染出来就是色块 | `neutral_*.png`、`skin_*.png` 像素分析 | 🔴 高 | 用豆包桌面端重新生成(decode 真实贴图) |
| ART-3 | 多帧动画规范完全未落地:全工程 0 处 `anims.create`,所有单位/投射物按单 image 渲染,spec 要求的 2-3 帧走帧、4 帧爆炸未实现 | BootScene.ts:43、SpriteRenderer、ProjectileController.ts:35 | 🟠 中 | 加 spritesheet 帧动画 |
| ART-4 | 孤儿资源 `unit_basic_turret.png`:def 已删但仍生成在盘 | `unitData.ts:126` | 🟡 低 | 删除或复用 |
| ART-5 | `gen.generateAll()` 还渲染不在盘、不被引用的默认地形与 `ui_industry`/`ui_supply`(死生成) | `AssetGenerator.ts:340,354` | 🟡 低 | 清理 |

### I. 世界观一致性

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| LORE-1 | 旗舰机制「深矿破坏者的水晶意识」仅停留在文案:无 180s 存在寿命、无自选目标、无共振,号称"唯一可交互体现"实为空 | `unitData.ts:173`、`GAME_DATA.md:362-370`、仅 `ProjectileController.ts:120` 有晶爆 | 🔴 高 | 实装或改文案,勿虚标 |
| LORE-2 | 科技名在 codex 与 TECH_DEFS 漂移:"机甲组装" vs "机甲装配技术"、"流水线优化" vs "量产线优化";"Lv1" vs "L1" | `codex.ts:79-85` vs `unitData.ts:730,754,780` | 🟠 中 | 统一命名 |
| LORE-3 | Codex 科技条目严重稀疏:27 个科技只有 7 个有词条;公会线/超武解锁/阵营专属科技全缺 | `codex.ts:79-85` | 🟠 中 | 补齐词条 |
| LORE-4 | Codex 科技成本陈旧(硬编码副本):"200,30秒" vs 实际 150/25 等,详情面板同屏显示矛盾数字 | `codex.ts:79-84` vs `unitData.ts:730-733` | 🟠 中 | desc 从 TECH_DEFS 派生 |
| LORE-5 | 术语漂移:"工业"vs"工业产值"、"补给"vs"供给";资源 水晶/人口 与文案 emoji 混用 | `ResourceDisplay.ts`、`GAME_DATA.md:50` | 🟡 低 | 统一用词 |

### J. 可访问性 / 玩家障碍

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| A11Y-1 | 无任何静音/音量/设置 UI:`SoundManager.muted` 存在但无任何场景/菜单调用;无键盘静音 | `SoundManager.ts:52-53`、全 src 无 mute | 🔴 高 | 暂停菜单加静音 + 音量 |
| A11Y-2 | 无设置场景(screen size/UI 缩放/键位/色盲);PauseMenu 固定四项 | `PauseMenu.ts:68-94` | 🔴 高 | 加设置面板 |
| A11Y-3 | 场上敌我仅靠单位纹理区分,无阵营色环/标签;敌方工兵与己方工兵同框难辨 | `SpriteRenderer.ts`(无 owner tint) | 🔴 高 | 阵营色环/底圈 |
| A11Y-4 | 小地图敌我=纯红/绿 2px vs 3px,无形状区分(色盲失效) | `Minimap.ts:120-121,138-139` | 🟠 中 | 加形状区分 |
| A11Y-5 | 建造红色显示仅 tint(0xff4444 vs 0x88ff88),无边框/符号 | `BuildController.ts:57` | 🟠 中 | 加 ⚠/边框 |
| A11Y-6 | 选中仅金色 tint 0xffff55,无描边|外框(视觉障碍不利) | `SpriteRenderer.ts:82,137` | 🟠 中 | 加外框 |
| A11Y-7 | 无捆绑 CJK 字体,`fontFamily:'Arial,sans-serif'` 硬编码,CJK 回退依赖系统字体 | `MenuScene.ts:108,114`、`UITheme.ts:99-103` | 🟠 中 | 统一 FontFamily token + 捆绑 CJK 字体 |
| A11Y-8 | 只读场景切换对象:`SoundManager.init()` 仅 Start/Continue 调用,LAN lobby 进入则无声 | `MenuScene.ts:251,267` | 🟡 低 | 统一初始化时机 |
| A11Y-9 | 关键警告只有屏中瞬时 toast(18px,1200ms),无事件日志;微 9-10px 文字多处 | `HUDScene.ts:502`、`CommandCard.ts:98,105` | 🟡 低 | 加警报日志 + 加大字号 |

### K. 公平性 / 内部一致性

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| FAIR-1 | 训练显示价 vs 实扣价不一致:HUD 显示未折扣 `cost`,实际扣 `getUnitCostWithFaction`(-20% favoredBy);AI 预算也用原价 | `HUDScene.ts:329` vs `CommandExecutor.ts:101-103`、`EconomyAI.ts:48-50` | 🟢 已实施(包1) | HUD 训练按钮显示 + AI 预算均改走 `getUnitCostWithFaction` |
| FAIR-2 | 难度资源加成泄漏到人类对手:owner-1 采集无条件乘 `resourceMult`,host 模式对方是人类也吃难度倍率 | `GameScene.ts:1464,1003` vs `:996-998` | 🟢 已实施(包1) | `stepGathering` 仅当 owner1.isAI 时应用难度倍率 |
| FAIR-3 | `_frostBastionTimer` 磐石壁垒 buff 载入即丢(见 SAVE-1),实时 vs 读档不一致 | `Unit.ts:58`、`HeroSystem.ts:140-144,1195-1201` | 🟢 已实施(包1) | 并入 SAVE-1 一并修(已持久化) |
| FAIR-4 | 建造价显示/扣费已一致(历史联邦 -20% 已修复) | `BuildController.ts`、`HUDScene.ts:291` | 🟢 通过 | — |

---

## 附 · 三轮累计汇总（实施清单草稿）

> 按「风险×收益×成本」粗排。所有 🔴 高优先;带 ⭐ 的为体验或正确性关键项。
> 全文见各轮次编号。最终实施将据此拆包。

| 分批 | 主要条目 | 性质 |
|------|----------|------|
| 包1 | ⭐SAVE-1/FAIR-3 buff 持久化、SAVE-3 存档鲁棒性 | 正确性 🔴 |
| 包2 | ⭐NET-1 英雄技能、NET-2 建造、NET-3 超武白名单 走网络;NET-8 限流;NET-6 槽位接管 | 联机正确性 🔴 |
| 包3 | ⭐FAIR-1 训练价显示、FAIR-2 难度倍率隔离 | 公平性 🔴 |
| 包4 | ⭐UX-9→A11Y-3/6 场上敌我区分与选中描边、A11Y-4/5 色盲辅助 | 可访问性 🔴 |
| 包5 | ⭐FEEL-1 移动分离、FEEL-2 满员工人、FEEL-3 路径抖动、FEEL-5 腐蚀重构；UX-11 命令队列 | 手感 🔴 |
| 包6 | PERF-3 分配内联、PERF-1 地形/雾渲染、PERF-2/SAVE-5 快照增量、PERF-4/5 空间索引 | 性能 🔴 |
| 包7 | UX-1 新手引导/帮助面板、UX-2 命令卡溢出、UX-3 命令反馈环、UX-4 可负担置灰、UX-6/7 反馈 | UX 🟠 |
| 包8 | ARCH-1 facade、ARCH-2/3/4 去重、ARCH-6 死代码清理 | 架构 🟠 |
| 包9 | TEST-1 网络测试、TEST-3/4 战斗与命令用例、TEST-2 场景胶水 | 测试 🟠 |
| 包10 | ART-2 13 张假实图重生成、ART-3 帧动画、ART-4/5 清理 | 美术 🟠 |
| 包11 | LORE-1~5、A11Y-1/2/7、A11Y-8/9 | 内容/无障碍 🟡→🟠 |
| 包12 | UX-5/8/9/10、PERF-6/7/8/9、TEST-5/6 | 打磨 🟡 |

---

*调研仍在进行:可再派轮次(音效设计、难度曲线、AI 行为、地图/关卡设计、生产流程/CLI 脚本、国际化等)。本文档持续追加。*

## 第四轮 · AI难度 / 地图关卡 / 音频 / 工具链与生产就绪（2026-08-04）

> 四路并行调研，补足内容/难度/感官/工程四块拼图。

### L. AI 与难度

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| AI-1 | 难度是多轴杠杆(非单一资源倍率):采集 0.7/1.0/2.0、反应 tick 4/2/1.5s、建造阈值、阶段推进、撤退阈值、风筝灵敏度、攻击渴求。hard 2.0x 采集是绝对主导项 | `AIController.ts:20-24`、`EconomyAI.ts:84-89`、`StrategyManager.ts:74-76,119`、`MilitaryAI.ts:57-80` | 🟢 通过 | — |
| AI-2 | AI 走真实系统(命令/预算/科技前置全走 CommandExecutor),无免费资源即时建造;唯一"作弊":0 工人救援直接写爆水晶下限,且随难度增大(hard 给更多免费救援) | `EconomyAI.ts:193-199` | 🟢 已实施(包1) | 救援下限跨难度统一为 AI_RESCUE_CRYSTAL_MIN(100),不再随 resourceMult 放大 |
| AI-3 | 侦察锁泄漏:`aiLockedAction='building'` 永不清除,斥候永久锁死不能参战 | `MilitaryAI.ts:501` | 🟡 低 | 停下/到达时清除 |
| AI-4 | `_findUnexploredTarget` 每斥候每检查扫 64×64(O(map²)) | `MilitaryAI.ts:522-531` | 🟡 低 | 缓存未探索列表 |
| AI-5 | 难度跳变:normal→hard 采集 +100%、阶段/攻击阈值阶跃,hard 无淡入,前期即碾压 | `AIController.ts`、`StrategyManager.ts` | 🟡 低 | hard 早期 2.0x 淡入 |
| AI-6 | AI 无正面开二矿/战略扩张(只会加产能建筑),被打掉基地后无战略应对 | `EconomyAI.ts:255-264` | 🟡 低 | 补充扩张逻辑 |

### M. 地图与关卡

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| MAP-1 | 3 图全可选无占位;山谷/河战/群岛结构确实不同(山地环/河/水桥) | `MenuScene.ts:18-20`、`data/maps/*.json` | 🟢 通过 | — |
| MAP-2 | 均非中心镜像;三图 P1 都比 P0 更接近地图中心(islands 差 6.4 格) | 3 个 map json 镜像对比 | 🟠 中 | 归一化出生点中心距/矿对等性(修数据) |
| MAP-3 | 群岛 P0 出生在草丛口袋被水/林围死,P1 开阔;岛屿中心顶级矿 (16,32) 距 P0~13 vs (48,32) 距 P1~28,不均 | `map_islands.json` | 🟠 中 | 修出生地与顶级矿对等 |
| MAP-4 | islands 存在 64 格不可达"预留"口袋(27..36 无桥),像扣住的扩张点,且 code 不读 `neutralStructures` | `map_islands.json`、`GameScene.ts:321-331` | 🟡 低 | 填掉或打通 |
| MAP-5 | 无中立目标/扩张点:`neutralStructures:[]` 全部三图,文档承诺的贸易站/废矿未落地,中场只有推线无控图决策 | `GAME_DATA.md:343-351` | 🟠 中 | 落地中立结构 |
| MAP-6 | 无 2v2/96×96 图(文档承诺 442);数据三副本(data/public/dist)易失同步 | `GAME_DATA.md:442` | 🟡 低 | 统一单源 |

### N. 音频

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| AUD-1 | LAN/lobby 路径从不调 `SoundManager.init()`,联机全程无音;init 仅 Start/Continue 点击 | `MenuScene.ts:251,267`、`LobbyScene.ts:307` | 🔴 高 | 所有开局路径统一 init |
| AUD-2 | 关键反馈无声:研究完成、超武发射、基地受袭/湮灭警告(GRACE_WARNING)、建筑被毁、资源不足、命令确认、技能命中均无音(仅 7 个事件有绑定) | `SoundBindings.ts:14-34`、`ResearchSystem.ts:56`、`GameOverController.ts:229` | 🟠 中 | 补关键绑定 + 新合成缓冲 |
| AUD-3 | **零音乐/氛围**,SoundManager 只合成 8 个 blip;菜单/对局全程静默 | `SoundManager.ts:57` | 🟠 中 | 补循环音乐/氛围缓冲 |
| AUD-4 | UI 无悬停/点击音(makeMenuButton 等所有 ui/* 仅颜色) | `MenuScene.ts:~124-280` | 🟡 低 | 统一按钮工厂加分 |
| AUD-5 | `muted` 无持久化/无 UI/无分轨增益(master 无) | `SoundManager.ts:52-53` | 🟡 低 | 持久化 + 分轨 + UI |

### O. 工具链与生产就绪

| # | 发现 | 证据 | 严重度 | 改进建议 |
|---|------|------|--------|----------|
| TOOL-1 | **无 CI**:无 .github/workflows;build 可复现(tsc exit 0、Phaser 独立 chunk) | package.json、无 workflows | 🔴 高 | 加 GitHub Actions: npm ci + tsc + test + build |
| TOOL-2 | **生产联机不可用**:LAN 中继用 Vite configureServer 挂 dev-only,`ws` 不进产包;静态 dist 无联机 | vite.config.mts:12-87、`LAN_MULTIPLAYER.md:92` | 🔴 高 | 抽独立 Node 入口(scripts/lan-relay.js) + `start:lan` script |
| TOOL-3 | 73MB 产物未压缩(71MB public 直拷、148 资源),无 gzip/brotli;无 PWA/offline(无 manifest/SW) | dist/、index.html | 🟠 中 | 压缩 + PWA manifest/SW |
| TOOL-4 | `any` 泄漏广(vite.config.mts、HUD/Game/SaveLoad/CommandExecutor 的 `as any`、`catch(e:any)`),strict 下靠运行期;AGENTS.md 端口 5173 与实 3000 不符 | tsconfig strict + 各处 | 🟠 中 | 类型化 scene 访问 + 清 `catch any` + 改文档 |
| TOOL-5 | 根目录残留 Windows 产物 `nul`(已 gitignore);无覆盖阈值 | 根目录、vitest.config.ts | 🟡 低 | 删 nul + 配 coverage |
| TOOL-6 | 密钥卫生良好:`vision-bridge.zip`/`config.json` 已 gitignore,跟踪代码仅空 api_key 占位,无真实密钥 | .gitignore:25,29、grep | 🟢 通过 | — |

---

## 附 · 四轮累计汇总（实施清单总表）

> 共 56 条目。按「风险×收益×成本」粗排;🔴=正确性/体验硬伤应优先。

### 🟥 包1 · 正确性 & 公平性（读档反弹 / 联机语义 / 价差）
| 条目 | 规模 | 说明 |
|------|------|------|
| SAVE-1 / FAIR-3 / SAVE-3 | 中 | buff(`_frostBastionTimer`/`_chargeStrikeUses`)持久化 + 丢失字段修复;存档鲁棒(版本迁移+try/catch+字段校验) |
| SAVE-2 | 小→中 | 迷雾 explored 掩膜持久化(单机) |
| SAVE-5 / PERF-2 | 中 | 快照静态载荷 + 增量、跳过 path/buff |
| FAIR-1 | 小 | HUD训练显示价/AI预算改用折扣价(getUnitCostWithFaction) |
| FAIR-2 / AI-2 | 小 | 难度采集倍率仅绑定 isAI;救援下限跨难度统一 |

### 🟥 包2 · 联机正确性（客户端命令全走网络）
| 条目 | 说明 |
|------|------|
| NET-1, NET-2, NET-3, NET-4 | 英雄技能/建造/超武改走命令;白名单对齐(use_ability),清死条目 |
| NET-6, NET-8 | 客户端槽位接管镜像主机;按客户端令牌桶限速 |

### 🟥 包3 · 手感（FEEL 全项 + 反馈闭环）
| 条目 | 说明 |
|------|------|
| FEEL-1, FEEL-2, FEEL-3, FEEL-4, FEEL-5 | 行军分离/steering、满员工人等待进入、路径抖动、聚散落点、腐蚀显式化 |
| UX-11 | 命令队列(shift 追加栈) |
| AUD-1, AUD-2, AUD-4 | 联机不再哑音、关键反馈补齐、UI 点击音 |
| UX-3, UX-7 | 命令落点 ping/ack、小地图受袭告警 |

### 🟥 包4 · 性能
| 条目 | 说明 |
|------|------|
| PERF-3 | 分配内联(distance/tileToWorld/query 数组复用) |
| PERF-1 | 地形/雾渲染重构 |
| PERF-4, PERF-5 | 空间索引复用桶 + 缩放评估 |
| PERF-6, PERF-7, PERF-8, PERF-9 | tint 守卫、血条池、EventBus 原地遍历、静态列表缓存 |

### 🟠 包5 · UX & 引导 & 可访问性
| 条目 | 说明 |
|------|------|
| UX-1 | 新手引导/帮助面板/空闲工人提示 |
| UX-2 | 命令卡溢出修复 |
| UX-4, UX-6 | 可负担置灰;Q/R 失败反馈 + 热键徽标 |
| A11Y-1, A11Y-2 | 静音/音量/设置面板 |
| A11Y-3, A11Y-4, A11Y-5, A11Y-6 | 场上敌我色环/标签、小地图形状、建造⚠、选中描边 |
| A11Y-7 | 统一 CJK 字体 token |

### 🟠 包6 · 架构 & 测试 & 内容 & 工程
| 条目 | 说明 |
|------|------|
| ARCH-1,2,3,4,6,8 | facade、去重、死代码清理、合并事件 |
| TEST-1,2,3,4 | 网络协议测试、场景胶水、战斗/命令边界用例 |
| TOOL-1, TOOL-2 | CI、独立 Node LAN 入口 |
| ART-2, ART-3, ART-4, ART-5 | 13 张假实图重生成(豆包)、帧动画、孤儿与死生成清理 |
| LORE-1,2,3,4,5 | 深矿破坏者实装或改文案、科技名统一、Codex 补条目/成本派生 |
| MAP-2,3,4,5 | 出生对称、铁矿对等、不可达口袋、中立结构落地 |
| AI-3,4,5,6 | 侦察锁、扫描缓存、难度淡入、扩张 |
| AUD-3,5, TOOL-3,4,5, UX-5,8,9,10, PERF-剩余, TEST-5,6 | 打磨项 |

---

## 战略建议

**先做包1+包2**(正确性/公平性/联机语义)——这些是"规则自己打架、读档/联机与现实不一致"的硬伤,一旦做了后面评测就稳。
**再做包3 手感 + 包4 性能**——直接决定"好不好玩/卡不卡"的两大体验面。
**包5 UX/引导/无障碍**与**包6 工程/内容**持续推进,含豆包美术重生成(受 AGENTS.md 硬规则约束)。

*本文档可持续追加轮次。实施时按包逐步拆任务,每包独立 tsc+test 验证。*