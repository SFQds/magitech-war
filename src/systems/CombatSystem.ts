/**
 * 战斗系统 — 攻击判定、伤害计算、死亡处理
 *
 * 纯逻辑：接收 GameWorld 中的单位和建筑引用
 */

import type { DamageType, ArmorType } from '../types/data';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { Entity } from '../entities/Entity';
import { MovementSystem } from './MovementSystem';
import type { GameMap } from '../core/GameMap';
import { distance } from '../utils/MathUtils';

/** 伤害-护甲 克制矩阵 */
const DAMAGE_MATRIX: Record<DamageType, Record<ArmorType, number>> = {
  physical:  { light: 1.0, heavy: 0.75, shield: 1.0,  bio: 1.0, structure: 0.5,  mechanical: 0.75 },
  magic:     { light: 1.0, heavy: 1.25, shield: 1.5,  bio: 1.0, structure: 1.0,  mechanical: 1.0  },
  alchemy:   { light: 1.0, heavy: 1.0,  shield: 2.0,  bio: 0.9, structure: 1.5,  mechanical: 1.0  },
  crystal:   { light: 1.0, heavy: 1.0,  shield: 0.5,  bio: 1.0, structure: 1.0,  mechanical: 1.25 },
  void:      { light: 1.0, heavy: 1.0,  shield: 1.0,  bio: 1.25, structure: 1.0,  mechanical: 1.0  },
};

/** 一次攻击事件的数据 */
export interface CombatEvent {
  attackerId: string;
  targetId: string;
  damage: number;
  targetDied: boolean;
  attackType: DamageType;
}

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

  /** 单位攻击目标 — 检查距禈并计算伤害 */
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

  /**
   * 更新所有单位的战斗状态 — 完整战斗循环
   *
   * @returns 本帧产生的战斗事件列表
   */
  static updateCombat(
    units: Unit[],
    _buildings: Building[],
    allUnits: Unit[],
    allBuildings: Building[],
    map: GameMap,
    deltaSec: number,
  ): CombatEvent[] {
    const events: CombatEvent[] = [];

    for (const unit of units) {
      if (!unit.isAlive) continue;

      // 递减攻击冷却
      if (unit.attackTimer > 0) {
        unit.attackTimer -= deltaSec;
      }

      // === 主动攻击：已指定目标，尝试造成伤害 ===
      const hasTarget = unit.targetEntityId && CombatSystem.findEntity(unit.targetEntityId, allUnits, allBuildings);
      const wantsToAttack = (unit.state === 'attacking' || unit.state === 'pursuing') && hasTarget;

      if (wantsToAttack) {
        const target = CombatSystem.findEntity(unit.targetEntityId!, allUnits, allBuildings);
        if (!target || !target.isAlive) {
          unit.stopAttacking();
          continue;
        }

        const dist = distance(
          { x: unit.tileX, y: unit.tileY },
          { x: target.tileX, y: target.tileY },
        );

        if (dist > unit.attackRange) {
          // 目标超出射程 → 追击
          // 只在无路径时规划追击路径
          if (unit.path.length === 0) {
            MovementSystem.navigate(
              unit,
              { x: Math.round(target.tileX), y: Math.round(target.tileY) },
              map,
            );
          }
          // setPath() 会把 state 设为 'moving'，这里修正为 pursuing
          if (unit.state === 'moving' && unit.targetEntityId) {
            unit.state = 'pursuing';
          }
          continue;
        }

        // 目标在射程内 → 如果正在追击就停下来
        if (unit.state === 'pursuing') {
          unit.path = [];
          unit.pathIndex = 0;
          unit.state = 'attacking';
        }

        // 冷却完毕 → 造成伤害
        if (unit.attackTimer <= 0) {
          const damage = CombatSystem.calculateDamage(unit.attackDamage, unit.attackType, target.armorType);
          const died = target.takeDamage(damage);

          unit.attackTimer = unit.attackCooldown;

          events.push({
            attackerId: unit.id,
            targetId: target.id,
            damage,
            targetDied: died,
            attackType: unit.attackType,
          });

          if (died) {
            unit.stopAttacking();
          }
        }
        continue;
      }

      // === 自动索敌：空闲单位（或移动中的作战单位）自动攻击视野内敌人 ===
      // 工人不自动攻击；已有攻击目标的跳过（防止覆盖用户命令）
      if (unit.targetEntityId) continue;
      if (unit.state !== 'idle' && unit.state !== 'moving') continue;
      if (unit.spriteKey === 'unit_worker') continue;

      const enemy = CombatSystem.findNearestEnemy(unit, allUnits, allBuildings);
      if (!enemy) continue;

      const dist = distance(
        { x: unit.tileX, y: unit.tileY },
        { x: enemy.tileX, y: enemy.tileY },
      );

      if (dist <= unit.attackRange && unit.attackTimer <= 0) {
        // 在射程内 → 站立攻击
        unit.attackTarget(enemy.id);
      } else if (dist <= unit.sight) {
        // 在视野内但不在射程内 → 追击
        if (unit.state === 'moving' && unit.path.length > 0) continue;

        unit.targetEntityId = enemy.id;
        unit.attackTimer = 0;
        MovementSystem.navigate(
          unit,
          { x: Math.round(enemy.tileX), y: Math.round(enemy.tileY) },
          map,
        );
        // setPath() 把状态设为 'moving'，修正为 pursuing
        if (unit.state === 'moving') {
          unit.state = 'pursuing';
        }
      }
    }

    return events;
  }

  /** 在所有实体中查找给定ID的实体 */
  private static findEntity(
    id: string,
    units: Unit[],
    buildings: Building[],
  ): Entity | null {
    const unit = units.find(u => u.id === id);
    if (unit) return unit;
    const bld = buildings.find(b => b.id === id);
    return bld ?? null;
  }

  /** 查找最近的非己方单位 */
  static findNearestEnemy(
    unit: Unit,
    units: Unit[],
    buildings: Building[],
  ): Entity | null {
    let nearest: Entity | null = null;
    let nearestDist = unit.sight;

    for (const other of units) {
      if (other.owner === unit.owner || !other.isAlive) continue;
      const dist = distance(
        { x: unit.tileX, y: unit.tileY },
        { x: other.tileX, y: other.tileY },
      );
      if (dist <= nearestDist) {
        nearestDist = dist;
        nearest = other;
      }
    }

    // 也检查建筑
    for (const bld of buildings) {
      if (bld.owner === unit.owner || !bld.isAlive) continue;
      const dist = distance(
        { x: unit.tileX, y: unit.tileY },
        { x: bld.tileX, y: bld.tileY },
      );
      if (dist <= nearestDist) {
        nearestDist = dist;
        nearest = bld;
      }
    }

    return nearest;
  }
}