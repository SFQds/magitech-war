/**
 * 单位特殊机制系统 — L3 单位的特殊行为
 *
 * 纯逻辑：处理 L3 单位的被动光环、倒计时爆炸、死亡自爆等机制。
 * 由 GameScene 每帧调用 update()；死亡自爆由 DeathCleanupSystem 在清理前调用 onUnitDeath()。
 * 无 Phaser 依赖。
 *
 * 当前实现：
 *  - 移动工坊 (unit_mobile_workshop): 周围4格友方机械每秒回血 maxHp*1.5%
 *  - 不稳定水晶炸弹 (unit_unstable_crystal): 10秒爆炸，500范围水晶伤害
 *  - 炼金巨像 (unit_alchemy_colossus): 死亡时300范围炼金伤害
 *  - 秘法炮台 (unit_arcane_cannon): 充能×3（接入 MageGuildUnits）
 *  - 符文泰坦 (unit_rune_titan): 混合伤害（物理/魔法取最优）
 *  - 奥术壁垒 (unit_arcane_bastion): 坚守时 +10护甲 +100护盾
 *  - 腐蚀巨兽 (unit_corrosion_beast): 攻击降低目标护甲(3/层, 上限15, 持续5s)
 *  - 虚空行者 (unit_void_walker): 每8秒闪烁到3格内随机位置
 *  - 魔导攻城炮 (unit_siege_engine): 对建筑×1.5伤害
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

/** 奥术壁垒坚守护甲加成 */
const BASTION_HOLD_ARMOR_BONUS = 10;
/** 奥术壁垒坚守护盾加成 */
const BASTION_HOLD_SHIELD = 100;

/** 腐蚀巨兽每层减甲值 */
const CORROSION_ARMOR_PER_STACK = 3;
/** 腐蚀巨兽最大减甲层数 */
const CORROSION_MAX_STACKS = 5;
/** 腐蚀巨兽减甲持续秒数 */
const CORROSION_DURATION = 5;

/** 虚空行者闪烁间隔（秒） */
const VOID_WALKER_BLINK_INTERVAL = 8;
/** 虚空行者闪烁范围（曼哈顿半径） */
const VOID_WALKER_BLINK_RANGE = 3;

/** 攻城炮对建筑伤害倍率 */
const SIEGE_STRUCTURE_MULT = 1.5;

// 批2: 霜脊守卫固守 — 驻守时护甲值翻倍
const FROST_GUARD_HOLD_ARMOR_MULT = 2.0;
// 批2: 深矿破坏者溅射 — 攻击对目标相邻单位造成 30% 伤害
const DEEP_DESTROYER_SPLASH_RATIO = 0.3;
const DEEP_DESTROYER_SPLASH_RADIUS = 2;
// 批3: 翡翠斥候隐形 + 标记
const JADE_SCOUT_SIGHT = 12;
const JADE_MARK_DURATION = 30;
const JADE_MARK_DMG_BONUS = 0.25; // 被标记单位受伤 +25%

export class UnitSpecialSystem {
  /** 腐蚀巨兽护甲扣减跟踪：目标 unitId → { 剩余秒数, 层数 } */
  private static _corrosionStacks = new Map<string, { timer: number; stacks: number }>();

  /** 虚空行者闪烁计时：unitId → 剩余秒数 */
  private static _voidWalkerTimers = new Map<string, number>();
  // 批3: 翡翠斥候标记目标 { timer: 剩余秒数 }
  private static _markedTargets = new Map<string, number>();

  /**
   * 每帧更新 L3 单位的持续机制。
   * 由 GameScene 每帧调用（与 BuildingSystem 同位置）。
   */
  static update(units: Unit[], deltaSec: number, world?: GameWorld): void {
    UnitSpecialSystem._updateMobileWorkshops(units, deltaSec);
    UnitSpecialSystem._updateUnstableCrystals(units, deltaSec, world);
    UnitSpecialSystem._updateArcaneBastions(units);
    UnitSpecialSystem._updateFrostGuards(units);
    UnitSpecialSystem._tickCorrosionStacks(units, deltaSec);
    UnitSpecialSystem._updateVoidWalkers(units, deltaSec, world);
    UnitSpecialSystem._updateJadeScouts(units);
    UnitSpecialSystem._tickMarks(units, deltaSec);
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

  // ========== 奥术壁垒：坚守时 +10护甲 +100护盾 ==========

  private static _updateArcaneBastions(units: Unit[]): void {
    for (const u of units) {
      if (!u.isAlive || u.spriteKey !== 'unit_arcane_bastion') continue;
      if (u.holdPosition) {
        // 坚守时施加 buff（每帧刷新确保持续有效）
        u.armor = u.baseArmor + BASTION_HOLD_ARMOR_BONUS;
        if (u.shieldHp < BASTION_HOLD_SHIELD) {
          u.shieldHp = BASTION_HOLD_SHIELD;
          u.maxShieldHp = Math.max(u.maxShieldHp, BASTION_HOLD_SHIELD);
        }
      } else {
        // 非坚守恢复基础护甲
        u.armor = u.baseArmor;
      }
    }
  }

  // ========== 批2: 霜脊守卫：固守时护甲翻倍 ==========

  private static _updateFrostGuards(units: Unit[]): void {
    for (const u of units) {
      if (!u.isAlive || u.spriteKey !== 'unit_frost_guard') continue;
      if (u.holdPosition) {
        u.armor = Math.round(u.baseArmor * FROST_GUARD_HOLD_ARMOR_MULT);
      } else {
        u.armor = u.baseArmor;
      }
    }
  }

  // ========== 批2: 深矿破坏者：攻击溅射 ==========

  /** 由 CombatSystem 在深矿破坏者攻击命中时调用，对目标相邻单位造成溅射伤害 */
  static onDeepDestroyerHit(attacker: Unit, target: Unit, units: Unit[], baseDamage: number, dmgType: string): void {
    for (const u of units) {
      if (!u.isAlive || u.id === target.id) continue;
      if (u.owner === attacker.owner) continue;
      const d = Math.abs(u.tileX - target.tileX) + Math.abs(u.tileY - target.tileY);
      if (d > DEEP_DESTROYER_SPLASH_RADIUS) continue;
      const splash = Math.round(baseDamage * DEEP_DESTROYER_SPLASH_RATIO);
      if (splash > 0) u.takeDamage(splash, dmgType as any);
    }
  }

  // ========== 批3: 翡翠斥候：隐形 + 标记 ==========

  /** 隐形单位查询：被 CombatSystem.findNearestEnemy 调用，跳过隐形的敌方单位 */
  static isUnitStealth(unit: Unit): boolean {
    // 翡翠斥候永久隐形（无侦测机制时）；被标记或自身攻击时不破隐（简化）
    return unit.isAlive && unit.spriteKey === 'unit_jade_scout';
  }

  /** 标记目标：由玩家/AI 命令翡翠斥候对目标施放，或简化为斥候靠近敌方时自动标记。
   *  duration 默认 JADE_MARK_DURATION(30s)；卡林「市场操纵」传 20s。 */
  static markTarget(targetId: string, duration: number = JADE_MARK_DURATION): void {
    UnitSpecialSystem._markedTargets.set(targetId, duration);
  }

  /** 被标记单位受伤加成查询：由 CombatSystem.calculateDamage 调用 */
  static getMarkBonus(targetId: string): number {
    return UnitSpecialSystem._markedTargets.has(targetId) ? JADE_MARK_DMG_BONUS : 0;
  }

  private static _updateJadeScouts(units: Unit[]): void {
    // 简化：翡翠斥候靠近敌方单位（3格内）时自动标记之
    const scouts = units.filter(u => u.isAlive && u.spriteKey === 'unit_jade_scout');
    if (scouts.length === 0) return;
    for (const scout of scouts) {
      for (const u of units) {
        if (!u.isAlive || u.owner === scout.owner) continue;
        const d = Math.abs(scout.tileX - u.tileX) + Math.abs(scout.tileY - u.tileY);
        if (d <= 3) UnitSpecialSystem.markTarget(u.id);
      }
    }
  }

  private static _tickMarks(units: Unit[], deltaSec: number): void {
    for (const [id, timer] of UnitSpecialSystem._markedTargets) {
      const nt = timer - deltaSec;
      if (nt <= 0) {
        UnitSpecialSystem._markedTargets.delete(id);
      } else {
        UnitSpecialSystem._markedTargets.set(id, nt);
      }
    }
  }

  // ========== 腐蚀巨兽：攻击叠减护甲 ==========

  /** 由 CombatSystem 在攻击命中时调用 */
  static onCorrosionHit(targetId: string): void {
    const entry = UnitSpecialSystem._corrosionStacks.get(targetId);
    if (entry) {
      entry.timer = CORROSION_DURATION; // 刷新持续时间
      if (entry.stacks < CORROSION_MAX_STACKS) {
        entry.stacks++;
      }
    } else {
      UnitSpecialSystem._corrosionStacks.set(targetId, { timer: CORROSION_DURATION, stacks: 1 });
    }
  }

  private static _tickCorrosionStacks(units: Unit[], deltaSec: number): void {
    if (UnitSpecialSystem._corrosionStacks.size === 0) return;
    for (const [id, entry] of UnitSpecialSystem._corrosionStacks) {
      entry.timer -= deltaSec;
      if (entry.timer <= 0) {
        // 过期：恢复目标护甲
        const unit = units.find(u => u.id === id);
        if (unit && unit.isAlive) {
          unit.armor = unit.baseArmor;
        }
        UnitSpecialSystem._corrosionStacks.delete(id);
      } else {
        // 持续减甲
        const unit = units.find(u => u.id === id);
        if (unit && unit.isAlive) {
          const penalty = Math.min(entry.stacks * CORROSION_ARMOR_PER_STACK, CORROSION_MAX_STACKS * CORROSION_ARMOR_PER_STACK);
          unit.armor = Math.max(0, unit.baseArmor - penalty);
        }
      }
    }
  }

  /** 获取目标的腐蚀减甲值（供 CombatSystem 使用） */
  static getCorrosionPenalty(targetId: string): number {
    const entry = UnitSpecialSystem._corrosionStacks.get(targetId);
    if (!entry || entry.timer <= 0) return 0;
    return Math.min(entry.stacks * CORROSION_ARMOR_PER_STACK, CORROSION_MAX_STACKS * CORROSION_ARMOR_PER_STACK);
  }

  // ========== 虚空行者：每 8s 闪烁 ==========

  private static _updateVoidWalkers(units: Unit[], deltaSec: number, world?: GameWorld): void {
    if (!world) return;
    for (const u of units) {
      if (!u.isAlive || u.spriteKey !== 'unit_void_walker') continue;
      let timer = UnitSpecialSystem._voidWalkerTimers.get(u.id) ?? VOID_WALKER_BLINK_INTERVAL;
      timer -= deltaSec;
      if (timer <= 0) {
        // 闪烁：随机位移到 3 格内可通过且无单位的 tile
        const newPos = world.map.findNearbyPassable(u.tileX, u.tileY, VOID_WALKER_BLINK_RANGE);
        if (newPos && newPos.x !== u.tileX && newPos.y !== u.tileY) {
          u.tileX = newPos.x;
          u.tileY = newPos.y;
          u.clearPath();
          u.targetEntityId = null;
        }
        timer = VOID_WALKER_BLINK_INTERVAL;
      }
      UnitSpecialSystem._voidWalkerTimers.set(u.id, timer);
    }
    // 清除已死亡/不存在单位的 timer
    for (const [id] of UnitSpecialSystem._voidWalkerTimers) {
      if (!units.some(u => u.id === id && u.isAlive)) {
        UnitSpecialSystem._voidWalkerTimers.delete(id);
      }
    }
  }

  // ========== 攻击伤害修正 ==========

  /**
   * 返回某单位的攻击伤害乘数（由 CombatSystem 在计算伤害前调用）。
   *  - 秘法炮台：有充能时 ×3（消耗1层充能）
   *  - 魔导攻城炮：对建筑目标 ×1.5（由 CombatSystem 传入 isStructure 判断）
   *  - 符文泰坦：混合伤害 ×1.0（混合处理在 getAttackDamageType 中切换为对目标护甲更有效的类型）
   * 其他单位返回 1.0。
   */
  static getAttackDamageMult(unit: Unit, targetIsStructure = false): number {
    if (unit.spriteKey === 'unit_arcane_cannon' && unit.abilityCharges > 0) {
      unit.abilityCharges -= 1;
      return 3.0;
    }
    if (unit.spriteKey === 'unit_siege_engine' && targetIsStructure) {
      return SIEGE_STRUCTURE_MULT;
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
    UnitSpecialSystem._corrosionStacks.clear();
    UnitSpecialSystem._voidWalkerTimers.clear();
    UnitSpecialSystem._markedTargets.clear();
  }
}
