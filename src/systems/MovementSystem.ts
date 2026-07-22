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
import { octile, tileKey, distance } from '../utils/MathUtils';
import { GuildSystem } from './GuildSystem';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';

// P1-PERF1: reusable neighbor offsets (avoid per-iteration array allocation)
const NEIGHBOR_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
  { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
  { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
];

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
  /** P2-3：推断寻路失败原因，供 navigate 上层 emit；保持 findPath 自身纯逻辑 */
  private static inferPathFailReason(
    start: Point, end: Point, map: GameMap,
  ): 'start_blocked' | 'end_blocked' | 'no_path' {
    if (!map.isPassable(Math.round(start.x), Math.round(start.y))) return 'start_blocked';
    if (!map.isPassable(Math.round(end.x), Math.round(end.y))) return 'end_blocked'; // P2: distinct reason for unreachable endpoint
    return 'no_path';
  }

  /** 为单个单位计算路径并设置 */
  static navigate(unit: Unit, target: Point, map: GameMap, playerIndex?: number): void {
    // 取整坐标，防止浮点下标访问 grid
    const start = {
      x: Math.round(unit.tileX),
      y: Math.round(unit.tileY),
    };
    // 工人可进入矿点格，其他单位不可
    const allowResourceTiles = unit.spriteKey === 'unit_worker';
    const path = this.findPath(start, target, map, unit.category, unit.id, allowResourceTiles);
    if (path.length > 0) {
      unit.setPath(path);
    } else if (playerIndex !== undefined) {
      // P2-3：玩家发起的寻路失败才上 toast，AI/系统内部调用静默
      const reason = this.inferPathFailReason(start, target, map);
      EventBus.emit(GameEvent.PATH_FAILED, {
        unitId: unit.id, playerIndex, reason,
      } as any);
    }
  }

  /**
   * 为一组单位分配围绕 target 的互不相同的整数终点格（编队散开）。
   * 离 target 最近者优先占中心格；并列时按 unit.id 排序（确定性）。
   * 仅检查地形可通过性，不检查单位占用——同组单位各自有独立终点。
   */
  static assignGroupGoals(units: Unit[], target: Point, map: GameMap): Map<string, Point> {
    const w = map.config.width;
    const keyFn = (x: number, y: number) => y * w + x;
    const used = new Set<number>();
    const goals = new Map<string, Point>();

    // 按到 target 距离排序（近的先占中心），并列按 id 排序
    const order = units.slice().sort((a, b) => {
      const da = distance({ x: a.tileX, y: a.tileY }, target);
      const db = distance({ x: b.tileX, y: b.tileY }, target);
      if (Math.abs(da - db) > 1e-6) return da - db;
      return a.id < b.id ? -1 : 1;
    });

    for (const u of order) {
      // 工人可进入矿点格，其他单位不可
      const allowResource = u.spriteKey === 'unit_worker';
      const g = MovementSystem._nearestFreeTile(target.x, target.y, map, used, keyFn, allowResource);
      goals.set(u.id, g);
      used.add(keyFn(g.x, g.y));
    }
    return goals;
  }

  /** 从 (cx,cy) 起向外环搜，返回首个地形可通过且未被本组占用的整数格 */
  private static _nearestFreeTile(
    cx: number, cy: number, map: GameMap,
    used: Set<number>, keyFn: (x: number, y: number) => number,
    allowResourceTiles: boolean = true,
  ): Point {
    cx = Math.round(cx); cy = Math.round(cy);
    if (map.inBounds(cx, cy) && map.isPassable(cx, cy) && !used.has(keyFn(cx, cy))
        && (allowResourceTiles || !map.isResourceTile(cx, cy))) {
      return { x: cx, y: cy };
    }
    const maxR = 24;
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = cx + dx, y = cy + dy;
          if (!map.inBounds(x, y)) continue;
          if (!map.isPassable(x, y)) continue;
          if (used.has(keyFn(x, y))) continue;
          if (!allowResourceTiles && map.isResourceTile(x, y)) continue;
          return { x, y };
        }
      }
    }
    return { x: cx, y: cy };
  }

  /** A* 寻路
   * @param excludeUnitId 路径计算时排除此单位的占用（自身不阻挡自己）
   * @param allowResourceTiles true=允许进入矿点格（工人），false=矿点格视为障碍
   */
  static findPath(
    start: Point,
    end: Point,
    map: GameMap,
    // P3-B1: _category (aircraft/naval) currently ignored - all units use ground passability grid.
    // Flying/naval terrain bypass is a design gap, not yet implemented.
    _category: string,
    excludeUnitId?: string,
    allowResourceTiles: boolean = false,
  ): Point[] {
    // 座标取整（防御性：防止浮点下标访问 grid）
    const sx = Math.round(start.x);
    const sy = Math.round(start.y);
    const ex = Math.round(end.x);
    const ey = Math.round(end.y);

    // 起点或终点不可通过 -> 返回空
    // 非工人单位终点在矿点格上 -> 返回空（找不到不经过矿点的路径）
    if (!map.isPassable(sx, sy) || !map.isPassable(ex, ey)) {
      return [];
    }
    if (!allowResourceTiles && map.isResourceTile(ex, ey)) {
      return [];
    }

    const grid = map.getPassableGrid();
    const w = map.config.width;
    const h = map.config.height;

    // P1-2 修复：excludeUnitId 实际生效 — 寻路时暂时清除自身占用
    const occRemoved = !!excludeUnitId;
    if (occRemoved) {
      map.removeOccupancy(sx, sy); // 自身起点不阻挡自己
    }
    // P3-B3: restore occupancy after pathfind so same-frame findPath calls see it
    const restoreOcc = () => { if (occRemoved) map.markOccupied(sx, sy); };

    const openHeap = new BinaryHeap<AStarNode>((a, b) => a.f - b.f);
    const closedSet = new Set<number>();
    // P4-B5: openSet tracks best g per tile to skip redundant heap pushes
    const openSet = new Map<number, number>();
    const encode = (x: number, y: number) => tileKey(x, y, w);

    const startNode: AStarNode = {
      x: sx,
      y: sy,
      g: 0,
      h: octile({ x: sx, y: sy }, { x: ex, y: ey }),
      f: octile({ x: sx, y: sy }, { x: ex, y: ey }),
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
        restoreOcc();
        return this.reconstructPath(current);
      }

      if (closedSet.has(key)) continue;
      closedSet.add(key);

      for (const { dx, dy } of NEIGHBOR_OFFSETS) {
        const nx = current.x + dx;
        const ny = current.y + dy;

        if (!map.inBounds(nx, ny)) continue;
        if (!grid[ny][nx]) continue;
        if (closedSet.has(encode(nx, ny))) continue;
        // 非工人单位不可经过矿点格（终点除外，终点已在入口检查过）
        if (!allowResourceTiles && map.isResourceTile(nx, ny) && !(nx === ex && ny === ey)) continue;
        // 单位碰撞：跳过被其他单位占用的瓦片（起点和终点除外）
        if (map.isOccupied(nx, ny) && !(nx === sx && ny === sy) && !(nx === ex && ny === ey)) continue;

        // 对角线检查 — P2-1 修复：同时检查地形和单位占用
        if (dx !== 0 && dy !== 0) {
          if (!grid[current.y + dy][current.x]) continue;
          if (!grid[current.y][current.x + dx]) continue;
          // 对角线穿过的两个正交邻格不能被单位占用
          if (map.isOccupied(current.x, current.y + dy) && !(current.x === sx && current.y + dy === sy)) continue;
          if (map.isOccupied(current.x + dx, current.y) && !(current.x + dx === sx && current.y === sy)) continue;
        }

        const moveCost = (dx !== 0 && dy !== 0) ? Math.SQRT2 : 1; // P2: unify with octile heuristic
        const g = current.g + moveCost;
        const h = octile({ x: nx, y: ny }, { x: ex, y: ey });
        const f = g + h;

        // P4-B5: skip if already in open with better/equal g (dedup heap entries)
        const nkey = encode(nx, ny);
        const prevG = openSet.get(nkey);
        if (prevG !== undefined && prevG <= g) continue;
        openSet.set(nkey, g);
        openHeap.push({ x: nx, y: ny, g, h, f, parent: current });
      }
    }

    restoreOcc();
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

    // 瞬移修复：入口排除自身占用，使后续 isOccupied 检查不会命中自己。
    // rebuildUnitOccupancy 用 Math.round(tileX) 编码，单位行进中 tileX=5.9 -> round=6
    // 会把目标格标记为自身占用，到点时 isOccupied 返回 true 触发散开瞬移。
    const oldX = Math.round(unit.tileX);
    const oldY = Math.round(unit.tileY);
    map.removeOccupancy(oldX, oldY);
    try {
      MovementSystem._updateMovementInner(unit, deltaSec, map);
    } finally {
      // 基于新位置恢复占用，让同帧后续单位看到更准确的占用信息（帧内一致性）
      map.markOccupied(Math.round(unit.tileX), Math.round(unit.tileY));
    }
  }

  /** 移动主体逻辑（调用方负责排除/恢复自身占用） */
  private static _updateMovementInner(unit: Unit, deltaSec: number, map: GameMap): void {
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
      // 采集工人允许在矿点格重叠，不检查占用、不散开
      const isGatheringUnit = !!unit.targetResourceId;

      if (map.isOccupied(target.x, target.y) && !isGatheringUnit) {
        // 中间 waypoint 被别人占：P1-C5 修复：不再跳过 waypoint（会穿墙抄近路），
        // 改为重新寻路到终点，让 A* 绕过被占格
        const finalTarget = unit.path[unit.path.length - 1];
        if (finalTarget) {
          const newPath = MovementSystem.findPath(
            { x: Math.round(unit.tileX), y: Math.round(unit.tileY) },
            finalTarget, map, unit.category, unit.id,
            unit.spriteKey === 'unit_worker',
          );
          if (newPath.length > 0) {
            unit.path = newPath;
            unit.pathIndex = 0;
          } else {
            // 重寻路也失败 -> 放弃
            unit.clearPath();
            if (unit.state === 'moving') unit.state = 'idle';
          }
        } else {
          unit.clearPath();
          if (unit.state === 'moving') unit.state = 'idle';
        }
        return;
      }
      unit.tileX = target.x;
      unit.tileY = target.y;
      unit.pathIndex++;

      if (unit.pathIndex >= unit.path.length) {
        // 到达终点：非采集单位若被别人占则找空格散开
        if (!isGatheringUnit && map.isOccupied(target.x, target.y)) {
          MovementSystem._applyScatterOffset(unit, target.x, target.y, map);
        }
        if (unit.state === 'pursuing' && unit.targetEntityId) {
          // 追击到达 -> 准备攻击
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
    // P2-4 修复：坐标边界钳制，防止越界导致寻路/渲染异常
    const maxX = map.config.width - 1;
    const maxY = map.config.height - 1;
    if (unit.tileX < 0) unit.tileX = 0;
    else if (unit.tileX > maxX) unit.tileX = maxX;
    if (unit.tileY < 0) unit.tileY = 0;
    else if (unit.tileY > maxY) unit.tileY = maxY;
  }

  /**
   * 到达终点时若该格被其他单位占用，找最近的空整数格落下。
   * Fix B：替代原 0.3 浮点偏移（round 后仍同 key 导致叠放）。
   * 自身占用已在 updateMovement 入口排除，故 isOccupied 只会命中其他单位。
   * 搜索半径 ≤3 格，找到则落到该整数格；找不到则原地不动。
   */
  private static _applyScatterOffset(unit: Unit, baseX: number, baseY: number, map: GameMap): void {
    const w = map.config.width;
    const keyFn = (x: number, y: number) => y * w + x;
    // 收集当前被占用的格（排除自身，自身已在入口 removeOccupancy）
    const used = new Set<number>();
    // 从 baseX,baseY 起搜，跳过被其他单位占用的格
    const cx = Math.round(baseX), cy = Math.round(baseY);
    if (map.inBounds(cx, cy) && map.isPassable(cx, cy) && !map.isOccupied(cx, cy)) {
      unit.tileX = cx; unit.tileY = cy; return;
    }
    const maxR = 3;
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = cx + dx, y = cy + dy;
          if (!map.inBounds(x, y)) continue;
          if (!map.isPassable(x, y)) continue;
          if (map.isOccupied(x, y)) continue;
          if (used.has(keyFn(x, y))) continue;
          used.add(keyFn(x, y));
          unit.tileX = x; unit.tileY = y;
          return;
        }
      }
    }
    // 兜底：原地不动
  }
}