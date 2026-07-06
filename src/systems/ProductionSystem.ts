/**
 * 生产系统 — 建筑建造、单位训练队列管理
 */

import { Building } from '../entities/Building';
import type { ProductionItem } from '../types/entity';

export class ProductionSystem {
  /** 开始建造/训练 */
  static startProduction(
    building: Building,
    unitDefId: string,
    buildTime: number
  ): void {
    if (!building.canEnqueue()) return;

    building.enqueueProduction({
      unitDefId,
      timeRemaining: buildTime,
      totalTime: buildTime,
    });
  }

  /** 推进所有建筑的生产进度 */
  static updateProduction(buildings: Building[], deltaSec: number): ProductionComplete[] {
    const completed: ProductionComplete[] = [];

    for (const building of buildings) {
      if (!building.isAlive) continue;

      const result = building.tickProduction(deltaSec);
      if (result) {
        completed.push({
          buildingId: building.id,
          unitDefId: result.unitDefId,
          position: building.rallyPoint ?? { x: building.tileX + 1, y: building.tileY },
        });
      }
    }

    return completed;
  }
}

export interface ProductionComplete {
  buildingId: string;
  unitDefId: string;
  position: { x: number; y: number };
}