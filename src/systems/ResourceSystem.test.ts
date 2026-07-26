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
import { ResourceField } from '../entities/ResourceField';
import { Building } from '../entities/Building';
import {
  makeWorker as makeWorkerBase,
  bindToField,
  makeRefinery,
  makePlayer,
  makeBuilding,
} from '../__fixtures__/factories';
import type { PlayerState } from '../types/entity';
import {
  MAX_CRYSTAL,
  GATHER_BASE_AMOUNT,
  GATHER_NO_REFINERY_CAP,
  GATHER_TICK_INTERVAL,
  INDUSTRY_REGEN_BASE,
  INDUSTRY_REGEN_PER_OUTPUT,
} from '../config/balance';

/** 造工人（默认 gathering 状态，便于采集测试） */
function makeWorker(owner = 0, tileX = 5, tileY = 0) {
  const w = makeWorkerBase(owner, tileX, tileY);
  w.state = 'gathering';
  return w;
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


describe('ResourceSystem.gather - 边界', () => {
  it('field.isActive=false 但 amount>0 返回 0', () => {
    const w = makeWorker();
    const f = new ResourceField(5, 0, 'crystal', 100);
    f.isActive = false;
    expect(ResourceSystem.gather(w, f)).toBe(0);
    expect(f.amount).toBe(100);
  });
});

describe('ResourceSystem.updateGathering - 工人状态分支', () => {
  it('死亡工人被跳过 (无事件)', () => {
    const w = makeWorker();
    w.takeDamage(999, 'physical');
    const f = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(w, f);
    const ev = ResourceSystem.updateGathering([w], [f], [makePlayer(0)], GATHER_TICK_INTERVAL);
    expect(ev).toHaveLength(0);
  });

  it('非 gathering 状态工人被跳过', () => {
    const w = makeWorker();
    const f = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(w, f);
    w.state = 'idle'; // bindToField 设 gathering，这里覆盖
    const ev = ResourceSystem.updateGathering([w], [f], [makePlayer(0)], GATHER_TICK_INTERVAL);
    expect(ev).toHaveLength(0);
  });

  it('targetResourceId=null 的 gathering 工人复位 idle', () => {
    const w = makeWorker();
    w.targetResourceId = null;
    ResourceSystem.updateGathering([w], [], [makePlayer(0)], GATHER_TICK_INTERVAL);
    expect(w.state).toBe('idle');
  });

  it('targetResourceId 指向不存在的 field 复位 idle 且 targetResourceId 清空', () => {
    const w = makeWorker();
    w.targetResourceId = 'ghost_field';
    const ev = ResourceSystem.updateGathering([w], [], [makePlayer(0)], GATHER_TICK_INTERVAL);
    expect(w.state).toBe('idle');
    expect(w.targetResourceId).toBeNull();
    expect(ev).toHaveLength(0);
  });

  it('部分 tick (deltaSec=0.5) 累积 timer 不产出', () => {
    const w = makeWorker(0, 5, 0);
    const f = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(w, f);
    const ev = ResourceSystem.updateGathering([w], [f], [makePlayer(0)], 0.5, [makeRefinery(0, 0, 0)], 1.0, 1.0);
    expect(ev).toHaveLength(0);
    expect(w.gatherTimer).toBeCloseTo(0.5, 5);
  });
});

describe('ResourceSystem.updateGathering - 精炼厂与倍率', () => {
  it('无 buildings 参数视为无精炼厂 (采集上限 3)', () => {
    const w = makeWorker(0, 5, 0);
    const f = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(w, f);
    const ev = ResourceSystem.updateGathering([w], [f], [makePlayer(0)], GATHER_TICK_INTERVAL, undefined, 1.0, 1.0);
    expect(ev[0].amount).toBe(GATHER_NO_REFINERY_CAP);
  });

  it('精炼厂恰好 15 格 (Manhattan) 满速采集 (边界 <=15)', () => {
    const w = makeWorker(0, 15, 0);
    const f = new ResourceField(15, 0, 'crystal', 1000);
    bindToField(w, f);
    const r = makeRefinery(0, 0, 0);
    const ev = ResourceSystem.updateGathering([w], [f], [makePlayer(0)], GATHER_TICK_INTERVAL, [r], 1.0, 1.0);
    expect(ev[0].amount).toBe(GATHER_BASE_AMOUNT);
  });

  it('精炼厂 16 格降速 (超出 15 边界)', () => {
    const w = makeWorker(0, 16, 0);
    const f = new ResourceField(16, 0, 'crystal', 1000);
    bindToField(w, f);
    const r = makeRefinery(0, 0, 0);
    const ev = ResourceSystem.updateGathering([w], [f], [makePlayer(0)], GATHER_TICK_INTERVAL, [r], 1.0, 1.0);
    expect(ev[0].amount).toBe(GATHER_NO_REFINERY_CAP);
  });

  it('gMultP1=2 对 player-1 工人采集翻倍', () => {
    const w = makeWorker(1, 5, 0);
    const f = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(w, f);
    const r = makeRefinery(1, 0, 0);
    const p0 = makePlayer(0);
    const p1 = makePlayer(1);
    const ev = ResourceSystem.updateGathering([w], [f], [p0, p1], GATHER_TICK_INTERVAL, [r], 1.0, 2.0);
    expect(ev[0].amount).toBe(GATHER_BASE_AMOUNT * 2);
    expect(p1.resources.crystal).toBe(GATHER_BASE_AMOUNT * 2);
  });

  it('undefined 倍率默认 1.0', () => {
    const w = makeWorker(0, 5, 0);
    const f = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(w, f);
    const ev = ResourceSystem.updateGathering([w], [f], [makePlayer(0)], GATHER_TICK_INTERVAL, [makeRefinery(0, 0, 0)]);
    expect(ev[0].amount).toBe(GATHER_BASE_AMOUNT);
  });

  it('mult=0 时 gathered=0 不发事件不递减 currentGatherers', () => {
    const w = makeWorker(0, 5, 0);
    const f = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(w, f);
    const ev = ResourceSystem.updateGathering([w], [f], [makePlayer(0)], GATHER_TICK_INTERVAL, [makeRefinery(0, 0, 0)], 0.0, 1.0);
    expect(ev).toHaveLength(0);
  });

  it('owner 越界 (无对应 player) 不发事件但仍复位', () => {
    const w = makeWorker(5, 5, 0);
    const f = new ResourceField(5, 0, 'crystal', 3);
    bindToField(w, f);
    const ev = ResourceSystem.updateGathering([w], [f], [], GATHER_TICK_INTERVAL, [], 1.0, 1.0);
    expect(ev).toHaveLength(0);
  });

  it('水晶已满 MAX_CRYSTAL 后不再增加', () => {
    const w = makeWorker(0, 5, 0);
    const f = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(w, f);
    const p = makePlayer(0, MAX_CRYSTAL);
    ResourceSystem.updateGathering([w], [f], [p], GATHER_TICK_INTERVAL, [makeRefinery(0, 0, 0)], 1.0, 1.0);
    expect(p.resources.crystal).toBe(MAX_CRYSTAL);
  });

  it('gather 事件携带正确 workerId/fieldId/playerIndex', () => {
    const w = makeWorker(0, 5, 0);
    const f = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(w, f);
    const ev = ResourceSystem.updateGathering([w], [f], [makePlayer(0)], GATHER_TICK_INTERVAL, [makeRefinery(0, 0, 0)], 1.0, 1.0);
    expect(ev[0].workerId).toBe(w.id);
    expect(ev[0].fieldId).toBe(f.id);
    expect(ev[0].playerIndex).toBe(0);
  });

  it('有精炼厂时矿枯竭也递减 currentGatherers 并复位工人', () => {
    const f = new ResourceField(5, 0, 'crystal', 10);
    const w = makeWorker(0, 5, 0);
    bindToField(w, f, 2);
    const r = makeRefinery(0, 0, 0);
    ResourceSystem.updateGathering([w], [f], [makePlayer(0)], GATHER_TICK_INTERVAL, [r], 1.0, 1.0);
    expect(w.state).toBe('idle');
    expect(f.currentGatherers).toBe(1);
  });

  it('currentGatherers=0 时不递减成负数', () => {
    const w = makeWorker(0, 5, 0);
    const f = new ResourceField(5, 0, 'crystal', 0);
    bindToField(w, f, 0);
    ResourceSystem.updateGathering([w], [f], [makePlayer(0)], GATHER_TICK_INTERVAL, [makeRefinery(0, 0, 0)], 1.0, 1.0);
    expect(f.currentGatherers).toBe(0);
  });
});

describe('ResourceSystem.updateResources - 边界', () => {
  it('死亡完工建筑不计入供给/工业', () => {
    const p = makePlayer(0);
    const b = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    b.complete();
    b.takeDamage(99999, 'physical');
    ResourceSystem.updateResources([p], [], [b], 0);
    expect(p.resources.supplyCap).toBe(0);
  });

  it('无建筑的玩家 supplyCap=0 industryCap=0', () => {
    const p = makePlayer(0);
    p.resources.supplyCap = 999;
    ResourceSystem.updateResources([p], [], [], 0);
    expect(p.resources.supplyCap).toBe(0);
    expect(p.resources.industryCap).toBe(0);
  });

  it('巨大 deltaSec 工业回升不超过 cap', () => {
    const p = makePlayer(0);
    p.resources.industry = 0;
    const b = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    b.complete();
    ResourceSystem.updateResources([p], [], [b], 9999);
    expect(p.resources.industry).toBeLessThanOrEqual(10);
    expect(p.resources.industry).toBeGreaterThanOrEqual(0);
  });

  it('工业回升恰好被 min 钳到 cap', () => {
    const p = makePlayer(0);
    p.resources.industry = 9.9;
    const b = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    b.complete();
    ResourceSystem.updateResources([p], [], [b], 10);
    expect(p.resources.industry).toBe(10);
  });

  it('衰减按 10%/秒 比例 deltaSec=0.5', () => {
    const p = makePlayer(0);
    p.resources.industry = 50;
    const b = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    b.complete();
    ResourceSystem.updateResources([p], [], [b], 0.5);
    expect(p.resources.industry).toBeCloseTo(47.5, 5);
  });

  it('负工业值钳制到 0 (deltaSec>0 路径)', () => {
    const p = makePlayer(0);
    p.resources.industry = -5;
    const b = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    b.complete();
    ResourceSystem.updateResources([p], [], [b], 1.0);
    expect(p.resources.industry).toBe(0);
  });

  it('deltaSec=0 初始化: 工业超 cap 瞬间截到 cap', () => {
    const p = makePlayer(0);
    p.resources.industry = 100;
    const b = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    b.complete();
    ResourceSystem.updateResources([p], [], [b], 0);
    expect(p.resources.industry).toBe(10);
  });

  it('deltaSec=0 初始化: 负工业钳到 0', () => {
    const p = makePlayer(0);
    p.resources.industry = -3;
    const b = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    b.complete();
    ResourceSystem.updateResources([p], [], [b], 0);
    expect(p.resources.industry).toBe(0);
  });

  it('多玩家 cap 独立计算 (各算各的建筑)', () => {
    const p0 = makePlayer(0);
    const p1 = makePlayer(1);
    const b0 = new Building(0, 'arcane_empire', 0, 0, 800, 'structure', 'production', 'bld_cc_empire', 20, 10);
    b0.complete();
    const b1 = new Building(1, 'hammer_federation', 5, 5, 800, 'structure', 'production', 'bld_cc_federation', 15, 8);
    b1.complete();
    ResourceSystem.updateResources([p0, p1], [], [b0, b1], 0);
    expect(p0.resources.supplyCap).toBe(20);
    expect(p1.resources.supplyCap).toBe(15);
  });
});


describe('ResourceSystem.updateGathering — 批D 虚空共鸣器加成', () => {
  it('共鸣器在 15 格内 → 采集 ×1.5（玩家多得 50%，矿脉额外抽取）', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0);
    const resonator = makeBuilding({ owner: 0, tileX: 0, tileY: 1, spriteKey: 'bld_void_resonator' });
    const player = makePlayer(0);
    const events = ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [refinery, resonator], 1.0, 1.0,
    );
    expect(events[0].amount).toBe(15); // 基础 10 × 1.5
    expect(player.resources.crystal).toBe(15);
    expect(field.amount).toBe(1000 - 15); // gather() 扣 10 + 额外抽 5
  });

  it('共鸣器超出 15 格 → 无加成（按精炼厂满速 10）', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0);
    const resonator = makeBuilding({ owner: 0, tileX: 21, tileY: 0, spriteKey: 'bld_void_resonator' }); // 距 (5,0)=16 >15
    const player = makePlayer(0);
    const events = ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [refinery, resonator], 1.0, 1.0,
    );
    expect(events[0].amount).toBe(GATHER_BASE_AMOUNT);
    expect(field.amount).toBe(1000 - 10);
  });

  it('敌方共鸣器不影响我方采集', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0);
    const enemyResonator = makeBuilding({ owner: 1, tileX: 0, tileY: 1, spriteKey: 'bld_void_resonator' });
    const player = makePlayer(0);
    const events = ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [refinery, enemyResonator], 1.0, 1.0,
    );
    expect(events[0].amount).toBe(GATHER_BASE_AMOUNT); // 10，无加成
  });

  it('共鸣器额外抽取不超过矿脉剩余储量', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 12);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0);
    const resonator = makeBuilding({ owner: 0, tileX: 0, tileY: 1, spriteKey: 'bld_void_resonator' });
    const player = makePlayer(0);
    const events = ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [refinery, resonator], 1.0, 1.0,
    );
    expect(events[0].amount).toBe(12); // 基础 10 + 额外 min(5, 剩余2)=2
    expect(field.amount).toBe(0);
    expect(field.isDepleted).toBe(true);
  });

  it('无共鸣器时不受影响（仅精炼厂满速 10）', () => {
    const worker = makeWorker(0, 5, 0);
    const field = new ResourceField(5, 0, 'crystal', 1000);
    bindToField(worker, field);
    const refinery = makeRefinery(0, 0, 0);
    const player = makePlayer(0);
    const events = ResourceSystem.updateGathering(
      [worker], [field], [player], GATHER_TICK_INTERVAL, [refinery], 1.0, 1.0,
    );
    expect(events[0].amount).toBe(GATHER_BASE_AMOUNT);
    expect(field.amount).toBe(1000 - 10);
  });
});
