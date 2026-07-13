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

    // 每帧重置所有建筑的临时生产加速 buff
    for (const b of buildings) {
      b.productionSpeedBonus = 0;
    }

    // === 被动光环（独立循环，先算完所有英雄的被动） ===
    for (const hero of heroes) {
      if (!hero.isAlive) continue;
      if (hero.spriteKey === 'hero:isabelle') {
        for (const u of units) {
          if (!u.isAlive || u.owner !== hero.owner) continue;
          const d = Math.abs(hero.tileX - u.tileX) + Math.abs(hero.tileY - u.tileY);
          if (d <= hero.auraRadius) {
            u.hp = Math.min(u.maxHp, u.hp + 2 * deltaSec);
          }
        }
      }
      if (hero.spriteKey === 'hero:marcus') {
        for (const b of buildings) {
          if (!b.isAlive || b.owner !== hero.owner) continue;
          const d = Math.abs(hero.tileX - b.tileX) + Math.abs(hero.tileY - b.tileY);
          if (d <= hero.auraRadius) {
            b.productionSpeedBonus = 0.20;
          }
        }
      }
    }

    // === 复活计时器 + 技能冷却 + 主动技能 ===
    for (const hero of heroes) {
      if (!hero.isAlive) {
        hero.reviveTimer -= deltaSec;
        if (hero.reviveTimer <= 0 && hero.reviveTimer !== -1) {
          hero.reviveTimer = -1; // 标记为已就绪（GameScene 轮询处理）
        }
        continue;
      }

      if (hero.skillCooldown > 0) {
        hero.skillCooldown -= deltaSec;
      }

      const hd = HERO_DEFS[hero.spriteKey];
      if (!hd) continue;

      if (!hero.canUseSkill) continue;

      if (hero.spriteKey === 'hero:isabelle') {
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