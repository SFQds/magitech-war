/**
 * ResourceSystem 单元测试 — 锁定采集/精炼厂/工业值审计修复点
 *
 * 覆盖：
 *  - 基础采集量（GATHER_BASE_AMOUNT=10）
 *  - 无精炼厂时上限 3，且退还多余到矿场不产生负数（P0-A1 修复）
 *  - 精炼厂距离加成：15 格内满速，>15 格降速（P2-质疑6 修复）
 *  - 矿枯竭时 currentGatherers 递减，工人复位 idle（P0-A3 修复）
 *  - 水晶上限 MAX_CRYSTAL 钳制
 *  - 科技采集倍率（gMultP0/P1）
 *  - 工业 cap：建造中建筑不计入供给/工业
 *  - 工业值超 cap 时按 10%/秒衰减（P2-质疑17 修复）
 *  - 工业值低于 cap 时按 regenRate 回升（P1-6/P1-7 修复）
 *  - 工业值下限保护（P1-9 修复）
 */
import { describe, it, expect } from 'vitest';
import { ResourceSystem } from './ResourceSystem';
import { Unit } from '../entities/Unit';
import { ResourceField } from '../entities/ResourceField';
import { Building } from '../entities/Building';
import type { PlayerState } from '../types/entity';
import {
  MAX_CRYSTAL,
  GATHER_BASE_AMOUNT,
  GATHER_NO_REFINERY_CAP,
  GATHER_TICK_INTERVAL,
  INDUSTRY_REGEN_BASE,
  INDUSTRY_REGEN_PER_OUTPUT,
} from '../config/balance';

/** 造工人 */
function makeWorker(owner = 0, tileX = 5, tileY = 0): Unit {
  const w = new Unit(
    owner, 'arcane_empire', tileX, tileY,
    80, 'light', 'infantry', 2, 5, 'physical', 3, 1, 5, 'unit_worker',
  );
  w.state = 'gathering';
  return w;
}

/** 把工人绑定到矿点（targetResourceId 必须用 field 的真实 id，否则查表失败） */
function bindToField(worker: Unit, field: ResourceField, gatherers = 1): void {
  worker.targetResourceId = field.id;
  field.currentGatherers = gatherers;
}

/** 造精炼厂（owner 阵营） */
function makeRefinery(owner = 0, tileX = 0, tileY = 0): Building {
  const b = new Building(owner, 'arcane_empire', tileX, tileY, 800, 'structure', 'resource', 'bld_refinery', 0, 0);
  b.complete();
  return b;
}

/** 造玩家状态 */
function makePlayer(index = 0, crystal = 0): PlayerState {
  return {
    index,
    faction: 'arcane_empire',
    guilds: [],
    resources: { crystal, industry: 0, supply: 0, supplyCap: 0, industryCap: 0 },
    isAI: false,
  };
}

describe('ResourceSystem.gather — 基础采集', () => {
  it('正常采集返回 GATHER_BASE_AMOUNT，矿场储量相应减少', () => {
    const field = new ResourceField(5, 0, 'crystal', 1000);
    const got = ResourceSystem.gather(makeWorker(), field);
    expect(got).toBe(GATHER_BASE_AMOUNT);
    expect(field.amount).toBe(1000 - GATHER_BASE_AMOUNT);
  });

  it('储量不足时只采剩余量', () => {
    const field = new ResourceField(5, 0, 'crystal', 4);
    const got = ResourceSystem.gather(makeWorker(), field);
    expect(got).toBe(4);
    expect(field.isDepleted).toBe(true);
  });

  it('枯竭矿场采集返回 0', () => {
    const field = new ResourceField(5, 0, 'crystal', 0);
    expect(ResourceSystem.gather(makeWorker(), field)).toBe(0);
  });
});

describe('ResourceSystem.updateGathering — 精炼厂距离加成（P2-质疑6）', () => {
  it('精炼厂在 15 格内 → 满速采集 GATHER_BASE_AMOUNT', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0); // 距 (5,0) = 5 格 ≤15
    const player = makePlayer(0);

    const events = ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [refinery], 1.0, 1.0,
    );
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(GATHER_BASE_AMOUNT);
    expect(player.resources.crystal).toBe(GATHER_BASE_AMOUNT);
  });

  it('精炼厂超过 15 格 → 降速到 GATHER_NO_REFINERY_CAP', () => {
    const worker = makeWorker(0, 20, 0);
    const field = new ResourceField(20, 0, 'crystal', 1000);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0); // 距 (20,0) = 20 格 >15
    const player = makePlayer(0);

    const events = ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [refinery], 1.0, 1.0,
    );
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(GATHER_NO_REFINERY_CAP);
  });

  it('无精炼厂 → 降速到 GATHER_NO_REFINERY_CAP，且退还多余不产生负数（P0-A1）', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(worker, field);
    const player = makePlayer(0);

    const events = ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [], 1.0, 1.0,
    );
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(GATHER_NO_REFINERY_CAP);
    // 退还 10-3=7 到矿场，储量应 = 1000 - 3（净采 3），而非 1000-10+7=997
    // field.gather 已扣 10，再回填 7 → 净扣 3
    expect(field.amount).toBe(1000 - GATHER_NO_REFINERY_CAP);
    expect(field.amount).toBeGreaterThanOrEqual(0);
  });

  it('异方精炼厂不计入加成', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(worker, field);
    const enemyRefinery = makeRefinery(1, 0, 0); // owner=1
    const player = makePlayer(0);

    const events = ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [enemyRefinery], 1.0, 1.0,
    );
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(GATHER_NO_REFINERY_CAP);
  });
});

describe('ResourceSystem.updateGathering — 矿枯竭复位（P0-A3）', () => {
  it('矿枯竭时工人复位 idle 且清空 targetResourceId', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 3); // 只够一次 3 采集（无精炼厂）
    bindToField(worker, field);
    const player = makePlayer(0);

    ResourceSystem.updateGathering([worker], [field], [player], GATHER_TICK_INTERVAL, [], 1.0, 1.0);
    expect(worker.state).toBe('idle');
    expect(worker.targetResourceId).toBeNull();
  });

  it('矿已耗尽（amount=0）的工人复位 idle 并递减 currentGatherers', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 0); // 已枯竭
    bindToField(worker, field, 2);
    const player = makePlayer(0);

    ResourceSystem.updateGathering([worker], [field], [player], GATHER_TICK_INTERVAL, [], 1.0, 1.0);
    expect(worker.state).toBe('idle');
    expect(worker.targetResourceId).toBeNull();
    expect(field.currentGatherers).toBe(1);
  });
});

describe('ResourceSystem.updateGathering — 水晶上限与科技倍率', () => {
  it('采集受 MAX_CRYSTAL 钳制', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0);
    const player = makePlayer(0, MAX_CRYSTAL - 1); // 差 1 满仓

    ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [refinery], 1.0, 1.0,
    );
    expect(player.resources.crystal).toBe(MAX_CRYSTAL);
  });

  it('科技倍率 gMultP0=2 时采集翻倍', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0);
    const player = makePlayer(0);

    const events = ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [refinery], 2.0, 1.0,
    );
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(GATHER_BASE_AMOUNT * 2);
  });
});

describe('ResourceSystem.updateResources — 补给/工业 cap 计算', () => {
  it('建造中建筑不计入供给/工业', () => {
    const player = makePlayer(0);
    const bld = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    // 默认 state='constructing'
    ResourceSystem.updateResources([player], [], [bld], 0);
    expect(player.resources.supplyCap).toBe(0);
    expect(player.resources.industryCap).toBe(0);
  });

  it('完工建筑计入供给/工业', () => {
    const player = makePlayer(0);
    const bld = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    bld.complete();
    ResourceSystem.updateResources([player], [], [bld], 0);
    expect(player.resources.supplyCap).toBe(20);
    expect(player.resources.industryCap).toBe(10);
  });

  it('异方建筑不计入本玩家', () => {
    const player = makePlayer(0);
    const bld = new Building(1, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    bld.complete();
    ResourceSystem.updateResources([player], [], [bld], 0);
    expect(player.resources.supplyCap).toBe(0);
  });
});

describe('ResourceSystem.updateResources — 工业值再生与衰减', () => {
  it('工业值低于 cap 时按 regenRate 回升（P1-6/P1-7）', () => {
    const player = makePlayer(0);
    player.resources.industry = 0;
    const bld = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    bld.complete();
    const ds = 1.0;
    ResourceSystem.updateResources([player], [], [bld], ds);
    const expectedRate = INDUSTRY_REGEN_BASE + 10 * INDUSTRY_REGEN_PER_OUTPUT;
    expect(player.resources.industry).toBeCloseTo(Math.min(10, expectedRate * ds), 5);
    expect(player.resources.industry).toBeLessThanOrEqual(10);
  });

  it('工业值超 cap 时按 10%/秒衰减回 cap（P2-质疑17）', () => {
    const player = makePlayer(0);
    player.resources.industry = 50;
    const bld = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    bld.complete();
    const ds = 1.0;
    ResourceSystem.updateResources([player], [], [bld], ds);
    // 1 秒后 50 * (1 - 0.1) = 45，仍 > cap(10)，故衰减到 45
    expect(player.resources.industry).toBeCloseTo(45, 5);
  });

  it('工业值不会降到负数（P1-9 下限保护）', () => {
    const player = makePlayer(0);
    player.resources.industry = 0.0001;
    const bld = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 0);
    bld.complete();
    ResourceSystem.updateResources([player], [], [bld], 1.0);
    expect(player.resources.industry).toBeGreaterThanOrEqual(0);
  });
});
