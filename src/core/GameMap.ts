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

  /** 在坐标附近搜索最近可通过瓦片（用于安全放置单位） */
  findNearbyPassable(startX: number, startY: number, maxRadius: number = 10): { x: number; y: number } | null {
    for (let r = 0; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // 只检查外圈
          const tx = startX + dx;
          const ty = startY + dy;
          if (this.isPassable(tx, ty)) {
            return { x: tx, y: ty };
          }
        }
      }
    }
    return null;
  }
}