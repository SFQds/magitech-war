/**
 * ResearchSystem 单元测试 — 研究推进与完成回溯应用
 *
 * 覆盖：
 *  - 未到完成进度：researchProgress 推进但不 completeTech
 *  - 完成时：completeTech、清空 researchingTechId、state 回 idle
 *  - 完成步兵护甲科技：回溯应用到现有步兵（armor = baseArmor + 5）
 *  - 完成建筑加固科技：回溯应用到现有建筑（maxHp×1.2）
 *  - 非研究中建筑不受影响
 *  - TechSystem 缓存在完成后刷新
 */
import { describe, it, expect } from 'vitest';
import { ResearchSystem } from './ResearchSystem';
import { TechSystem } from './TechSystem';
import { GameWorld } from '../core/GameWorld';
import { EntityRegistry } from '../core/EntityRegistry';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';

function setup() {
  const world = new GameWorld(16, 16);
  world.addPlayer('arcane_empire', [], false);
  const entities = new EntityRegistry();
  const tech = new TechSystem(world);
  tech.initAll();
  const research = new ResearchSystem(world, entities, tech);
  return { world, entities, tech, research };
}

function makeResearchingBuilding(owner = 0, techId = 'tech:infantry_armor', totalTime = 10): Building {
  const b = new Building(owner, 'arcane_empire', 1, 1, 800, 'structure', 'tech', 'bld_ancient_archive', 0, 0);
  b.complete();
  b.state = 'researching';
  b.researchingTechId = techId;
  b.researchProgress = 0;
  b.researchTotalTime = totalTime;
  return b;
}

function makeInfantry(owner = 0): Unit {
  const u = new Unit(owner, 'arcane_empire', 5, 5, 100, 'light', 'infantry', 2, 10, 'physical', 3, 1, 5, 'unit_rifleman');
  u.baseArmor = 2;
  u.armor = 2;
  return u;
}

describe('ResearchSystem.update — 推进进度', () => {
  it('未到完成：researchProgress 推进但不 completeTech', () => {
    const { entities, research, tech } = setup();
    const b = makeResearchingBuilding(0, 'tech:infantry_armor', 10);
    entities.addBuilding(b);
    research.update(5); // 5/10 = 0.5
    expect(b.researchProgress).toBeCloseTo(0.5, 5);
    expect(b.researchingTechId).toBe('tech:infantry_armor');
    expect(b.state).toBe('researching');
    expect(tech.getTree(0).isResearched('tech:infantry_armor')).toBe(false);
  });

  it('非研究中建筑不受影响', () => {
    const { entities, research } = setup();
    const b = makeResearchingBuilding();
    b.state = 'idle';
    b.researchingTechId = null;
    entities.addBuilding(b);
    research.update(100);
    expect(b.researchProgress).toBe(0);
  });

  it('死亡建筑不推进研究', () => {
    const { entities, research } = setup();
    const b = makeResearchingBuilding();
    b.takeDamage(9999, 'physical'); // 杀死
    entities.addBuilding(b);
    research.update(100);
    expect(b.researchProgress).toBe(0);
  });
});

describe('ResearchSystem.update — 完成回溯应用', () => {
  it('完成时 completeTech + 清空研究状态 + state 回 idle', () => {
    const { entities, research, tech } = setup();
    const b = makeResearchingBuilding(0, 'tech:infantry_armor', 10);
    entities.addBuilding(b);
    research.update(10); // 完成
    expect(tech.getTree(0).isResearched('tech:infantry_armor')).toBe(true);
    expect(b.researchingTechId).toBeNull();
    expect(b.researchProgress).toBe(0);
    expect(b.state).toBe('idle');
  });

  it('完成步兵护甲科技：回溯应用到现有步兵（armor = baseArmor + 5）', () => {
    const { entities, research } = setup();
    const b = makeResearchingBuilding(0, 'tech:infantry_armor', 10);
    const infantry = makeInfantry(0);
    entities.addBuilding(b);
    entities.addUnit(infantry);
    research.update(10);
    expect(infantry.armor).toBe(7); // baseArmor 2 + 5
  });

  it('完成建筑加固科技：回溯应用到现有建筑（maxHp×1.2）', () => {
    const { entities, research } = setup();
    const researchingBld = makeResearchingBuilding(0, 'tech:structure_reinforce', 10);
    const existingBld = new Building(0, 'arcane_empire', 3, 3, 800, 'structure', 'production', 'bld_barracks', 0, 0);
    existingBld.complete();
    entities.addBuilding(researchingBld);
    entities.addBuilding(existingBld);
    research.update(10);
    expect(existingBld.maxHp).toBe(960); // round(800*1.2)
  });

  it('完成后 TechSystem 缓存刷新', () => {
    const { entities, research, tech } = setup();
    const b = makeResearchingBuilding(0, 'tech:infantry_armor', 10);
    entities.addBuilding(b);
    expect(tech.getEffects(0).infantryArmor).toBe(0);
    research.update(10);
    expect(tech.getEffects(0).infantryArmor).toBe(5);
  });
});
