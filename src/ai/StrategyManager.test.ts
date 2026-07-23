/**
 * StrategyManager 单元测试 - 策略阶段判定 + 指令输出
 */
import { describe, it, expect } from 'vitest';
import { StrategyManager } from './StrategyManager';
import { makeWorld, makeUnit, makeBuilding } from '../__fixtures__/factories';

function setup(difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
  const world = makeWorld(32, 32, true);
  const sm = new StrategyManager(world, 1, difficulty); // player 1 = hammer_federation
  return { world, sm };
}

function makeRiflemen(owner: number, count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeUnit({ owner, spriteKey: 'unit_rifleman', tileX: i, tileY: 0, hp: 100 }),
  );
}

describe('StrategyManager initial phase', () => {
  it('initial phase is early before first evaluate', () => {
    const { sm } = setup();
    const d = sm.evaluate(0, [], [], []);
    expect(d.phase).toBe('early');
  });

  it('DEFAULT_DIRECTIVE is early with worker in preferredUnits', () => {
    expect(StrategyManager.DEFAULT_DIRECTIVE.phase).toBe('early');
    expect(StrategyManager.DEFAULT_DIRECTIVE.preferredUnits).toContain('unit_worker');
  });
});

describe('StrategyManager phase transitions (normal difficulty)', () => {
  it('early directive: aggression 0.1, expansion 0.8, defense 0.2', () => {
    const { sm } = setup();
    const d = sm.evaluate(0, [], [], []);
    expect(d.aggression).toBeCloseTo(0.1);
    expect(d.expansion).toBeCloseTo(0.8);
    expect(d.defense).toBeCloseTo(0.2);
    expect(d.preferredUnits).toContain('unit_worker');
    expect(d.preferredUnits).toContain('unit_rifleman');
  });

  it('transitions early->mid when combatCount>=6 and hasBarracks', () => {
    const { sm } = setup('normal');
    const units = makeRiflemen(1, 6);
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' });
    const d = sm.evaluate(0, units, [barracks], []);
    expect(d.phase).toBe('mid');
  });

  it('does NOT transition to mid with 6 combat but no production', () => {
    const { sm } = setup('normal');
    const units = makeRiflemen(1, 6);
    const d = sm.evaluate(0, units, [], []);
    expect(d.phase).toBe('early');
  });

  it('transitions mid->late when combatCount>=12', () => {
    const { sm } = setup('normal');
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' });
    // first reach mid
    sm.evaluate(0, makeRiflemen(1, 6), [barracks], []);
    // then reach late
    const d = sm.evaluate(0, makeRiflemen(1, 12), [barracks], []);
    expect(d.phase).toBe('late');
  });

  it('downgrades late->mid when combatCount<3', () => {
    const { sm } = setup('normal');
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' });
    sm.evaluate(0, makeRiflemen(1, 12), [barracks], []); // late
    const d = sm.evaluate(0, makeRiflemen(1, 2), [barracks], []);
    expect(d.phase).toBe('mid');
  });

  it('downgrades mid->early when production buildings lost', () => {
    const { sm } = setup('normal');
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' });
    sm.evaluate(0, makeRiflemen(1, 6), [barracks], []); // mid
    const d = sm.evaluate(0, makeRiflemen(1, 6), [], []); // no barracks
    expect(d.phase).toBe('early');
  });

  it('fallthrough keeps current phase when no upgrade/downgrade condition met', () => {
    const { sm } = setup('normal');
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' });
    sm.evaluate(0, makeRiflemen(1, 6), [barracks], []); // mid
    // 5 combat: <6 (no upgrade), >=3 (no downgrade from mid requires !hasProduction)
    const d = sm.evaluate(0, makeRiflemen(1, 5), [barracks], []);
    expect(d.phase).toBe('mid');
  });
});

describe('StrategyManager difficulty diffMult', () => {
  it('hard transitions to mid at combatCount>=4 (round(6*0.6)=4)', () => {
    const { sm } = setup('hard');
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' });
    const d = sm.evaluate(0, makeRiflemen(1, 4), [barracks], []);
    expect(d.phase).toBe('mid');
  });

  it('hard transitions to late at combatCount>=8 (round(12*0.6)=8)', () => {
    const { sm } = setup('hard');
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' });
    sm.evaluate(0, makeRiflemen(1, 4), [barracks], []); // mid
    const d = sm.evaluate(0, makeRiflemen(1, 8), [barracks], []);
    expect(d.phase).toBe('late');
  });

  it('easy requires combatCount>=9 for mid (round(6*1.5)=9)', () => {
    const { sm } = setup('easy');
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' });
    const d8 = sm.evaluate(0, makeRiflemen(1, 8), [barracks], []);
    expect(d8.phase).toBe('early');
    const d9 = sm.evaluate(0, makeRiflemen(1, 9), [barracks], []);
    expect(d9.phase).toBe('mid');
  });
});

describe('StrategyManager difficulty offsets', () => {
  it('hard early: aggression +0.15, expansion -0.1, defense +0.05', () => {
    const { sm } = setup('hard');
    const d = sm.evaluate(0, [], [], []);
    expect(d.aggression).toBeCloseTo(0.25); // 0.1+0.15
    expect(d.expansion).toBeCloseTo(0.7); // 0.8-0.1
    expect(d.defense).toBeCloseTo(0.25); // 0.2+0.05
  });

  it('easy early: aggression -0.1 (clamped to 0), expansion +0.15', () => {
    const { sm } = setup('easy');
    const d = sm.evaluate(0, [], [], []);
    expect(d.aggression).toBe(0); // 0.1-0.1=0 clamped
    expect(d.expansion).toBeCloseTo(0.95); // 0.8+0.15
  });

  it('hard late: aggression 0.9+0.15 clamped to 1.0', () => {
    const { sm } = setup('hard');
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' });
    sm.evaluate(0, makeRiflemen(1, 4), [barracks], []); // mid
    const d = sm.evaluate(0, makeRiflemen(1, 8), [barracks], []); // late
    expect(d.aggression).toBeLessThanOrEqual(1.0);
  });
});

describe('StrategyManager faction-aware preferredUnits', () => {
  it('hammer_federation late includes unit_hammer_squad and unit_magitech_mech', () => {
    const { sm } = setup('normal'); // player 1 = federation
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' });
    const factory = makeBuilding({ owner: 1, spriteKey: 'bld_factory' });
    sm.evaluate(0, makeRiflemen(1, 6), [barracks], []); // mid
    const d = sm.evaluate(0, makeRiflemen(1, 12), [barracks, factory], []);
    expect(d.preferredUnits).toContain('unit_hammer_squad');
    expect(d.preferredUnits).toContain('unit_magitech_mech');
  });

  it('arcane_empire late includes unit_arcane_guard', () => {
    const world = makeWorld(32, 32, true);
    const sm = new StrategyManager(world, 0, 'normal'); // player 0 = empire
    const barracks = makeBuilding({ owner: 0, spriteKey: 'bld_barracks' });
    sm.evaluate(0, makeRiflemen(0, 6), [barracks], []); // mid
    const d = sm.evaluate(0, makeRiflemen(0, 12), [barracks], []);
    expect(d.preferredUnits).toContain('unit_arcane_guard');
  });
});

describe('StrategyManager elapsed accumulation', () => {
  it('elapsed accumulates across evaluate calls', () => {
    const { sm } = setup('normal');
    // no production, elapsed > 90 -> early (time fallback)
    sm.evaluate(50, [], [], []);
    const d = sm.evaluate(50, [], [], []); // total 100 > 90
    expect(d.phase).toBe('early');
  });

  it('time fallback: elapsed>180 with production but low combat -> mid', () => {
    const { sm } = setup('normal');
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks' });
    sm.evaluate(100, makeRiflemen(1, 2), [barracks], []); // elapsed 100
    const d = sm.evaluate(100, makeRiflemen(1, 2), [barracks], []); // total 200 > 180, combat 2 < 6
    expect(d.phase).toBe('mid');
  });
});
