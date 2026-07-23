/**
 * 科技系统 — 科技效果缓存与应用
 *
 * 纯逻辑：从 GameWorld.techTrees 读取已研究科技，缓存为派生效果
 * （采集倍率/步兵护甲/建筑HP倍率），供新单位/新建筑生成时应用。
 *
 * 从 GameScene 抽离：calcGatherMult / initTechEffects / refreshTechEffects /
 * getTechEffects / applyTechToUnit / applyTechToBuilding / getTechTree。
 * 无 Phaser 依赖。
 */

import { GameWorld } from '../core/GameWorld';
import { TechTreeSystem } from './TechTreeSystem';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';

/** 某玩家的科技派生效果 */
export interface TechEffects {
  /** 采集倍率（advanced_mining×1.2 + crystal_smelting×1.15 + refining_tech×1.25） */
  gatherMult: number;
  /** 步兵护甲增量（infantry_armor → +5） */
  infantryArmor: number;
  /** 建筑 HP 倍率（structure_reinforce → ×1.2） */
  buildingHpMult: number;
}

const DEFAULT_EFFECTS: TechEffects = {
  gatherMult: 1.0,
  infantryArmor: 0,
  buildingHpMult: 1.0,
};

export class TechSystem {
  private readonly world: GameWorld;
  private readonly techEffects = new Map<number, TechEffects>();

  constructor(world: GameWorld) {
    this.world = world;
  }

  /** 采集倍率：三个采集科技乘算叠加 */
  private calcGatherMult(tt: TechTreeSystem): number {
    let m = 1.0;
    if (tt.isResearched('tech:advanced_mining')) m *= 1.2;
    if (tt.isResearched('tech:crystal_smelting')) m *= 1.15;
    if (tt.isResearched('tech:refining_tech')) m *= 1.25;
    return m;
  }

  /** 初始化所有玩家科技效果缓存（游戏开始时调用） */
  initAll(): void {
    for (let i = 0; i < this.world.players.length; i++) {
      this.refresh(i);
    }
  }

  /** 刷新指定玩家的科技效果缓存 */
  refresh(playerIndex: number): void {
    const tt = this.getTree(playerIndex);
    this.techEffects.set(playerIndex, {
      gatherMult: this.calcGatherMult(tt),
      infantryArmor: tt.isResearched('tech:infantry_armor') ? 5 : 0,
      buildingHpMult: tt.isResearched('tech:structure_reinforce') ? 1.2 : 1.0,
    });
  }

  /** 获取某玩家的科技效果（缺失时返回默认值） */
  getEffects(playerIndex: number): TechEffects {
    return this.techEffects.get(playerIndex) ?? DEFAULT_EFFECTS;
  }

  /** 获取某玩家科技树 */
  getTree(playerIndex: number): TechTreeSystem {
    const tt = this.world.techTrees.get(playerIndex);
    if (!tt) throw new Error(`TechTree not found for player ${playerIndex}`);
    return tt;
  }

  /** 将科技效果应用到单位（新建单位时调用） */
  applyToUnit(unit: Unit): void {
    const te = this.getEffects(unit.owner);
    if (unit.category === 'infantry' && te.infantryArmor > 0) {
      unit.armor = unit.baseArmor + te.infantryArmor;
    }
  }

  /** 将科技效果应用到建筑（新建建筑时调用） */
  applyToBuilding(bld: Building): void {
    const te = this.getEffects(bld.owner);
    if (te.buildingHpMult !== 1.0) {
      bld.maxHp = Math.round(bld.maxHp * te.buildingHpMult);
      bld.hp = Math.min(bld.hp, bld.maxHp);
    }
  }
}
