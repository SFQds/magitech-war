/**
 * 建筑 — 固定位置的生产/科技/防御设施
 */

import type { FactionId, ArmorType } from '../types/data';
import type { BuildingState, Point, ProductionItem } from '../types/entity';
import { Entity } from './Entity';

export type BuildingCategory = 'production' | 'resource' | 'tech' | 'defense' | 'utility';

export class Building extends Entity {
  buildingType: BuildingCategory;
  state: BuildingState = 'constructing';
  buildProgress: number = 0;        // 0~1, 1=建造完成
  rallyPoint: Point | null = null;
  productionQueue: ProductionItem[] = [];
  maxQueueSize: number = 5;         // 默认支持 5 个排队槽位
  providesSupply: number = 0;
  providesIndustry: number = 0;
  /** 正在研究的科技 ID */
  researchingTechId: string | null = null;
  /** 研究进度 0~1 */
  researchProgress: number = 0;
  /** 研究总耗时（秒） */
  researchTotalTime: number = 0;
  /** 建造该建筑的工人 ID（建造期间锁定） */
  builderId: string | null = null;
  /** 英雄光环等临时 buff 带来的生产速度加成（0=无加成） */
  productionSpeedBonus: number = 0;

  // ===== 防御建筑战斗属性 =====
  attackDamage: number = 0;
  attackRange: number = 0;
  attackCooldown: number = 0;
  attackType: string = 'physical';
  attackTimer: number = 0;
  targetEntityId: string | null = null;

  constructor(
    owner: number,
    faction: FactionId,
    tileX: number,
    tileY: number,
    maxHp: number,
    armorType: ArmorType,
    buildingType: BuildingCategory,
    spriteKey: string,
    providesSupply = 0,
    providesIndustry = 0
  ) {
    super(owner, faction, tileX, tileY, maxHp, armorType, spriteKey, 'building');
    this.buildingType = buildingType;
    this.providesSupply = providesSupply;
    this.providesIndustry = providesIndustry;
  }

  /** 建造完成 */
  complete(): void {
    this.state = 'idle';
    this.buildProgress = 1;
  }

  /** 添加生产队列项 */
  enqueueProduction(item: ProductionItem): void {
    this.productionQueue.push(item);
    if (this.state !== 'producing') {
      this.state = 'producing';
    }
  }

  /** 推进生产进度（由 ProductionSystem 每帧调用） */
  tickProduction(deltaSec: number): ProductionItem | null {
    if (this.productionQueue.length === 0) {
      if (this.state === 'producing') this.state = 'idle';
      return null;
    }

    const current = this.productionQueue[0];
    // 应用英雄光环等临时生产速度加成
    current.timeRemaining -= deltaSec * (1 + this.productionSpeedBonus);

    if (current.timeRemaining <= 0) {
      this.productionQueue.shift();
      if (this.productionQueue.length === 0 && this.state === 'producing') {
        this.state = 'idle';
      }
      return current; // 返回已完成项
    }
    return null;
  }

  /** 取消生产队列 */
  cancelProduction(index: number): void {
    if (index >= 0 && index < this.productionQueue.length) {
      this.productionQueue.splice(index, 1);
    }
    if (this.productionQueue.length === 0 && this.state === 'producing') {
      this.state = 'idle';
    }
  }

  /** 是否可添加更多生产队列 */
  canEnqueue(): boolean {
    return this.productionQueue.length < this.maxQueueSize;
  }
}