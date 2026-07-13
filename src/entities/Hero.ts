/**
 * 英雄 — 特殊战斗单位，具有等级、技能和复活机制
 */

import type { FactionId, DamageType, ArmorType } from '../types/data';
import { Unit } from './Unit';

export interface HeroSkillDef {
  name: string;
  cooldown: number;
  description: string;
}

export interface HeroData {
  displayName: string;
  title: string;
  faction: FactionId;
  stats: {
    hp: number;
    armor: ArmorType;
    speed: number;
    damage: number;
    dmgType: DamageType;
    range: number;
    cooldown: number;
    sight: number;
  };
  /** 被动技能效果描述 */
  passive: string;
  /** 主动技能 */
  active: HeroSkillDef;
  /** 复活冷却（秒） */
  reviveCooldown: number;
  /** 训练消耗 */
  cost: { crystal: number; supply: number; time: number };
  /** 基础护甲值 */
  armorValue?: number;
}

export class Hero extends Unit {
  heroName: string;
  title: string;
  level: number = 1;
  maxLevel: number = 3;
  /** 经验值 */
  xp: number = 0;
  /** 主动技能冷却计时器 */
  skillCooldown: number = 0;
  /** 复活剩余时间（0=存活，>0=倒计时中，-1=就绪待复活） */
  reviveTimer: number = 0;
  /** 被动光环半径（tile） */
  auraRadius: number = 8;

  constructor(
    owner: number,
    faction: FactionId,
    tileX: number,
    tileY: number,
    heroData: HeroData,
    spriteKey: string,
  ) {
    const s = heroData.stats;
    super(owner, faction, tileX, tileY, s.hp, s.armor, 'infantry',
      s.speed, s.damage, s.dmgType, s.range, s.cooldown, s.sight,
      spriteKey, []);
    this.heroName = heroData.displayName;
    this.title = heroData.title;
    this.armor = heroData.armorValue ?? 0;
    this.reviveCooldown = heroData.reviveCooldown;
    this.supplyCost = heroData.cost.supply;
  }

  private reviveCooldown!: number;

  /** 覆写受伤逻辑：死亡时启动复活冷却 */
  takeDamage(amount: number, damageType?: string): boolean {
    const died = super.takeDamage(amount, damageType);
    if (died) {
      this.reviveTimer = this.reviveCooldown;
    }
    return died;
  }

  /** 获得经验 */
  gainXp(amount: number): boolean {
    this.xp += amount;
    const needed = this.level * 100;
    if (this.xp >= needed && this.level < this.maxLevel) {
      this.xp -= needed;
      this.level++;
      this.maxHp = Math.round(this.maxHp * 1.15);
      this.hp = Math.min(this.hp + 50, this.maxHp);
      this.attackDamage = Math.round(this.attackDamage * 1.1);
      return true; // 升级了
    }
    return false;
  }

  /** 是否可使用主动技能 */
  get canUseSkill(): boolean {
    return this.skillCooldown <= 0 && this.isAlive;
  }
}