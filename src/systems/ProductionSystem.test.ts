/**
 * ProductionSystem 单元测试 - 生产队列推进（含机械行会并行训练）
 */
import { describe, it, expect } from 'vitest';
import { ProductionSystem } from './ProductionSystem';
import { Building } from '../entities/Building';
import { makeBuilding, makeWorld, factionForOwner } from '../__fixtures__/factories';
import type { PlayerState } from '../types/entity';

function makePlayerState(index: number, guilds: string[] = [], faction: 'arcane_empire' | 'hammer_federation' = 'arcane_empire'): PlayerState {
  return {
    index, faction, guilds, isAI: false,
    resources: { crystal: 1000, industry: 50, supply: 0, supplyCap: 50, industryCap: 65 },
  };
}

function item(id: string, timeRemaining: number, totalTime = timeRemaining) {
  return { unitDefId: id, timeRemaining, totalTime };
}

describe('ProductionSystem.startProduction', () => {
  it('no-ops when building.canEnqueue() is false (constructing)', () => {
    const b = new Building(0, 'arcane_empire', 1, 1, 800, 'structure', 'production', 'bld_barracks');
    // constructing by default
    ProductionSystem.startProduction(b, 'unit_worker', 10);
    expect(b.productionQueue).toHaveLength(0);
  });

  it('no-ops when queue is full (maxQueueSize reached)', () => {
    const b = makeBuilding();
    for (let i = 0; i < 5; i++) b.productionQueue.push(item('u', 1));
    ProductionSystem.startProduction(b, 'unit_worker', 10);
    expect(b.productionQueue).toHaveLength(5);
  });

  it('applies arcane_empire productionSpeedMult 0.95 to buildTime', () => {
    const b = makeBuilding({ spriteKey: 'bld_barracks' }); // faction arcane_empire
    ProductionSystem.startProduction(b, 'unit_rifleman', 100);
    expect(b.productionQueue[0].timeRemaining).toBeCloseTo(95);
    expect(b.productionQueue[0].totalTime).toBeCloseTo(95);
  });

  it('applies hammer_federation productionSpeedMult 0.85 to buildTime', () => {
    const b = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' }); // faction hammer_federation
    ProductionSystem.startProduction(b, 'unit_rifleman', 100);
    expect(b.productionQueue[0].timeRemaining).toBeCloseTo(85);
  });

  it('sets building state to producing when previously idle', () => {
    const b = makeBuilding();
    ProductionSystem.startProduction(b, 'unit_worker', 10);
    expect(b.state).toBe('producing');
  });

  it('does not overwrite researching state (CC can research + produce)', () => {
    const b = makeBuilding();
    b.state = 'researching';
    ProductionSystem.startProduction(b, 'unit_worker', 10);
    expect(b.state).toBe('researching');
    expect(b.productionQueue).toHaveLength(1);
  });
});

describe('ProductionSystem.updateProduction basics', () => {
  it('skips dead buildings', () => {
    const b = makeBuilding();
    b.productionQueue.push(item('u', 1));
    b.hp = 0;
    const completed = ProductionSystem.updateProduction([b], [makePlayerState(0)], new Map(), 5);
    expect(completed).toEqual([]);
    expect(b.productionQueue).toHaveLength(1);
  });

  it('skips constructing buildings', () => {
    const b = new Building(0, 'arcane_empire', 1, 1, 800, 'structure', 'production', 'bld_barracks');
    b.productionQueue.push(item('u', 1));
    const completed = ProductionSystem.updateProduction([b], [makePlayerState(0)], new Map(), 5);
    expect(completed).toEqual([]);
  });

  it('sets state to idle when queue was empty (producing->idle)', () => {
    const b = makeBuilding();
    b.state = 'producing';
    const completed = ProductionSystem.updateProduction([b], [makePlayerState(0)], new Map(), 1);
    expect(b.state).toBe('idle');
    expect(completed).toEqual([]);
  });

  it('completes an item and returns position = rallyPoint', () => {
    const b = makeBuilding({ tileX: 3, tileY: 4 });
    b.rallyPoint = { x: 9, y: 9 };
    b.productionQueue.push(item('unit_rifleman', 0.01));
    const completed = ProductionSystem.updateProduction([b], [makePlayerState(0)], new Map(), 0.1);
    expect(completed).toHaveLength(1);
    expect(completed[0].buildingId).toBe(b.id);
    expect(completed[0].unitDefId).toBe('unit_rifleman');
    expect(completed[0].position).toEqual({ x: 9, y: 9 });
    expect(b.productionQueue).toHaveLength(0);
    expect(b.state).toBe('idle');
  });

  it('uses {tileX+1, tileY} as position when rallyPoint is null', () => {
    const b = makeBuilding({ tileX: 3, tileY: 4 });
    b.productionQueue.push(item('u', 0.01));
    const completed = ProductionSystem.updateProduction([b], [makePlayerState(0)], new Map(), 0.1);
    expect(completed[0].position).toEqual({ x: 4, y: 4 });
  });

  it('applies hero productionSpeedBonus (1+bonus) as a speed multiplier', () => {
    const b = makeBuilding();
    b.productionSpeedBonus = 0.20;
    b.productionQueue.push(item('u', 10));
    ProductionSystem.updateProduction([b], [makePlayerState(0)], new Map(), 1);
    // progress = 1 * 1.2 = 1.2; 10 - 1.2 = 8.8
    expect(b.productionQueue[0].timeRemaining).toBeCloseTo(8.8, 1);
  });

  it('with deltaSec=0 makes no progress', () => {
    const b = makeBuilding();
    b.productionQueue.push(item('u', 5));
    ProductionSystem.updateProduction([b], [makePlayerState(0)], new Map(), 0);
    expect(b.productionQueue[0].timeRemaining).toBe(5);
  });

  it('empty buildings list returns []', () => {
    expect(ProductionSystem.updateProduction([], [makePlayerState(0)], new Map(), 1)).toEqual([]);
  });
});

describe('ProductionSystem.updateProduction non-mechanist (1 slot)', () => {
  it('advances only 1 queue item per frame', () => {
    const b = makeBuilding();
    b.productionQueue.push(item('a', 1), item('b', 1), item('c', 1));
    ProductionSystem.updateProduction([b], [makePlayerState(0)], new Map(), 1);
    // only index 0 completed (timeRemaining 1 -> 0)
    expect(b.productionQueue.map(p => p.unitDefId)).toEqual(['b', 'c']);
  });
});

describe('ProductionSystem.updateProduction mechanist (3 slots)', () => {
  const mechPlayer = (index = 0) => makePlayerState(index, ['mechanists_guild']);

  it('advances up to 3 parallel items per frame (index 0 no penalty completes first)', () => {
    const b = makeBuilding();
    // index 0 no penalty: 1*1.0=1 -> completes. index 1: 1*0.9=0.9 -> 0.1 left. index 2: 1*0.8=0.8 -> 0.2 left.
    b.productionQueue.push(item('a', 1), item('b', 1), item('c', 1));
    const completed = ProductionSystem.updateProduction([b], [mechPlayer(0)], new Map(), 1);
    expect(completed).toHaveLength(1);
    expect(completed[0].unitDefId).toBe('a');
    expect(b.productionQueue.map(p => p.unitDefId)).toEqual(['b', 'c']);
  });

  it('2nd/3rd queue items incur -10% penalty (slower progress)', () => {
    const b = makeBuilding();
    b.productionQueue.push(item('a', 10), item('b', 10), item('c', 10));
    ProductionSystem.updateProduction([b], [mechPlayer(0)], new Map(), 1);
    expect(b.productionQueue[0].timeRemaining).toBeCloseTo(9); // index 0, no penalty
    expect(b.productionQueue[1].timeRemaining).toBeCloseTo(9.1); // 10 - 1*0.9
    expect(b.productionQueue[2].timeRemaining).toBeCloseTo(9.2); // 10 - 1*0.8
  });

  it('with tech:production_line_optimized uses -5% penalty', () => {
    const b = makeBuilding();
    b.productionQueue.push(item('a', 10), item('b', 10), item('c', 10));
    const techTrees = new Map<number, { isResearched(id: string): boolean }>([[0, { isResearched: (id) => id === 'tech:production_line_optimized' }]]);
    ProductionSystem.updateProduction([b], [mechPlayer(0)], techTrees, 1);
    expect(b.productionQueue[1].timeRemaining).toBeCloseTo(9.05); // 10 - 1*0.95
    expect(b.productionQueue[2].timeRemaining).toBeCloseTo(9.10); // 10 - 1*0.90
  });

  it('only advances min(slots, queueLen) items', () => {
    const b = makeBuilding();
    b.productionQueue.push(item('a', 0.01));
    ProductionSystem.updateProduction([b], [mechPlayer(0)], new Map(), 0.1);
    expect(b.productionQueue).toHaveLength(0); // 1 item completed
  });

  it('parallel does not apply to non-parallel buildings (command center)', () => {
    const b = makeBuilding({ spriteKey: 'bld_cc_empire' });
    b.productionQueue.push(item('a', 1), item('b', 1), item('c', 1));
    ProductionSystem.updateProduction([b], [mechPlayer(0)], new Map(), 1);
    expect(b.productionQueue.map(p => p.unitDefId)).toEqual(['b', 'c']); // only 1 slot
  });

  it('completes multiple items in one frame and removes them in reverse index order', () => {
    const b = makeBuilding();
    b.productionQueue.push(item('a', 0.01), item('b', 0.01), item('c', 0.01));
    const completed = ProductionSystem.updateProduction([b], [mechPlayer(0)], new Map(), 0.1);
    expect(completed).toHaveLength(3);
    expect(b.productionQueue).toHaveLength(0);
  });

  it('penalty compounds with hero speedBonus multiplicatively', () => {
    const b = makeBuilding();
    b.productionSpeedBonus = 0.20;
    b.productionQueue.push(item('a', 10), item('b', 10), item('c', 10));
    ProductionSystem.updateProduction([b], [mechPlayer(0)], new Map(), 1);
    // index 1: progress = 1*1.2*(1-0.10) = 1.08; 10-1.08 = 8.92
    expect(b.productionQueue[1].timeRemaining).toBeCloseTo(8.92, 1);
  });

  it('completing last item flips state producing->idle', () => {
    const b = makeBuilding();
    b.productionQueue.push(item('a', 0.01));
    ProductionSystem.updateProduction([b], [mechPlayer(0)], new Map(), 0.1);
    expect(b.state).toBe('idle');
  });

  it('handles a queue where middle item completes first (reverse-sort splice)', () => {
    const b = makeBuilding();
    b.productionQueue.push(item('a', 10), item('b', 0.01), item('c', 10));
    ProductionSystem.updateProduction([b], [mechPlayer(0)], new Map(), 0.1);
    expect(b.productionQueue.map(p => p.unitDefId)).toEqual(['a', 'c']);
  });
});

describe('ProductionSystem.updateProduction handles undefined owner gracefully', () => {
  it('building.owner with no player entry falls back to non-mechanist (1 slot)', () => {
    const b = makeBuilding();
    b.owner = 5; // no such player
    b.productionQueue.push(item('a', 1), item('b', 1), item('c', 1));
    ProductionSystem.updateProduction([b], [makePlayerState(0)], new Map(), 1);
    expect(b.productionQueue.map(p => p.unitDefId)).toEqual(['b', 'c']); // only 1 advanced
  });
});
