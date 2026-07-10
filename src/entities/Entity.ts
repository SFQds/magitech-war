/**
 * 实体基类 — 所有游戏对象的基础
 *
 * 管理 ID、位置、生命值、精灵引用等通用属性
 */

import type { FactionId } from '../types/data';
import type { ArmorType } from '../types/data';
import { generateId } from '../utils/MathUtils';

export abstract class Entity {
  readonly id: string;
  owner: number;           // player index
  faction: FactionId;
  tileX: number;
  tileY: number;
  hp: number;
  maxHp: number;
  armorType: ArmorType;
  /** 固定减伤值（科技/技能叠加） */
  armor: number = 0;
  isActive: boolean;
  spriteKey: string;

  /** Phaser 精灵引用（由渲染层管理） */
  sprite: Phaser.GameObjects.Sprite | null = null;

  constructor(
    owner: number,
    faction: FactionId,
    tileX: number,
    tileY: number,
    maxHp: number,
    armorType: ArmorType,
    spriteKey: string,
    idPrefix = 'entity'
  ) {
    this.id = generateId(idPrefix);
    this.owner = owner;
    this.faction = faction;
    this.tileX = tileX;
    this.tileY = tileY;
    this.hp = maxHp;
    this.maxHp = maxHp;
    this.armorType = armorType;
    this.isActive = true;
    this.spriteKey = spriteKey;
  }

  /** 受到伤害，返回是否死亡 */
  takeDamage(amount: number): boolean {
    if (!this.isActive) return false;
    // 护甲减伤（至少造成1点伤害）
    const final = Math.max(1, amount - this.armor);
    this.hp -= final;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isActive = false;
      return true; // 已死亡
    }
    return false;
  }

  /** 恢复生命 */
  heal(amount: number): void {
    if (!this.isActive) return;
    this.hp = Math.min(this.hp + amount, this.maxHp);
  }

  /** 是否存活 */
  get isAlive(): boolean {
    return this.isActive && this.hp > 0;
  }

  /** 生命百分比 */
  get hpPercent(): number {
    return this.hp / this.maxHp;
  }
}