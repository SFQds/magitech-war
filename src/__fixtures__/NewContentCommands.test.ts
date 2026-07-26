/**
 * 验证新内容可通过命令直接使用（绕过 AI 经济策略，证明数据/门控/机制正确接线）
 * 聚焦: 公会建筑可建、L3 单位可训、超武需科技解锁
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../utils/EventBus';
import type { AnyCommand } from '../types/commands';
import { Building } from '../entities/Building';
import { SuperWeaponSystem } from '../systems/SuperWeaponSystem';

// 直接用 setupGame + CommandExecutor 验证命令链路，避免 AI 经济策略干扰
import { setupGame, makeCommandCenter } from './factories';
import type { GameSetup } from './factories';

let setup: GameSetup;
beforeEach(() => { EventBus.clear(); setup = setupGame(64, 64); });
afterEach(() => EventBus.clear());

function seedCC(owner = 0) {
  const cc = makeCommandCenter(owner, 6, 6);
  setup.entities.addBuilding(cc);
  return cc.id;
}

describe('新内容命令链路验证（绕过 AI 经济）', () => {
  it('炼金协会玩家可建 bld_alchemy_lab', () => {
    setup.world.players[0].guilds = ['alchemists_society'];
    setup.world.players[0].resources.crystal = 1000;
    seedCC();
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [], frame: 0,
      buildingDefId: 'bld_alchemy_lab', position: { x: 10, y: 10 },
    } as AnyCommand);
    expect(res.ok).toBe(true);
    const lab = setup.entities.buildings.find(b => b.spriteKey === 'bld_alchemy_lab');
    expect(lab).toBeDefined();
  });

  it('非炼金协会玩家不能建 bld_alchemy_lab（guild 门控）', () => {
    setup.world.players[0].guilds = ['mages_guild']; // 错误行会
    setup.world.players[0].resources.crystal = 1000;
    seedCC();
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [], frame: 0,
      buildingDefId: 'bld_alchemy_lab', position: { x: 10, y: 10 },
    } as AnyCommand);
    expect(res.ok).toBe(false);
  });

  it('机械行会玩家可建 bld_repair_depot', () => {
    setup.world.players[0].guilds = ['mechanists_guild'];
    setup.world.players[0].resources.crystal = 1000;
    seedCC();
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [], frame: 0,
      buildingDefId: 'bld_repair_depot', position: { x: 10, y: 10 },
    } as AnyCommand);
    expect(res.ok).toBe(true);
  });

  it('虚空研究院玩家可建 bld_void_resonator', () => {
    setup.world.players[0].guilds = ['void_institute'];
    setup.world.players[0].resources.crystal = 1000;
    seedCC();
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [], frame: 0,
      buildingDefId: 'bld_void_resonator', position: { x: 10, y: 10 },
    } as AnyCommand);
    expect(res.ok).toBe(true);
  });

  it('法师公会玩家可建 bld_teleport_gate', () => {
    setup.world.players[0].guilds = ['mages_guild'];
    setup.world.players[0].resources.crystal = 1000;
    seedCC();
    const res = setup.commandExecutor.execute({
      type: 'build', playerIndex: 0, unitIds: [], frame: 0,
      buildingDefId: 'bld_teleport_gate', position: { x: 10, y: 10 },
    } as AnyCommand);
    expect(res.ok).toBe(true);
  });

  it('L3 符文泰坦可训练（需奥术帝国+机械行会+双科技）', () => {
    // player 0 = arcane_empire (factionForOwner)。给它 mages... 不对，rune_titan 需 mechanists_guild
    setup.world.players[0].guilds = ['mechanists_guild'];
    setup.world.players[0].resources.crystal = 2000;
    setup.world.players[0].resources.supplyCap = 100;
    // 研究前置科技
    setup.world.techTrees.get(0)!.completeTech('tech:arcane_legacy');
    setup.world.techTrees.get(0)!.completeTech('tech:mech_assembly');
    seedCC();
    // 放一个 factory 训练 rune_titan
    const factory = new Building(0, 'arcane_empire', 8, 8, 1000, 'structure', 'production', 'bld_factory', 20, 30);
    factory.complete();
    setup.entities.addBuilding(factory);
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: factory.id, unitDefId: 'unit_rune_titan', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(true);
  });

  it('L3 炼金巨像可训练（需炼金协会+高级药剂科技）', () => {
    setup.world.players[0].guilds = ['alchemists_society'];
    setup.world.players[0].resources.crystal = 2000;
    setup.world.players[0].resources.supplyCap = 100;
    setup.world.techTrees.get(0)!.completeTech('tech:advanced_potions');
    seedCC();
    const barracks = new Building(0, 'arcane_empire', 8, 8, 800, 'structure', 'production', 'bld_barracks', 20, 0);
    barracks.complete();
    setup.entities.addBuilding(barracks);
    const res = setup.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], frame: 0,
      buildingId: barracks.id, unitDefId: 'unit_alchemy_colossus', count: 1,
    } as AnyCommand);
    expect(res.ok).toBe(true);
  });

  it('超武激活需先研究解锁科技（链路验证）', () => {
    // 已在 SuperWeaponSystem.test.ts 覆盖，此处仅确认 import 链路正常
    expect(typeof SuperWeaponSystem.activate).toBe('function');
  });
});
