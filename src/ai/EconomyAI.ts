/**
 * 经济 AI — 资源管理、建造决策
 */

import type { GameWorld } from '../core/GameWorld';
import type { AnyCommand } from '../types/commands';
import type { Building } from '../entities/Building';
import type { Unit } from '../entities/Unit';

export class EconomyAI {
  private world: GameWorld;
  private playerIndex: number;
  private resourceMultiplier: number;

  constructor(world: GameWorld, playerIndex: number, resourceMultiplier = 1.0) {
    this.world = world;
    this.playerIndex = playerIndex;
    this.resourceMultiplier = resourceMultiplier;
  }

  /** 每次 tick 输出建造/训练命令 */
  evaluate(buildings: Building[], units: Unit[]): AnyCommand[] {
    const commands: AnyCommand[] = [];
    const player = this.world.getPlayer(this.playerIndex);
    if (!player) return commands;

    const { crystal, supply, supplyCap } = player.resources;

    // 统计己方工人和兵营
    const workerCount = units.filter(
      u => u.owner === this.playerIndex && u.isAlive && u.spriteKey === 'unit_worker'
    ).length;

    const hasBarracks = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_barracks'
    );

    const ownBuildings = buildings.filter(
      b => b.owner === this.playerIndex && b.isAlive && b.buildingType === 'production' && b.canEnqueue()
    );
    if (ownBuildings.length === 0) return commands;

    // 1. 优先训练工人（如果少于6个）
    if (crystal >= 100 && supply < supplyCap && workerCount < 6) {
      const cc = ownBuildings.find(b => b.spriteKey === 'bld_cc_federation') ?? ownBuildings[0];
      commands.push({
        type: 'train',
        playerIndex: this.playerIndex,
        unitIds: [],
        buildingId: cc.id,
        unitDefId: 'unit_worker',
        count: 1,
        frame: 0,
      });
      return commands;
    }

    // 2. 没有兵营 → 建造兵营（水晶 >= 400 确保有余量）
    if (!hasBarracks && crystal >= 400) {
      commands.push({
        type: 'build',
        playerIndex: this.playerIndex,
        unitIds: [],
        buildingDefId: 'bld_barracks',
        position: { x: 0, y: 0 }, // 由 GameScene 自动选位
        frame: 0,
      } as any);
      return commands;
    }

    // 3. 有兵营 → 训练战斗法师（优先）
    if (hasBarracks && crystal >= 250 && supply < supplyCap) {
      const barracks = buildings.find(
        b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_barracks' && b.canEnqueue()
      );
      if (barracks) {
        commands.push({
          type: 'train',
          playerIndex: this.playerIndex,
          unitIds: [],
          buildingId: barracks.id,
          unitDefId: 'unit_battle_mage',
          count: 1,
          frame: 0,
        });
        return commands;
      }
    }

    // 4. 退而求其次：训练步枪兵
    if (crystal >= 150 && supply < supplyCap) {
      const cc = ownBuildings.find(b => b.spriteKey === 'bld_cc_federation') ?? ownBuildings[0];
      commands.push({
        type: 'train',
        playerIndex: this.playerIndex,
        unitIds: [],
        buildingId: cc.id,
        unitDefId: 'unit_rifleman',
        count: 1,
        frame: 0,
      });
    }

    return commands;
  }
}