/**
 * FpsCounter 单元测试
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({ default: class PhaserStub {} }));

import { FpsCounter } from './FpsCounter';

function makeScene() {
  const text: any = {
    setOrigin: () => text, setDepth: () => text, setScrollFactor: () => text,
    setAlpha: () => text, setVisible: () => text, setText: () => text, destroy: () => {},
  };
  const keyboard = { on: () => {} };
  const scene: any = {
    add: { text: () => ({ ...text }) },
    input: { keyboard },
    game: { loop: { actualFps: 60 } },
  };
  return { scene };
}

describe('FpsCounter', () => {
  it('构造不抛错', () => {
    const { scene } = makeScene();
    expect(() => new FpsCounter(scene)).not.toThrow();
  });

  it('初始不可见', () => {
    const { scene } = makeScene();
    const fc = new FpsCounter(scene);
    expect(fc.isVisible).toBe(false);
  });

  it('toggle 切换可见性', () => {
    const { scene } = makeScene();
    const fc = new FpsCounter(scene);
    fc.toggle();
    expect(fc.isVisible).toBe(true);
    fc.toggle();
    expect(fc.isVisible).toBe(false);
  });

  it('update 不可见时不刷新', () => {
    const { scene } = makeScene();
    const fc = new FpsCounter(scene);
    expect(() => fc.update(0.016)).not.toThrow();
  });

  it('update 可见时不抛错', () => {
    const { scene } = makeScene();
    const fc = new FpsCounter(scene);
    fc.toggle();
    expect(() => fc.update(0.016)).not.toThrow();
  });

  it('destroy 不抛错', () => {
    const { scene } = makeScene();
    const fc = new FpsCounter(scene);
    expect(() => fc.destroy()).not.toThrow();
  });
});
