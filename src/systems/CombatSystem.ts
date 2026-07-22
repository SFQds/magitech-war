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
  // P2-D3: crystal damage type has no units using it yet (death config, kept for type completeness)
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
  /** P0-6 修复：受害者 playerIndex（AOE 击杀时正确记录） */
  playerIndex?: number;
  /** P0-6 修复：未乘伤害矩阵的原始伤害值（供AOE正确计算溅射伤害） */
  rawDamage?: number;
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

  // P2-D5 修复：删除死代码 unitAttackTarget（全项目无调用，战斗循环走 updateCombat 内联计算）

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
        // P1-3 修复：零攻击力单位被手动命攻击时，清除攻击状态，不造成伤害
        if (unit.attackDamage <= 0) {
          unit.stopAttacking();
          continue;
        }
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
          // 目标超出射程 -> 追击
          // P1-C6 修复：目标移动后路径不刷新。每 30 帧重算一次路径（即使 path 非空）。
          // P1-A1 修复：有路但走不动（path 非空但实际卡住）也需超时检测，用 pursueFailTimer 统一。
          const tick30 = (unit.pursueRetickTimer ?? 0) + 1;
          unit.pursueRetickTimer = tick30;
          if (unit.path.length === 0 || tick30 >= 30) {
            MovementSystem.navigate(
              unit,
              { x: Math.round(target.tileX), y: Math.round(target.tileY) },
              map,
            );
            unit.pursueRetickTimer = 0;
            // navigate 仍返回空路径 -> 计入失败计数
            if (unit.path.length === 0) {
              unit.pursueFailTimer = (unit.pursueFailTimer ?? 0) + 1;
              if (unit.pursueFailTimer > 180) {
                unit.stopAttacking();
                unit.pursueFailTimer = 0;
                continue;
              }
            } else {
              unit.pursueFailTimer = 0;
            }
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
          let effectiveDmgMult = GuildSystem.getAlchemyDamageMult(unit) * GuildSystem.getVoidOverloadDamageMult(unit);
          let effectiveDmg = Math.round(unit.attackDamage * effectiveDmgMult); // P2: single round instead of triple
          // 目标护甲修正：炼金腐蚀弹（P1-E3 修复：读攻击者的 corrosion buff，而非 target）
          const corrosionPenalty = unit instanceof Unit
            ? Math.round((unit as Unit).baseArmor * GuildSystem.getAlchemyCorrosionArmorPenalty(unit as Unit))
            : 0;
          // 攻击方护甲增益（铁皮药剂 + 虚空过载护甲仅在攻击方被反击时需要；暂不在此处处理）
          
          const damage = CombatSystem.calculateDamage(effectiveDmg, unit.attackType, target.armorType, unit.faction);
          unit.attackTimer = unit.attackCooldown;
          // P0-7 修复：充能打击为一次性攻击增益，攻击后自动恢复原始攻击力
          GuildSystem.magesRestoreAfterAttack(unit);

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
              rawDamage: effectiveDmg, // P0-6：未乘矩阵的原始伤害，供AOE正确计算
            });
          }
        }
        continue;
      }

      // === 自动索敌：仅空闲单位自动攻击视野内敌人 ===
      // P1-B1 修复：moving 状态单位不再自动索敌，避免覆盖玩家移动命令（撤退/走位被敌人勾走）
      // 工人不自动攻击；已有攻击目标的跳过（防止覆盖用户命令）
      // AI 锁定的单位不自动索敌（防止 CombatSystem 覆盖 AI 撤退/防守命令）
      if (unit.targetEntityId) continue;
      if (unit.state !== 'idle') continue;
      // 工人 + 非战斗单位不自动攻击，也不应被手动命攻击
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
        // 在射程内 -> 站立攻击
        unit.attackTarget(enemy.id);
      } else if (dist <= unit.sight) {
        // 在视野内但不在射程内 -> 追击
        unit.targetEntityId = enemy.id;
        unit.attackTimer = 0;
        MovementSystem.navigate(
          unit,
          { x: Math.round(enemy.tileX), y: Math.round(enemy.tileY) },
          map,
        );
        // setPath() 把状态设为 'moving'，修正为 pursuing
        const st = unit.state as string;
        if (st === 'moving') {
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

      // 自动索敌：找射程内最近敌人（P1-G2 修复：同时搜索单位和建筑）
      let nearest: Entity | null = null;
      let nearestDist = bld.attackRange;
      for (const enemy of allUnits) {
        if (enemy.owner === bld.owner || !enemy.isAlive) continue;
        if (fogOfWar && bld.owner === 0 && !fogOfWar.isVisible(Math.round(enemy.tileX), Math.round(enemy.tileY))) continue;
        const d = distance({ x: bld.tileX, y: bld.tileY }, { x: enemy.tileX, y: enemy.tileY });
        if (d <= nearestDist) { nearestDist = d; nearest = enemy; }
      }
      // P1-G2: 也搜索敌方建筑
      for (const enemyBld of allBuildings) {
        if (enemyBld.owner === bld.owner || !enemyBld.isAlive) continue;
        if (fogOfWar && bld.owner === 0 && !fogOfWar.isVisible(enemyBld.tileX, enemyBld.tileY)) continue;
        const d = distance({ x: bld.tileX, y: bld.tileY }, { x: enemyBld.tileX, y: enemyBld.tileY });
        if (d <= nearestDist) { nearestDist = d; nearest = enemyBld; }
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

  /** AOE 范围伤害：对中心点 radius 范围内所有敌人造成伤害（掷弹兵等）
   * @param excludeTargetId P0-6：排除主目标（避免AOE对直接命中的目标二次伤害）*/
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
    excludeTargetId?: string,
  ): CombatEvent[] {
    const events: CombatEvent[] = [];
    // 对范围内单位
    for (const target of units) {
      if (target.owner === sourceOwner || !target.isAlive) continue;
      if (excludeTargetId && target.id === excludeTargetId) continue;
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
          playerIndex: target.owner,
        });
      }
    }
    // 对范围内建筑
    for (const target of buildings) {
      if (target.owner === sourceOwner || !target.isAlive) continue;
      if (excludeTargetId && target.id === excludeTargetId) continue;
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
          playerIndex: target.owner,
        });
      }
    }
    return events;
  }
}