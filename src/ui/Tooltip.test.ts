/**
 * Tooltip 单元测试
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({ default: class PhaserStub {} }));

import { Tooltip } from './Tooltip';

function makeScene() {
  const text: any = {
    setOrigin: () => text, setDepth: () => text, setScrollFactor: () => text,
    setColor: () => text, destroy: () => {},
  };
  const rect: any = {
    setOrigin: () => rect, setDepth: () => rect, setScrollFactor: () => rect,
    setSize: () => rect, destroy: () => {},
  };
  const container: any = {
    setDepth: () => container, setScrollFactor: () => container,
    setVisible: () => container, add: () => container, setPosition: () => container, destroy: () => {},
  };
  const scene: any = {
    cameras: { main: { width: 1280, height: 720 } },
    add: { text: () => ({ ...text }), rectangle: () => ({ ...rect }), container: () => ({ ...container }) },
  };
  return { scene };
}

describe('Tooltip', () => {
  it('构造不抛错', () => {
    const { scene } = makeScene();
    expect(() => new Tooltip(scene)).not.toThrow();
  });

  it('show 单行不抛错', () => {
    const { scene } = makeScene();
    const tt = new Tooltip(scene);
    expect(() => tt.show(100, 100, ['测试提示'])).not.toThrow();
  });

  it('show 多行不抛错', () => {
    const { scene } = makeScene();
    const tt = new Tooltip(scene);
    expect(() => tt.show(100, 100, ['标题', '属性: 100', '造价: 💎200'])).not.toThrow();
  });

  it('show 后 hide 不抛错', () => {
    const { scene } = makeScene();
    const tt = new Tooltip(scene);
    tt.show(100, 100, ['x']);
    expect(() => tt.hide()).not.toThrow();
  });

  it('连续 show 刷新内容不抛错', () => {
    const { scene } = makeScene();
    const tt = new Tooltip(scene);
    tt.show(100, 100, ['a']);
    expect(() => tt.show(200, 200, ['b', 'c'])).not.toThrow();
  });

  it('屏幕边缘钳制不抛错', () => {
    const { scene } = makeScene();
    const tt = new Tooltip(scene);
    expect(() => tt.show(1270, 710, ['边缘'])).not.toThrow();
  });

  it('destroy 不抛错', () => {
    const { scene } = makeScene();
    const tt = new Tooltip(scene);
    expect(() => tt.destroy()).not.toThrow();
  });
});
