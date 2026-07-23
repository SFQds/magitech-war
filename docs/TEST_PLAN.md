# 测试调研文档 — L2/L3 测试项清单

> 本文档是 L2 集成测试与 L3 端到端测试的 `it` 清单，由子代理调研后填充，指导测试编写。
> L1 单元测试已就绪（127 个，覆盖寻路/战斗/采集/迷雾/科技/研究）。

## L2 集成测试

### CommandExecutor（14 命令分支，回归点已标注）

> 构造注入：`new CommandExecutor(world, entities, spawner, applyTechToBuilding, addBuilding)`
> - `applyTechToBuilding` 默认传 no-op stub `()=>{}`（避免 structure_reinforce 干扰），仅"科技应用"用例传真实 TechSystem
> - `addBuilding` 传 stub `(b)=>entities.addBuilding(b)`（只登记注册表，不建 sprite）
> - 共享 fixture 用 `setupGame()`（factories.ts），EventBus 每 `it` 前 `clear()`

#### train
- `it('训练工兵：扣 100 晶体/1 补给，入队 1 项，state=producing')` — empire CC complete，crystal 1900/supply 1/队列 1
- `it('联邦玩家生产速度+15%：timeRemaining=5*0.85=4.25')`
- `it('favoredBy 折扣：arcane_empire 训练 battle_mage crystal=240（300*0.8）')` — 需先 completeTech('tech:battle_mage_training') **回归 P1-D2**
- `it('CC 研究中仍可训练工兵，state 保持 researching')` — CC state='researching' **回归 P1-CC**
- `it('非 CC 研究中训练 → fail「建筑正在研究中」')`
- `it('建筑不存在 → fail')` / `it('建筑不属于玩家 → fail')`
- `it('building constructing → fail「建筑尚未完工」')` **回归建筑建造中不能 canEnqueue**
- `it('队列满(maxQueueSize=5) → fail「训练队列已满」')`
- `it('未知单位 → fail「未知单位」')`
- `it('科技前置未研究 → fail「科技未解锁」')` — battle_mage 无 tech
- `it('L3 exclusiveTo faction 不匹配 → fail「exclusive faction mismatch」')` — empire train hammer_squad
- `it('资源不足 → fail「资源不足」')` / `it('supply 不足 → fail')`
- `it('英雄已存在 → fail「已有同名英雄」')` **回归 P1-1**
- `it('英雄阵营不匹配 → fail「hero faction mismatch」')` — empire train hero_marcus **回归 P1-H1**
- `it('英雄训练扣 800/5，不走 faction 折扣')`

#### cancel_train
- `it('取消队首：按 getUnitCostWithFaction 退款，队列-1')`
- `it('queueIndex=-1 取消最后一项')`
- `it('英雄队列项退款走 HERO_DEFS.cost 不打折')`
- `it('折扣一致性：train battle_mage 扣 240 → cancel 退 240 → 净 0')` **回归 P1-cancel_train**
- `it('空队列 → fail「生产队列为空」')` / `it('queueIndex 越界 → fail「队列项不存在」')`

#### move / attack_move
- `it('单单位移动：navigate 设 path，state=moving')`
- `it('多单位移动：assignGroupGoals 分配不同终点格')`
- `it('move 中断采集：递减旧矿 currentGatherers、清 targetResourceId')` **回归 P1-D5**
- `it('attack_move：state=pursuing，保留 targetEntityId')` **回归 P1-S1f**
- `it('死单位/非己方单位被静默跳过')` / `it('终点不可通行：path 为空但 ok')`

#### attack_target
- `it('设 attackTarget：targetEntityId、state=attacking、清 path')`
- `it('攻击中断采集：递减旧矿、清 targetResourceId')` **回归 P1-S1d**
- `it('owner 不符单位被跳过')` **回归 P1-D7**

#### build / deploy
- `it('建造兵营：扣 300/20，state=constructing，_aiBuildTime=20')` **回归 P1-AI20（非 instant complete）**
- `it('联邦建筑-20%：barracks 扣 crystal=240/industry=16')`
- `it('applyTechToBuilding 应用 structure_reinforce：maxHp=960')` — 传真实 TechSystem
- `it('deploy 用 cmd.position 非 CC-anchored')`
- `it('未知 buildingDefId → fail「建筑数据不存在」')`
- `it('crystal 不足 → fail')` / `it('industry 不足 → fail「资源不足」')` **回归 P0-1**
- `it('没有指挥中心 → fail「没有指挥中心」')`
- `it('CC 附近全不可通行 → fail「没有合适的建造位置」')`

#### gather
- `it('工人采集：设 targetResourceId、navigate 到矿点格')`
- `it('换矿前递减旧矿 currentGatherers')` **回归 P0-A2**
- `it('采集前停止攻击：清 targetEntityId')` **回归 P1-S1e**
- `it('field 不存在/枯竭 → 跳过仍 ok')`

#### research
- `it('研究 advanced_mining：扣 200，researchTotalTime=25.5(empire 0.85)，state=researching')`
- `it('联邦 researchTotalTime=30(1.0)')`
- `it('跨建筑同科技 → fail「该科技正在其他建筑研究」')` **回归 P0-C3**
- `it('研究白名单：archive 研究 advanced_mining → fail「该建筑不能研究此科技」')` **回归 P1-BUILD1**
- `it('前置未研究 → fail「前置科技未研究或已研究」')` / `it('已研究 → fail')`
- `it('建筑已有研究 → fail「正在研究其他科技」')` / `it('建筑 producing → fail「建筑忙碌中」')`
- `it('canResearch 走 TechTreeSystem')` **回归 P2-C4**

#### cancel_research
- `it('进度 0 取消：全额退款 200，清研究状态，发 RESEARCH_CANCELED')`
- `it('进度 0.5 取消：退款 floor(200*0.5)=100')`
- `it('进度 1.0 取消：退款 0')` / `it('progress 钳制 [0,1]')`
- `it('未在研究 → fail「该建筑未在研究科技」')`

#### spawn
- `it('spawn 3 个 rifleman：units +3')` / `it('count 缺省为 1')` / `it('spawn 英雄走 HeroSystem')`
- `it('position 不可通行 → findNearbyPassable 找替代')`

#### use_ability
- `it('马库斯 slot0 空投：生成 3 步枪兵，技能冷却 35s')`
- `it('伊莎贝尔 slot0 护盾：最弱友军 shieldHp=200')`
- `it('abilityId 格式错 → fail「无效的技能ID」')` / `it('slotIndex 越界 → fail「无效的技能槽位」')`
- `it('英雄不存在/已死/owner 不符 → fail')` / `it('冷却中 → fail「技能不可用」')`

#### stop / hold_position
- `it('stop：清 path、state=idle、holdPosition=false、aiLockedAction=null')`
- `it('hold_position：holdPosition=true，state 不强制 idle')`
- `it('stop 中断采集：递减旧矿（但 targetResourceId 保留，待确认是否 bug）')` **回归 P0-A2**

#### 路由层
- `it('未知 type → fail「未知命令」')`

### AIController（EconomyAI / MilitaryAI / StrategyManager）

#### AIController.update 节奏
- `it('deltaSec 不足 tickInterval 时返回空数组且不推进战略评估')` — normal tickInterval=2.0，update(1.0)→[]
- `it('累计 deltaSec >= tickInterval 后触发一次 evaluate 并重置')` — 两次 update(1.0) 第二次触发
- `it('easy 的 tickInterval=4s，2s 不足以触发')`
- `it('hard 的 tickInterval=1.5s，2s 触发')`
- `it('strategyTimer 累计 >= 25s 后重评估战略')`

#### EconomyAI.evaluate 行为
- `it('0 工人时发出 train unit_worker 命令（目标为 CC）')` — buildingId===cc.id, count===1
- `it('idle 工人发出 gather 命令，目标为最近 active 矿点')` — resourceFieldId===最近 field.id
- `it('已采集/移动中的 worker 不发 gather')` — state!=='idle'
- `it('资源够时建 barracks/factory/refinery')` — build 命令含三者
- `it('已有 barracks+factory 且 aggression>=0.7 时不建二者')`
- `it('0 工人 + crystal<100 时安全网直接改 player.resources.crystal')` — normal→100, hard→200
- `it('0 工人但 crystal>=100 时安全网不触发')`
- `it('安全网被 MAX_CRYSTAL=20000 钳制')`
- `it('supply>=cap-5 且有 factory 时建第二 barracks/factory')`
- `it('supply < cap-5 时不建第二兵营')`
- `it('train 命令带 techReq 时，科技未研究则跳过')` — battle_mage 无 tech 不发 train
- `it('techReq 已研究后正常发 train 命令')`
- `it('research 选最便宜且未研究的科技')` — 按 prerequisites 数 + crystal 排序
- `it('techBld 正在研究时不发 research')`
- `it('无生产建筑时 evaluate 返回空（仅含 gather）')`
- `it('CC 处于 constructing 状态被视为无生产建筑')` — canEnqueue()=false

#### MilitaryAI.evaluate 行为
- `it('ownCombat 为空时返回空数组并清空 kiteTracker')`
- `it('低血量(normal<30%)触发撤退：aiLockedAction=retreat 且发 move')`
- `it('easy 难度永不撤退（skipRetreat）')`
- `it('hard 难度撤退阈值 0.45')`
- `it('无己方建筑时撤退转为解锁，不永久锁定')`
- `it('撤退后到达己方建筑 3 格内 → 转 recover，hard 回血 +6/帧')`
- `it('recover 到 hpPercent>=0.7 → 解锁且设 retreatCooldown=3')`
- `it('敌人在 sight 内 → 发 attack_move 命令')` — unassigned>=attackThreshold
- `it('防守：敌人靠近己方建筑 8 格内，最近 defender 设为 defend')`
- `it('defend 目标死亡 → 清除锁定')`
- `it('holdPosition=true 时不被分配为 defender/进攻')`
- `it('alchemists_society 行会：敌人在场且冷却结束 → 施加药剂扣水晶')`
- `it('void_institute 行会：敌人在场 → 激活虚空过载')`
- `it('无行会时不触发任何行会技能')`

#### 难度差异矩阵
- `it('resourceMult：easy=0.7/normal=1.0/hard=2.0')`
- `it('EconomyAI aggressMultiplier：hard=0.7/normal=1.0/easy=1.5（影响建造门槛）')`
- `it('AI 采集倍率：hard 时 gMult1=techGatherMult*2.0')`
- `it('attackThreshold：easy=6/normal=3/hard=1')`
- `it('retreatThreshold：normal=0.30/hard=0.45')`
- `it('StrategyManager 阶段升级 diffMult：hard=0.6 升级更快')`

#### 最小 fixture
```ts
function makeFixture(difficulty) {
  const world = new GameWorld(40, 40);
  const pi = world.addPlayer('hammer_federation', [], true);
  const cc = makeCommandCenter(pi, 10, 10);
  const field = makeResourceField(12, 10, 10000);
  const ai = new AIController(world, pi, difficulty);
  return { world, pi, cc, field, ai,
           eco: new EconomyAI(world, pi, difficulty, ai.resourceMult),
           mil: new MilitaryAI(world, pi, difficulty) };
}
```

### GameOverController

#### 歼灭判定
- `it('一方建筑全失+无工人+宽限满 60s → 判歼灭，winnerIndex 正确')` — reason='annihilated'
- `it('双方同帧宽限满 → 平局 winnerIndex=-1')`
- `it('无建筑但有 worker → 不判歼灭（worker 兜底）')`

#### 宽限期
- `it('宽限期内重建（补一个建筑）则不判负')`
- `it('宽限精确边界：graceTimers==59 不判负，==60 判负')`
- `it('worker 存在时即便无建筑也不推进到判负')`
- `it('advanceGraceTimers 与 stepTimer 推进一致')`

#### 限时判定
- `it('跑满 1800s → 按 calcScore 判胜负，reason=timeout')`
- `it('calcScore 公式：crystal + Σ(maxHp+attackDamage*10)*0.5 + Σ maxHp*0.3')`
- `it('限时双方分数相等 → 平局')`
- `it('stepTimer 在 _gameOver=true 后不再推进')`

#### fixture
```ts
const stubScene = { add: { text: ()=>chainable }, scene: { start: ()=>{} } };
const ctrl = new GameOverController(stubScene, world, entities);
```

### DeathCleanupSystem

- `it('死亡单位退还 supply')` — supplyCost 扣减
- `it('死亡工人释放采集位 currentGatherers--')`
- `it('死亡单位从选中集移除（保留其余）')` — P2-质疑31
- `it('运输车被摧毁释放 cargo：退还 supply + 清 isCargo')` — P0-2
- `it('建筑摧毁发 BUILDING_DESTROYED 事件（含 reason）')`
- `it('非 constructing 建筑摧毁奖励英雄 XP')` — rewardBuildingXp 回调
- `it('生产队列按折扣价退款')` — getUnitCostWithFaction
- `it('研究进度按剩余比例退款')`
- `it('建造中建筑摧毁释放工人')` — builder.state='idle'
- `it('枯竭矿点注销资源格 + 移除 sprite')`

## L3 端到端测试（HeadlessGameRunner）

### 歼灭场景
- `it('AI vs AI 跑到一方建筑全失判歼灭')` — 构造一方快速败（杀光建筑+无工人）
- `it('宽限 60s 内重建则翻盘不判负')`

### 限时场景
- `it('跑满 1800 秒按分数判胜负')` — stepTimer(1800) + checkGameOver
- `it('calcScore 含 crystal+单位战力+建筑 HP')`

### 宽限翻盘场景
- `it('建筑全失推进 graceTimers 接近 60，重建后清零，继续不判负')`
- `it('graceTimers==59 不判负，==60 判负')`

### 完整游戏循环
- `it('开局 → 采集 → 造兵 → 交战 → 胜负 全流程不卡死')` — runUntil + maxFrames
- `it('两方 AI 持续运行 N 帧无异常')` — 稳定性

### fixture 构造要点
| 场景 | 关键构造 | 关键断言 |
|---|---|---|
| 歼灭 | P1 建筑 isActive=false + 无 worker + advanceGraceTimers(60) | isOver, winnerIndex, reason='annihilated' |
| 限时 | stepTimer(1800) + 资源非对称 | calcScore 三项, reason='timeout' |
| 翻盘 | 推进 graceTimers<60 → 补 complete() 建筑 → 再推进 | isOver===false |

### 风险提示
1. GameOverController 强依赖 Phaser.Scene，e2e 必须用 phaserStub
2. EconomyAI CC 选择：多生产建筑时优先 CC，测试只给 CC 最稳
3. MilitaryAI 撤退目标由 findNearbyPassable 决定，不硬编码 target 坐标
4. stepTimer(1800) 一次性大步进：stub 的 text() 必须返回链式对象
