/**
 * NeutralController 单元测试 - 中立单位/建筑行为
 */
import { describe, it, expect } from 'vitest';
import { NeutralController, NEUTRAL_BUILDING_DEFS, NeutralBuildingManager } from '../systems/NeutralController';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { makeUnit, makeWorld } from '../__fixtures__/factories';

describe('NeutralController - spawnNeutralUnit', () => {
  it('生成水晶精魄：owner=-1, supplyCost=0, hp=50', () => {
    const world = makeWorld(16, 16);
    const u = NeutralController.spawnNeutralUnit(world, 'neutral_crystal_wisp', 5, 5);
    expect(u).not.toBeNull();
    expect(u!.owner).toBe(-1);
    expect(u!.supplyCost).toBe(0);
    expect(u!.hp).toBe(50);
    expect(u!.spriteKey).toBe('neutral_crystal_wisp');
  });

  it('生成失控机甲：hp=300, attackDamage=25', () => {
    const world = makeWorld(16, 16);
    const u = NeutralController.spawnNeutralUnit(world, 'neutral_feral_mech', 3, 3);
    expect(u!.hp).toBe(300);
    expect(u!.attackDamage).toBe(25);
    expect(u!.armorType).toBe('mechanical');
  });

  it('生成山兽：hp=600, armorType=heavy', () => {
    const world = makeWorld(16, 16);
    const u = NeutralController.spawnNeutralUnit(world, 'neutral_mountain_beast', 7, 7);
    expect(u!.hp).toBe(600);
    expect(u!.armorType).toBe('heavy');
  });

  it('未知 defId 返回 null', () => {
    const world = makeWorld(16, 16);
    expect(NeutralController.spawnNeutralUnit(world, 'nonexistent', 0, 0)).toBeNull();
  });
});

describe('NeutralController - register / onNeutralKilled', () => {
  it('击杀水晶精魄奖励 50 水晶', () => {
    const ctrl = new NeutralController();
    const world = makeWorld(16, 16);
    const wisp = NeutralController.spawnNeutralUnit(world, 'neutral_crystal_wisp', 5, 5)!;
    ctrl.register(wisp, 'neutral_crystal_wisp');
    const reward = ctrl.onNeutralKilled(wisp, 0);
    expect(reward).not.toBeNull();
    expect(reward!.crystalReward).toBe(50);
    expect(reward!.xpReward).toBe(0);
  });

  it('击杀失控机甲奖励 100 水晶 + 20 XP', () => {
    const ctrl = new NeutralController();
    const world = makeWorld(16, 16);
    const mech = NeutralController.spawnNeutralUnit(world, 'neutral_feral_mech', 3, 3)!;
    ctrl.register(mech, 'neutral_feral_mech');
    const reward = ctrl.onNeutralKilled(mech, 0);
    expect(reward!.crystalReward).toBe(100);
    expect(reward!.xpReward).toBe(20);
  });

  it('击杀山兽奖励 200 水晶 + 50 XP', () => {
    const ctrl = new NeutralController();
    const world = makeWorld(16, 16);
    const beast = NeutralController.spawnNeutralUnit(world, 'neutral_mountain_beast', 7, 7)!;
    ctrl.register(beast, 'neutral_mountain_beast');
    const reward = ctrl.onNeutralKilled(beast, 0);
    expect(reward!.crystalReward).toBe(200);
    expect(reward!.xpReward).toBe(50);
  });

  it('未注册单位击杀返回 null', () => {
    const ctrl = new NeutralController();
    const u = makeUnit({ owner: -1 });
    expect(ctrl.onNeutralKilled(u, 0)).toBeNull();
  });

  it('getAliveNeutrals 返回存活中立单位', () => {
    const ctrl = new NeutralController();
    const world = makeWorld(16, 16);
    const wisp = NeutralController.spawnNeutralUnit(world, 'neutral_crystal_wisp', 5, 5)!;
    ctrl.register(wisp, 'neutral_crystal_wisp');
    expect(ctrl.getAliveNeutrals()).toHaveLength(1);
    wisp.takeDamage(9999, 'physical'); // 击杀
    expect(ctrl.getAliveNeutrals()).toHaveLength(0);
  });
});

describe('NeutralController - behavior update', () => {
  it('被动单位 update 不抛错', () => {
    const ctrl = new NeutralController();
    const world = makeWorld(32, 32);
    const wisp = NeutralController.spawnNeutralUnit(world, 'neutral_crystal_wisp', 5, 5)!;
    ctrl.register(wisp, 'neutral_crystal_wisp');
    expect(() => ctrl.update([], [], 1.0, world)).not.toThrow();
  });

  it('巡逻单位 update 不抛错', () => {
    const ctrl = new NeutralController();
    const world = makeWorld(32, 32);
    const mech = NeutralController.spawnNeutralUnit(world, 'neutral_feral_mech', 5, 5)!;
    ctrl.register(mech, 'neutral_feral_mech');
    expect(() => ctrl.update([], [], 1.0, world)).not.toThrow();
  });

  it('守护单位 update 不抛错', () => {
    const ctrl = new NeutralController();
    const world = makeWorld(32, 32);
    const beast = NeutralController.spawnNeutralUnit(world, 'neutral_mountain_beast', 7, 7)!;
    ctrl.register(beast, 'neutral_mountain_beast');
    expect(() => ctrl.update([], [], 1.0, world)).not.toThrow();
  });

  it('巡逻机甲遇到军事单位时攻击', () => {
    const ctrl = new NeutralController();
    const world = makeWorld(32, 32);
    const mech = NeutralController.spawnNeutralUnit(world, 'neutral_feral_mech', 5, 5)!;
    ctrl.register(mech, 'neutral_feral_mech');
    const rifle = makeUnit({ owner: 0, spriteKey: 'unit_rifleman', tileX: 6, tileY: 5, hp: 100 });
    ctrl.update([mech, rifle], [], 1.0, world);
    // 机甲应在 sight 范围内检测到步枪兵并 attackTarget
    expect(mech.targetEntityId).toBe(rifle.id);
  });
});

describe('NeutralBuildingManager', () => {
  it('capture 后 isCaptured 返回 true', () => {
    const mgr = new NeutralBuildingManager();
    mgr.capture('bld_1', 0);
    expect(mgr.isCaptured('bld_1')).toBe(true);
    expect(mgr.getOwner('bld_1')).toBe(0);
  });

  it('release 后 isCaptured 返回 false', () => {
    const mgr = new NeutralBuildingManager();
    mgr.capture('bld_1', 0);
    mgr.release('bld_1');
    expect(mgr.isCaptured('bld_1')).toBe(false);
    expect(mgr.getOwner('bld_1')).toBeNull();
  });

  it('未占领的建筑返回 null', () => {
    const mgr = new NeutralBuildingManager();
    expect(mgr.getOwner('bld_1')).toBeNull();
  });

  it('贸易站每 60 秒产出 100 水晶', () => {
    const mgr = new NeutralBuildingManager();
    const bld = new Building(-1, 'arcane_empire', 10, 10, 500, 'structure', 'production', 'neutral_trade_outpost');
    mgr.capture(bld.id, 0);
    const world = makeWorld(32, 32);
    // 一次性推 60 秒
    const outputs = mgr.update([bld], 60, world);
    expect(outputs).toHaveLength(1);
    expect(outputs[0].playerIndex).toBe(0);
    expect(outputs[0].crystal).toBe(100);
  });

  it('贸易站不足 60 秒不产出', () => {
    const mgr = new NeutralBuildingManager();
    const bld = new Building(-1, 'arcane_empire', 10, 10, 500, 'structure', 'production', 'neutral_trade_outpost');
    mgr.capture(bld.id, 0);
    const world = makeWorld(32, 32);
    const outputs = mgr.update([bld], 30, world);
    expect(outputs).toHaveLength(0);
  });

  it('建筑被摧毁后自动释放占领', () => {
    const mgr = new NeutralBuildingManager();
    const bld = new Building(-1, 'arcane_empire', 10, 10, 500, 'structure', 'production', 'neutral_trade_outpost');
    mgr.capture(bld.id, 0);
    bld.takeDamage(9999, 'physical');
    const world = makeWorld(32, 32);
    mgr.update([bld], 1, world);
    expect(mgr.isCaptured(bld.id)).toBe(false);
  });
});