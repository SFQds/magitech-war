/**
 * CommandCard 单元测试 - 命令按钮面板（含热键标注）
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: class PhaserStub {},
}));

import { CommandCard } from './CommandCard';
import type { CommandButton } from './CommandCard';

function makeScene() {
  const graphics = {
    clear: () => graphics, fillStyle: () => graphics, fillRoundedRect: () => graphics,
    lineStyle: () => graphics, strokeRoundedRect: () => graphics, fillRect: () => graphics,
    beginPath: () => graphics, moveTo: () => graphics, lineTo: () => graphics, strokePath: () => graphics,
    destroy: () => {},
  };
  const image = {
    setDisplaySize: () => image, setAlpha: () => image, setTint: () => image, setOrigin: () => image, destroy: () => {},
  };
  const text = {
    setOrigin: () => text, setText: () => text, setStyle: () => text, setColor: () => text, destroy: () => {},
  };
  const rect = {
    setOrigin: () => rect, setInteractive: () => rect, on: () => rect, destroy: () => {},
  };
  const container = {
    setDepth: () => container, setScrollFactor: () => container,
    add: () => container, removeAll: () => container, destroy: () => {},
  };
  const scene: any = {
    cameras: { main: { width: 1280, height: 720 } },
    add: {
      graphics: () => ({ ...graphics }),
      image: () => ({ ...image }),
      text: () => ({ ...text }),
      rectangle: () => ({ ...rect }),
      container: () => ({ ...container }),
    },
    textures: { exists: () => false },
  };
  return { scene };
}

describe('CommandCard - 构造', () => {
  it('构造不抛错', () => {
    const { scene } = makeScene();
    expect(() => new CommandCard(scene)).not.toThrow();
  });
});

describe('CommandCard - setCommands', () => {
  it('空命令列表不抛错', () => {
    const { scene } = makeScene();
    const card = new CommandCard(scene);
    expect(() => card.setCommands([])).not.toThrow();
  });

  it('单个命令不抛错', () => {
    const { scene } = makeScene();
    const card = new CommandCard(scene);
    const btn: CommandButton = { label: '测试', cost: '💎100', callback: () => {} };
    expect(() => card.setCommands([btn])).not.toThrow();
  });

  it('带热键的命令不抛错', () => {
    const { scene } = makeScene();
    const card = new CommandCard(scene);
    const btn: CommandButton = { label: '停止', cost: 'S', hotkey: 'S', callback: () => {} };
    expect(() => card.setCommands([btn])).not.toThrow();
  });

  it('禁用按钮不抛错', () => {
    const { scene } = makeScene();
    const card = new CommandCard(scene);
    const btn: CommandButton = { label: '锁定', cost: '🔒', callback: () => {}, disabled: true };
    expect(() => card.setCommands([btn])).not.toThrow();
  });

  it('多个命令不抛错', () => {
    const { scene } = makeScene();
    const card = new CommandCard(scene);
    const btns: CommandButton[] = [
      { label: '停止', cost: 'S', hotkey: 'S', callback: () => {} },
      { label: '坚守', cost: 'H', hotkey: 'H', callback: () => {} },
      { label: '攻击移动', cost: 'A', hotkey: 'A', callback: () => {} },
    ];
    expect(() => card.setCommands(btns)).not.toThrow();
  });
});

describe('CommandCard - clear / destroy', () => {
  it('clear 不抛错', () => {
    const { scene } = makeScene();
    const card = new CommandCard(scene);
    card.setCommands([{ label: 'x', cost: '', callback: () => {} }]);
    expect(() => card.clear()).not.toThrow();
  });

  it('destroy 不抛错', () => {
    const { scene } = makeScene();
    const card = new CommandCard(scene);
    expect(() => card.destroy()).not.toThrow();
  });
});
