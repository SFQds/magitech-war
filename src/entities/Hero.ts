/**
 * 英雄 — 特殊战斗单位，具有等级、技能和复活机制
 */

import type { FactionId, DamageType, ArmorType } from '../types/data';
import { Unit } from './Unit';

export interface HeroSkillDef {
  name: string;
  cooldown: number;
  description: string;
  /** 技能参数（由 HeroSystem 读取执行） */
  params?: Record<string, number>;
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
  /** 主动技能（旧版兼容） */
  active: HeroSkillDef;
  /** 技能树：5级渐进解锁 [Lv1, Lv2, Lv3, Lv4, Lv5] */
  skillTree: HeroSkillDef[];
  /** 复活冷却（秒） */
  reviveCooldown: number;
  /** 训练消耗 */
  cost: { crystal: number; supply: number; time: number };
  /** 基础护甲值 */
  armorValue?: number;
  /** P1-D11 修复：被动光环半径（tile），由 heroData 配置，不再硬编码 */
  auraRadius?: number;
}

export class Hero extends Unit {
  heroName: string;
  title: string;
  level: number = 1;
  maxLevel: number = 5;
  /** 经验值 */
  xp: number = 0;
  /** 每级所需 XP（level*80），Lv5 返回 0 表示已满级 */
  get xpToNextLevel(): number {
    return this.level < this.maxLevel ? this.level * 80 : 0;
  }
  /** 主动技能冷却计时器（秒） */
  skillCooldown: number = 0;
  /** 各技能独立的冷却计时器 [slot1_cd, slot2_cd, ult_cd] */
  skillCooldowns: number[] = [0, 0, 0];
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
    // P1-D11 修复：从 heroData 读取光环半径，两英雄可分别配置（马库斯12格、伊莎贝尔8格）
    this.auraRadius = heroData.auraRadius ?? 8;
  }

  private reviveCooldown!: number;

  /** 覆写受伤逻辑：死亡时启动复活冷却 + 清理技能冷却 */
  takeDamage(amount: number, damageType?: string): boolean {
    const died = super.takeDamage(amount, damageType);
    if (died) {
      this.reviveTimer = this.reviveCooldown;
      // P0-1 修复：死亡时重置技能冷却
      this.skillCooldowns = [0, 0, 0];
      this.skillCooldown = 0;
    }
    return died;
  }

  /** 获得经验（返回是否升级，支持连升多级） */
  gainXp(amount: number): boolean {
    if (this.level >= this.maxLevel) return false;
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.xpToNextLevel && this.level < this.maxLevel) {
      this.xp -= this.xpToNextLevel;
      this.level++;
      this.maxHp = Math.round(this.maxHp * 1.15);
      this.hp = Math.min(this.hp + 50, this.maxHp);
      this.attackDamage = Math.round(this.attackDamage * 1.1);
      leveled = true;
    }
    // Lv5后不再积累 XP
    if (this.level >= this.maxLevel) {
      this.xp = 0;
    }
    return leveled;
  }

  /** 是否解锁了某个技能槽位（按等级） */
  hasSkillSlot(slotIndex: number): boolean {
    // slot0 (Lv1主动①), slot1 (Lv3主动②), slot2 (Lv5终极)
    const requiredLevel = slotIndex === 0 ? 1 : slotIndex === 1 ? 3 : 5;
    return this.level >= requiredLevel;
  }

  /** 获取当前可用的技能列表 */
  getAvailableSkillSlots(): number[] {
    const slots: number[] = [];
    if (this.hasSkillSlot(0)) slots.push(0);
    if (this.hasSkillSlot(1)) slots.push(1);
    if (this.hasSkillSlot(2)) slots.push(2);
    return slots;
  }

  /** 是否可使用指定槽位的技能 */
  canUseSkillSlot(slotIndex: number): boolean {
    return slotIndex >= 0 && slotIndex < this.skillCooldowns.length
      && this.skillCooldowns[slotIndex] <= 0
      && this.isAlive
      && this.hasSkillSlot(slotIndex);
  }
}