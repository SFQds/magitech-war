/**
 * PauseMenu 单元测试
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: class PhaserStub {},
}));

import { PauseMenu } from './PauseMenu';

function makeScene() {
  const makeRect = () => {
    const r: any = {
      setOrigin: () => r, setDepth: () => r, setScrollFactor: () => r, destroy: () => {},
    };
    return r;
  };
  const makeText = () => {
    const t: any = {
      setOrigin: () => t, setDepth: () => t, setScrollFactor: () => t,
      setStyle: () => t, setInteractive: () => t, on: () => t, destroy: () => {},
    };
    return t;
  };
  const graphics = {
    clear: () => graphics, fillStyle: () => graphics, fillRoundedRect: () => graphics,
    lineStyle: () => graphics, strokeRoundedRect: () => graphics, fillRect: () => graphics,
    beginPath: () => graphics, moveTo: () => graphics, lineTo: () => graphics, strokePath: () => graphics,
    setAlpha: () => graphics, destroy: () => {},
  };
  const container: any = {
    setDepth: () => container, setScrollFactor: () => container,
    setVisible: () => container, add: () => container, destroy: () => {},
  };
  const scene: any = {
    cameras: { main: { width: 1280, height: 720 } },
    add: {
      rectangle: () => makeRect(), text: () => makeText(),
      graphics: () => ({ ...graphics }), container: () => ({ ...container }),
    },
    textures: { exists: () => false },
    time: { timeScale: 1 },
  };
  return { scene };
}

describe('PauseMenu - 构造', () => {
  it('构造不抛错', () => {
    const { scene } = makeScene();
    const cb = { onResume: vi.fn(), onRestart: vi.fn(), onMainMenu: vi.fn() };
    expect(() => new PauseMenu(scene, cb)).not.toThrow();
  });

  it('初始不可见', () => {
    const { scene } = makeScene();
    const cb = { onResume: vi.fn(), onRestart: vi.fn(), onMainMenu: vi.fn() };
    const menu = new PauseMenu(scene, cb);
    expect(menu.isVisible).toBe(false);
  });

  it('destroy 不抛错', () => {
    const { scene } = makeScene();
    const cb = { onResume: vi.fn(), onRestart: vi.fn(), onMainMenu: vi.fn() };
    const menu = new PauseMenu(scene, cb);
    expect(() => menu.destroy()).not.toThrow();
  });
});

describe('PauseMenu - show/hide', () => {
  it('show 后可见', () => {
    const { scene } = makeScene();
    const cb = { onResume: vi.fn(), onRestart: vi.fn(), onMainMenu: vi.fn() };
    const menu = new PauseMenu(scene, cb);
    menu.show();
    expect(menu.isVisible).toBe(true);
  });

  it('show 设置 timeScale=0', () => {
    const { scene } = makeScene();
    const cb = { onResume: vi.fn(), onRestart: vi.fn(), onMainMenu: vi.fn() };
    const menu = new PauseMenu(scene, cb);
    menu.show();
    expect(scene.time.timeScale).toBe(0);
  });

  it('hide 后不可见', () => {
    const { scene } = makeScene();
    const cb = { onResume: vi.fn(), onRestart: vi.fn(), onMainMenu: vi.fn() };
    const menu = new PauseMenu(scene, cb);
    menu.show();
    menu.hide();
    expect(menu.isVisible).toBe(false);
  });

  it('hide 恢复 timeScale=1', () => {
    const { scene } = makeScene();
    const cb = { onResume: vi.fn(), onRestart: vi.fn(), onMainMenu: vi.fn() };
    const menu = new PauseMenu(scene, cb);
    menu.show();
    menu.hide();
    expect(scene.time.timeScale).toBe(1);
  });

  it('hide 调用 onResume 回调', () => {
    const { scene } = makeScene();
    const onResume = vi.fn();
    const cb = { onResume, onRestart: vi.fn(), onMainMenu: vi.fn() };
    const menu = new PauseMenu(scene, cb);
    menu.hide();
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('show 后 hide 不再调用 onResume 第二次(仅 hide 触发)', () => {
    const { scene } = makeScene();
    const onResume = vi.fn();
    const cb = { onResume, onRestart: vi.fn(), onMainMenu: vi.fn() };
    const menu = new PauseMenu(scene, cb);
    menu.show();
    menu.hide();
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});

describe('PauseMenu - 多次切换', () => {
  it('show->hide->show 不抛错', () => {
    const { scene } = makeScene();
    const cb = { onResume: vi.fn(), onRestart: vi.fn(), onMainMenu: vi.fn() };
    const menu = new PauseMenu(scene, cb);
    menu.show();
    menu.hide();
    expect(() => menu.show()).not.toThrow();
    expect(menu.isVisible).toBe(true);
  });
});
