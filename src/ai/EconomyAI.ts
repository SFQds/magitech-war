/**
 * 经济 AI — 资源管理、建造决策
 */

import type { GameWorld } from '../core/GameWorld';
import type { AnyCommand } from '../types/commands';

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
  evaluate(): AnyCommand[] {
    const commands: AnyCommand[] = [];
    const player = this.world.getPlayer(this.playerIndex);
    if (!player) return commands;

    const { crystal, supply, supplyCap } = player.resources;

    // 简单规则：如果有足够水晶和补给，建造一个步枪兵
    if (crystal >= 150 && supply < supplyCap) {
      commands.push({
        type: 'train',
        playerIndex: this.playerIndex,
        unitIds: [],
        buildingId: '',     // TODO: 找到最近的兵营
        unitDefId: 'rifleman',
        count: 1,
        frame: 0,
      });
    }

    return commands;
  }
}