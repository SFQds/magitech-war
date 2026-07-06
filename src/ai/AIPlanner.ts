/**
 * AI 路径规划 — 为编队计算进攻路线
 */

import type { GameWorld } from '../core/GameWorld';
import type { Point } from '../types/entity';
import { MovementSystem } from '../systems/MovementSystem';

export class AIPlanner {
  /** 为多单位规划到同一目标的路径（各加小偏移避免重叠） */
  static planGroupPath(
    world: GameWorld,
    startPositions: Point[],
    target: Point
  ): Point[][] {
    const paths: Point[][] = [];

    for (let i = 0; i < startPositions.length; i++) {
      const start = startPositions[i];
      // 添加小幅偏移使单位不会堆叠
      const adjustedTarget: Point = {
        x: target.x + (i % 3) - 1,
        y: target.y + Math.floor(i / 3) - 1,
      };
      const path = MovementSystem.findPath(start, adjustedTarget, world.map, 'infantry');
      paths.push(path);
    }

    return paths;
  }
}