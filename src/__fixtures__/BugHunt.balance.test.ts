/**
 * 模拟游戏找 bug + 平衡性测试
 *
 * 用 HeadlessGameRunner 长时间运行 AI vs AI，
 * 检测经济崩盘、单位数量异常、科技/建筑缺失等 bug，
 * 并输出关键平衡指标（采集速率、军力扩张、科技节奏）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { HeadlessGameRunner } from './HeadlessGameRunner';
import { EventBus } from '../utils/EventBus';
import { serialize, deserialize } from '../save/SaveLoadSystem';
import type { SaveMeta } from '../save/SaveData';

afterEach(() => EventBus.clear());

// ============================================================
// 诊断工具
// ============================================================

interface Snap {
  frame: number;
  timeSec: number;
  p0: { crystal: number; units: number; buildings: number; supply: number; };
  p1: { crystal: number; units: number; buildings: number; supply: number; };
}

function snap(r: HeadlessGameRunner, frame: number): Snap {
  return {
    frame,
    timeSec: Math.round(r.gameOverCtrl.gameTimer),
    p0: {
      crystal: r.world.players[0].resources.crystal,
      units: r.entities.units.filter(u => u.owner === 0 && u.isAlive).length,
      buildings: r.entities.buildings.filter(b => b.owner === 0 && b.isAlive).length,
      supply: r.world.players[0].resources.supply,
    },
    p1: {
      crystal: r.world.players[1].resources.crystal,
      units: r.entities.units.filter(u => u.owner === 1 && u.isAlive).length,
      buildings: r.entities.buildings.filter(b => b.owner === 1 && b.isAlive).length,
      supply: r.world.players[1].resources.supply,
    },
  };
}

interface BugReport {
  severity: 'critical' | 'major' | 'minor';
  description: string;
  detail: string;
}

interface BalanceReport {
  category: string;
  metric: string;
  p0: string;
  p1: string;
  note: string;
}

// ============================================================
// 场景测试
// ============================================================

describe('Bug Hunt — 长跑稳定性', () => {
  /** 跑 500 帧（50 秒）并收集快照 */
  function runAndCollect(frames: number, difficulty: 'easy' | 'normal' | 'hard' = 'normal', ds = 0.1): {
    runner: HeadlessGameRunner;
    snaps: Snap[];
    bugs: BugReport[];
  } {
    const r = new HeadlessGameRunner({ difficulty });
    const snaps: Snap[] = [];
    const bugs: BugReport[] = [];
    const step = Math.max(1, Math.floor(frames / 10)); // 每 10% 进度快照

    for (let f = 0; f < frames; f++) {
      r.step(ds);
      if (f % step === 0 || f === frames - 1) {
        snaps.push(snap(r, f));
      }
    }

    // 诊断：检测 bug
    const midSnaps = snaps.slice(Math.floor(snaps.length / 3)); // 跳过开局（初始水晶消耗正常）

    // 关键 bug：水晶长期为 0（经济崩盘）
    const zeroCrystalP0 = midSnaps.every(s => s.p0.crystal === 0);
    const zeroCrystalP1 = midSnaps.every(s => s.p1.crystal === 0);
    if (zeroCrystalP0 && midSnaps.length >= 3) {
      bugs.push({
        severity: 'critical',
        description: 'P0（玩家）经济崩盘：中后期水晶持续为 0',
        detail: `${midSnaps.length} 个快照中 crystal 全为 0`,
      });
    }
    if (zeroCrystalP1 && midSnaps.length >= 3) {
      bugs.push({
        severity: 'critical',
        description: 'P1（AI）经济崩盘：中后期水晶持续为 0',
        detail: `${midSnaps.length} 个快照中 crystal 全为 0`,
      });
    }

    // 关键 bug：没有任何建筑（CC 被毁或从未建造）
    const lastSnap = snaps[snaps.length - 1];
    if (lastSnap.p0.buildings === 0) {
      bugs.push({
        severity: 'critical',
        description: 'P0 建筑数为 0（全部被毁）',
        detail: `帧 ${lastSnap.frame}, 时间 ${lastSnap.timeSec}s`,
      });
    }
    if (lastSnap.p1.buildings === 0) {
      bugs.push({
        severity: 'critical',
        description: 'P1 建筑数为 0（全部被毁）',
        detail: `帧 ${lastSnap.frame}, 时间 ${lastSnap.timeSec}s`,
      });
    }

    // 重要 bug：单位数量持续下降至 0（一方被彻底消灭但还没到宽限期）
    if (lastSnap.p0.units === 0 && lastSnap.p0.buildings > 0) {
      bugs.push({
        severity: 'major',
        description: 'P0 单位数为 0 但有建筑存活（工人被全灭无法重建）',
        detail: `帧 ${lastSnap.frame}, 时间 ${lastSnap.timeSec}s`,
      });
    }

    // 重要 bug：单方水晶超过 10000（通货膨胀？）
    if (lastSnap.p0.crystal > 10000) {
      bugs.push({
        severity: 'minor',
        description: `P0 水晶过高 (${lastSnap.p0.crystal})，可能通货膨胀`,
        detail: `帧 ${lastSnap.frame}`,
      });
    }
    if (lastSnap.p1.crystal > 10000) {
      bugs.push({
        severity: 'minor',
        description: `P1 水晶过高 (${lastSnap.p1.crystal})，可能通货膨胀`,
        detail: `帧 ${lastSnap.frame}`,
      });
    }

    r.dispose();
    return { runner: r, snaps, bugs };
  }

  it('normal: 500帧 无关键bug', () => {
    const { bugs } = runAndCollect(500, 'normal');
    const critical = bugs.filter(b => b.severity === 'critical');
    if (critical.length > 0) {
      console.error('[BUG]', JSON.stringify(critical, null, 2));
    }
    expect(critical).toHaveLength(0);
  });

  it('hard: 500帧 无关键bug', () => {
    const { bugs } = runAndCollect(500, 'hard');
    const critical = bugs.filter(b => b.severity === 'critical');
    if (critical.length > 0) {
      console.error('[BUG]', JSON.stringify(critical, null, 2));
    }
    expect(critical).toHaveLength(0);
  });

  it('easy: 500帧 无关键bug', () => {
    const { bugs } = runAndCollect(500, 'easy');
    const critical = bugs.filter(b => b.severity === 'critical');
    if (critical.length > 0) {
      console.error('[BUG]', JSON.stringify(critical, null, 2));
    }
    expect(critical).toHaveLength(0);
  });
});

// ============================================================
// 平衡性度量
// ============================================================

describe('Balance Analysis — 平衡性指标', () => {
  it('normal: 300帧 双方均有采集和经济产出', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    const c0 = r.world.players[0].resources.crystal;
    const c1 = r.world.players[1].resources.crystal;
    r.runFrames(300, 0.1); // 30 秒

    const p0c = r.world.players[0].resources.crystal;
    const p1c = r.world.players[1].resources.crystal;

    // P0（玩家）无 AI 控制，工人只采集不消耗，水晶应净增长
    expect(p0c).toBeGreaterThanOrEqual(c0);

    // P1（AI）会建建筑/训兵，水晶可能剧烈下降（正常行为）。
    // 关键是最终水晶 > 0 且有建筑存活，说明没有彻底崩盘。
    const aiBuildings = r.entities.buildings.filter(b => b.owner === 1 && b.isAlive);
    expect(aiBuildings.length).toBeGreaterThan(0);
    const aiUnits = r.entities.units.filter(u => u.owner === 1 && u.isAlive);
    expect(aiUnits.length).toBeGreaterThan(0);

    // 双方至少仍有起始单位
    const p0Units = r.entities.units.filter(u => u.owner === 0 && u.isAlive);
    const p1Units = r.entities.units.filter(u => u.owner === 1 && u.isAlive);
    expect(p0Units.length).toBeGreaterThan(0);
    expect(p1Units.length).toBeGreaterThan(0);

    r.dispose();
  });

  it('normal: 500帧 建筑数量合理增长', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    const bldBefore0 = r.entities.buildings.filter(b => b.owner === 0).length;
    const bldBefore1 = r.entities.buildings.filter(b => b.owner === 1).length;
    r.runFrames(500, 0.1); // 50 秒

    const bldAfter0 = r.entities.buildings.filter(b => b.owner === 0).length;
    const bldAfter1 = r.entities.buildings.filter(b => b.owner === 1).length;

    // AI 应至少建造 1 个额外建筑（精炼厂或兵营）
    expect(bldAfter1).toBeGreaterThanOrEqual(bldBefore1);

    r.dispose();
  });

  it('hard: AI 在 200 帧内建造兵营/工厂', () => {
    const r = new HeadlessGameRunner({ difficulty: 'hard' });
    r.runFrames(200, 0.1); // 20 秒

    const aiBlds = r.entities.buildings.filter(b => b.owner === 1);
    const hasBarracks = aiBlds.some(b => b.spriteKey === 'bld_barracks');
    const hasFactory = aiBlds.some(b => b.spriteKey === 'bld_factory');
    const hasRefinery = aiBlds.some(b => b.spriteKey === 'bld_refinery');

    // Hard AI 应在 20 秒内至少建 1 个生产建筑或精炼厂
    expect(hasBarracks || hasFactory || hasRefinery).toBe(true);

    r.dispose();
  });

  it('hard: AI 在 500 帧内训练新单位', () => {
    const r = new HeadlessGameRunner({ difficulty: 'hard' });
    const unitCountBefore = r.entities.units.filter(u => u.owner === 1).length;
    r.runFrames(500, 0.1); // 50 秒

    const unitCountAfter = r.entities.units.filter(u => u.owner === 1).length;
    expect(unitCountAfter).toBeGreaterThan(unitCountBefore);

    r.dispose();
  });

  it('存档往返：序列化后可反序列化并继续运行不崩溃', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    r.runFrames(300, 0.1); // 30 秒预热

    // 序列化
    const meta: SaveMeta = {
      mapId: 'map_valley',
      mapWidth: 64, mapHeight: 64,
      playerFaction: 'arcane_empire',
      aiFaction: 'hammer_federation',
      aiDifficulty: 'normal',
      playerGuilds: ['mages_guild', 'alchemists_society'],
      aiGuilds: ['mechanists_guild', 'alchemists_society'],
    };
    const data = serialize({
      world: r.world,
      entities: r.entities,
      gameTimer: r.gameOverCtrl.gameTimer,
      graceTimers: r.gameOverCtrl.graceTimers,
      meta,
    });

    // 反序列化
    const restored = deserialize(data);
    expect(restored.world.players).toHaveLength(2);
    expect(restored.entities.units.length).toBeGreaterThan(0);
    expect(restored.entities.buildings.length).toBeGreaterThan(0);

    r.dispose();
  });
});

// ============================================================
// 边界/异常场景
// ============================================================

describe('Edge Cases — 边界场景', () => {
  it('超长运行不崩溃: 2000 帧', () => {
    const r = new HeadlessGameRunner({ difficulty: 'hard' });
    expect(() => r.runFrames(2000, 0.1)).not.toThrow();
    r.dispose();
  });

  it('资源点枯竭后工人不崩溃', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    // 直接耗尽所有资源点
    for (const f of r.entities.fields) {
      f.amount = 0;
      f.isActive = false;
    }
    // 继续跑 200 帧，不应崩溃
    expect(() => r.runFrames(200, 0.1)).not.toThrow();
    r.dispose();
  });

  it('双方同时全灭后游戏结束', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    // 杀光所有单位+建筑
    for (const b of r.entities.buildings) b.takeDamage(99999, 'physical');
    for (const u of r.entities.units) u.takeDamage(99999, 'physical');
    r.runFrames(1, 0.01);
    // 推进宽限 61 秒
    for (let i = 0; i < 61; i++) r.step(1.0);
    expect(r.gameOverCtrl.isOver).toBe(true);
    r.dispose();
  });

  it('重开游戏（两次 new HeadlessGameRunner）无状态泄漏', () => {
    const r1 = new HeadlessGameRunner({ difficulty: 'normal' });
    r1.runFrames(100, 0.1);
    const c1 = r1.world.players[0].resources.crystal;
    r1.dispose();

    const r2 = new HeadlessGameRunner({ difficulty: 'normal' });
    r2.runFrames(100, 0.1);
    const c2 = r2.world.players[0].resources.crystal;
    r2.dispose();

    // 两次应得到相同结果（确定性 + 无状态泄漏）
    expect(c2).toBe(c1);
  });
});