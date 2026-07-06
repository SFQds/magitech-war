/**
 * 军事 AI — 部队集结、攻击决策
 */

import type { GameWorld } from '../core/GameWorld';
import type { AnyCommand } from '../types/commands';

export class MilitaryAI {
  private world: GameWorld;
  private playerIndex: number;

  constructor(world: GameWorld, playerIndex: number) {
    this.world = world;
    this.playerIndex = playerIndex;
  }

  /** 每次 tick 输出军事命令 */
  evaluate(): AnyCommand[] {
    const commands: AnyCommand[] = [];

    // TODO: 编组部队、选择攻击目标、路径规划
    // 当前返回空，等待后续实现

    return commands;
  }
}