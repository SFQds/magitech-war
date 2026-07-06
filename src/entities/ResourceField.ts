/**
 * 资源采集点 — 水晶矿脉等地图上的可采集资源
 */

import type { FactionId } from '../types/data';
import type { ResourceType } from '../types/data';
import { Entity } from './Entity';

export class ResourceField extends Entity {
  resourceType: ResourceType;
  amount: number;              // 剩余储量
  maxGatherers: number;        // 同时最大采集数
  currentGatherers: number = 0;

  constructor(
    tileX: number,
    tileY: number,
    resourceType: ResourceType,
    initialAmount: number,
    maxGatherers = 3
  ) {
    // 资源点无 owner（中立），faction 标记为特殊值
    super(-1, 'arcane_empire' as FactionId, tileX, tileY, 9999, 'structure', 'resource_field', 'resource');
    this.resourceType = resourceType;
    this.amount = initialAmount;
    this.maxGatherers = maxGatherers;
  }

  /** 采集资源，返回采集量（最多一次10） */
  gather(amount = 10): number {
    if (this.amount <= 0) return 0;
    const gathered = Math.min(amount, this.amount);
    this.amount -= gathered;

    if (this.amount <= 0) {
      this.isActive = false;
    }
    return gathered;
  }

  /** 是否枯竭 */
  get isDepleted(): boolean {
    return this.amount <= 0;
  }
}