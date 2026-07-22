/**
 * 游戏地图 — 瓦片网格系统
 *
 * 管理地形数据、可通过性、水晶矿脉位置
 * 默认 64×64 tiles，每个 tile 32×32 px
 */

import type { TerrainType } from '../types/data';

/** 地图配置 */
export interface MapConfig {
  name: string;
  width: number;        // tiles
  height: number;
  tileSize: number;     // px
}

/** 地形可通过性映射 */
const PASSABLE: Record<TerrainType, boolean> = {
  grass: true,
  sand: true,
  water: false,
  mountain: false,
  forest: true,         // 可通过但遮挡视野
};

/** 地形遮挡视野 */
const BLOCKS_SIGHT: Record<TerrainType, boolean> = {
  grass: false,
  sand: false,
  water: false,
  mountain: true,
  forest: true,
};

export class GameMap {
  readonly config: MapConfig;
  private tiles: TerrainType[][];  // [y][x]
  private passableGrid: boolean[][];
  private sightBlocker: boolean[][];
  /** 单位占用的瓦片（整数key=y*width+x），用于碰撞检测 */
  private occupiedUnitTiles: Set<number> = new Set();
  /** 资源矿点格（非工人单位不可进入） */
  private resourceTiles: Set<number> = new Set();

  /** 将 (x,y) 编码为整数 key */
  private encodeKey(x: number, y: number): number { return Math.round(y) * this.config.width + Math.round(x); }

  constructor(config: MapConfig) {
    this.config = config;
    this.tiles = [];
    this.passableGrid = [];
    this.sightBlocker = [];

    // 默认全草地
    for (let y = 0; y < config.height; y++) {
      this.tiles[y] = new Array(config.width).fill('grass');
      this.passableGrid[y] = new Array(config.width).fill(true);
      this.sightBlocker[y] = new Array(config.width).fill(false);
    }
  }

  // ============ 地形查询 ============

  /** 获取 tile 地形类型 */
  getTile(x: number, y: number): TerrainType {
    if (!this.inBounds(x, y)) return 'mountain';
    return this.tiles[y][x];
  }

  /** 设置 tile 地形 */
  setTile(x: number, y: number, terrain: TerrainType): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[y][x] = terrain;
    this.passableGrid[y][x] = PASSABLE[terrain];
    this.sightBlocker[y][x] = BLOCKS_SIGHT[terrain];
  }

  /** 是否可通过（单位移动、建筑放置） */
  isPassable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.passableGrid[y][x];
  }

  /** 是否可通过（含单位碰撞检测） */
  isPassableWithUnits(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (!this.passableGrid[y][x]) return false;
    if (this.occupiedUnitTiles.has(this.encodeKey(x, y))) return false;
    return true;
  }

  // ============ 单位碰撞（瓦片占用） ============

  /** 清除所有单位占用并重新计算（每帧调用） */
  rebuildUnitOccupancy(units: ReadonlyArray<{ tileX: number; tileY: number; isAlive: boolean }>): void {
    this.occupiedUnitTiles.clear();
    for (const u of units) {
      if (u.isAlive) {
        this.occupiedUnitTiles.add(this.encodeKey(u.tileX, u.tileY));
      }
    }
  }

  /** 查询某瓦片是否被单位占用 */
  isOccupied(x: number, y: number): boolean {
    return this.occupiedUnitTiles.has(this.encodeKey(x, y));
  }

  /** P1-R4 修复：即时标记单位占用（同帧批量 spawn/卸载时避免叠放） */
  markOccupied(x: number, y: number): void {
    this.occupiedUnitTiles.add(this.encodeKey(x, y));
  }

  /** P1-2 修复：移除指定 tile 的单位占用（寻路时排除自身） */
  removeOccupancy(x: number, y: number): void {
    this.occupiedUnitTiles.delete(this.encodeKey(x, y));
  }

  /** 注册资源矿点格（非工人单位不可进入此格） */
  registerResourceTile(x: number, y: number): void {
    this.resourceTiles.add(this.encodeKey(x, y));
  }

  /** 注销资源矿点格（矿枯竭移除时） */
  unregisterResourceTile(x: number, y: number): void {
    this.resourceTiles.delete(this.encodeKey(x, y));
  }

  /** 是否为资源矿点格 */
  isResourceTile(x: number, y: number): boolean {
    return this.resourceTiles.has(this.encodeKey(x, y));
  }

  /** 是否遮挡视野 */
  blocksSight(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.sightBlocker[y][x];
  }

  /** 是否在地图范围内 */
  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.config.width && y >= 0 && y < this.config.height;
  }

  // ============ 批量操作 ============

  /** 从 MapData 加载地形 */
  loadFromData(data: { tiles: TerrainType[][] }): void {
    for (let y = 0; y < Math.min(data.tiles.length, this.config.height); y++) {
      for (let x = 0; x < Math.min(data.tiles[y].length, this.config.width); x++) {
        this.setTile(x, y, data.tiles[y][x]);
      }
    }
  }

  /** 将指定矩形区域标记为不可通过（用于建筑占位） */
  markBlocked(x: number, y: number, w: number, h: number, blocked: boolean): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (this.inBounds(tx, ty)) {
          this.passableGrid[ty][tx] = !blocked;
        }
      }
    }
  }

  /** 获取可通过性网格的只读副本（寻路使用） */
  getPassableGrid(): ReadonlyArray<ReadonlyArray<boolean>> {
    return this.passableGrid;
  }

  /** 在坐标附近搜索最近可通过瓦片（用于安全放置单位）
   * P1-18 修复：同时检查地形和单位占用 */
  findNearbyPassable(startX: number, startY: number, maxRadius: number = 10): { x: number; y: number } | null {
    for (let r = 0; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // 只检查外圈
          const tx = startX + dx;
          const ty = startY + dy;
          if (this.isPassableWithUnits(tx, ty)) {
            return { x: tx, y: ty };
          }
        }
      }
    }
    return null;
  }

  /**
   * 为采集工人寻找终点 tile：从资源点的 8 邻格中选一个可通过且未被单位占用的格。
   *
   * P2-采矿散开 修复：派发采集命令时改用此 tile 作为寻路终点，避免多个工人
   * 都被引向矿点本身、后到者到点被散开到离矿点很远的旁格（曼哈顿 >1.5 进不了采集状态）。
   * 放让先到者占一格、后到者自然落别的相邻空格。若 8 邻格全被占则回退到矿点 tile，
   * 由 MovementSystem 的散开兜底处理。
   *
   * @param fieldX 资源点 tile 坐标
   * @param fieldY 资源点 tile 坐标
   * @returns 选中的终点 tile；若邻格全不可通行回退为 (fieldX, fieldY)
   */
  findGatherApproachTile(fieldX: number, fieldY: number): { x: number; y: number } | null {
    // 8 邻格，正交(上下左右)优先，距离资源点曼哈顿=1，可保证到点 dist≤1.5 切采集
    const offsets: Array<{ dx: number; dy: number }> = [
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
      { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
    ];
    for (const o of offsets) {
      const tx = fieldX + o.dx;
      const ty = fieldY + o.dy;
      if (this.isPassableWithUnits(tx, ty)) {
        return { x: tx, y: ty };
      }
    }
    // 邻格全占满：回退矿点 tile 本身（散开兜底处理）
    return null;
  }
}