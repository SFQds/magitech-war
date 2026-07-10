/**
 * 策略层 — 输出 StrategyDirective 指导运营层行为
 *
 * 每 25s 评估一次游戏阶段和战略倾向。
 * 当前为骨架实现，后续可扩展为多 AI 性格、反制对手等复杂策略。
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
  private elapsed: number = 0;
  private currentPhase: StrategyDirective['phase'] = 'early';

  /** 默认指令（开局至第一次策略评估前使用） */
  static readonly DEFAULT_DIRECTIVE: StrategyDirective = {
    phase: 'early',
    aggression: 0.1,
    expansion: 0.8,
    defense: 0.2,
    preferredUnits: ['unit_worker'],
  };

  constructor(world: GameWorld, playerIndex: number) {
    this.world = world;
    this.playerIndex = playerIndex;
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

    switch (this.currentPhase) {
      case 'early':
        return {
          phase: 'early',
          aggression: 0.1,
          expansion: 0.8,
          defense: 0.2,
          preferredUnits: ['unit_worker', 'unit_rifleman'],
        };
      case 'mid':
        return {
          phase: 'mid',
          aggression: 0.4,
          expansion: 0.5,
          defense: 0.5,
          preferredUnits: ['unit_battle_mage', 'unit_magitech_mech'],
        };
      case 'late':
        return {
          phase: 'late',
          aggression: 0.9,
          expansion: 0.2,
          defense: 0.6,
          preferredUnits: ['unit_magitech_mech', 'unit_battle_mage', 'unit_rifleman'],
        };
    }
  }

  /** 阶段判定（含降级逻辑：工厂被拆 → 降回 early，军队打光 → 降回 mid） */
  private determinePhase(
    combatCount: number,
    hasBarracks: boolean,
    hasFactory: boolean,
  ): StrategyDirective['phase'] {
    const hasProduction = hasBarracks || hasFactory;

    if (this.currentPhase === 'late' && combatCount < 3) {
      return 'mid';
    }
    if (this.currentPhase === 'mid' && !hasProduction) {
      return 'early';
    }

    // 升级判定
    if (!hasProduction && this.elapsed < 180) {
      return 'early';
    }
    if (hasProduction && combatCount < 6) {
      return 'mid';
    }
    return 'late';
  }
}