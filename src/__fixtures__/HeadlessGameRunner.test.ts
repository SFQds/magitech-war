/**
 * HeadlessGameRunner 冒烟测试 — 验证无头游戏循环可跑起来
 */
import { describe, it, expect, afterEach } from 'vitest';
import { HeadlessGameRunner } from './HeadlessGameRunner';
import { EventBus } from '../utils/EventBus';

afterEach(() => EventBus.clear());

describe('HeadlessGameRunner — 冒烟', () => {
  it('构造 + 初始化：双方有 CC 和起始单位', () => {
    const r = new HeadlessGameRunner({ width: 64, height: 64, difficulty: 'normal' });
    expect(r.entities.buildings.length).toBeGreaterThan(0); // 双方 CC
    expect(r.entities.units.length).toBeGreaterThan(0); // 起始单位
    expect(r.entities.fields.length).toBeGreaterThan(0); // 资源点
    expect(r.gameOverCtrl.isOver).toBe(false);
    r.dispose();
  });

  it('跑 100 帧不崩溃', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    expect(() => r.runFrames(100, 0.1)).not.toThrow();
    expect(r.gameOverCtrl.isOver).toBe(false); // 100 帧=10秒，不该这么快结束
    r.dispose();
  });

  it('跑 500 帧后 AI 应有产出（单位数增加或建筑数增加）', () => {
    const r = new HeadlessGameRunner({ difficulty: 'hard' });
    const unitsBefore = r.entities.units.length;
    const bldsBefore = r.entities.buildings.length;
    r.runFrames(500, 0.1); // 50 秒
    // AI hard 应该训练了单位或建了建筑
    const grew = r.entities.units.length > unitsBefore || r.entities.buildings.length > bldsBefore;
    expect(grew).toBe(true);
    r.dispose();
  });
});
