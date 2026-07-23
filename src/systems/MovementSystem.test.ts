/**
 * MovementSystem 单元测试 — 锁定三轮审计修复点
 *
 * 覆盖：
 *  - A* 寻路（直线/绕障/起点终点阻塞）
 *  - excludeUnitId：自身占用不阻挡自己（P1-2 修复）
 *  - allowResourceTiles：工人可进矿点格，其他单位不可（矿点占用修复）
 *  - 对角线穿墙阻挡（P2-1 修复）
 *  - assignGroupGoals 编队散开：互异终点 + 确定性排序
 *  - updateMovement 瞬移修复：入口排除自身占用，到点不瞬移
 *  - 采集工人到矿点重叠不散开
 *  - 边界钳制（P2-4 修复）
 */
import { describe, it, expect } from 'vitest';
import { MovementSystem } from './MovementSystem';
import { grassMap, makeUnit as makeUnitBase } from '../__fixtures__/factories';

/** 造一个单位（位置参数风格薄包装，委托夹具库） */
function makeUnit(spriteKey = 'unit_rifleman', tileX = 0, tileY = 0, owner = 0) {
  return makeUnitBase({ spriteKey, tileX, tileY, owner });
}

describe('MovementSystem.findPath — A* 寻路', () => {
  it('直线寻路：起点到终点路径连续且首尾正确', () => {
    const map = grassMap();
    const path = MovementSystem.findPath({ x: 0, y: 0 }, { x: 5, y: 0 }, map, 'infantry');
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 5, y: 0 });
  });

  it('对角线寻路使用 8 方向', () => {
    const map = grassMap();
    const path = MovementSystem.findPath({ x: 0, y: 0 }, { x: 3, y: 3 }, map, 'infantry');
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 3, y: 3 });
    // 直线对角最短 4 步（含起点），不会绕大弯
    expect(path.length).toBeLessThanOrEqual(4);
  });

  it('绕障：水域阻挡时寻路绕行而非穿过', () => {
    const map = grassMap();
    // 在 (2,0)-(2,2) 竖一道水墙
    for (let y = 0; y < 3; y++) map.setTile(2, y, 'water');
    const path = MovementSystem.findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, map, 'infantry');
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 4, y: 0 });
    // 路径不得经过水墙格
    for (const p of path) {
      expect(map.getTile(p.x, p.y)).not.toBe('water');
    }
  });

  it('起点不可通过 → 返回空路径', () => {
    const map = grassMap();
    map.setTile(0, 0, 'water');
    const path = MovementSystem.findPath({ x: 0, y: 0 }, { x: 5, y: 0 }, map, 'infantry');
    expect(path).toEqual([]);
  });

  it('终点不可通过 → 返回空路径', () => {
    const map = grassMap();
    map.setTile(5, 0, 'mountain');
    const path = MovementSystem.findPath({ x: 0, y: 0 }, { x: 5, y: 0 }, map, 'infantry');
    expect(path).toEqual([]);
  });

  it('完全被围死 → 返回空路径（不无限循环）', () => {
    const map = grassMap(8, 8);
    // 把 (4,4) 四周围死
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        map.setTile(4 + dx, 4 + dy, 'mountain');
      }
    }
    const path = MovementSystem.findPath({ x: 0, y: 0 }, { x: 4, y: 4 }, map, 'infantry');
    expect(path).toEqual([]);
  });
});

describe('MovementSystem.findPath — excludeUnitId 自身占用排除（P1-2）', () => {
  it('自身占用起点格时仍可寻路（不阻挡自己）', () => {
    const map = grassMap();
    // 模拟单位自身占用了起点 (0,0)
    map.markOccupied(0, 0);
    // 无 excludeUnitId：起点虽可通过但邻居被自身占用阻挡 —— 注意 findPath 对起点/终点不检查占用
    // 带 excludeUnitId：寻路前 removeOccupancy(起点)，自身彻底不挡
    const path = MovementSystem.findPath({ x: 0, y: 0 }, { x: 3, y: 0 }, map, 'infantry', 'unit_1');
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 3, y: 0 });
  });

  it('excludeUnitId 调用后恢复占用（不污染地图状态）', () => {
    const map = grassMap();
    map.markOccupied(0, 0);
    MovementSystem.findPath({ x: 0, y: 0 }, { x: 3, y: 0 }, map, 'infantry', 'unit_1');
    // 调用后占用应恢复
    expect(map.isOccupied(0, 0)).toBe(true);
  });
});

describe('MovementSystem.findPath — 资源矿点格限制（矿点占用修复）', () => {
  it('非工人单位：终点在矿点格 → 返回空（allowResourceTiles=false）', () => {
    const map = grassMap();
    map.registerResourceTile(5, 0);
    const path = MovementSystem.findPath({ x: 0, y: 0 }, { x: 5, y: 0 }, map, 'infantry');
    expect(path).toEqual([]);
  });

  it('非工人单位：矿点格作为中间格被跳过 → 绕行', () => {
    const map = grassMap();
    map.registerResourceTile(3, 0);
    const path = MovementSystem.findPath({ x: 0, y: 0 }, { x: 6, y: 0 }, map, 'infantry');
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 6, y: 0 });
    // 路径不得经过矿点格（终点除外）
    for (const p of path) {
      expect(map.isResourceTile(p.x, p.y)).toBe(false);
    }
  });

  it('工人单位：allowResourceTiles=true 可进入矿点格', () => {
    const map = grassMap();
    map.registerResourceTile(5, 0);
    const path = MovementSystem.findPath({ x: 0, y: 0 }, { x: 5, y: 0 }, map, 'infantry', undefined, true);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 5, y: 0 });
  });
});

describe('MovementSystem.findPath — 对角线穿墙阻挡（P2-1）', () => {
  it('对角线两侧正交格被占时禁止抄近路', () => {
    const map = grassMap(10, 10);
    // 起点 (1,1) 仍有两个自由正交出口 (0,1)/(1,0) 可绕行，
    // 但对角线 (1,1)→(2,2) 的两个角格 (2,1)/(1,2) 被占 → 该对角步应被禁止
    map.markOccupied(2, 1);
    map.markOccupied(1, 2);
    const path = MovementSystem.findPath({ x: 1, y: 1 }, { x: 3, y: 3 }, map, 'infantry', 'self');
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toEqual({ x: 1, y: 1 });
    expect(path[path.length - 1]).toEqual({ x: 3, y: 3 });
    // 第一步不应是直接对角到 (2,2)（被挡的对角步）
    expect(path[1]).not.toEqual({ x: 2, y: 2 });
  });
});

describe('MovementSystem.navigate — 工人自动开启矿点通行', () => {
  it('工人 navigate 到矿点格能生成路径', () => {
    const map = grassMap();
    map.registerResourceTile(5, 0);
    const worker = makeUnit('unit_worker', 0, 0);
    MovementSystem.navigate(worker, { x: 5, y: 0 }, map);
    expect(worker.path.length).toBeGreaterThan(0);
    expect(worker.path[worker.path.length - 1]).toEqual({ x: 5, y: 0 });
  });

  it('非工人 navigate 到矿点格：路径为空（不进入矿点）', () => {
    const map = grassMap();
    map.registerResourceTile(5, 0);
    const rifleman = makeUnit('unit_rifleman', 0, 0);
    MovementSystem.navigate(rifleman, { x: 5, y: 0 }, map);
    expect(rifleman.path.length).toBe(0);
  });
});

describe('MovementSystem.assignGroupGoals — 编队散开（编队目标分配修复）', () => {
  it('多单位分配到互异的整数终点格', () => {
    const map = grassMap(20, 20);
    const units = [
      makeUnit('unit_rifleman', 0, 0),
      makeUnit('unit_rifleman', 1, 0),
      makeUnit('unit_rifleman', 2, 0),
      makeUnit('unit_rifleman', 3, 0),
    ];
    const goals = MovementSystem.assignGroupGoals(units, { x: 10, y: 10 }, map);
    expect(goals.size).toBe(units.length);
    const tiles = new Set<number>();
    for (const u of units) {
      const g = goals.get(u.id)!;
      tiles.add(g.y * 20 + g.x);
    }
    // 4 个单位应得到 4 个不同的格
    expect(tiles.size).toBe(units.length);
  });

  it('离 target 最近者优先占中心格', () => {
    const map = grassMap(20, 20);
    const near = makeUnit('unit_rifleman', 10, 9);   // 离 (10,10) 最近
    const far = makeUnit('unit_rifleman', 0, 0);
    const goals = MovementSystem.assignGroupGoals([far, near], { x: 10, y: 10 }, map);
    // near 应得到中心格 (10,10)
    expect(goals.get(near.id)).toEqual({ x: 10, y: 10 });
    // far 得到的是另一个格
    expect(goals.get(far.id)).not.toEqual({ x: 10, y: 10 });
  });

  it('并列距离按 unit.id 确定性排序', () => {
    const map = grassMap(20, 20);
    const a = makeUnit('unit_rifleman', 10, 9);
    const b = makeUnit('unit_rifleman', 9, 10); // 与 a 到 (10,10) 距离相同
    // 跑两次，结果应一致（确定性）
    const g1 = MovementSystem.assignGroupGoals([a, b], { x: 10, y: 10 }, map);
    const g2 = MovementSystem.assignGroupGoals([b, a], { x: 10, y: 10 }, map);
    expect(g1.get(a.id)).toEqual(g2.get(a.id));
    expect(g1.get(b.id)).toEqual(g2.get(b.id));
  });
});

describe('MovementSystem.updateMovement — 瞬移修复（P0 核心 bug）', () => {
  it('到点时不再瞬移：自身占用排除后正常推进', () => {
    const map = grassMap();
    const unit = makeUnit('unit_rifleman', 4.95, 0); // round=5，将到 (5,0)
    unit.setPath([{ x: 5, y: 0 }]);
    unit.state = 'moving';
    // 模拟 rebuildUnitOccupancy：round(4.95)=5，把目标格标记为自身占用
    map.markOccupied(5, 0);

    const beforeX = unit.tileX;
    MovementSystem.updateMovement(unit, 0.016, map);

    // 旧 bug：isOccupied(5,0)=true(自己) → findNearbyPassable → tileX 跳 1~2 格
    // 修复后：入口 removeOccupancy(5,0)，isOccupied=false，正常到点，无大跳
    const jump = Math.abs(unit.tileX - beforeX);
    expect(jump).toBeLessThan(1.0); // 一步移动量 = speed*delta，远小于 1
    // 到点后路径应被清空（clearPath 会清 path 和 pathIndex）
    expect(unit.path.length).toBe(0);
    expect(unit.pathIndex).toBe(0);
    // 单位状态不再 moving
    expect(unit.state).not.toBe('moving');
  });

  it('updateMovement 调用后基于新位置恢复占用', () => {
    const map = grassMap();
    const unit = makeUnit('unit_rifleman', 0, 0);
    unit.setPath([{ x: 1, y: 0 }]);
    unit.state = 'moving';
    MovementSystem.updateMovement(unit, 0.016, map);
    // 终点附近（未到点）应在新位置恢复占用
    const rx = Math.round(unit.tileX);
    expect(map.isOccupied(rx, 0)).toBe(true);
  });

  it('采集工人到矿点格不触发散开（允许重叠）', () => {
    const map = grassMap();
    const worker = makeUnit('unit_worker', 4.9, 0);
    worker.targetResourceId = 'field_1'; // 标记为采集单位
    worker.setPath([{ x: 5, y: 0 }]);
    worker.state = 'gathering';
    // 另一个单位占着 (5,0)
    map.markOccupied(5, 0);
    const beforeX = worker.tileX;
    MovementSystem.updateMovement(worker, 0.016, map);
    // 工人应正常到点，不被散开到远处
    const jump = Math.abs(worker.tileX - beforeX);
    expect(jump).toBeLessThan(1.0);
  });
});

describe('MovementSystem.updateMovement — 边界钳制（P2-4）', () => {
  it('移动后坐标不越界', () => {
    const map = grassMap(8, 8);
    const unit = makeUnit('unit_rifleman', 7, 7); // 右下角
    unit.setPath([{ x: 7, y: 7 }]); // 已在终点附近
    unit.state = 'moving';
    // 给极大 delta 试图冲出边界
    MovementSystem.updateMovement(unit, 1.0, map);
    expect(unit.tileX).toBeLessThanOrEqual(7);
    expect(unit.tileY).toBeLessThanOrEqual(7);
    expect(unit.tileX).toBeGreaterThanOrEqual(0);
    expect(unit.tileY).toBeGreaterThanOrEqual(0);
  });
});
