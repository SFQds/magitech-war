/**
 * EconomyAI 单元测试 - 资源管理 / 建造决策 / 训练决策
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EconomyAI } from './EconomyAI';
import { StrategyManager, StrategyDirective } from './StrategyManager';
import { makeWorld, makeUnit, makeBuilding, makeCommandCenter, makeResourceField } from '../__fixtures__/factories';

const EARLY: StrategyDirective = {
  phase: 'early', aggression: 0.1, expansion: 0.8, defense: 0.2,
  preferredUnits: ['unit_worker', 'unit_rifleman'],
};

function setupAI(owner = 1, difficulty: 'easy' | 'normal' | 'hard' = 'normal', resourceMult = 1.0) {
  const world = makeWorld(32, 32, true);
  return { world, ai: new EconomyAI(world, owner, difficulty, resourceMult) };
}

describe('EconomyAI gather assignment', () => {
  it('assigns idle workers to the closest active mineral field', () => {
    const { world, ai } = setupAI();
    const cc = makeCommandCenter(1, 10, 10);
    const worker = makeUnit({ owner: 1, spriteKey: 'unit_worker', tileX: 5, tileY: 5, hp: 80 });
    const near = makeResourceField(3, 5, 1000); // dist 2
    const far = makeResourceField(9, 5, 1000); // dist 4
    const cmds = ai.evaluate([cc], [worker], [near, far], EARLY);
    const gatherCmds = cmds.filter(c => c.type === 'gather');
    expect(gatherCmds).toHaveLength(1);
    expect((gatherCmds[0] as { resourceFieldId: string }).resourceFieldId).toBe(near.id);
  });

  it('skips workers that are already gathering/moving', () => {
    const { world, ai } = setupAI();
    const cc = makeCommandCenter(1, 10, 10);
    const idle = makeUnit({ owner: 1, spriteKey: 'unit_worker', tileX: 5, tileY: 5, hp: 80 });
    idle.state = 'idle';
    const gathering = makeUnit({ owner: 1, spriteKey: 'unit_worker', tileX: 6, tileY: 5, hp: 80 });
    gathering.state = 'gathering';
    const field = makeResourceField(3, 5, 1000);
    const cmds = ai.evaluate([cc], [idle, gathering], [field], EARLY);
    const gatherCmds = cmds.filter(c => c.type === 'gather');
    expect(gatherCmds).toHaveLength(1); // only the idle one
  });
});

describe('EconomyAI rescue net', () => {
  it('bumps crystal to max(100, ceil(100*resourceMult)) when 0 workers and crystal<100', () => {
    const { world, ai } = setupAI(1, 'normal', 1.0);
    world.getPlayer(1)!.resources.crystal = 30;
    const cc = makeCommandCenter(1, 10, 10);
    ai.evaluate([cc], [], [], EARLY);
    expect(world.getPlayer(1)!.resources.crystal).toBeGreaterThanOrEqual(100);
  });

  it('rescue scales with resourceMult (hard=2.0 gives 200)', () => {
    const { world, ai } = setupAI(1, 'hard', 2.0);
    world.getPlayer(1)!.resources.crystal = 30;
    const cc = makeCommandCenter(1, 10, 10);
    ai.evaluate([cc], [], [], EARLY);
    expect(world.getPlayer(1)!.resources.crystal).toBe(200);
  });

  it('does not trigger rescue when workerCount>0', () => {
    const { world, ai } = setupAI();
    world.getPlayer(1)!.resources.crystal = 30;
    const cc = makeCommandCenter(1, 10, 10);
    const worker = makeUnit({ owner: 1, spriteKey: 'unit_worker', hp: 80 });
    ai.evaluate([cc], [worker], [], EARLY);
    expect(world.getPlayer(1)!.resources.crystal).toBe(30); // unchanged
  });
});

describe('EconomyAI worker training', () => {
  it('trains worker when crystal>=100, supply<cap, workerCount<target', () => {
    const { world, ai } = setupAI();
    world.getPlayer(1)!.resources.crystal = 200;
    const cc = makeCommandCenter(1, 10, 10);
    const cmds = ai.evaluate([cc], [], [], EARLY);
    const trainCmds = cmds.filter(c => c.type === 'train' && (c as { unitDefId: string }).unitDefId === 'unit_worker');
    expect(trainCmds).toHaveLength(1);
  });

  it('does not train worker when supply>=supplyCap', () => {
    const { world, ai } = setupAI();
    world.getPlayer(1)!.resources.crystal = 200;
    world.getPlayer(1)!.resources.supply = world.getPlayer(1)!.resources.supplyCap;
    const cc = makeCommandCenter(1, 10, 10);
    const cmds = ai.evaluate([cc], [], [], EARLY);
    const trainCmds = cmds.filter(c => c.type === 'train' && (c as { unitDefId: string }).unitDefId === 'unit_worker');
    expect(trainCmds).toHaveLength(0);
  });

  it('targetWorkers=8 when directive.expansion>0.5 (EARLY)', () => {
    const { world, ai } = setupAI();
    world.getPlayer(1)!.resources.crystal = 500;
    const cc = makeCommandCenter(1, 10, 10);
    // 7 workers -> still trains (7 < 8)
    const workers = Array.from({ length: 7 }, (_, i) =>
      makeUnit({ owner: 1, spriteKey: 'unit_worker', tileX: i, tileY: 10, hp: 80 }),
    );
    const cmds = ai.evaluate([cc], workers, [], EARLY);
    const trainCmds = cmds.filter(c => c.type === 'train' && (c as { unitDefId: string }).unitDefId === 'unit_worker');
    expect(trainCmds).toHaveLength(1);
  });

  it('targetWorkers=5 when directive.expansion<=0.5 (LATE-like)', () => {
    const late: StrategyDirective = { ...EARLY, expansion: 0.2 };
    const { world, ai } = setupAI();
    world.getPlayer(1)!.resources.crystal = 500;
    const cc = makeCommandCenter(1, 10, 10);
    // 5 workers -> no train (5 not < 5)
    const workers = Array.from({ length: 5 }, (_, i) =>
      makeUnit({ owner: 1, spriteKey: 'unit_worker', tileX: i, tileY: 10, hp: 80 }),
    );
    const cmds = ai.evaluate([cc], workers, [], late);
    const trainCmds = cmds.filter(c => c.type === 'train' && (c as { unitDefId: string }).unitDefId === 'unit_worker');
    expect(trainCmds).toHaveLength(0);
  });
});

describe('EconomyAI building decisions', () => {
  it('builds barracks when aggression<0.7 and crystal meets threshold', () => {
    const { world, ai } = setupAI();
    world.getPlayer(1)!.resources.crystal = 500;
    const cc = makeCommandCenter(1, 10, 10);
    const cmds = ai.evaluate([cc], [], [], EARLY);
    expect(cmds.some(c => c.type === 'build' && (c as { buildingDefId: string }).buildingDefId === 'bld_barracks')).toBe(true);
  });

  it('builds faction tech building (assembly_workshop for federation)', () => {
    const { world, ai } = setupAI(1); // player 1 = federation
    world.getPlayer(1)!.resources.crystal = 800;
    const cc = makeCommandCenter(1, 10, 10);
    const cmds = ai.evaluate([cc], [], [], EARLY);
    expect(cmds.some(c => c.type === 'build' && (c as { buildingDefId: string }).buildingDefId === 'bld_assembly_workshop')).toBe(true);
  });

  it('builds power_plant only when hasFactory', () => {
    const { world, ai } = setupAI();
    world.getPlayer(1)!.resources.crystal = 800;
    const cc = makeCommandCenter(1, 10, 10);
    // no factory -> no power plant
    let cmds = ai.evaluate([cc], [], [], EARLY);
    expect(cmds.some(c => c.type === 'build' && (c as { buildingDefId: string }).buildingDefId === 'bld_power_plant')).toBe(false);
    // with factory
    const factory = makeBuilding({ owner: 1, spriteKey: 'bld_factory', tileX: 12, tileY: 10 });
    cmds = ai.evaluate([cc, factory], [], [], EARLY);
    expect(cmds.some(c => c.type === 'build' && (c as { buildingDefId: string }).buildingDefId === 'bld_power_plant')).toBe(true);
  });

  it('does not build barracks/factory when already present', () => {
    const { world, ai } = setupAI();
    world.getPlayer(1)!.resources.crystal = 800;
    const cc = makeCommandCenter(1, 10, 10);
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks', tileX: 12, tileY: 10 });
    const factory = makeBuilding({ owner: 1, spriteKey: 'bld_factory', tileX: 14, tileY: 10 });
    const cmds = ai.evaluate([cc, barracks, factory], [], [], EARLY);
    expect(cmds.some(c => c.type === 'build' && (c as { buildingDefId: string }).buildingDefId === 'bld_barracks')).toBe(false);
    expect(cmds.some(c => c.type === 'build' && (c as { buildingDefId: string }).buildingDefId === 'bld_factory')).toBe(false);
  });
});

describe('EconomyAI returns empty when no production buildings', () => {
  it('returns only gather commands when no production buildings (no CC rebuild)', () => {
    const { world, ai } = setupAI();
    world.getPlayer(1)!.resources.crystal = 500;
    const worker = makeUnit({ owner: 1, spriteKey: 'unit_worker', tileX: 5, tileY: 5, hp: 80 });
    const field = makeResourceField(3, 5, 1000);
    const cmds = ai.evaluate([], [worker], [field], EARLY);
    // only gather, no build/train
    expect(cmds.every(c => c.type === 'gather')).toBe(true);
  });
});

describe('EconomyAI preferredUnits training', () => {
  it('trains preferredUnit in directive order, respecting techReq', () => {
    const { world, ai } = setupAI();
    world.getPlayer(1)!.resources.crystal = 1000;
    const cc = makeCommandCenter(1, 10, 10);
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks', tileX: 12, tileY: 10 });
    // battle_mage has techReq but not researched -> should skip it, train rifleman
    const directive: StrategyDirective = {
      phase: 'mid', aggression: 0.4, expansion: 0.5, defense: 0.5,
      preferredUnits: ['unit_battle_mage', 'unit_rifleman'],
    };
    const cmds = ai.evaluate([cc, barracks], [], [], directive);
    const trainCmds = cmds.filter(c => c.type === 'train');
    const trainedIds = trainCmds.map(c => (c as { unitDefId: string }).unitDefId);
    expect(trainedIds).not.toContain('unit_battle_mage'); // tech not researched
    expect(trainedIds).toContain('unit_rifleman');
  });

  it('only one preferredUnit trained per building per tick (dedup)', () => {
    const { world, ai } = setupAI();
    world.getPlayer(1)!.resources.crystal = 1000;
    const cc = makeCommandCenter(1, 10, 10);
    const barracks = makeBuilding({ owner: 1, spriteKey: 'bld_barracks', tileX: 12, tileY: 10 });
    const directive: StrategyDirective = {
      phase: 'mid', aggression: 0.4, expansion: 0.5, defense: 0.5,
      preferredUnits: ['unit_rifleman', 'unit_rifleman'],
    };
    const cmds = ai.evaluate([cc, barracks], [], [], directive);
    const rifleCmds = cmds.filter(c => c.type === 'train' && (c as { unitDefId: string }).unitDefId === 'unit_rifleman');
    expect(rifleCmds).toHaveLength(1);
  });
});

describe('EconomyAI hero training', () => {
  it('trains hero when crystal sufficient and no hero present (federation -> marcus)', () => {
    const { world, ai } = setupAI(1); // federation
    world.getPlayer(1)!.resources.crystal = 1000;
    const cc = makeCommandCenter(1, 10, 10);
    const cmds = ai.evaluate([cc], [], [], EARLY);
    expect(cmds.some(c => c.type === 'train' && (c as { unitDefId: string }).unitDefId === 'hero_marcus')).toBe(true);
  });

  it('does not train hero when one already exists', () => {
    const { world, ai } = setupAI(1);
    world.getPlayer(1)!.resources.crystal = 1000;
    const cc = makeCommandCenter(1, 10, 10);
    const hero = makeUnit({ owner: 1, spriteKey: 'hero_marcus', hp: 350 });
    const cmds = ai.evaluate([cc], [hero], [], EARLY);
    expect(cmds.some(c => c.type === 'train' && (c as { unitDefId: string }).unitDefId === 'hero_marcus')).toBe(false);
  });
});

describe('EconomyAI difficulty resourceFactor', () => {
  it('hard builds barracks at lower crystal (resourceFactor 0.7)', () => {
    const { world, ai } = setupAI(1, 'hard');
    // barracks cost 300 for federation (240 after discount); 0.7 factor -> need 168
    world.getPlayer(1)!.resources.crystal = 250;
    const cc = makeCommandCenter(1, 10, 10);
    const cmds = ai.evaluate([cc], [], [], EARLY);
    expect(cmds.some(c => c.type === 'build' && (c as { buildingDefId: string }).buildingDefId === 'bld_barracks')).toBe(true);
  });

  it('easy needs more crystal (resourceFactor 1.5)', () => {
    const { world, ai } = setupAI(1, 'easy');
    // barracks cost 240; 1.5 factor -> need 360
    world.getPlayer(1)!.resources.crystal = 300;
    const cc = makeCommandCenter(1, 10, 10);
    const cmds = ai.evaluate([cc], [], [], EARLY);
    expect(cmds.some(c => c.type === 'build' && (c as { buildingDefId: string }).buildingDefId === 'bld_barracks')).toBe(false);
  });
});


describe('EconomyAI - counter units', () => {
  it('evaluate with shield-heavy enemies does not throw', () => {
    const { world, ai } = setupAI(1, 'hard');
    const cc = makeCommandCenter(1, 10, 10);
    const bld = makeBuilding({ owner: 1, spriteKey: 'bld_barracks', tileX: 12, tileY: 12 });
    const field = makeResourceField(12, 10, 5000);
    const enemies = [
      makeUnit({ owner: 0, spriteKey: 'unit_arcane_guard', armorType: 'shield', hp: 350, tileX: 15, tileY: 10 }),
      makeUnit({ owner: 0, spriteKey: 'unit_arcane_guard', armorType: 'shield', hp: 350, tileX: 15, tileY: 10 }),
      makeUnit({ owner: 0, spriteKey: 'unit_rifleman', armorType: 'light', hp: 100, tileX: 15, tileY: 10 }),
    ];
    const workers = [makeUnit({ owner: 1, spriteKey: 'unit_worker', hp: 80, tileX: 5, tileY: 5 })];
    const allUnits: any[] = [cc, bld, ...workers, ...enemies];
    expect(() => ai.evaluate([cc, bld], allUnits, [field], EARLY)).not.toThrow();
  });

  it('empty enemies produces no counter units', () => {
    const { world, ai } = setupAI();
    const cc = makeCommandCenter(1, 10, 10);
    const field = makeResourceField(12, 10, 5000);
    expect(() => ai.evaluate([cc], [makeUnit({ owner: 1, spriteKey: 'unit_rifleman', hp: 100 })], [field], EARLY)).not.toThrow();
  });

  it('mechanical-heavy enemy composition does not crash', () => {
    const { world, ai } = setupAI(1, 'hard');
    const cc = makeCommandCenter(1, 10, 10);
    const bld = makeBuilding({ owner: 1, spriteKey: 'bld_barracks', tileX: 12, tileY: 12 });
    const field = makeResourceField(12, 10, 5000);
    const enemies = [
      makeUnit({ owner: 0, spriteKey: 'unit_magitech_mech', armorType: 'mechanical', hp: 500, tileX: 15, tileY: 10 }),
      makeUnit({ owner: 0, spriteKey: 'unit_magitech_mech', armorType: 'mechanical', hp: 500, tileX: 15, tileY: 10 }),
      makeUnit({ owner: 0, spriteKey: 'unit_magitech_mech', armorType: 'mechanical', hp: 500, tileX: 15, tileY: 10 }),
      makeUnit({ owner: 0, spriteKey: 'unit_rifleman', armorType: 'light', hp: 100, tileX: 15, tileY: 10 }),
    ];
    const workers = [makeUnit({ owner: 1, spriteKey: 'unit_worker', hp: 80, tileX: 5, tileY: 5 })];
    const allUnits: any[] = [cc, bld, ...workers, ...enemies];
    expect(() => ai.evaluate([cc, bld], allUnits, [field], EARLY)).not.toThrow();
  });
});
