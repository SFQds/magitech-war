/**
 * 数据完整性测试 - UNIT_DEFS / BUILDING_DEFS / TECH_DEFS / FACTION_DEFS / HERO_DEFS
 *
 * 验证静态配置的：必填字段、数值范围、交叉引用、科技树无环
 */
import { describe, it, expect } from 'vitest';
import { UNIT_DEFS, BUILDING_DEFS, TECH_DEFS, FACTION_DEFS } from './unitData';
import { HERO_DEFS } from './heroData';

const VALID_FACTIONS = new Set(Object.keys(FACTION_DEFS));
const VALID_GUILDS = new Set(['mages_guild', 'mechanists_guild', 'alchemists_society', 'void_institute']);
const ALL_UNIT_OR_HERO_KEYS = new Set([...Object.keys(UNIT_DEFS), ...Object.keys(HERO_DEFS)]);

describe('UNIT_DEFS integrity', () => {
  const entries = Object.entries(UNIT_DEFS);

  it('every unit def has required top-level fields', () => {
    for (const [id, def] of entries) {
      expect(def.displayName, `${id}.displayName`).toBeTruthy();
      expect(def.cost, `${id}.cost`).toBeDefined();
      expect(def.stats, `${id}.stats`).toBeDefined();
      expect(def.attackEffect, `${id}.attackEffect`).toBeTruthy();
    }
  });

  it('every unit cost has non-negative crystal/supply and positive time', () => {
    for (const [id, def] of entries) {
      expect(def.cost.crystal, `${id}.cost.crystal`).toBeGreaterThanOrEqual(0);
      expect(def.cost.supply, `${id}.cost.supply`).toBeGreaterThanOrEqual(0);
      expect(def.cost.time, `${id}.cost.time`).toBeGreaterThan(0);
      if (def.cost.industry !== undefined) {
        expect(def.cost.industry, `${id}.cost.industry`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('every unit stats has sane ranges (hp>0, speed>0, sight>0, damage>=0, range>=0)', () => {
    for (const [id, def] of entries) {
      const s = def.stats;
      expect(s.hp, `${id}.stats.hp`).toBeGreaterThan(0);
      expect(s.speed, `${id}.stats.speed`).toBeGreaterThan(0);
      expect(s.sight, `${id}.stats.sight`).toBeGreaterThan(0);
      expect(s.damage, `${id}.stats.damage`).toBeGreaterThanOrEqual(0);
      expect(s.range, `${id}.stats.range`).toBeGreaterThanOrEqual(0);
      expect(s.cooldown, `${id}.stats.cooldown`).toBeGreaterThanOrEqual(0);
    }
  });

  it('every unit tier is L1|L2|L3 when present', () => {
    for (const [id, def] of entries) {
      if (def.tier) {
        expect(['L1', 'L2', 'L3'], `${id}.tier`).toContain(def.tier);
      }
    }
  });

  it('every unit techReq entry references a valid TECH_DEFS key', () => {
    for (const [id, def] of entries) {
      if (def.techReq) {
        for (const tid of def.techReq) {
          expect(TECH_DEFS[tid], `${id}.techReq -> ${tid}`).toBeDefined();
        }
      }
    }
  });

  it('every unit exclusiveTo.faction references a valid FACTION_DEFS key', () => {
    for (const [id, def] of entries) {
      if (def.exclusiveTo?.faction) {
        expect(VALID_FACTIONS.has(def.exclusiveTo.faction), `${id}.exclusiveTo.faction`).toBe(true);
      }
    }
  });

  it('every unit favoredBy entry is a valid faction id or guild id', () => {
    const allowed = new Set([...VALID_FACTIONS, ...VALID_GUILDS]);
    for (const [id, def] of entries) {
      if (def.favoredBy) {
        for (const f of def.favoredBy) {
          expect(allowed.has(f), `${id}.favoredBy -> ${f}`).toBe(true);
        }
      }
    }
  });

  it('every L3-exclusive unit is producible by at least one building', () => {
    const allProduces = new Set<string>();
    for (const bld of Object.values(BUILDING_DEFS)) {
      for (const p of bld.produces) allProduces.add(p);
    }
    for (const [id, def] of entries) {
      if (def.tier === 'L3' && def.exclusiveTo) {
        expect(allProduces.has(id), `L3 unit ${id} not producible by any building`).toBe(true);
      }
    }
  });
});

describe('BUILDING_DEFS integrity', () => {
  const entries = Object.entries(BUILDING_DEFS);

  it('every building def has displayName, cost, hp>0, provides, produces', () => {
    for (const [id, def] of entries) {
      expect(def.displayName, `${id}.displayName`).toBeTruthy();
      expect(def.cost, `${id}.cost`).toBeDefined();
      expect(def.hp, `${id}.hp`).toBeGreaterThan(0);
      expect(def.provides, `${id}.provides`).toBeDefined();
      expect(def.produces, `${id}.produces`).toBeDefined();
      expect(def.provides.supply, `${id}.provides.supply`).toBeGreaterThanOrEqual(0);
      expect(def.provides.industry, `${id}.provides.industry`).toBeGreaterThanOrEqual(0);
    }
  });

  it('every building produces entry references a valid UNIT_DEFS or HERO_DEFS key', () => {
    for (const [id, def] of entries) {
      for (const p of def.produces) {
        expect(ALL_UNIT_OR_HERO_KEYS.has(p), `${id}.produces -> ${p}`).toBe(true);
      }
    }
  });

  it('every building researches entry references a valid TECH_DEFS key', () => {
    for (const [id, def] of entries) {
      if (def.researches) {
        for (const tid of def.researches) {
          expect(TECH_DEFS[tid], `${id}.researches -> ${tid}`).toBeDefined();
        }
      }
    }
  });
});

describe('TECH_DEFS integrity', () => {
  const entries = Object.entries(TECH_DEFS);

  it('every tech def has name, crystal>=0, time>0, desc', () => {
    for (const [id, def] of entries) {
      expect(def.name, `${id}.name`).toBeTruthy();
      expect(def.crystal, `${id}.crystal`).toBeGreaterThanOrEqual(0);
      expect(def.time, `${id}.time`).toBeGreaterThan(0);
      expect(def.desc, `${id}.desc`).toBeDefined();
    }
  });

  it('every tech prerequisite references a valid TECH_DEFS key', () => {
    for (const [id, def] of entries) {
      if (def.prerequisites) {
        for (const pre of def.prerequisites) {
          expect(TECH_DEFS[pre], `${id}.prerequisites -> ${pre}`).toBeDefined();
        }
      }
    }
  });

  it('tech tree has no cycles (DFS)', () => {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const hasCycle = (id: string): boolean => {
      if (visited.has(id)) return false;
      if (visiting.has(id)) return true; // back edge = cycle
      visiting.add(id);
      const def = TECH_DEFS[id];
      if (def?.prerequisites) {
        for (const pre of def.prerequisites) {
          if (hasCycle(pre)) return true;
        }
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    };
    for (const id of Object.keys(TECH_DEFS)) {
      expect(hasCycle(id), `cycle through ${id}`).toBe(false);
    }
  });

  it('at least one root tech has no prerequisites', () => {
    const roots = entries.filter(([, def]) => !def.prerequisites || def.prerequisites.length === 0);
    expect(roots.length).toBeGreaterThan(0);
  });

  it('no tech lists itself as a prerequisite', () => {
    for (const [id, def] of entries) {
      if (def.prerequisites) {
        expect(def.prerequisites, `${id} self-references`).not.toContain(id);
      }
    }
  });
});

describe('FACTION_DEFS integrity', () => {
  const entries = Object.entries(FACTION_DEFS);

  it('every faction def has valid fields', () => {
    for (const [id, def] of entries) {
      expect(def.startingCrystal, `${id}.startingCrystal`).toBeGreaterThanOrEqual(0);
      expect(def.startingIndustry, `${id}.startingIndustry`).toBeGreaterThanOrEqual(0);
      expect(def.bonuses, `${id}.bonuses`).toBeDefined();
    }
  });

  it('every startingUnits entry references a valid unit def with count > 0', () => {
    for (const [id, def] of entries) {
      for (const [unitId, count] of def.startingUnits) {
        expect(ALL_UNIT_OR_HERO_KEYS.has(unitId), `${id}.startingUnits -> ${unitId}`).toBe(true);
        expect(count, `${id}.startingUnits ${unitId} count`).toBeGreaterThan(0);
      }
    }
  });
});

describe('HERO_DEFS integrity', () => {
  const entries = Object.entries(HERO_DEFS);

  it('every hero def has displayName, title, faction, stats, skillTree(5), reviveCooldown>0, cost', () => {
    for (const [id, def] of entries) {
      expect(def.displayName, `${id}.displayName`).toBeTruthy();
      expect(def.title, `${id}.title`).toBeTruthy();
      expect(VALID_FACTIONS.has(def.faction), `${id}.faction`).toBe(true);
      expect(def.stats, `${id}.stats`).toBeDefined();
      expect(def.skillTree, `${id}.skillTree`).toHaveLength(5);
      expect(def.reviveCooldown, `${id}.reviveCooldown`).toBeGreaterThan(0);
      expect(def.cost.crystal, `${id}.cost.crystal`).toBeGreaterThanOrEqual(0);
      expect(def.cost.supply, `${id}.cost.supply`).toBeGreaterThan(0);
      expect(def.cost.time, `${id}.cost.time`).toBeGreaterThan(0);
    }
  });

  it('every hero skill has name, cooldown>=0, description', () => {
    for (const [id, def] of entries) {
      for (let i = 0; i < def.skillTree.length; i++) {
        const sk = def.skillTree[i];
        expect(sk.name, `${id}.skillTree[${i}].name`).toBeTruthy();
        expect(sk.cooldown, `${id}.skillTree[${i}].cooldown`).toBeGreaterThanOrEqual(0);
        expect(sk.description, `${id}.skillTree[${i}].description`).toBeDefined();
      }
    }
  });

  it('hero_isabelle is produced by bld_cc_empire, hero_marcus by bld_cc_federation', () => {
    expect(BUILDING_DEFS['bld_cc_empire'].produces).toContain('hero_isabelle');
    expect(BUILDING_DEFS['bld_cc_federation'].produces).toContain('hero_marcus');
  });
});
