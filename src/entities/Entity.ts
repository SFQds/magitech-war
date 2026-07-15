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
  /** 护盾生命值（奥术守卫等有护盾的单位） */
  shieldHp: number = 0;
  maxShieldHp: number = 0;
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

  /** 受到伤害，返回是否死亡。damageType 用于虚空穿透护甲。
   * P0-5 修复：有效护甲 = baseArmor + 铁皮药剂加成（减去虚空/腐蚀穿透后） */
  takeDamage(amount: number, damageType?: string): boolean {
    if (!this.isActive) return false;
    let remaining = amount;
    // 护盾优先吸收伤害
    if (this.shieldHp > 0) {
      if (remaining <= this.shieldHp) {
        this.shieldHp -= remaining;
        remaining = 0;
      } else {
        remaining -= this.shieldHp;
        this.shieldHp = 0;
      }
    }
    // 虚空伤害穿透50%护甲
    const effectiveArmor = damageType === 'void' ? Math.floor(this.armor * 0.5) : this.armor;
    const final = Math.max(1, remaining - effectiveArmor);
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