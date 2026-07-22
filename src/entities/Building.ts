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
  /** P1-FOG1: building sight radius for fog of war contribution (default 6) */
  sight: number = 6;
  /** 英雄光环等临时 buff 带来的生产速度加成（0=无加成） */
  productionSpeedBonus: number = 0;
  /** P1-AI20: AI 建筑模拟建造时间（>0 时由 stepConstructionResearch 推进） */
  _aiBuildTime: number = 0;

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
    // P1-CC 修复：CC 研究中也可训练单位，不覆盖 researching 状态
    if (this.state !== 'producing' && this.state !== 'researching') {
      this.state = 'producing';
    }
  }

  /** P2-质疑12: 删除 tickProduction 死代码，生产推进由 ProductionSystem.updateProduction 统一处理 */

  /** 取消生产队列 — P1-12 修复：返回被取消项的 unitDefId 供调用方计算退款
   *  P2-C2 标注：方法已实现但当前无调用方，待训练取消 UI 接入后调用，暂保留。 */
  cancelProduction(index: number): string | null {
    if (index >= 0 && index < this.productionQueue.length) {
      const item = this.productionQueue.splice(index, 1)[0];
      if (this.productionQueue.length === 0 && this.state === 'producing') {
        this.state = 'idle';
      }
      return item.unitDefId;
    }
    if (this.productionQueue.length === 0 && this.state === 'producing') {
      this.state = 'idle';
    }
    return null;
  }

  /** 是否可添加更多生产队列（建造完成后才允许） */
  canEnqueue(): boolean {
    if (this.state === 'constructing') return false;
    return this.productionQueue.length < this.maxQueueSize;
  }
}