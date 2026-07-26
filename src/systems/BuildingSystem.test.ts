/**
 * BuildingSystem 单元测试 - 公会专属建筑机制
 *
 * 验证维修站 (bld_repair_depot) 光环：周围 6 格友方机械单位每秒回血。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BuildingSystem } from './BuildingSystem';
import { makeUnit, makeBuilding, makeWorld } from '../__fixtures__/factories';

describe('BuildingSystem - 维修站 (bld_repair_depot)', () => {
  it('周围 6 格内友方机械单位每秒回血 maxHp*3%（下限 2）', () => {
    // 机械单位：armorType='mechanical'，maxHp=400 → 3% = 12/s
    const mech = makeUnit({ owner: 0, tileX: 5, tileY: 5, armorType: 'mechanical', hp: 100 });
    mech.maxHp = 400;
    mech.hp = 100;
    const depot = makeBuilding({ owner: 0, tileX: 8, tileY: 5, spriteKey: 'bld_repair_depot' });
    // 距离 |5-8|+|5-5| = 3 <= 6，在光环内

    BuildingSystem.update([mech], [depot], 1.0); // 1 秒
    // 12/s * 1s = 12 → hp 100 → 112
    expect(mech.hp).toBe(112);
  });

  it('低 maxHp 机械单位回血使用下限 2/s', () => {
    // maxHp=50 → 3% = 1.5 < 2，使用下限 2/s
    const mech = makeUnit({ owner: 0, tileX: 5, tileY: 5, armorType: 'mechanical', hp: 10 });
    mech.maxHp = 50;
    mech.hp = 10;
    const depot = makeBuilding({ owner: 0, tileX: 5, tileY: 6, spriteKey: 'bld_repair_depot' });

    BuildingSystem.update([mech], [depot], 1.0);
    expect(mech.hp).toBe(12); // 10 + 2
  });

  it('非机械单位（infantry/light）不受维修站增益', () => {
    const infantry = makeUnit({ owner: 0, tileX: 5, tileY: 5, armorType: 'light', hp: 50 });
    infantry.maxHp = 100;
    const depot = makeBuilding({ owner: 0, tileX: 5, tileY: 6, spriteKey: 'bld_repair_depot' });

    BuildingSystem.update([infantry], [depot], 1.0);
    expect(infantry.hp).toBe(50); // 不变
  });

  it('超出 6 格半径的机械单位不受增益', () => {
    const mech = makeUnit({ owner: 0, tileX: 5, tileY: 5, armorType: 'mechanical', hp: 100 });
    mech.maxHp = 400;
    const depot = makeBuilding({ owner: 0, tileX: 12, tileY: 5, spriteKey: 'bld_repair_depot' });
    // 距离 |5-12| = 7 > 6

    BuildingSystem.update([mech], [depot], 1.0);
    expect(mech.hp).toBe(100); // 不变
  });

  it('敌方机械单位不受我方维修站增益', () => {
    const enemyMech = makeUnit({ owner: 1, tileX: 5, tileY: 5, armorType: 'mechanical', hp: 50 });
    enemyMech.maxHp = 400;
    const depot = makeBuilding({ owner: 0, tileX: 5, tileY: 6, spriteKey: 'bld_repair_depot' });

    BuildingSystem.update([enemyMech], [depot], 1.0);
    expect(enemyMech.hp).toBe(50); // 不变
  });

  it('回血不超过 maxHp', () => {
    const mech = makeUnit({ owner: 0, tileX: 5, tileY: 5, armorType: 'mechanical', hp: 395 });
    mech.maxHp = 400;
    const depot = makeBuilding({ owner: 0, tileX: 5, tileY: 6, spriteKey: 'bld_repair_depot' });

    BuildingSystem.update([mech], [depot], 1.0); // +12 但 clamp 到 400
    expect(mech.hp).toBe(400);
  });

  it('建造中的维修站（state=constructing）不触发光环', () => {
    const mech = makeUnit({ owner: 0, tileX: 5, tileY: 5, armorType: 'mechanical', hp: 100 });
    mech.maxHp = 400;
    const depot = makeBuilding({ owner: 0, tileX: 5, tileY: 6, spriteKey: 'bld_repair_depot', completed: false });
    // completed=false → state='constructing'

    BuildingSystem.update([mech], [depot], 1.0);
    expect(mech.hp).toBe(100); // 不变
  });

  it('无维修站时不抛错且单位 hp 不变', () => {
    const mech = makeUnit({ owner: 0, tileX: 5, tileY: 5, armorType: 'mechanical', hp: 100 });
    expect(() => BuildingSystem.update([mech], [], 1.0)).not.toThrow();
    expect(mech.hp).toBe(100);
  });

  it('deltaSec 按比例缩放回血（0.5s 回一半）', () => {
    const mech = makeUnit({ owner: 0, tileX: 5, tileY: 5, armorType: 'mechanical', hp: 100 });
    mech.maxHp = 400;
    const depot = makeBuilding({ owner: 0, tileX: 5, tileY: 6, spriteKey: 'bld_repair_depot' });

    BuildingSystem.update([mech], [depot], 0.5); // 0.5 秒 → +6
    expect(mech.hp).toBe(106);
  });
});


describe('BuildingSystem - 传送门 (bld_teleport_gate)', () => {
  beforeEach(() => BuildingSystem.resetForTest());
  afterEach(() => BuildingSystem.resetForTest());

  it('单位进入一端 1 格内 → 瞬移到另一端，扣 20 水晶', () => {
    const world = makeWorld(32, 32, true);
    // player 0 起始 2000 水晶
    const gateA = makeBuilding({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'bld_teleport_gate' });
    const gateB = makeBuilding({ owner: 0, tileX: 20, tileY: 20, spriteKey: 'bld_teleport_gate' });
    const unit = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' }); // 在 gateA 上
    unit.state = 'moving';

    BuildingSystem.update([unit], [gateA, gateB], 0.1, world);
    expect(unit.tileX).toBe(20);
    expect(unit.tileY).toBe(20);
    expect(unit.state).toBe('idle');
    expect(world.players[0].resources.crystal).toBe(2000 - 20);
  });

  it('只有 1 座传送门 → 不触发传送', () => {
    const world = makeWorld(32, 32, true);
    const gateA = makeBuilding({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'bld_teleport_gate' });
    const unit = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });

    BuildingSystem.update([unit], [gateA], 0.1, world);
    expect(unit.tileX).toBe(5);
    expect(unit.tileY).toBe(5);
    expect(world.players[0].resources.crystal).toBe(2000); // 不扣
  });

  it('工兵不参与传送（避免打乱采集）', () => {
    const world = makeWorld(32, 32, true);
    const gateA = makeBuilding({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'bld_teleport_gate' });
    const gateB = makeBuilding({ owner: 0, tileX: 20, tileY: 20, spriteKey: 'bld_teleport_gate' });
    const worker = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_worker' });

    BuildingSystem.update([worker], [gateA, gateB], 0.1, world);
    expect(worker.tileX).toBe(5);
    expect(worker.tileY).toBe(5);
  });

  it('超出 1 格半径的单位不触发传送', () => {
    const world = makeWorld(32, 32, true);
    const gateA = makeBuilding({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'bld_teleport_gate' });
    const gateB = makeBuilding({ owner: 0, tileX: 20, tileY: 20, spriteKey: 'bld_teleport_gate' });
    const unit = makeUnit({ owner: 0, tileX: 7, tileY: 5, spriteKey: 'unit_rifleman' }); // 距 2 >1

    BuildingSystem.update([unit], [gateA, gateB], 0.1, world);
    expect(unit.tileX).toBe(7);
    expect(unit.tileY).toBe(5);
  });

  it('水晶不足时不传送（也不扣水晶）', () => {
    const world = makeWorld(32, 32, true);
    world.players[0].resources.crystal = 10; // 不足 20
    const gateA = makeBuilding({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'bld_teleport_gate' });
    const gateB = makeBuilding({ owner: 0, tileX: 20, tileY: 20, spriteKey: 'bld_teleport_gate' });
    const unit = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });

    BuildingSystem.update([unit], [gateA, gateB], 0.1, world);
    expect(unit.tileX).toBe(5); // 未传送
    expect(world.players[0].resources.crystal).toBe(10); // 未扣
  });

  it('传送后单位进入冷却，冷却内再次进入入口不传送', () => {
    const world = makeWorld(32, 32, true);
    const gateA = makeBuilding({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'bld_teleport_gate' });
    const gateB = makeBuilding({ owner: 0, tileX: 20, tileY: 20, spriteKey: 'bld_teleport_gate' });
    const unit = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });

    // 第一次传送：5,5 → 20,20
    BuildingSystem.update([unit], [gateA, gateB], 0.1, world);
    expect(unit.tileX).toBe(20);
    // 现在单位在 gateB 上，冷却中；再 update 不应立即回传到 gateA
    const crystalBefore = world.players[0].resources.crystal;
    BuildingSystem.update([unit], [gateA, gateB], 0.1, world);
    expect(unit.tileX).toBe(20); // 未回传
    expect(world.players[0].resources.crystal).toBe(crystalBefore); // 未再扣
  });

  it('冷却到期后可再次传送', () => {
    const world = makeWorld(32, 32, true);
    const gateA = makeBuilding({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'bld_teleport_gate' });
    const gateB = makeBuilding({ owner: 0, tileX: 20, tileY: 20, spriteKey: 'bld_teleport_gate' });
    const unit = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });

    BuildingSystem.update([unit], [gateA, gateB], 0.1, world); // → 20,20
    expect(unit.tileX).toBe(20);
    // 推进 3 秒冷却（冷却=3s）— 此次 update 传送门跳过该单位（冷却中），仅推进冷却
    BuildingSystem.update([unit], [gateA, gateB], 3.0, world);
    expect(unit.tileX).toBe(20); // 仍未传送（冷却在此帧结束时才到期）
    // 下一次 update 冷却已到期，触发回传到 gateA（最远端）
    BuildingSystem.update([unit], [gateA, gateB], 0.1, world);
    expect(unit.tileX).toBe(5);
    expect(world.players[0].resources.crystal).toBe(2000 - 40); // 两次传送
  });

  it('敌方传送门不影响我方单位', () => {
    const world = makeWorld(32, 32, true);
    const enemyGateA = makeBuilding({ owner: 1, tileX: 5, tileY: 5, spriteKey: 'bld_teleport_gate' });
    const enemyGateB = makeBuilding({ owner: 1, tileX: 20, tileY: 20, spriteKey: 'bld_teleport_gate' });
    const myUnit = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });

    BuildingSystem.update([myUnit], [enemyGateA, enemyGateB], 0.1, world);
    expect(myUnit.tileX).toBe(5); // 未传送
  });

  it('建造中的传送门不参与配对', () => {
    const world = makeWorld(32, 32, true);
    const gateA = makeBuilding({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'bld_teleport_gate' });
    const gateB = makeBuilding({ owner: 0, tileX: 20, tileY: 20, spriteKey: 'bld_teleport_gate', completed: false });
    const unit = makeUnit({ owner: 0, tileX: 5, tileY: 5, spriteKey: 'unit_rifleman' });

    BuildingSystem.update([unit], [gateA, gateB], 0.1, world);
    expect(unit.tileX).toBe(5); // gateB 建造中，仅 1 座完成，不传送
  });
});
