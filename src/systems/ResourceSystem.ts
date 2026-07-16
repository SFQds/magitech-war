/**
 * 资源系统 — 采集、消耗、补给计算
 *
 * 纯逻辑：管理水晶采集、工业产值、人口补给
 */

import type { PlayerState } from '../types/entity';
import { Unit } from '../entities/Unit';
import { ResourceField } from '../entities/ResourceField';
import { Building } from '../entities/Building';

/** 水晶存储上限 */
const MAX_CRYSTAL = 20000;

export interface GatherEvent {
  workerId: string;
  fieldId: string;
  playerIndex: number;
  amount: number;
}

export class ResourceSystem {
  /** 工兵采集资源（单次调用） */
  static gather(worker: Unit, field: ResourceField): number {
    if (!field.isActive || field.isDepleted) return 0;
    // 允许超出 maxGatherers 的情况（已到场的已通过 GameScene 检查）
    const gathered = field.gather(10); // 基础采集速率：10/次
    return gathered;
  }

  /**
   * 每帧更新所有正在采集的工人
   * 每 1 秒执行一次采集 tick
   */
  static updateGathering(
    units: Unit[],
    fields: ResourceField[],
    players: PlayerState[],
    deltaSec: number,
    buildings?: Building[],
    gMultP0?: number,
    gMultP1?: number,
  ): GatherEvent[] {
    const events: GatherEvent[] = [];
    // 缓存 fieldIndex 避免每工人 fields.find() O(F) 扫描
    const fieldMap = new Map<string, ResourceField>();
    for (const f of fields) fieldMap.set(f.id, f);

    // 缓存"是否有采矿场"状态（建筑完成/摧毁时变化，但在此热路径只读一次）
    let hasRefineryP0 = false, hasRefineryP1 = false;
    if (buildings) {
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        if (!b.isAlive || b.spriteKey !== 'bld_refinery') continue;
        if (b.owner === 0) hasRefineryP0 = true;
        if (b.owner === 1) hasRefineryP1 = true;
        if (hasRefineryP0 && hasRefineryP1) break;
      }
    }

    for (const unit of units) {
      if (!unit.isAlive || unit.state !== 'gathering') continue;

      if (!unit.targetResourceId) {
        unit.state = 'idle';
        continue;
      }

      const field = fieldMap.get(unit.targetResourceId);
      if (!field || !field.isActive || field.isDepleted) {
        unit.targetResourceId = null;
        unit.state = 'idle';
        continue;
      }

      // 累积采集计时
      unit.gatherTimer += deltaSec;
      if (unit.gatherTimer >= 1.0) {
        unit.gatherTimer -= 1.0;

        const amount = ResourceSystem.gather(unit, field);
        const hasRefinery = unit.owner === 0 ? hasRefineryP0 : hasRefineryP1;
        let gathered = hasRefinery ? amount : 3;
        // 无采矿场时只采集 3，退还矿场 7
        if (!hasRefinery) {
          field.amount += (amount - gathered);
        }

        // 科技采集加成
        const mult = unit.owner === 0 ? (gMultP0 ?? 1.0) : (gMultP1 ?? 1.0);
        gathered = Math.round(gathered * mult);
        if (gathered > 0) {
          const player = players[unit.owner];
          if (player) {
            player.resources.crystal = Math.min(MAX_CRYSTAL, player.resources.crystal + gathered);
            events.push({
              workerId: unit.id,
              fieldId: field.id,
              playerIndex: unit.owner,
              amount: gathered,
            });
          }

          if (field.isDepleted) {
            unit.targetResourceId = null;
            unit.state = 'idle';
            if (field.currentGatherers > 0) field.currentGatherers--;
          }
        }
      }
    }

    return events;
  }

  /** 更新所有玩家资源（补给/工业上限重算） */
  static updateResources(
    players: PlayerState[],
    _units: Unit[],
    buildings: Building[],
    deltaSec: number = 0,
  ): void {
    for (const player of players) {
      // 重新计算补给上限和工业上限
      let totalSupply = 0;
      let totalIndustry = 0;

      for (const building of buildings) {
        // 建设中建筑不提供供给/工业（建造完成后才生效）
        if (building.owner !== player.index || !building.isAlive || building.state === 'constructing') continue;
        totalSupply += building.providesSupply;
        totalIndustry += building.providesIndustry;
      }

      player.resources.supplyCap = Math.max(0, totalSupply);
      player.resources.industryCap = Math.max(0, totalIndustry);

      // P1-6/P1-7 修复：cap 下降时不截断已积累值（避免资源蒸发）
      // 仅在 cap 上升时允许 industry 跟随增长（初始化/建新建筑场景）
      // 工业值保持在 [0, industryCap] 之间但不强制截断已超出的部分
      if (deltaSec > 0) {
        const regenRate = 0.5 + totalIndustry * 0.03;
        // 仅当当前工业低于 cap 时再生，不强制截断超出部分
        if (player.resources.industry < totalIndustry) {
          player.resources.industry = Math.min(
            totalIndustry,
            player.resources.industry + regenRate * deltaSec,
          );
        }
        // P1-9 修复：工业值下限保护
        if (player.resources.industry < 0) player.resources.industry = 0;
      } else {
        // 初始化时直接填满（游戏开始）
        if (player.resources.industry < 0) player.resources.industry = 0;
        if (player.resources.industry > totalIndustry) player.resources.industry = totalIndustry;
      }
    }
  }
}