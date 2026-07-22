/**
 * 策略层 — 输出 StrategyDirective 指导运营层行为
 *
 * 每 25s 评估一次游戏阶段和战略倾向。
 * 支持难度差异化：easy 慢扩张/hard 快进攻。
 */

import type { GameWorld } from '../core/GameWorld';
import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';
import type { ResourceField } from '../entities/ResourceField';

export interface StrategyDirective {
  phase: 'early' | 'mid' | 'late';
  aggression: number;   // 0.0~1.0
  expansion: number;    // 0.0~1.0
  defense: number;      // 0.0~1.0
  preferredUnits: string[];
}

export class StrategyManager {
  private world: GameWorld;
  private playerIndex: number;
  private difficulty: 'easy' | 'normal' | 'hard';
  private elapsed: number = 0;
  private currentPhase: StrategyDirective['phase'] = 'early';

  /** 按阵营返回偏好单位列表 */
  private getFactionUnits(): { rifleman: string; elite: string; tier2: string } {
    const faction = this.world.players[this.playerIndex]?.faction;
    if (faction === 'hammer_federation') {
      return { rifleman: 'unit_rifleman', elite: 'unit_hammer_squad', tier2: 'unit_magitech_mech' };
    }
    return { rifleman: 'unit_rifleman', elite: 'unit_arcane_guard', tier2: 'unit_magitech_mech' };
  }

  static readonly DEFAULT_DIRECTIVE: StrategyDirective = {
    phase: 'early',
    aggression: 0.1,
    expansion: 0.8,
    defense: 0.2,
    preferredUnits: ['unit_worker'],
  };

  constructor(world: GameWorld, playerIndex: number, difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
    this.world = world;
    this.playerIndex = playerIndex;
    this.difficulty = difficulty;
  }

  /** 每 25s 调用一次，返回当前策略指令 */
  evaluate(
    deltaSec: number,
    units: Unit[],
    buildings: Building[],
    _fields: ResourceField[],
  ): StrategyDirective {
    this.elapsed += deltaSec;

    const combatUnits = units.filter(
      u => u.owner === this.playerIndex && u.isAlive && u.spriteKey !== 'unit_worker'
    );
    const hasBarracks = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_barracks'
    );
    const hasFactory = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_factory'
    );

    // 阶段判断（含双向降级）
    this.currentPhase = this.determinePhase(combatUnits.length, hasBarracks, hasFactory);

    // 难度感知的侵略性/扩张/防御偏移
    const diffAggro = this.difficulty === 'hard' ? 0.15 : this.difficulty === 'easy' ? -0.1 : 0;
    const diffExpand = this.difficulty === 'hard' ? -0.1 : this.difficulty === 'easy' ? 0.15 : 0;
    const diffDefend = this.difficulty === 'hard' ? 0.05 : this.difficulty === 'easy' ? -0.1 : 0;

    switch (this.currentPhase) {
      case 'early': {
        const fu = this.getFactionUnits();
        return {
          phase: 'early',
          aggression: Math.min(1, Math.max(0, 0.1 + diffAggro)),
          expansion: Math.min(1, Math.max(0, 0.8 + diffExpand)),
          defense: Math.min(1, Math.max(0, 0.2 + diffDefend)),
          preferredUnits: ['unit_worker', fu.rifleman],
        };
      }
      case 'mid': {
        const fu = this.getFactionUnits();
        return {
          phase: 'mid',
          aggression: Math.min(1, Math.max(0, 0.4 + diffAggro)),
          expansion: Math.min(1, Math.max(0, 0.5 + diffExpand)),
          defense: Math.min(1, Math.max(0, 0.5 + diffDefend)),
          preferredUnits: ['unit_battle_mage', fu.tier2],
        };
      }
      case 'late': {
        const fu = this.getFactionUnits();
        return {
          phase: 'late',
          aggression: Math.min(1, Math.max(0, 0.9 + diffAggro)),
          expansion: Math.min(1, Math.max(0, 0.2 + diffExpand)),
          defense: Math.min(1, Math.max(0, 0.6 + diffDefend)),
          preferredUnits: [fu.tier2, fu.elite, 'unit_battle_mage', fu.rifleman],
        };
      }
    }
  }

  /** 阶段判定（含降级逻辑 + 难度感知） */
  private determinePhase(
    combatCount: number,
    hasBarracks: boolean,
    hasFactory: boolean,
  ): StrategyDirective['phase'] {
    const hasProduction = hasBarracks || hasFactory;
    const diffMult = this.difficulty === 'hard' ? 0.6 : this.difficulty === 'easy' ? 1.5 : 1.0;

    // 降级逻辑
    if (this.currentPhase === 'late' && combatCount < 3) {
      return 'mid';
    }
    if (this.currentPhase === 'mid' && !hasProduction) {
      return 'early';
    }

    // 升级条件（diffMult 越小越容易升级 → hard 更快）
    if (combatCount >= Math.round(12 * diffMult)) return 'late';
    if (combatCount >= Math.round(6 * diffMult) && hasProduction) return 'mid';
    if (!hasProduction) return 'early';

    // 时间兜底推进（原 /diffMult 错误导致 hard 停留更久，已修正为 *diffMult）
    if (this.elapsed > 90 * diffMult && !hasProduction) return 'early';
    if (this.elapsed > 180 * diffMult && hasProduction && combatCount < Math.round(6 * diffMult)) return 'mid';
    // P1-AI1: fallthrough must not jump to late when combatCount < mid threshold.
    // Keep current phase instead of forcing late (was always returning 'late').
    return this.currentPhase;
  }
}