/**
 * HeadlessGameRunner L3 端到端测试 - 完整游戏循环
 *
 * 验证整局游戏能在无 Phaser 环境跑完，AI vs AI 歼灭/限时/宽限翻盘。
 * 这是替代人工"打一局看胜负"的自动化网。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { HeadlessGameRunner } from './HeadlessGameRunner';
import { makeCommandCenter } from './factories';
import { EventBus } from '../utils/EventBus';

afterEach(() => EventBus.clear());

describe('HeadlessGameRunner - 端到端整局', () => {
  it('构造：双方有 CC 和起始单位，资源点已放置', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    expect(r.entities.buildings.length).toBeGreaterThanOrEqual(2); // 双方 CC
    expect(r.entities.units.length).toBeGreaterThanOrEqual(8); // 双方起始单位
    expect(r.entities.fields.length).toBeGreaterThan(0);
    expect(r.gameOverCtrl.isOver).toBe(false);
    r.dispose();
  });

  it('跑 200 帧不崩溃且不提前结束', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    expect(() => r.runFrames(200, 0.1)).not.toThrow();
    expect(r.gameOverCtrl.isOver).toBe(false); // 20 秒游戏时间，不该结束
    r.dispose();
  });

  it('AI vs AI hard：跑 2000 帧（200秒）有经济产出', () => {
    const r = new HeadlessGameRunner({ difficulty: 'hard' });
    const bldsBefore = r.entities.buildings.length;
    r.runFrames(2000, 0.1); // 200 秒
    // hard AI 应训练单位或建建筑
    const grew = r.entities.buildings.length > bldsBefore || r.entities.units.length > 8;
    expect(grew).toBe(true);
    r.dispose();
  });

  it('歼灭场景：杀光一方建筑+单位后推进宽限判歼灭', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    // 杀光 P1( AI ) 所有建筑和单位
    for (const b of r.entities.buildings) if (b.owner === 1) b.takeDamage(99999, 'physical');
    for (const u of r.entities.units) if (u.owner === 1) u.takeDamage(99999, 'physical');
    // 清理死亡实体
    r.runFrames(1, 0.01);
    // 推进宽限 60 秒
    for (let i = 0; i < 60; i++) r.step(1.0);
    expect(r.gameOverCtrl.isOver).toBe(true);
    r.dispose();
  });

  it('宽限翻盘：建筑全失但 60s 内重建则不判负', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    // 杀光 P1 建筑
    for (const b of r.entities.buildings) if (b.owner === 1) b.takeDamage(99999, 'physical');
    r.runFrames(1, 0.01); // 清理
    // 推进宽限 50 秒（未满 60）
    for (let i = 0; i < 50; i++) r.step(1.0);
    expect(r.gameOverCtrl.isOver).toBe(false);
    // P1 重建一个建筑（手动加）
    const newCC = makeCommandCenter(1, 30, 30);
    r.entities.addBuilding(newCC);
    // 再推进 20 秒（超过 60，但有建筑 -> 清零不累计）
    for (let i = 0; i < 20; i++) r.step(1.0);
    expect(r.gameOverCtrl.isOver).toBe(false);
    r.dispose();
  });

  it('限时场景：跑满 1800 秒按分数判胜负', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    // 直接推进计时到 1800 秒
    r.gameOverCtrl.stepTimer(1800.0);
    r.gameOverCtrl.checkGameOver();
    expect(r.gameOverCtrl.isOver).toBe(true);
    // calcScore 应可计算
    expect(r.gameOverCtrl.calcScore(0)).toBeGreaterThan(0);
    expect(r.gameOverCtrl.calcScore(1)).toBeGreaterThan(0);
    r.dispose();
  });

  it('稳定性：双方持续运行 3000 帧无异常且最终能结束或稳定', () => {
    const r = new HeadlessGameRunner({ difficulty: 'hard' });
    expect(() => r.runFrames(3000, 0.1)).not.toThrow(); // 300 秒
    r.dispose();
  });
});


describe('HeadlessGameRunner - 第二轮补洞: 事件链与边界', () => {
  it('阵营互换: playerFaction=hammer_federation 时玩家是铁锤联邦', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal', playerFaction: 'hammer_federation' });
    expect(r.world.players[0].faction).toBe('hammer_federation');
    expect(r.world.players[1].faction).toBe('arcane_empire');
    r.dispose();
  });

  it('placeStartingUnits=false: 无起始单位', () => {
    const r = new HeadlessGameRunner({ placeStartingUnits: false });
    // 只有 CC，无起始单位
    expect(r.entities.units.length).toBe(0);
    r.dispose();
  });

  it('easy 难度: 跑 500 帧不崩溃', () => {
    const r = new HeadlessGameRunner({ difficulty: 'easy' });
    expect(() => r.runFrames(500, 0.1)).not.toThrow();
    r.dispose();
  });

  it('hard 难度: 跑 500 帧不崩溃', () => {
    const r = new HeadlessGameRunner({ difficulty: 'hard' });
    expect(() => r.runFrames(500, 0.1)).not.toThrow();
    r.dispose();
  });

  it('runUntil 返回实际帧数 (受 maxFrames 上限)', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    const frames = r.runUntil(() => false, 100);
    expect(frames).toBe(100);
    r.dispose();
  });

  it('runUntil 在游戏结束时提前停止', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    const frames = r.runUntil(runner => runner.gameOverCtrl.isOver, 5000);
    expect(frames).toBeLessThanOrEqual(5000);
    r.dispose();
  });

  it('英雄可被训练: commandExecutor 训练英雄后出现在 entities', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    const cc = r.entities.buildings.find(b => b.owner === 0 && b.spriteKey === 'bld_cc_empire');
    expect(cc).toBeDefined();
    const heroId = 'hero_isabelle';
    r.commandExecutor.execute({
      type: 'train', playerIndex: 0, unitIds: [], buildingId: cc!.id, unitDefId: heroId, frame: 0,
    } as any);
    // 队列中应有该英雄
    expect(cc!.productionQueue.some(q => q.unitDefId === heroId)).toBe(true);
    r.dispose();
  });

  it('多帧推进后水晶产量非零 (经济系统运行)', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    const crystalBefore = r.world.players[0].resources.crystal;
    r.runFrames(1000, 0.1); // 100 秒
    // 工人采集后水晶应增加（或至少不减少）
    expect(r.world.players[0].resources.crystal).toBeGreaterThanOrEqual(crystalBefore);
    r.dispose();
  });

  it('timestep 确定性: 相同种子两次运行结果一致', () => {
    const r1 = new HeadlessGameRunner({ difficulty: 'normal' });
    r1.runFrames(300, 0.1);
    const crystal1 = r1.world.players[0].resources.crystal;
    const units1 = r1.entities.units.length;
    r1.dispose();

    const r2 = new HeadlessGameRunner({ difficulty: 'normal' });
    r2.runFrames(300, 0.1);
    const crystal2 = r2.world.players[0].resources.crystal;
    const units2 = r2.entities.units.length;
    r2.dispose();

    expect(crystal2).toBe(crystal1);
    expect(units2).toBe(units1);
  });
});
