/**
 * 可移动战斗单位
 */

import type { FactionId, DamageType, ArmorType } from '../types/data';
import type { UnitState, Point, UnitAbility } from '../types/entity';
import { Entity } from './Entity';

export class Unit extends Entity {
  category: 'infantry' | 'vehicle' | 'aircraft' | 'naval';
  state: UnitState = 'idle';
  speed: number;
  attackDamage: number;
  attackType: DamageType;
  attackRange: number;
  attackCooldown: number;
  attackTimer: number;
  sight: number;
  path: Point[] = [];
  pathIndex: number = 0;
  targetEntityId: string | null = null;
  targetResourceId: string | null = null;
  cargo: Unit[] = [];
  abilities: UnitAbility[];
  abilityCharges: number = 0;
  maxAbilityCharges: number = 3;
  /** 坚守位置 — true 时 CombatSystem 不会自动索敌追击 */
  holdPosition: boolean = false;
  /** AI 强制行为标记 — 设置后 CombatSystem 不会覆盖此单位的行为 */
  aiLockedAction: 'retreat' | 'defend' | 'attack' | 'recover' | 'building' | null = null;
  /** 该单位消耗的补给数（死亡时退还） */
  supplyCost: number = 1;
  /** 采集计时器（工人使用） */
  gatherTimer: number = 0;
  /** 运输卡车卸载目标 */
  unloadTarget: { x: number; y: number } | null = null;
  /** 基础护甲值（来自设计数据，科技叠加以此为基准） */
  baseArmor: number = 0;

  // ===== 行会系统 — 炼金协会药剂效果 =====
  /** 炼金药剂 buff 计时器（秒），0=无效果 */
  alchemyBuffTimer: number = 0;
  /** 炼金药剂类型 */
  alchemyBuffType: 'none' | 'strength' | 'ironskin' | 'swift' | 'corrosion' = 'none';
  /** 药剂效果数值（攻击倍率增量/护甲增量/移速增量/目标护甲减量%） */
  alchemyBuffValue: number = 0;

  // ===== 行会系统 — 虚空研究院过载 =====
  /** 虚空过载是否激活 */
  isVoidOvercharged: boolean = false;
  /** 虚空过载剩余时间（秒），0=未过载 */
  voidOverloadTimer: number = 0;

  constructor(
    owner: number,
    faction: FactionId,
    tileX: number,
    tileY: number,
    maxHp: number,
    armorType: ArmorType,
    category: Unit['category'],
    speed: number,
    attackDamage: number,
    attackType: DamageType,
    attackRange: number,
    attackCooldown: number,
    sight: number,
    spriteKey: string,
    abilities: UnitAbility[] = []
  ) {
    super(owner, faction, tileX, tileY, maxHp, armorType, spriteKey, 'unit');
    this.category = category;
    this.speed = speed;
    this.attackDamage = attackDamage;
    this.attackType = attackType;
    this.attackRange = attackRange;
    this.attackCooldown = attackCooldown;
    this.attackTimer = 0;
    this.sight = sight;
    this.abilities = abilities;
  }

  /** 设置移动路径 */
  setPath(path: Point[]): void {
    this.path = path;
    this.pathIndex = 0;
    if (path.length > 0) {
      this.state = 'moving';
    }
  }

  /** 清除当前路径 */
  clearPath(): void {
    this.path = [];
    this.pathIndex = 0;
    if (this.state === 'moving' || this.state === 'pursuing') {
      this.state = 'idle';
    }
  }

  /** 选择攻击目标 */
  attackTarget(targetId: string): void {
    this.targetEntityId = targetId;
    this.state = 'attacking';
    this.attackTimer = 0;
  }

  /** 停止攻击 */
  stopAttacking(): void {
    this.targetEntityId = null;
    if (this.state === 'attacking' || this.state === 'pursuing') {
      this.state = 'idle';
    }
  }

  /** 增加奥术充能层数（法师公会机制） */
  addCharge(): void {
    if (this.abilityCharges < this.maxAbilityCharges) {
      this.abilityCharges++;
    }
  }

  /** 消耗充能层数 */
  consumeCharge(count = 1): boolean {
    if (this.abilityCharges >= count) {
      this.abilityCharges -= count;
      return true;
    }
    return false;
  }
}