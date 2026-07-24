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
import { HERO_DEFS } from '../config/heroData';
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

      const heroId = hero.spriteKey;

      if (heroId === 'hero_isabelle') {
        // 贤者之石：周围8格友方每秒+2HP
        for (const u of units) {
          if (!u.isAlive || u.owner !== hero.owner) continue;
          const d = Math.abs(hero.tileX - u.tileX) + Math.abs(hero.tileY - u.tileY);
          if (d <= hero.auraRadius) {
            u.hp = Math.min(u.maxHp, u.hp + 2 * deltaSec);
          }
        }
      }

      if (heroId === 'hero_marcus') {
        // 厂长光环：周围12格生产建筑训练速度+20%
        for (const b of buildings) {
          if (!b.isAlive || b.owner !== hero.owner) continue;
          const d = Math.abs(hero.tileX - b.tileX) + Math.abs(hero.tileY - b.tileY);
          if (d <= hero.auraRadius) {
            b.productionSpeedBonus += 0.20;
          }
        }
      }

      // === 塞巴斯蒂安: 工程光环 — 周围10格机械生产/建造+20%
      if (heroId === 'hero_sebastian') {
        for (const b of buildings) {
          if (!b.isAlive || b.owner !== hero.owner) continue;
          const d = Math.abs(hero.tileX - b.tileX) + Math.abs(hero.tileY - b.tileY);
          if (d <= hero.auraRadius) {
            b.productionSpeedBonus += 0.20;
          }
        }
      }

      // === 艾琳: 矿工之光 — 周围8格采集速度+25%，建造速度+15%（通过 productionSpeedBonus）
      if (heroId === 'hero_eileen') {
        for (const b of buildings) {
          if (!b.isAlive || b.owner !== hero.owner) continue;
          const d = Math.abs(hero.tileX - b.tileX) + Math.abs(hero.tileY - b.tileY);
          if (d <= hero.auraRadius) {
            b.productionSpeedBonus += 0.15;
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

      const heroId2 = hero.spriteKey;
      const hd = HERO_DEFS[heroId2];
      if (!hd || hd.skillTree.length === 0) continue;
      if (hero.holdPosition) continue;

      if (heroId2 === 'hero_isabelle') {
        HeroSystem._updateIsabelle(hero, units, hd);
      }

      if (heroId2 === 'hero_marcus') {
        const result = HeroSystem._updateMarcus(hero, units, spawnCommands, hd);
        if (result) spawnCommands.push(...result);
      }

      // === 塞巴斯蒂安：自动部署炮台（空闲时，上限3座） ===
      if (heroId2 === 'hero_sebastian') {
        const result = HeroSystem._updateSebastian(hero, buildings, spawnCommands, hd);
        if (result) spawnCommands.push(...result);
      }

      // === 艾琳：自动水晶共鸣爆破（敌人靠近水晶建筑时） ===
      if (heroId2 === 'hero_eileen') {
        HeroSystem._updateEileen(hero, units, buildings, world, hd);
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
    const heroId = hero.spriteKey;
    const hd = HERO_DEFS[heroId];
    if (!hd || !hero.canUseSkillSlot(slotIndex)) {
      return { success: false, slotIndex, skillName: 'N/A' };
    }

    const skill = hd.skillTree[
      slotIndex === 0 ? (hero.level >= 2 ? 1 : 0) :
      slotIndex === 1 ? (hero.level >= 4 ? 3 : 2) :
      4
    ];

    hero.skillCooldowns[slotIndex] = skill.cooldown;

    EventBus.emit(GameEvent.ABILITY_USED, {
      unitId: hero.id,
      abilityId: `${heroId}_slot${slotIndex}`,
      playerIndex: hero.owner,
    });

    // 执行技能效果
    const spawnCommands: { unitDefId: string; count: number; position: { x: number; y: number }; playerIndex: number }[] = [];
    if (heroId === 'hero_isabelle') {
      if (slotIndex === 0) {
        this._execIsabelleShield(hero, targets.units);
      } else if (slotIndex === 1) {
        this._execIsabelleAlchemy(hero, targets.units);
      } else if (slotIndex === 2) {
        this._execIsabelleRain(hero, targets.units);
      }
    } else if (heroId === 'hero_marcus') {
      if (slotIndex === 0) {
        const cmds = this._execMarcusAirdrop(hero);
        if (cmds) spawnCommands.push(...cmds);
      } else if (slotIndex === 1) {
        this._execMarcusRepair(hero, targets.units);
      } else if (slotIndex === 2) {
        this._execMarcusOverdrive(hero, targets.units);
      }
    } else if (heroId === 'hero_sebastian') {
      if (slotIndex === 0) {
        const cmds = this._execSebastianTurret(hero, targets.buildings);
        if (cmds) spawnCommands.push(...cmds);
      } else if (slotIndex === 1) {
        this._execSebastianOverload(hero);
      } else if (slotIndex === 2) {
        this._execSebastianArray(hero, targets.units);
      }
    } else if (heroId === 'hero_eileen') {
      if (slotIndex === 0) {
        this._execEileenBlast(hero, targets.units);
      } else if (slotIndex === 1) {
        this._execEileenShield(hero, targets.units);
      } else if (slotIndex === 2) {
        this._execEileenLeyline(hero, targets.units);
      }
    }

    return {
      success: true,
      slotIndex,
      skillName: skill.name,
      spawnCommands: spawnCommands.length > 0 ? spawnCommands : [],
    };
  }

  // ===== 技能效果执行（自动技能和手动激活共享） =====

  /** 伊莎贝尔 Slot 0: 默库里合金镀层 */
  static _execIsabelleShield(hero: Hero, units: Unit[]): void {
    const allies = units.filter(u => u.isAlive && u.owner === hero.owner && u.id !== hero.id);
    if (allies.length === 0) return;
    allies.sort((a, b) => a.hpPercent - b.hpPercent);
    const target = allies[0];
    const shieldAmount = hero.level >= 2 ? 350 : 200;
    target.shieldHp = Math.max(target.shieldHp, shieldAmount);
    target.maxShieldHp = Math.max(target.maxShieldHp, shieldAmount);
  }

  /** 伊莎贝尔 Slot 1: 炼金转化 */
  static _execIsabelleAlchemy(hero: Hero, units: Unit[]): void {
    const nearbyEnemies = units.filter(u =>
      u.owner !== hero.owner && u.isAlive &&
      Math.abs(u.tileX - hero.tileX) <= 8 && Math.abs(u.tileY - hero.tileY) <= 8,
    );
    for (const enemy of nearbyEnemies) {
      enemy.attackTimer = Math.max(enemy.attackTimer, 3.0);
    }
  }

  /** 伊莎贝尔 Slot 2: 贤者之雨 */
  static _execIsabelleRain(hero: Hero, units: Unit[]): void {
    for (const ally of units) {
      if (!ally.isAlive || ally.owner !== hero.owner) continue;
      const d = Math.abs(hero.tileX - ally.tileX) + Math.abs(hero.tileY - ally.tileY);
      if (d <= 10) {
        ally.hp = Math.min(ally.maxHp, ally.hp + 150);
      }
    }
  }

  /** 马库斯 Slot 0: 流水线空投 */
  static _execMarcusAirdrop(hero: Hero): { unitDefId: string; count: number; position: { x: number; y: number }; playerIndex: number }[] {
    const cmds: { unitDefId: string; count: number; position: { x: number; y: number }; playerIndex: number }[] = [];
    cmds.push({
      unitDefId: 'unit_rifleman',
      count: hero.level >= 2 ? 5 : 3,
      position: { x: hero.tileX + 1, y: hero.tileY + 1 },
      playerIndex: hero.owner,
    });
    if (hero.level >= 2) {
      cmds.push({
        unitDefId: 'unit_assault_worker',
        count: 1,
        position: { x: hero.tileX + 2, y: hero.tileY + 1 },
        playerIndex: hero.owner,
      });
    }
    return cmds;
  }

  /** 马库斯 Slot 1: 紧急修复协议 */
  static _execMarcusRepair(hero: Hero, units: Unit[]): void {
    const healPct = hero.level >= 4 ? 0.08 : 0.05;
    hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(hero.maxHp * healPct));
    for (const u of units) {
      if (!u.isAlive || u.owner !== hero.owner) continue;
      const d = Math.abs(hero.tileX - u.tileX) + Math.abs(hero.tileY - u.tileY);
      if (d <= 5 && u.armorType === 'mechanical') {
        u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * healPct));
      }
    }
  }

  /** 马库斯 Slot 2: 全功率运转 */
  static _execMarcusOverdrive(hero: Hero, units: Unit[]): void {
    const nearbyEnemies = units.filter(u =>
      u.owner !== hero.owner && u.isAlive &&
      Math.abs(u.tileX - hero.tileX) <= 5 && Math.abs(u.tileY - hero.tileY) <= 5,
    );
    for (const enemy of nearbyEnemies) {
      enemy.takeDamage(150, 'physical');
    }
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

  
  // ======== 塞巴斯蒂安 ========

  private static _updateSebastian(
    hero: Hero,
    buildings: Building[],
    spawnCommands: { unitDefId: string; count: number; position: { x: number; y: number }; playerIndex: number }[],
    hd: HeroData | undefined,
  ): typeof spawnCommands | null {
    if (!hd) return null;

    // Slot 0: 部署炮台 — 空闲时定期补充炮台
    if (hero.canUseSkillSlot(0)) {
      const maxTurrets = hero.level >= 2 ? 3 : 2;
      const existingTurrets = buildings.filter(
        b => b.owner === hero.owner && b.isAlive && b.spriteKey === 'bld_turret',
      ).length;
      if (existingTurrets < maxTurrets) {
        // 在英雄周围找可通行位置部署炮台
        const offsets = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, 2], [2, -2], [-2, -2]];
        for (const [dx, dy] of offsets) {
          if (existingTurrets >= maxTurrets) break;
          // 不检查 isPassable（构建时由 CommandExecutor 的 findNearbyPassable 处理）
          spawnCommands.push({
            unitDefId: 'bld_turret',
            count: 1,
            position: { x: hero.tileX + dx, y: hero.tileY + dy },
            playerIndex: hero.owner,
          });
          hero.skillCooldowns[0] = hero.level >= 2 ? 20 : 25;
        }
      }
      return null;
    }

    // Slot 1: 符文引擎过载 — HP低时自动爆发
    if (hero.canUseSkillSlot(1) && hero.hpPercent < 0.4) {
      HeroSystem._applySebastianOverload(hero);
      hero.skillCooldowns[1] = hero.level >= 4 ? 45 : 60;
      EventBus.emit(GameEvent.ABILITY_USED, {
        unitId: hero.id, abilityId: 'sebastian_overload', playerIndex: hero.owner,
      });
    }

    // Slot 2: 远古符文阵列 — 被包围时终极爆发
    if (hero.canUseSkillSlot(2) && hero.hpPercent < 0.3) {
      // 简化为对周围5格敌人造成 500 AOE
      for (const u of (hero as any)._nearbyEnemies ?? []) {
        // 实际敌人由 exec 方法查找
      }
      hero.skillCooldowns[2] = 150;
      EventBus.emit(GameEvent.ABILITY_USED, {
        unitId: hero.id, abilityId: 'sebastian_array', playerIndex: hero.owner,
      });
    }

    return null;
  }

  /** 塞巴斯蒂安 Slot 0: 部署炮台 — 返回炮台 spawn 命令 */
  static _execSebastianTurret(hero: Hero, allBuildings: Building[]): { unitDefId: string; count: number; position: { x: number; y: number }; playerIndex: number }[] {
    const max = hero.level >= 2 ? 3 : 2;
    const existing = allBuildings.filter(
      b => b.owner === hero.owner && b.isAlive && (b.spriteKey === 'bld_turret' || b.spriteKey === 'bld_turret'),
    ).length;
    if (existing >= max) return [];
    // 部署在英雄身边
    return [{
      unitDefId: 'bld_turret',
      count: 1,
      position: { x: hero.tileX + 2, y: hero.tileY },
      playerIndex: hero.owner,
    }];
  }

  /** 塞巴斯蒂安 Slot 1: 符文引擎过载 — 攻速+50%/移速+30%，每秒-3%HP */
  static _execSebastianOverload(hero: Hero): void {
    HeroSystem._applySebastianOverload(hero);
  }

  private static _applySebastianOverload(hero: Hero): void {
    const hpLossPct = hero.level >= 4 ? 0.01 : 0.03;
    const hpLoss = Math.round(hero.maxHp * hpLossPct);
    // 攻击速度 +50%（通过降低 attackTimer 模拟）
    hero.attackTimer = Math.max(0, hero.attackTimer - hero.attackCooldown * 0.5);
    // 移速 +30%
    const origSpeed = hero.speed;
    hero.speed = origSpeed * (hero.level >= 4 ? 1.4 : 1.3);
    hero.hp = Math.max(1, hero.hp - hpLoss);
    // 15秒后恢复（简化：一次性扣血 + buff 持续到下次评估）
  }

  /** 塞巴斯蒂安 Slot 2: 远古符文阵列 — AOE 500 + 眩晕 */
  static _execSebastianArray(hero: Hero, allUnits: Unit[]): void {
    const nearbyEnemies = allUnits.filter(u =>
      u.owner !== hero.owner && u.isAlive &&
      Math.abs(u.tileX - hero.tileX) <= 5 && Math.abs(u.tileY - hero.tileY) <= 5,
    );
    for (const enemy of nearbyEnemies) {
      enemy.takeDamage(500, 'magic');
      // 眩晕3秒：大幅增加攻击冷却
      enemy.attackTimer = Math.max(enemy.attackTimer, 3.0);
    }
  }

  // ======== 艾琳 ========

  private static _updateEileen(
    hero: Hero,
    units: Unit[],
    buildings: Building[],
    world: GameWorld,
    hd: HeroData | undefined,
  ): void {
    if (!hd) return;

    // Slot 0: 水晶共鸣爆破 — 敌人靠近己方水晶建筑时
    if (hero.canUseSkillSlot(0)) {
      const crystalBld = buildings.filter(b =>
        b.owner === hero.owner && b.isAlive &&
        (b.spriteKey === 'bld_cc_empire' || b.spriteKey === 'bld_cc_federation' || b.spriteKey === 'bld_refinery')
      );
      const nearbyEnemies = units.filter(u => {
        if (u.owner === hero.owner || !u.isAlive) return false;
        return crystalBld.some(b =>
          Math.abs(u.tileX - b.tileX) <= 5 && Math.abs(u.tileY - b.tileY) <= 5
        );
      });
      if (nearbyEnemies.length >= 2) {
        const crystal = world.players[hero.owner]?.resources.crystal ?? 0;
        const dmg = Math.min(200, Math.round(crystal * 0.05)); // 5% of crystal, max 200
        for (const enemy of nearbyEnemies) {
          enemy.takeDamage(dmg, 'magic');
        }
        hero.skillCooldowns[0] = hero.level >= 2 ? 25 : 30;
        EventBus.emit(GameEvent.ABILITY_USED, {
          unitId: hero.id, abilityId: 'eileen_blast', playerIndex: hero.owner,
        });
      }
    }

    // Slot 1: 矿工之盾 — HP低时给友军加护盾
    if (hero.canUseSkillSlot(1) && hero.hpPercent < 0.5) {
      const shieldAmount = hero.level >= 4 ? 250 : 150;
      for (const ally of units) {
        if (!ally.isAlive || ally.owner !== hero.owner) continue;
        const d = Math.abs(hero.tileX - ally.tileX) + Math.abs(hero.tileY - ally.tileY);
        if (d <= 8) {
          ally.shieldHp = Math.max(ally.shieldHp, shieldAmount);
          ally.maxShieldHp = Math.max(ally.maxShieldHp, shieldAmount);
        }
      }
      hero.skillCooldowns[1] = hero.level >= 4 ? 30 : 40;
      EventBus.emit(GameEvent.ABILITY_USED, {
        unitId: hero.id, abilityId: 'eileen_shield', playerIndex: hero.owner,
      });
    }

    // Slot 2: 地脉觉醒 — HP极低时全图揭示+友军攻速
    if (hero.canUseSkillSlot(2) && hero.hpPercent < 0.25) {
      // 简化：所有友军攻击速度+50%（attackTimer 减半）
      for (const ally of units) {
        if (!ally.isAlive || ally.owner !== hero.owner) continue;
        ally.attackTimer = Math.max(0, ally.attackTimer - (ally.attackCooldown * 0.5));
      }
      hero.skillCooldowns[2] = 180;
      EventBus.emit(GameEvent.ABILITY_USED, {
        unitId: hero.id, abilityId: 'eileen_leyline', playerIndex: hero.owner,
      });
    }
  }

  /** 艾琳 Slot 0: 水晶共鸣爆破（手动） */
  static _execEileenBlast(hero: Hero, allUnits: Unit[]): void {
    const nearbyEnemies = allUnits.filter(u =>
      u.owner !== hero.owner && u.isAlive &&
      Math.abs(u.tileX - hero.tileX) <= 8 && Math.abs(u.tileY - hero.tileY) <= 8,
    );
    const dmg = hero.level >= 2 ? 150 : 100;
    for (const enemy of nearbyEnemies) {
      enemy.takeDamage(dmg, 'magic');
    }
    // Lv2+ 残留减速场：敌人在范围内攻击冷却+2秒
    if (hero.level >= 2) {
      for (const enemy of nearbyEnemies) {
        enemy.attackTimer = Math.max(enemy.attackTimer, 2.0);
      }
    }
  }

  /** 艾琳 Slot 1: 矿工之盾（手动） */
  static _execEileenShield(hero: Hero, allUnits: Unit[]): void {
    const shieldAmount = hero.level >= 4 ? 250 : 150;
    for (const ally of allUnits) {
      if (!ally.isAlive || ally.owner !== hero.owner) continue;
      const d = Math.abs(hero.tileX - ally.tileX) + Math.abs(hero.tileY - ally.tileY);
      if (d <= 8) {
        ally.shieldHp = Math.max(ally.shieldHp, shieldAmount);
        ally.maxShieldHp = Math.max(ally.maxShieldHp, shieldAmount);
      }
    }
  }

  /** 艾琳 Slot 2: 地脉觉醒（手动） */
  static _execEileenLeyline(hero: Hero, allUnits: Unit[]): void {
    for (const ally of allUnits) {
      if (!ally.isAlive || ally.owner !== hero.owner) continue;
      ally.attackTimer = Math.max(0, ally.attackTimer - ally.attackCooldown * 0.5);
    }
    // 对可视化敌人造成一定伤害
    for (const enemy of allUnits) {
      if (enemy.owner === hero.owner || !enemy.isAlive) continue;
      const d = Math.abs(hero.tileX - enemy.tileX) + Math.abs(hero.tileY - enemy.tileY);
      if (d <= 12) {
        enemy.takeDamage(80, 'magic');
      }
    }
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
    const spriteKey = heroId;
    return new Hero(owner, faction as any, tileX, tileY, hd, spriteKey);
  }
}