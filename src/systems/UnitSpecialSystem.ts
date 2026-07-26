/**
 * 单位特殊机制系统 — L3 单位的特殊行为
 *
 * 纯逻辑：处理 L3 单位的被动光环、倒计时爆炸、死亡自爆等机制。
 * 由 GameScene 每帧调用 update()；死亡自爆由 DeathCleanupSystem 在清理前调用 onUnitDeath()。
 * 无 Phaser 依赖。
 *
 * 当前实现：
 *  - 移动工坊 (unit_mobile_workshop, 机械行会+铁锤联邦)：周围4格友方机械每秒回血 maxHp*1.5%（移动版维修站，半径/效率减半）
 *  - 不稳定水晶炸弹 (unit_unstable_crystal, 虚空研究院)：生成后10秒爆炸，500范围水晶伤害（不分敌我）
 *  - 炼金巨像 (unit_alchemy_colossus, 炼金协会)：死亡时300范围炼金伤害（不分敌我）
 *  - 秘法炮台 (unit_arcane_cannon)：通过 MAGE_GUILD_UNITS 接入充能系统，充能后下一发×3（见 getAttackDamageMult）
 *  - 符文泰坦 (unit_rune_titan)：混合伤害（物理+魔法，取较高者见 getAttackDamageMult）
 */

import { Unit } from '../entities/Unit';
import type { GameWorld } from '../core/GameWorld';
import type { DamageType } from '../types/data';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';

/** 移动工坊维修光环半径（Manhattan） */
const MOBILE_WORKSHOP_RADIUS = 4;
/** 移动工坊每秒回血占 maxHp 比例（维修站的一半） */
const MOBILE_WORKSHOP_HEAL_RATIO = 0.015;
/** 移动工坊每秒回血下限 */
const MOBILE_WORKSHOP_HEAL_MIN = 1;

/** 不稳定水晶炸弹倒计时（秒） */
const UNSTABLE_CRYSTAL_FUSE = 10;
/** 不稳定水晶爆炸范围（曼哈顿半径） */
const UNSTABLE_CRYSTAL_RADIUS = 4;
/** 不稳定水晶爆炸伤害 */
const UNSTABLE_CRYSTAL_DAMAGE = 500;

/** 炼金巨像死亡自爆范围（曼哈顿半径） */
const COLOSSUS_DEATH_RADIUS = 4;
/** 炼金巨像死亡自爆伤害 */
const COLOSSUS_DEATH_DAMAGE = 300;

export class UnitSpecialSystem {
  /**
   * 每帧更新 L3 单位的持续机制。
   * 由 GameScene 每帧调用（与 BuildingSystem 同位置）。
   */
  static update(units: Unit[], deltaSec: number, world?: GameWorld): void {
    UnitSpecialSystem._updateMobileWorkshops(units, deltaSec);
    UnitSpecialSystem._updateUnstableCrystals(units, deltaSec, world);
  }

  // ========== 移动工坊：移动维修光环 ==========

  private static _updateMobileWorkshops(units: Unit[], deltaSec: number): void {
    const workshops = units.filter(u =>
      u.isAlive && u.spriteKey === 'unit_mobile_workshop'
    );
    if (workshops.length === 0) return;
    for (const ws of workshops) {
      for (const u of units) {
        if (!u.isAlive || u.owner !== ws.owner) continue;
        if (u.armorType !== 'mechanical') continue;
        if (u.id === ws.id) continue; // 不修自己
        const d = Math.abs(ws.tileX - u.tileX) + Math.abs(ws.tileY - u.tileY);
        if (d > MOBILE_WORKSHOP_RADIUS) continue;
        const healPerSec = Math.max(u.maxHp * MOBILE_WORKSHOP_HEAL_RATIO, MOBILE_WORKSHOP_HEAL_MIN);
        u.hp = Math.min(u.maxHp, u.hp + healPerSec * deltaSec);
      }
    }
  }

  // ========== 不稳定水晶炸弹：倒计时爆炸 ==========

  private static _updateUnstableCrystals(units: Unit[], deltaSec: number, _world?: GameWorld): void {
    for (const u of units) {
      if (!u.isAlive || u.spriteKey !== 'unit_unstable_crystal') continue;
      // 用 abilityCharges 字段存储剩余倒计时（复用现有字段避免改 Unit）
      const fuse = (u as any)._unstableFuse ?? UNSTABLE_CRYSTAL_FUSE;
      const next = fuse - deltaSec;
      (u as any)._unstableFuse = next;
      if (next <= 0) {
        // 引爆：范围内所有单位（不分敌我）受水晶伤害
        for (const target of units) {
          if (!target.isAlive) continue;
          const d = Math.abs(u.tileX - target.tileX) + Math.abs(u.tileY - target.tileY);
          if (d <= UNSTABLE_CRYSTAL_RADIUS) {
            target.takeDamage(UNSTABLE_CRYSTAL_DAMAGE, 'crystal');
          }
        }
        // 自爆单位自毁
        u.takeDamage(u.hp + u.shieldHp + u.armor + 100, 'crystal');
        EventBus.emit(GameEvent.ABILITY_USED, {
          unitId: u.id, abilityId: 'unstable_crystal_explode', playerIndex: u.owner,
        });
      }
    }
  }

  // ========== 炼金巨像：死亡自爆 ==========

  /** 当单位死亡时调用（由 DeathCleanupSystem 在清理前调用）。返回产生的爆炸事件数。 */
  static onUnitDeath(unit: Unit, units: Unit[]): number {
    if (unit.spriteKey !== 'unit_alchemy_colossus') return 0;
    let hits = 0;
    for (const target of units) {
      if (!target.isAlive || target.id === unit.id) continue;
      const d = Math.abs(unit.tileX - target.tileX) + Math.abs(unit.tileY - target.tileY);
      if (d <= COLOSSUS_DEATH_RADIUS) {
        target.takeDamage(COLOSSUS_DEATH_DAMAGE, 'alchemy');
        hits++;
      }
    }
    if (hits > 0) {
      EventBus.emit(GameEvent.ABILITY_USED, {
        unitId: unit.id, abilityId: 'colossus_death_explode', playerIndex: unit.owner,
      });
    }
    return hits;
  }

  // ========== 攻击伤害修正 ==========

  /**
   * 返回某单位的攻击伤害乘数（由 CombatSystem 在计算伤害前调用）。
   *  - 秘法炮台：有充能时 ×3（消耗1层充能）
   *  - 符文泰坦：混合伤害 ×1.0（混合处理在 getAttackDamageType 中切换为对目标护甲更有效的类型）
   * 其他单位返回 1.0。
   */
  static getAttackDamageMult(unit: Unit): number {
    if (unit.spriteKey === 'unit_arcane_cannon' && unit.abilityCharges > 0) {
      // 消耗1层充能，下一发×3
      unit.abilityCharges -= 1;
      return 3.0;
    }
    return 1.0;
  }

  /**
   * 返回某单位的实际伤害类型（符文泰坦根据目标护甲切换物理/魔法）。
   * 其他单位返回 def.dmgType（由调用方传入 fallback）。
   */
  static getAttackDamageType(unit: Unit, targetArmorType: string, fallback: DamageType): DamageType {
    if (unit.spriteKey === 'unit_rune_titan') {
      // 混合伤害：对重甲/建筑用魔法（物理被重甲减免），对轻甲用物理
      // 简化：目标为 heavy/structure/mechanical -> 魔法；否则物理
      if (targetArmorType === 'heavy' || targetArmorType === 'structure' || targetArmorType === 'mechanical') {
        return 'magic';
      }
      return 'physical';
    }
    return fallback;
  }

  // ========== 测试辅助 ==========

  /** 重置内部状态（测试用） */
  static resetForTest(): void {
    // 当前无 static 状态，预留
  }
}
