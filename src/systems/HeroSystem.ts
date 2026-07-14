/**
 * 英雄系统 — 被动光环 + 5级技能树 + 复活 + XP分配
 *
 * 技能槽位：
 * - slot 0: Lv1 主动①, Lv2 升级
 * - slot 1: Lv3 主动②, Lv4 升级
 * - slot 2: Lv5 终极技能
 */

import { Hero } from '../entities/Hero';
import type { HeroData } from '../entities/Hero';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import type { GameWorld } from '../core/GameWorld';
import { HERO_DEFS, getFactionHero } from '../config/heroData';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';

/** 技能激活结果 */
export interface SkillActivationResult {
  success: boolean;
  slotIndex: number;
  skillName: string;
  /** 派生指令（如马库斯空投的 spawn 命令） */
  spawnCommands?: { unitDefId: string; count: number; position: { x: number; y: number }; playerIndex: number }[];
}

export class HeroSystem {
  /** 更新所有英雄：被动光环 + 技能冷却 + 复活计时器 */
  static update(
    heroes: Hero[],
    units: Unit[],
    buildings: Building[],
    world: GameWorld,
    deltaSec: number,
  ): { spawnCommands: { unitDefId: string; count: number; position: { x: number; y: number }; playerIndex: number }[] } {
    // 每帧重置所有建筑的临时生产加速 buff
    for (const b of buildings) {
      b.productionSpeedBonus = 0;
    }

    // === 被动光环 ===
    for (const hero of heroes) {
      if (!hero.isAlive) continue;

      if (hero.spriteKey === 'hero:isabelle') {
        // 贤者之石：周围8格友方每秒+2HP
        for (const u of units) {
          if (!u.isAlive || u.owner !== hero.owner) continue;
          const d = Math.abs(hero.tileX - u.tileX) + Math.abs(hero.tileY - u.tileY);
          if (d <= hero.auraRadius) {
            u.hp = Math.min(u.maxHp, u.hp + 2 * deltaSec);
          }
        }
      }

      if (hero.spriteKey === 'hero:marcus') {
        // 厂长光环：周围12格生产建筑训练速度+20%
        for (const b of buildings) {
          if (!b.isAlive || b.owner !== hero.owner) continue;
          const d = Math.abs(hero.tileX - b.tileX) + Math.abs(hero.tileY - b.tileY);
          if (d <= 12) { // 马库斯光环12格
            b.productionSpeedBonus = 0.20;
          }
        }
      }
    }

    // === 复活计时器 + 技能冷却 ===
    for (const hero of heroes) {
      if (!hero.isAlive) {
        // 复活倒计时
        if (hero.reviveTimer > 0) {
          hero.reviveTimer -= deltaSec;
          if (hero.reviveTimer <= 0) {
            hero.reviveTimer = -1; // 就绪
          }
        }
        continue;
      }

      // 技能冷却推进
      hero.skillCooldown = Math.max(0, hero.skillCooldown - deltaSec);
      for (let i = 0; i < hero.skillCooldowns.length; i++) {
        hero.skillCooldowns[i] = Math.max(0, hero.skillCooldowns[i] - deltaSec);
      }
    }

    // === 自动技能（AI 和玩家都适用） ===
    const spawnCommands: { unitDefId: string; count: number; position: { x: number; y: number }; playerIndex: number }[] = [];

    for (const hero of heroes) {
      if (!hero.isAlive) continue;

      const hd = HERO_DEFS[hero.spriteKey];
      if (!hd || hd.skillTree.length === 0) continue;

      // === 伊莎贝尔：自动给最弱友军加护盾 ===
      if (hero.spriteKey === 'hero:isabelle') {
        HeroSystem._updateIsabelle(hero, units, hd);
      }

      // === 马库斯：自动空投（兵力不足时） ===
      if (hero.spriteKey === 'hero:marcus') {
        const result = HeroSystem._updateMarcus(hero, units, spawnCommands, hd);
        if (result) spawnCommands.push(...result);
      }
    }

    return { spawnCommands };
  }

  // ===== 伊莎贝尔自动技能 =====

  private static _updateIsabelle(hero: Hero, units: Unit[], hd: HeroData | undefined): void {
    if (!hd) return;

    // Slot 0: 默库里合金镀层 — 自动给 HP 最低的友军
    if (hero.canUseSkillSlot(0)) {
      const allies = units.filter(u => u.isAlive && u.owner === hero.owner && u.id !== hero.id);
      if (allies.length > 0) {
        allies.sort((a, b) => a.hpPercent - b.hpPercent);
        const target = allies[0];
        if (target.hpPercent < 0.6) {
          const shieldAmount = hero.level >= 2 ? 350 : 200;
          target.shieldHp = Math.max(target.shieldHp, shieldAmount);
          target.maxShieldHp = Math.max(target.maxShieldHp, shieldAmount);
          hero.skillCooldowns[0] = hero.level >= 2 ? 25 : 30;
          EventBus.emit(GameEvent.ABILITY_USED, {
            unitId: hero.id, abilityId: 'isabelle_shield', playerIndex: hero.owner,
          });
        }
      }
    }

    // Slot 1: 炼金转化 — 大量敌人靠近时自动释放
    if (hero.canUseSkillSlot(1)) {
      const nearbyEnemies = units.filter(u =>
        u.owner !== hero.owner && u.isAlive &&
        Math.abs(u.tileX - hero.tileX) <= 8 && Math.abs(u.tileY - hero.tileY) <= 8,
      );
      if (nearbyEnemies.length >= 3) {
        // 炼金转化：范围内敌方投射物减速（简化：所有敌人攻击冷却 +3秒）
        for (const enemy of nearbyEnemies) {
          enemy.attackTimer = Math.max(enemy.attackTimer, 3.0);
        }
        hero.skillCooldowns[1] = hero.level >= 4 ? 45 : 60;
        EventBus.emit(GameEvent.ABILITY_USED, {
          unitId: hero.id, abilityId: 'isabelle_alchemy', playerIndex: hero.owner,
        });
      }
    }

    // Slot 2: 贤者之雨 — HP 非常低时终极治疗
    if (hero.canUseSkillSlot(2) && hero.hpPercent < 0.35) {
      for (const ally of units) {
        if (!ally.isAlive || ally.owner !== hero.owner) continue;
        const d = Math.abs(hero.tileX - ally.tileX) + Math.abs(hero.tileY - ally.tileY);
        if (d <= 10) {
          ally.hp = Math.min(ally.maxHp, ally.hp + 150);
        }
      }
      hero.skillCooldowns[2] = 120;
      EventBus.emit(GameEvent.ABILITY_USED, {
        unitId: hero.id, abilityId: 'isabelle_rain', playerIndex: hero.owner,
      });
    }
  }

  // ===== 马库斯自动技能 =====

  private static _updateMarcus(
    hero: Hero,
    units: Unit[],
    spawnCommands: { unitDefId: string; count: number; position: { x: number; y: number }; playerIndex: number }[],
    hd: HeroData | undefined,
  ): typeof spawnCommands | null {
    if (!hd) return null;

    // Slot 0: 流水线空投 — 兵力不足时自动补充
    if (hero.canUseSkillSlot(0)) {
      const rifleCount = units.filter(
        u => u.owner === hero.owner && u.isAlive && u.spriteKey === 'unit_rifleman',
      ).length;
      if (rifleCount < 6) {
        const count = hero.level >= 2 ? 5 : 3;
        spawnCommands.push({
          unitDefId: 'unit_rifleman',
          count,
          position: { x: hero.tileX + 1, y: hero.tileY + 1 },
          playerIndex: hero.owner,
        });
        if (hero.level >= 2) {
          spawnCommands.push({
            unitDefId: 'unit_assault_worker',
            count: 1,
            position: { x: hero.tileX + 2, y: hero.tileY + 1 },
            playerIndex: hero.owner,
          });
        }
        hero.skillCooldowns[0] = hero.level >= 2 ? 30 : 35;
        EventBus.emit(GameEvent.ABILITY_USED, {
          unitId: hero.id, abilityId: 'marcus_airdrop', playerIndex: hero.owner,
        });
        return null; // 已发射 spawn 指令
      }
    }

    // Slot 1: 紧急修复协议 — HP 低时自修
    if (hero.canUseSkillSlot(1)) {
      if (hero.hpPercent < 0.45) {
        const healPct = hero.level >= 4 ? 0.08 : 0.05;
        const healAmount = Math.round(hero.maxHp * healPct);
        hero.hp = Math.min(hero.maxHp, hero.hp + healAmount);
        // 也修复周围机械单位
        for (const u of units) {
          if (!u.isAlive || u.owner !== hero.owner) continue;
          const d = Math.abs(hero.tileX - u.tileX) + Math.abs(hero.tileY - u.tileY);
          if (d <= 5 && u.armorType === 'mechanical') {
            u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * healPct));
          }
        }
        hero.skillCooldowns[1] = hero.level >= 4 ? 40 : 50;
        EventBus.emit(GameEvent.ABILITY_USED, {
          unitId: hero.id, abilityId: 'marcus_repair', playerIndex: hero.owner,
        });
      }
    }

    // Slot 2: 全功率运转 — 被包围时终极爆发
    if (hero.canUseSkillSlot(2)) {
      const nearbyEnemies = units.filter(u =>
        u.owner !== hero.owner && u.isAlive &&
        Math.abs(u.tileX - hero.tileX) <= 5 && Math.abs(u.tileY - hero.tileY) <= 5,
      );
      if (nearbyEnemies.length >= 3 && hero.hpPercent < 0.5) {
        // 攻击翻倍 + 溅射（简化：对周围所有敌人造成一次AOE伤害）
        for (const enemy of nearbyEnemies) {
          enemy.takeDamage(150, 'physical');
        }
        hero.skillCooldowns[2] = 200;
        EventBus.emit(GameEvent.ABILITY_USED, {
          unitId: hero.id, abilityId: 'marcus_overdrive', playerIndex: hero.owner,
        });
      }
    }

    return null;
  }

  // ===== 手动技能激活（供 HUD 按钮调用） =====

  /** 玩家手动激活英雄技能 */
  static activateSkill(
    hero: Hero,
    slotIndex: number,
    targets: { units: Unit[]; buildings: Building[] },
  ): SkillActivationResult {
    const hd = HERO_DEFS[hero.spriteKey];
    if (!hd || !hero.canUseSkillSlot(slotIndex)) {
      return { success: false, slotIndex, skillName: 'N/A' };
    }

    const skill = hd.skillTree[
      slotIndex === 0 ? (hero.level >= 2 ? 1 : 0) :  // 槽位0→Lv1或Lv2版本
      slotIndex === 1 ? (hero.level >= 4 ? 3 : 2) :  // 槽位1→Lv3或Lv4版本
      4  // 槽位2→Lv5终极
    ];

    const cooldown = skill.cooldown;
    hero.skillCooldowns[slotIndex] = cooldown;

    EventBus.emit(GameEvent.ABILITY_USED, {
      unitId: hero.id,
      abilityId: `${hero.spriteKey}_slot${slotIndex}`,
      playerIndex: hero.owner,
    });

    return {
      success: true,
      slotIndex,
      skillName: skill.name,
      spawnCommands: [],
    };
  }

  /** 获取技能槽位对应的技能信息（供 HUD 显示） */
  static getSkillInfo(hero: Hero, slotIndex: number): {
    name: string;
    cooldown: number;
    currentCooldown: number;
    description: string;
    available: boolean;
    unlocked: boolean;
  } | null {
    const hd = HERO_DEFS[hero.spriteKey];
    if (!hd || hd.skillTree.length === 0) return null;

    const unlocked = hero.hasSkillSlot(slotIndex);
    const skillIdx = slotIndex === 0 ? (hero.level >= 2 ? 1 : 0)
      : slotIndex === 1 ? (hero.level >= 4 ? 3 : 2)
      : 4;
    const skill = hd.skillTree[skillIdx];

    return {
      name: skill.name,
      cooldown: skill.cooldown,
      currentCooldown: hero.skillCooldowns[slotIndex] ?? 0,
      description: skill.description,
      available: hero.canUseSkillSlot(slotIndex),
      unlocked,
    };
  }

  /** 训练英雄：从主基地生成 */
  static trainHero(
    heroId: string,
    owner: number,
    faction: string,
    tileX: number,
    tileY: number,
  ): Hero | null {
    const hd = HERO_DEFS[heroId];
    if (!hd) return null;
    const spriteKey = heroId.replace(':', '_');
    return new Hero(owner, faction as any, tileX, tileY, hd, spriteKey);
  }
}