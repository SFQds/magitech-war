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
import { BUILDING_DEFS } from '../config/unitData';
import { Building } from '../entities/Building';

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
  it('研究 advanced_mining：扣 150，state=researching', () => {
    const ccId = seedCC();
    const res = setup.commandExecutor.execute({
      type: 'research', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: ccId, techDefId: 'tech:advanced_mining',
    } as AnyCommand);
    expect(res.ok).toBe(true);
    expect(setup.world.players[0].resources.crystal).toBe(2000 - 150);
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

  it('取消研究：进度 0.5 退款 floor(150*0.5)=75', () => {
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
    expect(setup.world.players[0].resources.crystal).toBe(crystalBefore + 75);
    expect(cc.researchingTechId).toBeNull();
    expect(cc.state).toBe('idle');
  });

  it('批3: 公会专属科技 exclusiveTo.guild 不符 -> fail；加对应行会后可研究', () => {
    // 批C: tech:solvent_bomb 现由 bld_alchemy_lab 承载（CC 不再列炼金科技）
    // 手动放一个 alchemy_lab 给 player 0，绕过建造门控隔离测试研究层 guild 门控
    const lab = new Building(0, 'arcane_empire', 8, 8, 600, 'structure', 'tech', 'bld_alchemy_lab', 0, 10);
    lab.complete();
    setup.entities.addBuilding(lab);
    // player 0 guilds = [] -> 应被 guild 门控拦截
    const res = setup.commandExecutor.execute({
      type: 'research', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: lab.id, techDefId: 'tech:solvent_bomb',
    } as AnyCommand);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('行会');
    // 加 alchemists_society 行会后，前置已满足（solvent_bomb 无 prerequisites）应可研究
    setup.world.players[0].guilds.push('alchemists_society');
    const res2 = setup.commandExecutor.execute({
      type: 'research', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: lab.id, techDefId: 'tech:solvent_bomb',
    } as AnyCommand);
    expect(res2.ok).toBe(true);
  });

  it('批3: 公会科技前置未满足时仍 fail（即使行会符合）', () => {
    // 批C: tech:corrosion_amp 现由 bld_alchemy_lab 承载
    const lab = new Building(0, 'arcane_empire', 8, 8, 600, 'structure', 'tech', 'bld_alchemy_lab', 0, 10);
    lab.complete();
    setup.entities.addBuilding(lab);
    setup.world.players[0].guilds.push('alchemists_society');
    const res = setup.commandExecutor.execute({
      type: 'research', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: lab.id, techDefId: 'tech:corrosion_amp',
    } as AnyCommand);
    expect(res.ok).toBe(false); // 前置 advanced_potions 未研究
  });
});

describe('CommandExecutor - 批1 exclusiveTo 门控', () => {
  it('build: arcane_empire 玩家不能建铁锤联邦专属 bld_assembly_workshop', () => {
    seedCC(); // player 0 = arcane_empire
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [], frame: 0,
      buildingDefId: 'bld_assembly_workshop', position: { x: 10, y: 10 },
    } as AnyCommand);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('faction');
  });

  it('build: arcane_empire 玩家可建自己的 bld_ancient_archive', () => {
    seedCC();
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [], frame: 0,
      buildingDefId: 'bld_ancient_archive', position: { x: 10, y: 10 },
    } as AnyCommand);
    expect(res.ok).toBe(true);
  });

  it('build: hammer_federation 玩家(player 1)不能建奥术帝国专属 bld_ancient_archive', () => {
    // player 1 = hammer_federation (AI)。先给它一个 CC。
    const cc1 = makeCommandCenter(1, 20, 20);
    setup.entities.addBuilding(cc1);
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 1, unitIds: [], frame: 0,
      buildingDefId: 'bld_ancient_archive', position: { x: 22, y: 22 },
    } as AnyCommand);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('faction');
  });

  it('train: arcane_empire 玩家不能训练 hammer_federation 专属 unit_hammer_squad', () => {
    // 手动给 player 0 (arcane_empire) 放一个 bld_assembly_workshop，绕过建造门控隔离测试训练层 faction 门控。
    const bld = new Building(0, 'arcane_empire', 8, 8, 600, 'structure', 'production', 'bld_assembly_workshop', 0, 10);
    bld.complete();
    setup.entities.addBuilding(bld);
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: bld.id, unitDefId: 'unit_hammer_squad', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('faction');
  });

  it('build: exclusiveTo.guild 不符 -> fail；加对应行会后可建', () => {
    // 临时给 bld_turret 加 exclusiveTo.guild=void_institute，验证 execBuild 读取 guild 门控。
    const original = BUILDING_DEFS['bld_turret'].exclusiveTo;
    BUILDING_DEFS['bld_turret'].exclusiveTo = { guild: 'void_institute' };
    try {
      seedCC(); // player 0 guilds = []
      const res = setup.commandExecutor.execute({
        type: 'build', playerIndex: 0, unitIds: [], frame: 0,
        buildingDefId: 'bld_turret', position: { x: 10, y: 10 },
      } as AnyCommand);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain('guild');
      // 给 player 0 加 void_institute 行会后应可建
      setup.world.players[0].guilds.push('void_institute');
      const res2 = setup.commandExecutor.execute({
        type: 'build', playerIndex: 0, unitIds: [], frame: 0,
        buildingDefId: 'bld_turret', position: { x: 12, y: 12 },
      } as AnyCommand);
      expect(res2.ok).toBe(true);
    } finally {
      BUILDING_DEFS['bld_turret'].exclusiveTo = original;
    }
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


// ============================================================
// 批4: 第二期阵营门控测试
// ============================================================
describe('CommandExecutor - 批4 第二期阵营门控', () => {
  it('霜脊守卫 unit_frost_guard 仅霜脊王国可训练（arcane_empire 玩家被拒）', () => {
    const ccId = seedCC();
    const barracks = new Building(0, 'arcane_empire', 6, 8, 800, 'structure', 'production', 'bld_barracks', 20, 0);
    setup.entities.addBuilding(barracks);
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: barracks.id, unitDefId: 'unit_frost_guard', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });

  it('翡翠斥候 unit_jade_scout 仅翡翠邦联可训练（arcane_empire 玩家被拒）', () => {
    const barracks = new Building(0, 'arcane_empire', 6, 8, 800, 'structure', 'production', 'bld_barracks', 20, 0);
    setup.entities.addBuilding(barracks);
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: barracks.id, unitDefId: 'unit_jade_scout', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });

  it('深矿竖井 bld_deep_mine 仅霜脊王国可建造（arcane_empire 玩家被拒）', () => {
    const ccId = seedCC();
    const worker = makeUnit({ owner: 0, tileX: 7, tileY: 6, spriteKey: 'unit_worker' });
    setup.entities.addUnit(worker);
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [worker.id], frame: 0,
      buildingDefId: 'bld_deep_mine', position: { x: 8, y: 8 },
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });

  it('交易所 bld_trade_post 仅翡翠邦联可建造（arcane_empire 玩家被拒）', () => {
    const worker = makeUnit({ owner: 0, tileX: 7, tileY: 6, spriteKey: 'unit_worker' });
    setup.entities.addUnit(worker);
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [worker.id], frame: 0,
      buildingDefId: 'bld_trade_post', position: { x: 8, y: 8 },
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });

  it('深矿破坏者 unit_deep_destroyer 需霜脊+虚空研究院（arcane_empire 无 void 被拒）', () => {
    const factory = new Building(0, 'arcane_empire', 6, 8, 1000, 'structure', 'production', 'bld_factory', 20, 30);
    setup.entities.addBuilding(factory);
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: factory.id, unitDefId: 'unit_deep_destroyer', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });
});
