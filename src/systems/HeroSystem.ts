/**
 * 英雄系统 — 被动光环 + 主动技能 + 复活
 */

import { Hero } from '../entities/Hero';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import type { GameWorld } from '../core/GameWorld';
import { HERO_DEFS, getFactionHero } from '../config/heroData';
import type { AnyCommand } from '../types/commands';

export class HeroSystem {
  /** 更新所有英雄：被动光环 + 技能冷却 + 复活计时器 */
  static update(
    heroes: Hero[],
    units: Unit[],
    buildings: Building[],
    world: GameWorld,
    deltaSec: number,
  ): AnyCommand[] {
    const commands: AnyCommand[] = [];

    for (const hero of heroes) {
      if (!hero.isAlive) {
        // 复活倒计时
        hero.reviveTimer -= deltaSec;
        if (hero.reviveTimer <= 0 && hero.reviveTimer > -999) {
          hero.reviveTimer = -999; // 已就绪待复活
        }
        continue;
      }

      // 技能冷却
      if (hero.skillCooldown > 0) {
        hero.skillCooldown -= deltaSec;
      }

      const hd = HERO_DEFS[hero.spriteKey];
      if (!hd) continue;

      // === 被动光环 ===
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
        // 已通过 PassiveBonus 概念预留，实际由 faction 生产加成覆盖
      }

      // === 主动技能自动施放 ===
      if (!hero.canUseSkill) continue;

      if (hero.spriteKey === 'hero:isabelle') {
        // 伊莎贝尔：自动给最低血量的友方单位套护盾
        const allies = units.filter(u => u.isAlive && u.owner === hero.owner && u.id !== hero.id);
        if (allies.length > 0) {
          allies.sort((a, b) => a.hpPercent - b.hpPercent);
          const target = allies[0];
          if (target.hpPercent < 0.6) {
            target.shieldHp = Math.max(target.shieldHp, 200);
            target.maxShieldHp = Math.max(target.maxShieldHp, 200);
            hero.skillCooldown = hd.active.cooldown;
          }
        }
      }

      if (hero.spriteKey === 'hero:marcus') {
        // 马库斯：自动空投——在英雄位置周围生成3个步枪兵
        // 由 GameScene 监听 UNIT_CREATED 事件处理
        if (units.filter(u => u.owner === hero.owner && u.isAlive && u.spriteKey === 'unit_rifleman').length < 6) {
          commands.push({
            type: 'spawn',
            playerIndex: hero.owner,
            unitIds: [],
            unitDefId: 'unit_rifleman',
            count: 3,
            position: { x: hero.tileX + 1, y: hero.tileY + 1 },
            frame: 0,
          } as any);
          hero.skillCooldown = hd.active.cooldown;
        }
      }
    }

    return commands;
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
    // spriteKey 用下划线代替冒号（PNG 文件命名限制）
    const spriteKey = heroId.replace(':', '_');
    return new Hero(owner, faction as any, tileX, tileY, hd, spriteKey);
  }
}