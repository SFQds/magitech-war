/**
 * 军事 AI — 部队集结、攻击决策
 */

import type { GameWorld } from '../core/GameWorld';
import type { AnyCommand } from '../types/commands';
import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';
import { AIPlanner } from './AIPlanner';

export class MilitaryAI {
  private world: GameWorld;
  private playerIndex: number;
  private attackGrouped: boolean = false; // 是否已编组过进攻部队

  constructor(world: GameWorld, playerIndex: number) {
    this.world = world;
    this.playerIndex = playerIndex;
  }

  /** 每次 tick 输出军事命令 */
  evaluate(units: Unit[], _buildings: Building[]): AnyCommand[] {
    const commands: AnyCommand[] = [];

    // 收集己方作战单位（非工人）
    const combatUnits = units.filter(
      u => u.owner === this.playerIndex
        && u.isAlive
        && u.spriteKey !== 'unit_worker'
        && u.state !== 'attacking'
    );

    if (combatUnits.length < 3) return commands; // 至少3个作战单位才进攻

    // 寻找敌方最近的建筑作为攻击目标（优先指挥中心）
    const enemyBuildings = _buildings.filter(b => b.owner !== this.playerIndex && b.isAlive);

    // 如果没有敌方建筑可见，寻找敌方单位
    if (enemyBuildings.length === 0) {
      const enemyUnits = units.filter(u => u.owner !== this.playerIndex && u.isAlive);
      if (enemyUnits.length === 0) return commands;

      const target = enemyUnits[0];
      // 对每个作战单位发出攻击移动命令
      const targetTile = { x: Math.round(target.tileX), y: Math.round(target.tileY) };

      for (const cu of combatUnits) {
        commands.push({
          type: 'attack_move',
          playerIndex: this.playerIndex,
          unitIds: [cu.id],
          target: targetTile,
          frame: 0,
        });
      }
      return commands;
    }

    // 有敌方建筑，进攻最近的
    const targetBld = enemyBuildings.reduce((closest, b) => {
      const closestPos = { x: closest.tileX, y: closest.tileY };
      const bPos = { x: b.tileX, y: b.tileY };

      // 用第一个作战单位的位置作为参考
      const ref = combatUnits[0];
      const dClosest = Math.abs(ref.tileX - closestPos.x) + Math.abs(ref.tileY - closestPos.y);
      const dB = Math.abs(ref.tileX - bPos.x) + Math.abs(ref.tileY - bPos.y);
      return dB < dClosest ? b : closest;
    });

    const targetTile = { x: targetBld.tileX, y: targetBld.tileY };

    // 为编队规划路径
    const startPositions = combatUnits.map(u => ({
      x: Math.round(u.tileX),
      y: Math.round(u.tileY),
    }));

    const paths = AIPlanner.planGroupPath(this.world, startPositions, targetTile);

    for (let i = 0; i < combatUnits.length; i++) {
      const cu = combatUnits[i];
      // 攻击移动：MoveCommand type 可以是 'attack_move'
      commands.push({
        type: 'attack_move',
        playerIndex: this.playerIndex,
        unitIds: [cu.id],
        target: targetTile,
        frame: 0,
      });
    }

    return commands;
  }
}