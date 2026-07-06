/**
 * 战争迷雾 — 基于单位视野的可视性系统
 *
 * 每个 tile 有三个状态：visible（当前可见）、explored（曾可见但当前不可见）、hidden（从未可见）
 */

export enum FogState {
  Hidden = 0,    // 从未探索
  Explored = 1,  // 曾探索但当前不可见（灰暗显示）
  Visible = 2,   // 当前可见
}

export class FogOfWar {
  private width: number;
  private height: number;
  private fog: FogState[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.fog = [];
    for (let y = 0; y < height; y++) {
      this.fog[y] = new Array(width).fill(FogState.Hidden);
    }
  }

  /** 每帧调用：先清空当前可见，再根据单位位置重新计算 */
  update(units: Array<{ tileX: number; tileY: number; sight: number; owner: number }>, playerIndex: number): void {
    // 重置当前帧可见为 Explored（保留探索记忆）
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.fog[y][x] === FogState.Visible) {
          this.fog[y][x] = FogState.Explored;
        }
      }
    }

    // 根据友方单位视野照亮
    for (const unit of units) {
      if (unit.owner !== playerIndex) continue;
      this.revealCircle(unit.tileX, unit.tileY, unit.sight);
    }
  }

  /** 以 (cx, cy) 为中心，半径 r tiles 的圆形区域设为 Visible */
  private revealCircle(cx: number, cy: number, r: number): void {
    const r2 = r * r;
    const minX = Math.max(0, cx - r);
    const maxX = Math.min(this.width - 1, cx + r);
    const minY = Math.max(0, cy - r);
    const maxY = Math.min(this.height - 1, cy + r);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          this.fog[y][x] = FogState.Visible;
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