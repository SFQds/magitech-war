/**
 * 行会系统 — 4个行会核心机制
 *
 * 法师公会：奥术充能（自动积累→消耗释放技能）
 * 机械行会：流水线协议（建筑并行训练）
 * 炼金协会：炼金调制（消耗水晶购买战斗药剂）
 * 虚空研究院：水晶过载（单位临时暴走→损毁）
 */

import type { PlayerState } from '../types/entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { Hero } from '../entities/Hero';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';

// ============================================================
// 法师公会：奥术充能
// ============================================================

const CHARGE_INTERVAL = 30;       // 充能间隔 30s
const MAX_CHARGES = 3;            // 最大充能层数
const CHARGE_SHIELD_HP = 150;     // Lv2 临时护盾值

/** 法师公会单位清单（可通过充能获得增益） */
const MAGE_GUILD_UNITS = new Set([
  'unit_battle_mage',
  'unit_arcane_guard',
  'unit_arcane_heavy',
  // P2-D2 修复：移除 'unit_arcane_cannon'——该单位在 unitData.ts 从未定义，
  // 保留会让法师公会充能对该 ID 永远不生效（虽不报错但暗示缺失单位）。
]);

// ============================================================
// 机械行会：流水线协议
// ============================================================

/** 机械行会允许并行训练的建筑 */
const PARALLEL_TRAIN_BUILDINGS = new Set([
  'bld_barracks', 'bld_factory', 'bld_assembly_workshop',
]);

const MECHANIST_PARALLEL_SLOTS = 3;   // 并行训练上限
const MECHANIST_PENALTY = 0.10;       // 额外队列效率惩罚 -10%/每队列
const TECH_OPTIMIZED_PENALTY = 0.05;  // 科技优化后惩罚 -5%

// ============================================================
// 炼金协会：炼金调制
// ============================================================

export interface AlchemyPotion {
  id: string;
  name: string;
  crystalCost: number;
  duration: number;         // 秒
  effect: 'strength' | 'ironskin' | 'swift' | 'corrosion';
  value: number;
  description: string;
}

/** 可用药剂清单 */
export const ALCHEMY_POTIONS: AlchemyPotion[] = [
  {
    id: 'potion_strength',
    name: '力量药剂',
    crystalCost: 50,
    duration: 45,
    effect: 'strength',
    value: 0.30,       // 攻击 +30%
    description: '攻击 +30%，持续45秒',
  },
  {
    id: 'potion_ironskin',
    name: '铁皮药剂',
    crystalCost: 50,
    duration: 45,
    effect: 'ironskin',
    value: 0.40,       // 护甲 +40%
    description: '护甲 +40%，持续45秒',
  },
  {
    id: 'potion_swift',
    name: '迅捷药剂',
    crystalCost: 40,
    duration: 30,
    effect: 'swift',
    value: 0.40,       // 移速 +40%
    description: '移速 +40%，持续30秒',
  },
  {
    id: 'potion_corrosion',
    name: '腐蚀弹',
    crystalCost: 60,
    duration: 30,
    effect: 'corrosion',
    value: 0.30,       // 目标护甲 -30%
    description: '目标护甲 -30%，持续30秒',
  },
];

// ============================================================
// 虚空研究院：水晶过载
// ============================================================

const VOID_OVERLOAD_DURATION = 30;     // 默认过载 30秒
const VOID_OVERLOAD_BOOST = 0.50;      // 全属性 +50%
const TECH_OVERLOAD_OPTIMIZED = 45;    // 科技优化后 45秒
const TECH_OVERLOAD_BOOST_OPT = 0.35;  // 科技优化后 +35%

// ============================================================
// 主系统
// ============================================================

export class GuildSystem {
  /**
   * 每帧更新所有行会机制。
   * 由 GameScene.update() 每帧调用。
   */
  static update(
    players: PlayerState[],
    units: Unit[],
    buildings: Building[],
    deltaSec: number,
    techTrees: Map<number, { isResearched(id: string): boolean }>,
    chargeTimers: Map<number, number>,
  ): void {
    for (const player of players) {
      const guilds: string[] = player.guilds;

      // === 法师公会：奥术充能 ===
      if (guilds.includes('mages_guild')) {
        GuildSystem._updateMagesGuild(player.index, units, deltaSec, chargeTimers);
      }

      // === 机械行会：流水线协议 ===
      // （并行训练由 ProductionSystem 查询时处理）

      // === 炼金协会：药剂 buff 计时 ===
      if (guilds.includes('alchemists_society')) {
        GuildSystem._updateAlchemyBuffs(units, player.index, deltaSec);
      }

      // P0-6 修复：无论是否有炼金协会，所有单位的腐蚀弹debuff都需要衰减
      // （敌方对我方施加的腐蚀弹，我方即使没有炼金协会也要 tick 计时器）
      if (!guilds.includes('alchemists_society')) {
        // 只 tick 腐蚀 debuff（type === 'corrosion'），不处理己方的增益 buff
        for (const unit of units) {
          if (unit.owner !== player.index || !unit.isAlive) continue;
          if (unit.alchemyBuffType === 'corrosion' && unit.alchemyBuffTimer > 0) {
            unit.alchemyBuffTimer -= deltaSec;
            if (unit.alchemyBuffTimer <= 0) {
              unit.alchemyBuffTimer = 0;
              unit.alchemyBuffType = 'none';
              unit.alchemyBuffValue = 0;
            }
          }
        }
      }

      // === 虚空研究院：过载计时 ===
      if (guilds.includes('void_institute')) {
        GuildSystem._updateVoidOverloads(units, player.index, deltaSec);
      }
    }
  }

  // ========== 法师公会实现 ==========

  /** 奥术充能：充能积累 + 自动激活护盾 */
  private static _updateMagesGuild(
    playerIndex: number,
    units: Unit[],
    deltaSec: number,
    chargeTimers: Map<number, number>,
  ): void {
    let timer = chargeTimers.get(playerIndex) ?? 0;
    timer += deltaSec;

    if (timer >= CHARGE_INTERVAL) {
      timer -= CHARGE_INTERVAL;
      // 为所有法师公会单位充能
      for (const unit of units) {
        if (unit.owner !== playerIndex || !unit.isAlive) continue;
        if (!MAGE_GUILD_UNITS.has(unit.spriteKey)) continue;
        unit.abilityCharges = Math.min(unit.abilityCharges + 1, MAX_CHARGES);
      }
    }
    chargeTimers.set(playerIndex, timer);

    // Lv2 自动激活：HP<50% 时消耗2层充能激活临时护盾
    for (const unit of units) {
      if (unit.owner !== playerIndex || !unit.isAlive) continue;
      if (!MAGE_GUILD_UNITS.has(unit.spriteKey)) continue;
      if (unit.hpPercent < 0.5 && unit.abilityCharges >= 2 && unit.shieldHp <= 0) {
        unit.abilityCharges -= 2;
        unit.shieldHp = CHARGE_SHIELD_HP;
        unit.maxShieldHp = CHARGE_SHIELD_HP;

        EventBus.emit(GameEvent.ABILITY_USED, {
          unitId: unit.id,
          abilityId: 'arcane_shield_auto',
          playerIndex,
        });
      }
    }
  }

  // ========== 法师公会：主动技能 ==========
  // P2-D1 标注：magesChargeStrike / magesGroupShield / magesElementalSurge 当前无调用点，
  // 待技能 UI 命令链路接入后调用，暂保留实现。

  /** Lv1 单体附加伤害：消耗1层充能，下一次攻击 +50%，攻击后自动恢复 */
  static magesChargeStrike(unit: Unit): boolean {
    if (!unit.consumeCharge(1)) return false;
    // 保存原始攻击力
    if (!unit.baseAttackDamage) {
      unit.baseAttackDamage = unit.attackDamage;
    }
    unit.attackDamage = Math.round(unit.baseAttackDamage * 1.5);
    // P0-7 修复：记录充能打击次数（攻击后由 CombatSystem 自动恢复）
    ((unit as any)._chargeStrikeUses ?? 0);
    (unit as any)._chargeStrikeUses = ((unit as any)._chargeStrikeUses ?? 0) + 1;
    return true;
  }

  /** P0-7 修复：充能打击攻击后自动恢复（CombatSystem 每次攻击后调用） */
  static magesRestoreAfterAttack(unit: Unit): void {
    const uses = (unit as any)._chargeStrikeUses ?? 0;
    if (uses <= 0) return;
    (unit as any)._chargeStrikeUses = uses - 1;
    if ((unit as any)._chargeStrikeUses <= 0) {
      unit.attackDamage = unit.baseAttackDamage || unit.attackDamage;
      unit.baseAttackDamage = 0;
    }
  }

  /** Lv2 范围友军护盾：消耗2层充能，为周围友军添加护盾 */
  static magesGroupShield(
    unit: Unit,
    allUnits: Unit[],
    range: number = 5,
  ): boolean {
    if (!unit.consumeCharge(2)) return false;

    for (const ally of allUnits) {
      if (ally.owner !== unit.owner || !ally.isAlive) continue;
      const dx = ally.tileX - unit.tileX;
      const dy = ally.tileY - unit.tileY;
      if (Math.sqrt(dx * dx + dy * dy) <= range && ally.shieldHp <= 0) {
        ally.shieldHp = CHARGE_SHIELD_HP;
        ally.maxShieldHp = CHARGE_SHIELD_HP;
      }
    }
    return true;
  }

  /** Lv3 大范围AOE + 短暂眩晕：消耗3层充能 */
  static magesElementalSurge(
    unit: Unit,
    enemyUnits: Unit[],
    range: number = 8,
    damage: number = 80,
  ): boolean {
    if (!unit.consumeCharge(3)) return false;

    for (const enemy of enemyUnits) {
      if (enemy.owner === unit.owner || !enemy.isAlive) continue;
      const dx = enemy.tileX - unit.tileX;
      const dy = enemy.tileY - unit.tileY;
      if (Math.sqrt(dx * dx + dy * dy) <= range) {
        enemy.takeDamage(damage, 'magic');
        // 短暂眩晕：攻击计时器重置
        enemy.attackTimer = Math.max(enemy.attackTimer, 2.0);
      }
    }
    return true;
  }

  // ========== 机械行会实现 ==========

  /** 查询机械行会并行训练槽位数 */
  static getMechanistParallelSlots(
    building: Building,
    hasOptimizedTech: boolean,
  ): number {
    if (!PARALLEL_TRAIN_BUILDINGS.has(building.spriteKey)) return 1;
    return MECHANIST_PARALLEL_SLOTS;
  }

  /** 查询机械行会额外队列效率惩罚率 */
  static getMechanistPenalty(queueIndex: number, hasOptimizedTech: boolean): number {
    if (queueIndex === 0) return 0; // 第一条队列无惩罚
    const penalty = hasOptimizedTech ? TECH_OPTIMIZED_PENALTY : MECHANIST_PENALTY;
    return penalty * queueIndex;
  }

  // ========== 炼金协会实现 ==========

  /** 为单位施加炼金药剂效果 — P0-5/P1-R1 修复：铁皮药剂实时修改 armor 值
   *  P1-R1: 被腐蚀弹覆盖时也要恢复 ironskin 的护甲加成，防止护甲永久偏高 */
  static applyAlchemyPotion(
    unit: Unit,
    potion: AlchemyPotion,
  ): void {
    // P1-R1 修复：无论当前 buffType 是什么，只要单位曾有过 ironskin 且 armor 仍偏高，先恢复
    if (unit.hadIronskin && unit.armor !== unit.baseArmor) {
      unit.armor = unit.baseArmor;
    }
    unit.hadIronskin = false;

    // 同类型不叠加（GAME_DATA.md 规则）
    unit.alchemyBuffType = potion.effect;
    unit.alchemyBuffTimer = potion.duration;
    unit.alchemyBuffValue = potion.value;

    // 铁皮药剂：立即增加值护甲
    if (potion.effect === 'ironskin') {
      unit.armor = Math.round(unit.baseArmor * (1 + potion.value));
      unit.hadIronskin = true;
    }

    EventBus.emit(GameEvent.ABILITY_USED, {
      unitId: unit.id,
      abilityId: potion.id,
      playerIndex: unit.owner,
    });
  }

  /** 更新炼金 buff 倒计时 — P0-5 修复：铁皮药剂到期时恢复原始护甲 */
  private static _updateAlchemyBuffs(
    units: Unit[],
    playerIndex: number,
    deltaSec: number,
  ): void {
    for (const unit of units) {
      if (unit.owner !== playerIndex || !unit.isAlive) continue;
      if (unit.alchemyBuffTimer > 0) {
        unit.alchemyBuffTimer -= deltaSec;
        if (unit.alchemyBuffTimer <= 0) {
          unit.alchemyBuffTimer = 0;
          // 铁皮药剂到期 → 恢复原始护甲
          if (unit.alchemyBuffType === 'ironskin') {
            unit.armor = unit.baseArmor;
          }
          unit.hadIronskin = false;
          unit.alchemyBuffType = 'none';
          unit.alchemyBuffValue = 0;
        }
      }
    }
  }

  /** 查询单位的炼金 buff 对攻击的修正（乘法因子） */
  static getAlchemyDamageMult(unit: Unit): number {
    if (unit.alchemyBuffTimer <= 0) return 1.0;
    if (unit.alchemyBuffType === 'strength') {
      return 1.0 + unit.alchemyBuffValue; // 1.0 + 0.30 = 1.30
    }
    return 1.0;
  }

  /** 查询单位的炼金 buff 对护甲的修正（加法值） — P0-5 修复：接入伤害计算 */
  static getAlchemyArmorBonus(unit: Unit): number {
    if (unit.alchemyBuffTimer <= 0) return 0;
    if (unit.alchemyBuffType === 'ironskin') {
      return Math.round(unit.baseArmor * unit.alchemyBuffValue);
    }
    return 0;
  }

  /** P0-5 修复：获取单位当前有效护甲（含铁皮药剂加成），返回修正值 */
  static getEffectiveAlchemyArmorBonus(target: Unit): number {
    if (!(target instanceof Unit)) return 0;
    if (target.alchemyBuffTimer <= 0) return 0;
    if (target.alchemyBuffType === 'ironskin') {
      return Math.round(target.baseArmor * target.alchemyBuffValue);
    }
    return 0;
  }

  /** 查询单位的炼金 buff 对移速的修正 */
  static getAlchemySpeedMult(unit: Unit): number {
    if (unit.alchemyBuffTimer <= 0) return 1.0;
    if (unit.alchemyBuffType === 'swift') {
      return 1.0 + unit.alchemyBuffValue;
    }
    return 1.0;
  }

  /** 查询单位是否被腐蚀弹削弱护甲 */
  static getAlchemyCorrosionArmorPenalty(targetUnit: Unit): number {
    if (targetUnit.alchemyBuffTimer <= 0) return 0;
    if (targetUnit.alchemyBuffType === 'corrosion') {
      return targetUnit.alchemyBuffValue; // 减去护甲的30%
    }
    return 0;
  }

  // ========== 虚空研究院实现 ==========

  /** 为单位激活水晶过载 */
  static activateVoidOverload(
    unit: Unit,
    hasOptimizedTech: boolean,
  ): boolean {
    if (unit.isVoidOvercharged || !unit.isAlive) return false;

    unit.isVoidOvercharged = true;
    // P1-B5: record optimized state so getVoidOverload*/takeDamage apply +35% boost instead of +50%
    unit.isVoidOptimized = !!hasOptimizedTech;
    unit.voidOverloadTimer = hasOptimizedTech
      ? TECH_OVERLOAD_OPTIMIZED
      : VOID_OVERLOAD_DURATION;

    EventBus.emit(GameEvent.ABILITY_USED, {
      unitId: unit.id,
      abilityId: 'void_overload',
      playerIndex: unit.owner,
    });

    return true;
  }

  /** 更新虚空过载倒计时（过期后单位损毁） */
  private static _updateVoidOverloads(
    units: Unit[],
    playerIndex: number,
    deltaSec: number,
  ): void {
    for (const unit of units) {
      if (unit.owner !== playerIndex || !unit.isAlive) continue;
      if (!unit.isVoidOvercharged) continue;

      unit.voidOverloadTimer -= deltaSec;
      if (unit.voidOverloadTimer <= 0) {
        // 过载结束 → 单位损毁
        // P0-C3 修复：若单位是英雄，走 takeDamage 触发 reviveTimer（否则英雄永不复活）。
        // takeDamage 内部会设 isActive=false 并（Hero 覆写）启动复活倒计时 + 重置技能冷却。
        // 非英雄单位保持原直接销毁逻辑（避免触发 UNIT_KILLED 给敌方 XP，虚空过载是自毁不是被击杀）。
        if (unit instanceof Hero) {
          // 传 hp+shield+armor+100 确保穿透护盾与护甲后仍致死（takeDamage 会减伤）
          unit.takeDamage(unit.hp + unit.shieldHp + unit.armor + 100, 'void');
        } else {
          unit.hp = 0;
          unit.isActive = false;
        }
        unit.isVoidOvercharged = false;
        unit.voidOverloadTimer = 0;

        EventBus.emit(GameEvent.UNIT_DESTROYED, {
          unitId: unit.id,
          playerIndex,
          cause: 'void_overload_expired',
        });
        // P1-A4: hero self-destruct emits HERO_DIED for sound/HUD feedback
        if (unit instanceof Hero) {
          EventBus.emit(GameEvent.HERO_DIED, {
            unitId: unit.id,
            heroId: unit.spriteKey,
            playerIndex,
            killerId: '',
          });
        }
      }
    }
  }

  /** 查询虚空过载的攻击加成（乘法因子）— P0-4 修复：从 unit 自身读取优化状态 */
  static getVoidOverloadDamageMult(unit: Unit, _hasOptimizedTech = false): number {
    if (!unit.isVoidOvercharged || unit.voidOverloadTimer <= 0) return 1.0;
    const boost = (unit as any).isVoidOptimized ? TECH_OVERLOAD_BOOST_OPT : VOID_OVERLOAD_BOOST;
    return 1.0 + boost;
  }

  /** 查询虚空过载的移速加成 */
  static getVoidOverloadSpeedMult(unit: Unit, _hasOptimizedTech = false): number {
    if (!unit.isVoidOvercharged || unit.voidOverloadTimer <= 0) return 1.0;
    const boost = (unit as any).isVoidOptimized ? TECH_OVERLOAD_BOOST_OPT : VOID_OVERLOAD_BOOST;
    return 1.0 + boost;
  }

  /** 查询虚空过载的护甲加成 */
  static getVoidOverloadArmorMult(unit: Unit, _hasOptimizedTech = false): number {
    if (!unit.isVoidOvercharged || unit.voidOverloadTimer <= 0) return 1.0;
    const boost = (unit as any).isVoidOptimized ? TECH_OVERLOAD_BOOST_OPT : VOID_OVERLOAD_BOOST;
    return 1.0 + boost;
  }
}