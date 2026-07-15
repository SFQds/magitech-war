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
import type { FogOfWar } from '../core/FogOfWar';
import { GuildSystem } from './GuildSystem';
import { UNIT_DEFS, getFactionBonuses } from '../config/unitData';
import { EntityRegistry } from '../core/EntityRegistry';
import { distance } from '../utils/MathUtils';

/** 伤害-护甲 克制矩阵 */
const DAMAGE_MATRIX: Record<DamageType, Record<ArmorType, number>> = {
  physical:  { light: 1.0, heavy: 0.75, shield: 1.0,  bio: 1.0, structure: 0.5,  mechanical: 0.75 },
  magic:     { light: 1.0, heavy: 1.25, shield: 1.5,  bio: 1.0, structure: 1.0,  mechanical: 1.0  },
  alchemy:   { light: 1.0, heavy: 1.0,  shield: 2.0,  bio: 0.9, structure: 1.5,  mechanical: 1.0  },
  crystal:   { light: 1.0, heavy: 1.0,  shield: 0.5, bio: 1.0, structure: 1.0, mechanical: 1.25 },
  void:      { light: 1.0, heavy: 1.0,  shield: 1.0,  bio: 1.25, structure: 1.0,  mechanical: 1.0  },
};

/** 一次攻击事件的数据 */
export interface CombatEvent {
  attackerId: string;
  targetId: string;
  damage: number;
  targetDied: boolean;
  attackType: DamageType;
  /** 'melee' = 近战即时伤害, 'aoe' = 范围伤害, 其他值 = 弹道纹理 key */
  attackEffect: string;
  /** 是否为近战攻击 */
  isMelee: boolean;
  /** AOE 半径（掷弹兵等范围攻击），0 表示单体 */
  aoeRadius?: number;
  /** 弹道起点（远程时有值） */
  attackerTileX?: number;
  attackerTileY?: number;
  targetTileX?: number;
  targetTileY?: number;
  /** 炼金腐蚀弹对目标的护甲扣减值（远程弹道命中时应用） */
  corrosionPenalty?: number;
}

export class CombatSystem {
  /** 计算最终伤害 */
  static calculateDamage(
    baseDamage: number,
    attackType: DamageType,
    targetArmor: ArmorType,
    attackerFaction?: string,
  ): number {
    const matrixMult = DAMAGE_MATRIX[attackType]?.[targetArmor] ?? 1.0;
    // 帝国魔法伤害+10%
    let factionMult = 1.0;
    if (attackerFaction && attackType === 'magic') {
      factionMult = getFactionBonuses(attackerFaction).magicDmgMult;
    }
    return Math.round(baseDamage * matrixMult * factionMult);
  }

  /** 单位攻击目标 — 检查距禈并计算伤害（含行会buff修正） */
  static unitAttackTarget(attacker: Unit, target: Entity): number {
    const dist = distance(
      { x: attacker.tileX, y: attacker.tileY },
      { x: target.tileX, y: target.tileY }
    );

    if (dist > attacker.attackRange) return 0;

    // 行会buff修正攻击力
    let effectiveDmg = attacker.attackDamage;
    effectiveDmg = Math.round(effectiveDmg * GuildSystem.getAlchemyDamageMult(attacker));
    effectiveDmg = Math.round(effectiveDmg * GuildSystem.getVoidOverloadDamageMult(attacker));

    const damage = this.calculateDamage(
      effectiveDmg,
      attacker.attackType,
      target.armorType,
      attacker.faction,
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
    fogOfWar?: FogOfWar,
    entities?: EntityRegistry,
  ): CombatEvent[] {
    const events: CombatEvent[] = [];
    // 使用 EntityRegistry 的 Map 索引（O(1) 查表替代 O(N) 遍历）
    const unitIdx = entities?.unitIndex;
    const bldIdx = entities?.buildingIndex;

    for (const unit of units) {
      if (!unit.isAlive) continue;

      if (unit.attackTimer > 0) {
        unit.attackTimer -= deltaSec;
      }

      // === 主动攻击：已指定目标，O(1) Map 查表 ===
      const targetEntity = unit.targetEntityId
        ? (unitIdx?.get(unit.targetEntityId) ?? bldIdx?.get(unit.targetEntityId))
        : null;
      const hasTarget = targetEntity !== undefined && targetEntity !== null && targetEntity.isAlive;
      const wantsToAttack = (unit.state === 'attacking' || unit.state === 'pursuing') && hasTarget;

      if (wantsToAttack) {
        // 使用 O(1) Map 查表结果（targetEntity），避免再次 O(N) findEntity
        const target = targetEntity;
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

        // 冷却完毕 → 攻击（应用行会buff修正）
        if (unit.attackTimer <= 0) {
          // 攻击力：炼金力量药剂 + 虚空过载
          let effectiveDmg = unit.attackDamage;
          effectiveDmg = Math.round(effectiveDmg * GuildSystem.getAlchemyDamageMult(unit));
          effectiveDmg = Math.round(effectiveDmg * GuildSystem.getVoidOverloadDamageMult(unit));
          // 目标护甲修正：炼金腐蚀弹（扣减目标护甲）
          const corrosionPenalty = target instanceof Unit
            ? Math.round((target as Unit).baseArmor * GuildSystem.getAlchemyCorrosionArmorPenalty(target as Unit))
            : 0;
          // 攻击方护甲增益（铁皮药剂 + 虚空过载护甲仅在攻击方被反击时需要；暂不在此处处理）
          
          const damage = CombatSystem.calculateDamage(effectiveDmg, unit.attackType, target.armorType, unit.faction);
          unit.attackTimer = unit.attackCooldown;

          const def = UNIT_DEFS[unit.spriteKey];
          const attackEffect = def?.attackEffect ?? 'melee';

          if (attackEffect === 'melee') {
            // 近战：即时伤害（应用腐蚀护甲扣减）
            const savedArmor = target.armor;
            if (corrosionPenalty > 0) {
              target.armor = Math.max(0, target.armor - corrosionPenalty);
            }
            const died = target.takeDamage(damage, unit.attackType);
            target.armor = savedArmor; // 恢复（腐蚀效果应由全局buff管理）
            events.push({
              attackerId: unit.id,
              targetId: target.id,
              damage,
              targetDied: died,
              attackType: unit.attackType,
              attackEffect: 'melee',
              isMelee: true,
            });
            if (died) {
              unit.stopAttacking();
            }
          } else {
            // 远程：弹道事件，伤害由弹道命中时结算
            events.push({
              attackerId: unit.id,
              targetId: target.id,
              damage,
              targetDied: false,
              attackType: unit.attackType,
              attackEffect,
              isMelee: false,
              attackerTileX: unit.tileX,
              attackerTileY: unit.tileY,
              targetTileX: target.tileX,
              targetTileY: target.tileY,
              corrosionPenalty: corrosionPenalty > 0 ? corrosionPenalty : undefined,
            });
          }
        }
        continue;
      }

      // === 自动索敌：空闲单位（或移动中的作战单位）自动攻击视野内敌人 ===
      // 工人不自动攻击；已有攻击目标的跳过（防止覆盖用户命令）
      // AI 锁定的单位不自动索敌（防止 CombatSystem 覆盖 AI 撤退/防守命令）
      if (unit.targetEntityId) continue;
      if (unit.state !== 'idle' && unit.state !== 'moving') continue;
      // 工人 + 非战斗单位不自动攻击
      if (unit.attackDamage <= 0) continue;
      if (unit.holdPosition) continue;
      // 仅 retreat 阻止索敌；defend/recover 允许途中自卫
      if (unit.aiLockedAction === 'retreat') continue;

      const enemy = CombatSystem.findNearestEnemy(unit, allUnits, allBuildings, fogOfWar);
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

    // === 防御建筑攻击循环 ===
    for (const bld of allBuildings) {
      if (!bld.isAlive || bld.attackDamage <= 0) continue;
      // 建造中/研究中的建筑不攻击
      if (bld.state === 'constructing' || bld.state === 'researching') continue;
      if (bld.attackTimer > 0) { bld.attackTimer -= deltaSec; }
      if (bld.attackTimer > 0) continue;

      // O(1) 查表验证当前目标
      const currentTarget = bld.targetEntityId
        ? (unitIdx?.get(bld.targetEntityId) ?? bldIdx?.get(bld.targetEntityId))
        : null;
      if (currentTarget && currentTarget.isAlive) {
        const dist = distance(
          { x: bld.tileX, y: bld.tileY },
          { x: currentTarget.tileX, y: currentTarget.tileY },
        );
        if (dist <= bld.attackRange) {
          const dmgType = bld.attackType as DamageType;
          const damage = CombatSystem.calculateDamage(bld.attackDamage, dmgType, currentTarget.armorType, bld.faction);
          bld.attackTimer = bld.attackCooldown;
          const died = currentTarget.takeDamage(damage, dmgType);
          events.push({
            attackerId: bld.id,
            targetId: currentTarget.id,
            damage,
            targetDied: died,
            attackType: dmgType,
            attackEffect: 'melee',
            isMelee: true,
          });
          if (died) bld.targetEntityId = null;
          continue;
        } else {
          bld.targetEntityId = null; // 目标跑了
        }
      }

      // 自动索敌：找射程内最近敌人
      let nearest: Entity | null = null;
      let nearestDist = bld.attackRange;
      for (const enemy of allUnits) {
        if (enemy.owner === bld.owner || !enemy.isAlive) continue;
        if (fogOfWar && bld.owner === 0 && !fogOfWar.isVisible(Math.round(enemy.tileX), Math.round(enemy.tileY))) continue;
        const d = distance({ x: bld.tileX, y: bld.tileY }, { x: enemy.tileX, y: enemy.tileY });
        if (d <= nearestDist) { nearestDist = d; nearest = enemy; }
      }
      if (nearest) {
        bld.targetEntityId = nearest.id;
        const dmgType = bld.attackType as DamageType;
        const damage = CombatSystem.calculateDamage(bld.attackDamage, dmgType, nearest.armorType, bld.faction);
        bld.attackTimer = bld.attackCooldown;
        const died = nearest.takeDamage(damage, dmgType);
        events.push({
            attackerId: bld.id,
            targetId: nearest.id,
            damage,
            targetDied: died,
            attackType: dmgType,
            attackEffect: 'melee',
            isMelee: true,
          });
        if (died) bld.targetEntityId = null;
      }
    }

    return events;
  }

  /** 查找最近的非己方单位 */
  static findNearestEnemy(
    unit: Unit,
    units: Unit[],
    buildings: Building[],
    fogOfWar?: FogOfWar,
  ): Entity | null {
    let nearest: Entity | null = null;
    let nearestDist = unit.sight;

    for (const other of units) {
      if (other.owner === unit.owner || !other.isAlive) continue;
      // 迷雾过滤：仅玩家单位受限制，AI 单位全图可见
      if (fogOfWar && unit.owner === 0 && !fogOfWar.isVisible(Math.round(other.tileX), Math.round(other.tileY))) continue;
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
      // 迷雾过滤：仅玩家单位受限制
      if (fogOfWar && unit.owner === 0 && !fogOfWar.isVisible(bld.tileX, bld.tileY)) continue;
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

  /** AOE 范围伤害：对中心点 radius 范围内所有敌人造成伤害（掷弹兵等） */
  static calculateAOE(
    centerX: number,
    centerY: number,
    radius: number,
    damage: number,
    damageType: DamageType,
    sourceOwner: number,
    sourceFaction: string,
    units: Unit[],
    buildings: Building[],
  ): CombatEvent[] {
    const events: CombatEvent[] = [];
    // 对范围内单位
    for (const target of units) {
      if (target.owner === sourceOwner || !target.isAlive) continue;
      const d = distance({ x: centerX, y: centerY }, { x: target.tileX, y: target.tileY });
      if (d <= radius) {
        const finalDmg = this.calculateDamage(damage, damageType, target.armorType, sourceFaction);
        const died = target.takeDamage(finalDmg, damageType);
        events.push({
          attackerId: '',
          targetId: target.id,
          damage: finalDmg,
          targetDied: died,
          attackType: damageType,
          attackEffect: 'aoe',
          isMelee: false,
        });
      }
    }
    // 对范围内建筑
    for (const target of buildings) {
      if (target.owner === sourceOwner || !target.isAlive) continue;
      const d = distance({ x: centerX, y: centerY }, { x: target.tileX, y: target.tileY });
      if (d <= radius) {
        const finalDmg = this.calculateDamage(damage, damageType, target.armorType, sourceFaction);
        const died = target.takeDamage(finalDmg, damageType);
        events.push({
          attackerId: '',
          targetId: target.id,
          damage: finalDmg,
          targetDied: died,
          attackType: damageType,
          attackEffect: 'aoe',
          isMelee: false,
        });
      }
    }
    return events;
  }
}