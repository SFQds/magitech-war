/**
 * 移动系统 — A* 寻路 + 单位沿路径移动
 *
 * 纯逻辑：接收 GameWorld，修改 Unit.path / Unit.tileX/Y
 * 不持有状态，不依赖 Phaser
 */

import type { Point } from '../types/entity';
import { Unit } from '../entities/Unit';
import { GameMap } from '../core/GameMap';
import { BinaryHeap } from '../utils/BinaryHeap';
import { manhattan, tileKey } from '../utils/MathUtils';
import { GuildSystem } from './GuildSystem';

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
    // 取整坐标，防止浮点下标访问 grid
    const start = {
      x: Math.round(unit.tileX),
      y: Math.round(unit.tileY),
    };
    const path = this.findPath(start, target, map, unit.category, unit.id);
    if (path.length > 0) {
      unit.setPath(path);
    }
  }

  /** A* 寻路
   * @param excludeUnitId 路径计算时排除此单位的占用（自身不阻挡自己）
   */
  static findPath(
    start: Point,
    end: Point,
    map: GameMap,
    _category: string,
    excludeUnitId?: string,
  ): Point[] {
    // 座标取整（防御性：防止浮点下标访问 grid）
    const sx = Math.round(start.x);
    const sy = Math.round(start.y);
    const ex = Math.round(end.x);
    const ey = Math.round(end.y);

    // 起点或终点不可通过 → 返回空
    if (!map.isPassable(sx, sy) || !map.isPassable(ex, ey)) {
      return [];
    }

    const grid = map.getPassableGrid();
    const w = map.config.width;
    const h = map.config.height;

    const openHeap = new BinaryHeap<AStarNode>((a, b) => a.f - b.f);
    const closedSet = new Set<number>();
    const encode = (x: number, y: number) => tileKey(x, y, w);

    const startNode: AStarNode = {
      x: sx,
      y: sy,
      g: 0,
      h: manhattan({ x: sx, y: sy }, { x: ex, y: ey }),
      f: manhattan({ x: sx, y: sy }, { x: ex, y: ey }),
      parent: null,
    };
    openHeap.push(startNode);

    const maxIterations = w * h * 2;
    let iterations = 0;

    while (!openHeap.isEmpty && iterations < maxIterations) {
      iterations++;

      const current = openHeap.pop()!;
      const key = encode(current.x, current.y);

      if (current.x === ex && current.y === ey) {
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
        if (!grid[ny][nx]) continue;
        if (closedSet.has(encode(nx, ny))) continue;
        // 单位碰撞：跳过被其他单位占用的瓦片（起点和终点除外）
        if (map.isOccupied(nx, ny) && !(nx === sx && ny === sy) && !(nx === ex && ny === ey)) continue;

        // 对角线检查
        if (dx !== 0 && dy !== 0) {
          if (!grid[current.y + dy][current.x]) continue;
          if (!grid[current.y][current.x + dx]) continue;
        }

        const moveCost = (dx !== 0 && dy !== 0) ? 1.414 : 1;
        const g = current.g + moveCost;
        const h = manhattan({ x: nx, y: ny }, { x: ex, y: ey });
        const f = g + h;

        openHeap.push({ x: nx, y: ny, g, h, f, parent: current });
      }
    }

    return []; // 无法到达
  }

  /** 从终点回溯路径 */
  private static reconstructPath(node: AStarNode): Point[] {
    const path: Point[] = [];
    let current: AStarNode | null = node;
    while (current) {
      path.push({ x: current.x, y: current.y });
      current = current.parent;
    }
    path.reverse();
    return path;
  }

  /** 每帧更新单位位置 */
  static updateMovement(unit: Unit, deltaSec: number, map: GameMap): void {
    // 接受 moving 和 pursuing 两种移动状态
    if ((unit.state !== 'moving' && unit.state !== 'pursuing') || unit.path.length === 0) return;

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
        // 到达终点：根据之前的状态切换
        if (unit.state === 'pursuing' && unit.targetEntityId) {
          // 追击到达 → 准备攻击
          unit.state = 'attacking';
        } else {
          unit.clearPath();
        }
        unit.path = [];
        unit.pathIndex = 0;
      }
      return;
    }

    // 朝目标移动（应用行会 + 虚空过载移速修正）
    let speed = unit.speed;
    speed *= GuildSystem.getAlchemySpeedMult(unit);
    speed *= GuildSystem.getVoidOverloadSpeedMult(unit);
    const moveAmount = speed * deltaSec;
    const ratio = moveAmount / dist;
    unit.tileX += dx * ratio;
    unit.tileY += dy * ratio;
  }
}