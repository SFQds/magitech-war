/**
 * 资源系统 — 采集、消耗、补给计算
 *
 * 纯逻辑：管理水晶采集、工业产值、人口补给
 */

import type { PlayerState } from '../types/entity';
import { Unit } from '../entities/Unit';
import { ResourceField } from '../entities/ResourceField';
import { Building } from '../entities/Building';

export class ResourceSystem {
  /** 工兵采集资源 */
  static gather(worker: Unit, field: ResourceField): number {
    if (!field.isActive || field.isDepleted) return 0;
    if (field.currentGatherers >= field.maxGatherers) return 0;

    const gathered = field.gather(10); // 基础采集速率：10/次
    return gathered;
  }

  /** 更新所有玩家资源 */
  static updateResources(
    players: PlayerState[],
    _units: Unit[],
    buildings: Building[]
  ): void {
    for (const player of players) {
      // 重新计算补给和工业
      let totalSupply = 0;
      let totalIndustry = 0;

      for (const building of buildings) {
        if (building.owner !== player.index || !building.isAlive) continue;
        totalSupply += building.providesSupply;
        totalIndustry += building.providesIndustry;
      }

      player.resources.supplyCap = totalSupply;
      player.resources.industry = totalIndustry;
    }
  }
}