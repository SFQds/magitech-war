/**
 * 移动系统 — A* 寻路 + 单位沿路径移动
 *
 * 纯逻辑：接收 GameWorld，修改 Unit.path / Unit.tileX/Y
 * 不持有状态，不依赖 Phaser
 */

import type { Point } from '../types/entity';
import { Unit } from '../entities/Unit';
import { GameMap } from '../core/GameMap';
import { manhattan } from '../utils/MathUtils';

/** A* 寻路节点 */
interface AStarNode {
  x: number;
  y: number;
  g: number;  // 起点到此的代价
  h: number;  // 此到终点的估计代价
  f: number;  // g + h
  parent: AStarNode | null;
}

/** A* 寻路结果 */
export class MovementSystem {
  /** 为单个单位计算路径并设置 */
  static navigate(unit: Unit, target: Point, map: GameMap): void {
    const path = this.findPath(
      { x: unit.tileX, y: unit.tileY },
      target,
      map,
      unit.category
    );
    if (path.length > 0) {
      unit.setPath(path);
    }
  }

  /** A* 寻路 */
  static findPath(
    start: Point,
    end: Point,
    map: GameMap,
    _category: string
  ): Point[] {
    const grid = map.getPassableGrid();
    const w = map.config.width;
    const h = map.config.height;

    // 终点不可通过或不在范围内 → 返回空
    if (!map.isPassable(end.x, end.y)) {
      return [];
    }

    const openList: AStarNode[] = [];
    const closedSet = new Set<string>();

    const startNode: AStarNode = {
      x: start.x,
      y: start.y,
      g: 0,
      h: manhattan(start, end),
      f: manhattan(start, end),
      parent: null,
    };
    openList.push(startNode);

    const maxIterations = w * h * 2; // 防止死循环
    let iterations = 0;

    while (openList.length > 0 && iterations < maxIterations) {
      iterations++;

      // 找 openList 中 f 最小的节点
      let currentIdx = 0;
      for (let i = 1; i < openList.length; i++) {
        if (openList[i].f < openList[currentIdx].f) {
          currentIdx = i;
        }
      }
      const current = openList.splice(currentIdx, 1)[0];
      const key = `${current.x},${current.y}`;

      // 到达终点
      if (current.x === end.x && current.y === end.y) {
        return this.reconstructPath(current);
      }

      if (closedSet.has(key)) continue;
      closedSet.add(key);

      // 检查 8 个邻居
      const neighbors = [
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
        { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
      ];

      for (const { dx, dy } of neighbors) {
        const nx = current.x + dx;
        const ny = current.y + dy;

        if (!map.inBounds(nx, ny)) continue;
        if (!grid[ny][nx]) continue; // 不可通过
        if (closedSet.has(`${nx},${ny}`)) continue;

        // 对角线检查：必须两个相邻直方向也可通过
        if (dx !== 0 && dy !== 0) {
          if (!grid[current.y + dy][current.x]) continue;
          if (!grid[current.y][current.x + dx]) continue;
        }

        const moveCost = (dx !== 0 && dy !== 0) ? 1.414 : 1;
        const g = current.g + moveCost;
        const h = manhattan({ x: nx, y: ny }, end);
        const f = g + h;

        openList.push({ x: nx, y: ny, g, h, f, parent: current });
      }
    }

    return []; // 无法到达
  }

  /** 从终点回溯路径 */
  private static reconstructPath(node: AStarNode): Point[] {
    const path: Point[] = [];
    let current: AStarNode | null = node;
    while (current) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }
    return path;
  }

  /** 每帧更新单位位置 */
  static updateMovement(unit: Unit, deltaSec: number, map: GameMap): void {
    if (unit.state !== 'moving' || unit.path.length === 0) return;

    const target = unit.path[unit.pathIndex];
    if (!target) {
      unit.clearPath();
      return;
    }

    const dx = target.x - unit.tileX;
    const dy = target.y - unit.tileY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      // 到达当前路径点
      unit.tileX = target.x;
      unit.tileY = target.y;
      unit.pathIndex++;

      if (unit.pathIndex >= unit.path.length) {
        // 到达终点
        unit.clearPath();
      }
      return;
    }

    // 朝目标移动
    const moveAmount = unit.speed * deltaSec;
    const ratio = moveAmount / dist;
    unit.tileX += dx * ratio;
    unit.tileY += dy * ratio;
  }
}