/**
 * 战斗系统 — 攻击判定、伤害计算、死亡处理
 *
 * 纯逻辑：接收 GameWorld 中的单位和建筑引用
 */

import type { DamageType, ArmorType } from '../types/data';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { Entity } from '../entities/Entity';
import { distance } from '../utils/MathUtils';

/** 伤害-护甲 克制矩阵 */
const DAMAGE_MATRIX: Record<DamageType, Record<ArmorType, number>> = {
  physical:  { light: 1.0, heavy: 0.75, shield: 1.0,  bio: 1.0, structure: 0.5,  mechanical: 0.75 },
  magic:     { light: 1.0, heavy: 1.25, shield: 1.5,  bio: 1.0, structure: 1.0,  mechanical: 1.0  },
  alchemy:   { light: 1.0, heavy: 1.0,  shield: 2.0,  bio: 0.9, structure: 1.5,  mechanical: 1.0  },
  crystal:   { light: 1.0, heavy: 1.0,  shield: 0.5,  bio: 1.0, structure: 1.0,  mechanical: 1.25 },
  void:      { light: 1.0, heavy: 1.0,  shield: 1.0,  bio: 1.25, structure: 1.0,  mechanical: 1.0  },
};

export class CombatSystem {
  /** 计算最终伤害 */
  static calculateDamage(
    baseDamage: number,
    attackType: DamageType,
    targetArmor: ArmorType
  ): number {
    const multiplier = DAMAGE_MATRIX[attackType]?.[targetArmor] ?? 1.0;
    return Math.round(baseDamage * multiplier);
  }

  /** 单位攻击目标 */
  static unitAttackTarget(attacker: Unit, target: Entity): number {
    const dist = distance(
      { x: attacker.tileX, y: attacker.tileY },
      { x: target.tileX, y: target.tileY }
    );

    if (dist > attacker.attackRange) return 0;

    const damage = this.calculateDamage(
      attacker.attackDamage,
      attacker.attackType,
      target.armorType
    );

    return damage;
  }

  /** 更新所有单位的战斗状态 */
  static updateCombat(units: Unit[], buildings: Building[], deltaSec: number): void {
    for (const unit of units) {
      if (!unit.isAlive) continue;
      if (unit.attackTimer > 0) {
        unit.attackTimer -= deltaSec;
      }
    }
  }
}