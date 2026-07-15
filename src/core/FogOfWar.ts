/**
 * 战争迷雾 — 基于单位视野的可视性系统
 *
 * 每个 tile 有三个状态：visible（当前可见）、explored（曾可见但当前不可见）、hidden（从未可见）
 * 使用整数 tile key（y*width+x）零GC。渲染增量：仅更新 changedKeys 中的瓦片。
 *
 * P1-15 修复：接入地形视线阻挡（山脉/森林阻断视线）
 */

import type { GameMap } from './GameMap';

export enum FogState {
  Hidden = 0,    // 从未探索
  Explored = 1,  // 曾探索但当前不可见（灰暗显示）
  Visible = 2,   // 当前可见
}

/** 用于迷雾更新的单位视图（避免直接依赖 Unit 类） */
export interface FogUnitView {
  readonly tileX: number;
  readonly tileY: number;
  readonly sight: number;
  readonly owner: number;
}

export class FogOfWar {
  private width: number;
  private height: number;
  private fog: FogState[][];

  /** P1-15: 地形引用（用于视线阻挡检查） */
  private map: GameMap | null = null;

  /** 上一帧可见（本帧需重置为Explored）的瓦片key */
  private prevVisibleKeys: number[] = [];
  /** 本帧状态变更的所有瓦片key（供渲染器增量更新） */
  private changedKeys: number[] = [];

  private encodeKey(x: number, y: number): number { return y * this.width + x; }

  constructor(width: number, height: number, map?: GameMap) {
    this.width = width;
    this.height = height;
    this.map = map ?? null;
    this.fog = [];
    for (let y = 0; y < height; y++) {
      this.fog[y] = new Array(width).fill(FogState.Hidden);
    }
  }

  /** P1-15: 设置地形引用（延迟注入） */
  setMap(map: GameMap): void {
    this.map = map;
  }

  /** 每帧调用：将上一帧可见瓦片重置为 Explored，然后照亮当前视野 */
  update(units: readonly FogUnitView[], playerIndex: number): void {
    this.changedKeys = [];

    // O(prevVisible) 只重置上一帧被照亮的瓦片
    for (const key of this.prevVisibleKeys) {
      const { x, y } = this.decodeKey(key);
      if (y >= 0 && y < this.height && x >= 0 && x < this.width && this.fog[y][x] === FogState.Visible) {
        this.fog[y][x] = FogState.Explored;
        this.changedKeys.push(key);
      }
    }
    this.prevVisibleKeys = [];

    // 根据友方单位视野照亮
    for (const unit of units) {
      if (unit.owner !== playerIndex) continue;
      this.revealCircle(unit.tileX, unit.tileY, unit.sight);
    }
  }

  private decodeKey(key: number): { x: number; y: number } {
    return { x: key % this.width, y: (key / this.width) | 0 };
  }

  /** P1-15: 判断两点之间视线是否被地形阻挡（Bresenham 线检测） */
  private hasLineOfSight(sx: number, sy: number, tx: number, ty: number): boolean {
    if (!this.map) return true; // 无地形数据时默认通视

    const dx = Math.abs(tx - sx);
    const dy = Math.abs(ty - sy);
    const stepX = sx < tx ? 1 : -1;
    const stepY = sy < ty ? 1 : -1;

    let x = sx;
    let y = sy;

    if (dx > dy) {
      let err = dx / 2;
      for (let i = 0; i < dx; i++) {
        x += stepX;
        err -= dy;
        if (err < 0) { y += stepY; err += dx; }
        // 跳过起点和终点
        if (x === tx && y === ty) break;
        if (this.map.blocksSight(x, y)) return false;
      }
    } else {
      let err = dy / 2;
      for (let i = 0; i < dy; i++) {
        y += stepY;
        err -= dx;
        if (err < 0) { x += stepX; err += dy; }
        if (x === tx && y === ty) break;
        if (this.map.blocksSight(x, y)) return false;
      }
    }
    return true;
  }

  /** 以 (cx, cy) 为中心，半径 r tiles 的圆形区域设为 Visible */
  private revealCircle(cx: number, cy: number, r: number): void {
    const r2 = r * r;
    const icx = Math.round(cx);
    const icy = Math.round(cy);
    const minX = Math.max(0, icx - r);
    const maxX = Math.min(this.width - 1, icx + r);
    const minY = Math.max(0, icy - r);
    const maxY = Math.min(this.height - 1, icy + r);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          // P1-15: 检查视线是否被地形阻挡
          if (!this.hasLineOfSight(icx, icy, x, y)) continue;

          const key = this.encodeKey(x, y);
          if (this.fog[y][x] !== FogState.Visible) {
            this.fog[y][x] = FogState.Visible;
            this.changedKeys.push(key);
          }
          this.prevVisibleKeys.push(key);
        }
      }
    }
  }

  /** 查询某个 tile 的迷雾状态 */
  getState(x: number, y: number): FogState {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return FogState.Hidden;
    return this.fog[y][x];
  }

  /** 对指定玩家是否可见 */
  isVisible(x: number, y: number): boolean {
    return this.getState(x, y) === FogState.Visible;
  }

  /** 是否已被探索（可见 + 曾可见） */
  isExplored(x: number, y: number): boolean {
    return this.getState(x, y) !== FogState.Hidden;
  }

  /** 获取完整迷雾网格引用 */
  getGrid(): ReadonlyArray<ReadonlyArray<FogState>> {
    return this.fog;
  }

  /** 获取本帧状态变更的瓦片 key 列表（供渲染器增量更新） */
  getChangedKeys(): number[] {
    return this.changedKeys;
  }

  /** 将指定矩形区域标记为已探索 */
  revealArea(x: number, y: number, w: number, h: number): void {
    for (let ty = y; ty < y + h && ty < this.height; ty++) {
      for (let tx = x; tx < x + w && tx < this.width; tx++) {
        if (tx >= 0 && ty >= 0 && tx < this.width && ty < this.height) {
          this.fog[ty][tx] = FogState.Explored;
        }
      }
    }
  }
}