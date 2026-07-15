/**
 * 弹射物控制器 — 生成、追踪、命中处理
 */
import Phaser from 'phaser';
import { Projectile } from '../entities/Projectile';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { CombatSystem } from '../systems/CombatSystem';
import { GuildSystem } from '../systems/GuildSystem';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { tileToWorld } from '../utils/MathUtils';

interface ProjSpriteEntry { projectileId: string; sprite: Phaser.GameObjects.Image; }

export class ProjectileController {
  private scene: Phaser.Scene;
  private projectiles: Projectile[] = [];
  private sprites: Map<string, Phaser.GameObjects.Image> = new Map();

  constructor(scene: Phaser.Scene) { this.scene = scene; }

  get list(): Projectile[] { return this.projectiles; }

  spawn(attacker: Unit, targetId: string, damage: number, effectKey: string, corrosionPenalty = 0, rawDamage?: number): void {
    const proj = new Projectile(attacker.owner, attacker.faction,
      attacker.tileX, attacker.tileY, attacker.id, targetId,
      15, damage, attacker.attackType, true);
    proj.corrosionPenalty = corrosionPenalty;
    // P0-6：保存原始伤害（未乘矩阵），供 AOE 溅射计算使用
    proj.rawDamage = rawDamage ?? damage;
    this.projectiles.push(proj);

    const texKey = this.scene.textures.exists(effectKey) ? effectKey : '__DEFAULT';
    const w = tileToWorld(proj.tileX, proj.tileY);
    const img = this.scene.add.image(w.x, w.y, texKey);
    img.setDepth(20);
    this.sprites.set(proj.id, img);
  }

  update(
    deltaSec: number,
    unitMap: Map<string, Unit>,
    buildingMap: Map<string, Building>,
    units: Unit[],
    buildings: Building[],
    flashTimers: Map<string, number>,
  ): void {
    const toRemove: string[] = [];

    for (const proj of this.projectiles) {
      if (!proj.isActive) continue;
      const target = unitMap.get(proj.targetId) ?? buildingMap.get(proj.targetId);
      if (!target || !target.isAlive) {
        proj.isActive = false; toRemove.push(proj.id); continue;
      }

      const dx = target.tileX - proj.tileX;
      const dy = target.tileY - proj.tileY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.3) {
        // 应用腐蚀弹护甲扣减（远程弹道）
        const savedArmor = target.armor;
        if (proj.corrosionPenalty > 0 && target instanceof Unit) {
          target.armor = Math.max(0, target.armor - proj.corrosionPenalty);
        }
        target.takeDamage(proj.damage, proj.damageType);
        if (savedArmor !== target.armor) target.armor = savedArmor; // 恢复
        proj.isActive = false; toRemove.push(proj.id);
        flashTimers.set(proj.targetId, 0.12);

        if (!target.isAlive) {
          flashTimers.delete(proj.targetId);
          const owner = target.owner;
          EventBus.emit(GameEvent.UNIT_KILLED, { unitId: target.id, killerId: proj.sourceId, playerIndex: owner });
          for (const unit of units) {
            if (unit.targetEntityId === proj.targetId) unit.stopAttacking();
          }
          // P1-N1 修复：击杀者自身也清除目标（远程单位击杀后应重新索敌，而非卡在 pursuing）
          const attacker = unitMap.get(proj.sourceId);
          if (attacker && attacker.targetEntityId === proj.targetId) {
            attacker.stopAttacking();
          }
        }

        // 掷弹兵AOE溅射
        const attackerUnit = unitMap.get(proj.sourceId);
        if (attackerUnit && attackerUnit.spriteKey === 'unit_grenadier') {
          // P0-6 修复：排除主目标（不被AOE溅射二次伤害）+ 使用原始伤害（避免矩阵二次乘法）
          const aoeEvents = CombatSystem.calculateAOE(
            target.tileX, target.tileY, 2, Math.round((proj.rawDamage ?? proj.damage) * 0.5),
            proj.damageType, proj.owner, attackerUnit.faction,
            units, buildings, target.id);
          for (const ae of aoeEvents) {
            flashTimers.set(ae.targetId, 0.12);
            if (ae.targetDied) {
              flashTimers.delete(ae.targetId);
              EventBus.emit(GameEvent.UNIT_KILLED, {
                unitId: ae.targetId, killerId: proj.sourceId,
                playerIndex: ae.playerIndex ?? 1,
              });
            }
          }
        }
      } else {
        const move = Math.min(proj.speed * deltaSec, dist * 0.95);
        const ratio = move / dist;
        proj.tileX += dx * ratio;
        proj.tileY += dy * ratio;
      }

      const sprite = this.sprites.get(proj.id);
      if (sprite) {
        const w = tileToWorld(proj.tileX, proj.tileY);
        sprite.setPosition(w.x, w.y);
        sprite.setRotation(Math.atan2(dy, dx));
      }
    }

    for (const id of toRemove) {
      const idx = this.projectiles.findIndex(p => p.id === id);
      if (idx !== -1) {
        // swap-with-last O(1) 替代 splice O(N)
        this.projectiles[idx] = this.projectiles[this.projectiles.length - 1];
        this.projectiles.pop();
      }
      const s = this.sprites.get(id);
      if (s) { s.destroy(); this.sprites.delete(id); }
    }
  }

  destroy(): void {
    for (const [, s] of this.sprites) s.destroy();
    this.sprites.clear();
    this.projectiles = [];
  }
}