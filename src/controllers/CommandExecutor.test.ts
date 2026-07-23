/**
 * CommandExecutor 单元测试 - 命令链集成
 *
 * L2 集成：验证命令执行成功/失败路径 + 审计回归点。
 * 用 setupGame() 夹具，applyTechToBuilding 默认 stub（避免科技干扰）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupGame, makeCommandCenter, makeUnit, makeResourceField } from '../__fixtures__/factories';
import type { GameSetup } from '../__fixtures__/factories';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import type { AnyCommand } from '../types/commands';

let setup: GameSetup;

beforeEach(() => {
  EventBus.clear();
  setup = setupGame(32, 32);
});

afterEach(() => EventBus.clear());

/** 给玩家 0 放一个完成的 CC（train/build/research 前置） */
function seedCC(owner = 0): string {
  const cc = makeCommandCenter(owner, 6, 6);
  setup.entities.addBuilding(cc);
  return cc.id;
}

describe('CommandExecutor - train', () => {
  it('训练工兵：扣 100 晶体/1 补给，入队 1 项，state=producing', () => {
    const ccId = seedCC();
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId, unitDefId: 'unit_worker', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(true);
    expect(setup.world.players[0].resources.crystal).toBe(2000 - 100);
    expect(setup.world.players[0].resources.supply).toBe(1);
    const cc = setup.entities.getBuilding(ccId)!;
    expect(cc.productionQueue.length).toBe(1);
    expect(cc.state).toBe('producing');
  });

  it('favoredBy 折扣：arcane_empire 训练 battle_mage crystal=240', () => {
    setup.world.techTrees.get(0)!.completeTech('tech:battle_mage_training');
    const ccId = seedCC();
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId, unitDefId: 'unit_battle_mage', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(true);
    expect(setup.world.players[0].resources.crystal).toBe(2000 - 240); // 300*0.8
  });

  it('CC 研究中仍可训练工兵，state 保持 researching', () => {
    const ccId = seedCC();
    const cc = setup.entities.getBuilding(ccId)!;
    cc.state = 'researching';
    cc.researchingTechId = 'tech:advanced_mining';
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId, unitDefId: 'unit_worker', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(true);
    expect(cc.state).toBe('researching'); // 不被覆盖
  });

  it('建筑不存在 -> fail', () => {
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: 'nope', unitDefId: 'unit_worker', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });

  it('building constructing -> fail「尚未完工」', () => {
    const cc = makeCommandCenter(0, 6, 6, false); // 不 complete
    setup.entities.addBuilding(cc);
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: cc.id, unitDefId: 'unit_worker', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });

  it('科技前置未研究 -> fail', () => {
    const ccId = seedCC();
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId, unitDefId: 'unit_battle_mage', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });

  it('资源不足 -> fail', () => {
    setup.world.players[0].resources.crystal = 50;
    const ccId = seedCC();
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId, unitDefId: 'unit_worker', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(false);
    expect(setup.world.players[0].resources.crystal).toBe(50); // 未扣
  });
});

describe('CommandExecutor - cancel_train', () => {
  it('折扣一致性：train battle_mage 扣 240 -> cancel 退 240 -> 净 0', () => {
    setup.world.techTrees.get(0)!.completeTech('tech:battle_mage_training');
    const ccId = seedCC();
    setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId, unitDefId: 'unit_battle_mage', count: 1,
    } as AnyCommand);
    const afterTrain = setup.world.players[0].resources.crystal;
    setup.commandExecutor.execute({
      type: 'cancel_train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId, queueIndex: 0,
    } as AnyCommand);
    expect(setup.world.players[0].resources.crystal).toBe(afterTrain + 240); // 退回
  });
});

describe('CommandExecutor - move', () => {
  it('单单位移动：设 path，state=moving', () => {
    const u = makeUnit({ owner: 0, tileX: 5, tileY: 5 });
    setup.entities.addUnit(u);
    const res = setup.commandExecutor.execute({
      type: 'move', playerIndex: 0, unitIds: [u.id], frame: 0, target: { x: 10, y: 5 },
    } as AnyCommand);
    expect(res.ok).toBe(true);
    expect(u.path.length).toBeGreaterThan(0);
    expect(u.state).toBe('moving');
  });

  it('move 中断采集：navigate 改 state 后 gather 槽检查现状', () => {
    // 注意：execMove 先 navigate（state->moving）再检查 state==='gathering'，
    // 故导航后 gather 槽不会被递减。此测试记录当前行为（待确认是否 bug）。
    const u = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_worker' });
    const field = makeResourceField(6, 5, 1000);
    setup.entities.addUnit(u);
    setup.entities.addField(field);
    u.targetResourceId = field.id;
    u.state = 'gathering';
    field.currentGatherers = 2;
    const res = setup.commandExecutor.execute({
      type: 'move', playerIndex: 0, unitIds: [u.id], frame: 0, target: { x: 10, y: 5 },
    } as AnyCommand);
    expect(res.ok).toBe(true);
    expect(u.state).toBe('moving'); // navigate 改了 state
    // 当前实现：navigate 后 state 已非 gathering，故不递减（现状记录）
    expect(field.currentGatherers).toBe(2);
  });
});

describe('CommandExecutor - build', () => {
  it('建造兵营：扣 300/20，state=constructing，_aiBuildTime=20', () => {
    seedCC();
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [], frame: 0,
      buildingDefId: 'bld_barracks', position: { x: 10, y: 10 },
    } as AnyCommand);
    expect(res.ok).toBe(true);
    expect(setup.world.players[0].resources.crystal).toBe(2000 - 300);
    expect(setup.world.players[0].resources.industry).toBe(65 - 20); // 起始 65
    const newBld = setup.entities.buildings.find(b => b.spriteKey === 'bld_barracks');
    expect(newBld).toBeDefined();
    expect(newBld!.state).toBe('constructing'); // 非 instant complete
    expect(newBld!.buildProgress).toBe(0);
    expect((newBld as any)._aiBuildTime).toBe(20);
  });

  it('没有指挥中心 -> fail', () => {
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [], frame: 0,
      buildingDefId: 'bld_barracks', position: { x: 10, y: 10 },
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });

  it('industry 不足 -> fail', () => {
    setup.world.players[0].resources.industry = 5;
    seedCC();
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [], frame: 0,
      buildingDefId: 'bld_barracks', position: { x: 10, y: 10 },
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });
});

describe('CommandExecutor - gather', () => {
  it('工人采集：设 targetResourceId、navigate 到矿点格', () => {
    const u = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_worker' });
    const field = makeResourceField(10, 5, 1000);
    setup.entities.addUnit(u);
    setup.entities.addField(field);
    const res = setup.commandExecutor.execute({
      type: 'gather', playerIndex: 0, unitIds: [u.id], frame: 0, resourceFieldId: field.id,
    } as AnyCommand);
    expect(res.ok).toBe(true);
    expect(u.targetResourceId).toBe(field.id);
    expect(u.path.length).toBeGreaterThan(0);
  });

  it('换矿前递减旧矿 currentGatherers', () => {
    const u = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_worker' });
    const f1 = makeResourceField(6, 5, 1000);
    const f2 = makeResourceField(15, 5, 1000);
    setup.entities.addUnit(u);
    setup.entities.addField(f1);
    setup.entities.addField(f2);
    u.targetResourceId = f1.id;
    u.state = 'gathering';
    f1.currentGatherers = 2;
    setup.commandExecutor.execute({
      type: 'gather', playerIndex: 0, unitIds: [u.id], frame: 0, resourceFieldId: f2.id,
    } as AnyCommand);
    expect(f1.currentGatherers).toBe(1);
    expect(u.targetResourceId).toBe(f2.id);
  });
});

describe('CommandExecutor - stop / hold_position', () => {
  it('stop：清 path、state=idle、holdPosition=false、aiLockedAction=null', () => {
    const u = makeUnit({ owner: 0, tileX: 5, tileY: 5 });
    u.state = 'moving';
    u.path = [{ x: 6, y: 5 }];
    u.holdPosition = true;
    u.aiLockedAction = 'attack';
    setup.entities.addUnit(u);
    const res = setup.commandExecutor.execute({
      type: 'stop', playerIndex: 0, unitIds: [u.id], frame: 0,
    } as AnyCommand);
    expect(res.ok).toBe(true);
    expect(u.path.length).toBe(0);
    expect(u.state).toBe('idle');
    expect(u.holdPosition).toBe(false);
    expect(u.aiLockedAction).toBeNull();
  });

  it('hold_position：holdPosition=true，state 不强制 idle', () => {
    const u = makeUnit({ owner: 0, tileX: 5, tileY: 5 });
    u.state = 'attacking';
    u.path = [{ x: 6, y: 5 }];
    setup.entities.addUnit(u);
    setup.commandExecutor.execute({
      type: 'hold_position', playerIndex: 0, unitIds: [u.id], frame: 0,
    } as AnyCommand);
    expect(u.holdPosition).toBe(true);
    expect(u.path.length).toBe(0);
  });
});

describe('CommandExecutor - research / cancel_research', () => {
  it('研究 advanced_mining：扣 200，state=researching', () => {
    const ccId = seedCC();
    const res = setup.commandExecutor.execute({
      type: 'research', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId, techDefId: 'tech:advanced_mining',
    } as AnyCommand);
    expect(res.ok).toBe(true);
    expect(setup.world.players[0].resources.crystal).toBe(2000 - 200);
    const cc = setup.entities.getBuilding(ccId)!;
    expect(cc.researchingTechId).toBe('tech:advanced_mining');
    expect(cc.state).toBe('researching');
  });

  it('前置未研究 -> fail', () => {
    const ccId = seedCC();
    const res = setup.commandExecutor.execute({
      type: 'research', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId, techDefId: 'tech:refining_tech',
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });

  it('取消研究：进度 0.5 退款 floor(200*0.5)=100', () => {
    const ccId = seedCC();
    setup.commandExecutor.execute({
      type: 'research', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId, techDefId: 'tech:advanced_mining',
    } as AnyCommand);
    const cc = setup.entities.getBuilding(ccId)!;
    cc.researchProgress = 0.5;
    const crystalBefore = setup.world.players[0].resources.crystal;
    setup.commandExecutor.execute({
      type: 'cancel_research', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId,
    } as AnyCommand);
    expect(setup.world.players[0].resources.crystal).toBe(crystalBefore + 100);
    expect(cc.researchingTechId).toBeNull();
    expect(cc.state).toBe('idle');
  });
});

describe('CommandExecutor - 未知命令', () => {
  it('未知 type -> fail', () => {
    const res = setup.commandExecutor.execute({
      type: 'whatever', playerIndex: 0, unitIds: [], frame: 0,
    } as unknown as AnyCommand);
    expect(res.ok).toBe(false);
  });
});
