/**
 * GameWorld 单元测试 - 玩家初始化 / 资源 / 经济操作
 */
import { describe, it, expect } from 'vitest';
import { GameWorld } from './GameWorld';
import { makeWorld } from '../__fixtures__/factories';
import { MAX_CRYSTAL } from '../config/balance';

describe('GameWorld constructor', () => {
  it('builds a GameMap with the given dimensions and default tileSize 32', () => {
    const w = makeWorld(8, 6);
    expect(w.map.config.width).toBe(8);
    expect(w.map.config.height).toBe(6);
    expect(w.map.config.tileSize).toBe(32);
    expect(w.map.config.name).toBe('Default');
  });

  it('accepts a custom tileSize', () => {
    const w = new GameWorld(4, 4, 16);
    expect(w.map.config.tileSize).toBe(16);
  });

  it('a new world has no players and empty techTrees', () => {
    const w = makeWorld();
    expect(w.players).toEqual([]);
    expect(w.techTrees.size).toBe(0);
    expect(w.arcaneChargeTimers.size).toBe(0);
  });
});

describe('GameWorld addPlayer', () => {
  it('returns sequential indices 0,1,2...', () => {
    const w = makeWorld();
    expect(w.addPlayer('arcane_empire', [], false)).toBe(0);
    expect(w.addPlayer('hammer_federation', [], true)).toBe(1);
    expect(w.addPlayer('arcane_empire', [])).toBe(2);
  });

  it('initializes crystal/industry from FACTION_DEFS', () => {
    const w = makeWorld();
    w.addPlayer('arcane_empire', []);
    const p = w.getPlayer(0)!;
    expect(p.resources.crystal).toBe(2000);
    expect(p.resources.industry).toBe(65);
    expect(p.resources.industryCap).toBe(65);
  });

  it('sets supplyCap from the CC building def (50) and supply 0', () => {
    const w = makeWorld();
    w.addPlayer('arcane_empire', []);
    const p = w.getPlayer(0)!;
    expect(p.resources.supplyCap).toBe(50);
    expect(p.resources.supply).toBe(0);
  });

  it('stores faction, guilds, and isAI flag', () => {
    const w = makeWorld();
    w.addPlayer('arcane_empire', [], false); // index 0
    w.addPlayer('hammer_federation', ['mechanists_guild'], true); // index 1
    const p = w.getPlayer(1)!;
    expect(p.faction).toBe('hammer_federation');
    expect(p.guilds).toEqual(['mechanists_guild']);
    expect(p.isAI).toBe(true);
  });

  it('creates a TechTreeSystem for the player index', () => {
    const w = makeWorld();
    w.addPlayer('arcane_empire', []);
    expect(w.techTrees.has(0)).toBe(true);
  });

  it('for an unknown faction falls back to crystal 2000, industry 50', () => {
    const w = makeWorld();
    w.addPlayer('frostridge_kingdom' as never, []);
    const p = w.getPlayer(0)!;
    expect(p.resources.crystal).toBe(2000);
    expect(p.resources.industry).toBe(50);
    expect(p.resources.industryCap).toBe(50);
  });

  it('makeWorld(addPlayers=true) sets up 2 players: human arcane + AI federation', () => {
    const w = makeWorld(16, 16, true);
    expect(w.players).toHaveLength(2);
    expect(w.players[0].faction).toBe('arcane_empire');
    expect(w.players[0].isAI).toBe(false);
    expect(w.players[1].faction).toBe('hammer_federation');
    expect(w.players[1].isAI).toBe(true);
  });

  it('getPlayer returns undefined for a missing index', () => {
    const w = makeWorld();
    expect(w.getPlayer(99)).toBeUndefined();
  });
});

describe('GameWorld canAfford', () => {
  const setup = () => {
    const w = makeWorld();
    w.addPlayer('arcane_empire', []);
    return w;
  };

  it('returns false for a missing player', () => {
    expect(setup().canAfford(99, { crystal: 1 })).toBe(false);
  });

  it('returns true when player has enough of all cost fields', () => {
    const w = setup();
    expect(w.canAfford(0, { crystal: 1000, industry: 50, supply: 10 })).toBe(true);
  });

  it('returns false when crystal insufficient', () => {
    expect(setup().canAfford(0, { crystal: 2001 })).toBe(false);
  });

  it('returns false when industry insufficient', () => {
    expect(setup().canAfford(0, { industry: 66 })).toBe(false);
  });

  it('treats supply as headroom: supplyCap - supply >= cost.supply', () => {
    const w = setup();
    expect(w.canAfford(0, { supply: 50 })).toBe(true);
    expect(w.canAfford(0, { supply: 51 })).toBe(false);
    w.spend(0, { supply: 40 });
    expect(w.canAfford(0, { supply: 11 })).toBe(false); // only 10 headroom
  });

  it('ignores undefined cost fields', () => {
    const w = setup();
    expect(w.canAfford(0, {})).toBe(true);
    expect(w.canAfford(0, { crystal: 0 })).toBe(true);
  });
});

describe('GameWorld spend', () => {
  it('subtracts crystal and industry, flooring at 0', () => {
    const w = makeWorld();
    w.addPlayer('arcane_empire', []);
    w.spend(0, { crystal: 500, industry: 20 });
    const p = w.getPlayer(0)!;
    expect(p.resources.crystal).toBe(1500);
    expect(p.resources.industry).toBe(45);
    w.spend(0, { crystal: 99999 });
    expect(p.resources.crystal).toBe(0);
  });

  it('adds to supply (occupancy), not subtracts', () => {
    const w = makeWorld();
    w.addPlayer('arcane_empire', []);
    w.spend(0, { supply: 10 });
    expect(w.getPlayer(0)!.resources.supply).toBe(10);
    w.spend(0, { supply: 5 });
    expect(w.getPlayer(0)!.resources.supply).toBe(15);
  });

  it('is a no-op for a missing player', () => {
    const w = makeWorld();
    expect(() => w.spend(99, { crystal: 100 })).not.toThrow();
  });
});

describe('GameWorld refund', () => {
  it('adds crystal capped at MAX_CRYSTAL (20000)', () => {
    const w = makeWorld();
    w.addPlayer('arcane_empire', []);
    // bring to near cap then overflow
    w.getPlayer(0)!.resources.crystal = MAX_CRYSTAL - 1;
    w.refund(0, { crystal: 100 });
    expect(w.getPlayer(0)!.resources.crystal).toBe(MAX_CRYSTAL);
    w.getPlayer(0)!.resources.crystal = 0;
    w.refund(0, { crystal: 30000 });
    expect(w.getPlayer(0)!.resources.crystal).toBe(MAX_CRYSTAL);
  });

  it('adds industry capped at industryCap', () => {
    const w = makeWorld();
    w.addPlayer('arcane_empire', []);
    const p = w.getPlayer(0)!;
    p.resources.industry = 65; // at cap
    w.refund(0, { industry: 10 });
    expect(p.resources.industry).toBe(65);
    p.resources.industry = 10;
    w.refund(0, { industry: 20 });
    expect(p.resources.industry).toBe(30);
  });

  it('decreases supply (releases occupancy), floored at 0', () => {
    const w = makeWorld();
    w.addPlayer('arcane_empire', []);
    w.spend(0, { supply: 20 });
    w.refund(0, { supply: 5 });
    expect(w.getPlayer(0)!.resources.supply).toBe(15);
    w.refund(0, { supply: 100 });
    expect(w.getPlayer(0)!.resources.supply).toBe(0);
  });

  it('is a no-op for a missing player', () => {
    const w = makeWorld();
    expect(() => w.refund(99, { crystal: 100 })).not.toThrow();
  });

  it('round-trips: spend then refund restores industry within cap', () => {
    const w = makeWorld();
    w.addPlayer('arcane_empire', []);
    const p = w.getPlayer(0)!;
    const before = p.resources.industry; // 65
    w.spend(0, { industry: 65 });
    expect(p.resources.industry).toBe(0);
    w.refund(0, { industry: 65 });
    expect(p.resources.industry).toBe(before);
  });
});
