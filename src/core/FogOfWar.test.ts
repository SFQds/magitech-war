/**
 * FogOfWar 单元测试 — 锁定迷雾可见性审计修复点
 *
 * 覆盖：
 *  - 初始全 Hidden
 *  - update 后友方单位视野内变 Visible
 *  - 上一帧 Visible 本帧无视野 → 降为 Explored（曾可见）
 *  - 异方单位不为本方提供视野
 *  - 建筑也提供视野（P1-FOG1）
 *  - 地形视线阻挡（P1-15：山脉/森林阻断）
 *  - getState/isVisible/isExplored 查询
 *  - revealArea 手动标记已探索
 */
import { describe, it, expect } from 'vitest';
import { FogOfWar, FogState } from './FogOfWar';
import { GameMap } from './GameMap';
import { view } from '../__fixtures__/factories';

describe('FogOfWar — 初始状态', () => {
  it('初始全 Hidden', () => {
    const fog = new FogOfWar(8, 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(fog.getState(x, y)).toBe(FogState.Hidden);
      }
    }
  });

  it('越界查询返回 Hidden', () => {
    const fog = new FogOfWar(8, 8);
    expect(fog.getState(-1, 0)).toBe(FogState.Hidden);
    expect(fog.getState(8, 8)).toBe(FogState.Hidden);
  });
});

describe('FogOfWar — 视野揭示', () => {
  it('update 后友方单位视野内变 Visible', () => {
    const fog = new FogOfWar(16, 16);
    const unit = view(0, 5, 5, 2);
    fog.update([unit], 0);
    expect(fog.isVisible(5, 5)).toBe(true);
    expect(fog.isVisible(6, 5)).toBe(true);
    expect(fog.isVisible(7, 5)).toBe(true); // 距离 2 ≤ sight
    expect(fog.isVisible(8, 5)).toBe(false); // 距离 3 > sight
  });

  it('异方单位不为本方提供视野', () => {
    const fog = new FogOfWar(16, 16);
    const enemyUnit = view(1, 5, 5, 3);
    fog.update([enemyUnit], 0); // 查玩家 0 视野
    expect(fog.isVisible(5, 5)).toBe(false);
  });

  it('建筑也提供视野（P1-FOG1）', () => {
    const fog = new FogOfWar(16, 16);
    const building = view(0, 5, 5, 6);
    fog.update([], 0, [building]);
    expect(fog.isVisible(5, 5)).toBe(true);
    expect(fog.isVisible(10, 5)).toBe(true); // 距离 5 ≤ sight 6
  });
});

describe('FogOfWar — Explored 降级（曾可见）', () => {
  it('上一帧 Visible 本帧无视野 → 降为 Explored', () => {
    const fog = new FogOfWar(16, 16);
    const unit = view(0, 5, 5, 2);
    // 第 1 帧：照亮 (5,5) 周围
    fog.update([unit], 0);
    expect(fog.isVisible(6, 5)).toBe(true);

    // 第 2 帧：单位离开，无任何友方视野
    fog.update([], 0);
    expect(fog.isVisible(6, 5)).toBe(false);
    expect(fog.isExplored(6, 5)).toBe(true); // 曾可见
    expect(fog.getState(6, 5)).toBe(FogState.Explored);
  });

  it('从未照亮的格保持 Hidden（非 Explored）', () => {
    const fog = new FogOfWar(16, 16);
    fog.update([view(0, 0, 0, 2)], 0);
    expect(fog.isExplored(15, 15)).toBe(false);
    expect(fog.getState(15, 15)).toBe(FogState.Hidden);
  });

  it('重新照亮 Explored 格会再次变 Visible', () => {
    const fog = new FogOfWar(16, 16);
    fog.update([view(0, 5, 5, 2)], 0);
    fog.update([], 0); // (6,5) → Explored
    expect(fog.getState(6, 5)).toBe(FogState.Explored);
    fog.update([view(0, 6, 5, 2)], 0); // 重新照亮
    expect(fog.isVisible(6, 5)).toBe(true);
  });
});

describe('FogOfWar — 地形视线阻挡（P1-15）', () => {
  it('山脉阻挡视线，其后的格不可见（山脉自身仍可见）', () => {
    const map = new GameMap({ name: 't', width: 16, height: 16, tileSize: 32 });
    // 在 (6,5) 放山脉，挡住 (5,5)→(7,5) 视线
    map.setTile(6, 5, 'mountain');
    const fog = new FogOfWar(16, 16, map);
    fog.update([view(0, 5, 5, 5)], 0);
    expect(fog.isVisible(5, 5)).toBe(true);
    // 山脉自身 (6,5) 是 LOS 终点，循环里 break 跳过遮挡检查 → 仍可见
    expect(fog.isVisible(6, 5)).toBe(true);
    // (7,5) 在山脉后，视线被 (6,5) 阻挡 → 不可见
    expect(fog.isVisible(7, 5)).toBe(false);
  });

  it('无地形引用时默认通视（不阻挡）', () => {
    const fog = new FogOfWar(16, 16); // 无 map
    fog.update([view(0, 5, 5, 5)], 0);
    expect(fog.isVisible(10, 5)).toBe(true);
  });
});

describe('FogOfWar — revealArea 手动探索', () => {
  it('revealArea 把矩形区域标记为 Explored', () => {
    const fog = new FogOfWar(16, 16);
    fog.revealArea(5, 5, 3, 3);
    expect(fog.getState(5, 5)).toBe(FogState.Explored);
    expect(fog.getState(7, 7)).toBe(FogState.Explored);
    expect(fog.isVisible(5, 5)).toBe(false); // Explored 非 Visible
  });

  it('revealArea 不越界', () => {
    const fog = new FogOfWar(8, 8);
    fog.revealArea(6, 6, 5, 5); // 超出 8x8
    expect(fog.getState(7, 7)).toBe(FogState.Explored);
    expect(fog.getState(8, 8)).toBe(FogState.Hidden); // 越界
  });
});

describe('FogOfWar — 查询 API', () => {
  it('isVisible 仅在 Visible 时 true', () => {
    const fog = new FogOfWar(16, 16);
    expect(fog.isVisible(0, 0)).toBe(false);
    fog.update([view(0, 0, 0, 1)], 0);
    expect(fog.isVisible(0, 0)).toBe(true);
  });

  it('isExplored 对 Visible 和 Explored 都 true', () => {
    const fog = new FogOfWar(16, 16);
    fog.update([view(0, 0, 0, 1)], 0);
    expect(fog.isExplored(0, 0)).toBe(true); // Visible
    fog.update([], 0);
    expect(fog.isExplored(0, 0)).toBe(true); // Explored
  });

  it('getChangedKeys 返回本帧状态变更的瓦片', () => {
    const fog = new FogOfWar(16, 16);
    fog.update([view(0, 5, 5, 1)], 0);
    const changed = fog.getChangedKeys();
    expect(changed.length).toBeGreaterThan(0);
  });
});
