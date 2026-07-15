/**
 * 投射物 — 飞行中的攻击/法术效果
 *
 * 生命周期极短，适合使用 ObjectPool
 */

import type { FactionId, DamageType } from '../types/data';
import { Entity } from './Entity';

export class Projectile extends Entity {
  sourceId: string;
  targetId: string;
  speed: number;             // tiles/s
  damage: number;
  /** AOE 溅射原始伤害（未乘矩阵，用于 calculateAOE 内部矩阵计算）*/
  rawDamage: number = 0;
  damageType: DamageType;
  isHoming: boolean;         // 是否追踪目标
  /** 炼金腐蚀弹护甲扣减值（命中时应用） */
  corrosionPenalty: number = 0;

  constructor(
    owner: number,
    faction: FactionId,
    tileX: number,
    tileY: number,
    sourceId: string,
    targetId: string,
    speed: number,
    damage: number,
    damageType: DamageType,
    isHoming = true
  ) {
    // 投射物用小写命中判定，HP 为 1（命中即销毁）
    super(owner, faction, tileX, tileY, 1, 'light', 'projectile', 'proj');
    this.sourceId = sourceId;
    this.targetId = targetId;
    this.speed = speed;
    this.damage = damage;
    this.damageType = damageType;
    this.isHoming = isHoming;
  }

  /** 重置投射物状态（ObjectPool 复用） */
  reset(
    owner: number,
    faction: FactionId,
    tileX: number,
    tileY: number,
    sourceId: string,
    targetId: string,
    damage: number,
    damageType: DamageType
  ): void {
    this.owner = owner;
    this.faction = faction;
    this.tileX = tileX;
    this.tileY = tileY;
    this.hp = 1;
    this.isActive = true;
    this.sourceId = sourceId;
    this.targetId = targetId;
    this.damage = damage;
    this.damageType = damageType;
  }
}