/**
 * SuperWeaponBar 单元测试 - 超武按钮栏
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: class PhaserStub {},
}));

import { SuperWeaponBar } from './SuperWeaponBar';
import { SuperWeaponSystem } from '../systems/SuperWeaponSystem';

function makeScene() {
  const graphics = {
    clear: () => graphics, fillStyle: () => graphics, fillRoundedRect: () => graphics,
    lineStyle: () => graphics, strokeRoundedRect: () => graphics,
    setDepth: () => graphics, setScrollFactor: () => graphics, destroy: () => {},
  };
  const text = {
    setOrigin: () => text, setDepth: () => text, setScrollFactor: () => text,
    setText: (s: string) => { text['_text'] = s; return text; },
    setColor: () => text, setAlpha: (a: number) => { text['_alpha'] = a; return text; },
    setStyle: () => text, destroy: () => {}, _text: '', _alpha: 1,
  };
  const rect = {
    setOrigin: () => rect, setDepth: () => rect, setScrollFactor: () => rect,
    setInteractive: () => rect, on: () => rect, destroy: () => {},
  };
  const container = {
    setDepth: () => container, setScrollFactor: () => container,
    add: () => container, destroy: () => {},
  };
  const scene: any = {
    add: { graphics: () => graphics, text: () => ({ ...text }), rectangle: () => ({ ...rect }), container: () => ({ ...container }) },
  };
  return { scene };
}

beforeEach(() => {
  // 重置超武状态
  SuperWeaponSystem.initPlayer(0, ['mages_guild', 'alchemists_society']);
  SuperWeaponSystem.initPlayer(1, ['mechanists_guild', 'void_institute']);
});

describe('SuperWeaponBar - 构造', () => {
  it('玩家0有2个行会 -> 2个超武按钮', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    // mages_guild->elemental_storm, alchemists_society->solvent_bomb
    expect((bar as any).buttons).toHaveLength(2);
    bar.destroy();
  });

  it('玩家1有2个行会 -> 2个超武按钮(不同行会)', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 1, 100, 100);
    // mechanists_guild->orbital_cannon, void_institute->void_rift
    expect((bar as any).buttons).toHaveLength(2);
    bar.destroy();
  });

  it('无行会玩家 -> 0个按钮', () => {
    SuperWeaponSystem.initPlayer(2, []);
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 2, 100, 100);
    expect((bar as any).buttons).toHaveLength(0);
    bar.destroy();
  });
});

describe('SuperWeaponBar - 瞄准模式', () => {
  it('初始无瞄准', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    expect(bar.aimingWeaponId).toBeNull();
    bar.destroy();
  });

  it('点击可用超武进入瞄准模式', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    // 模拟点击第一个按钮（elemental_storm, 冷却0）
    (bar as any)._onClick('elemental_storm');
    expect(bar.aimingWeaponId).toBe('elemental_storm');
    bar.destroy();
  });

  it('再次点击同一超武取消瞄准', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    (bar as any)._onClick('elemental_storm');
    expect(bar.aimingWeaponId).toBe('elemental_storm');
    (bar as any)._onClick('elemental_storm');
    expect(bar.aimingWeaponId).toBeNull();
    bar.destroy();
  });

  it('confirmTarget 返回 true 并清空瞄准', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    (bar as any)._onClick('elemental_storm');
    const result = bar.confirmTarget(10, 20);
    expect(result).toBe(true);
    expect(bar.aimingWeaponId).toBeNull();
    bar.destroy();
  });

  it('confirmTarget 无瞄准时返回 false', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    expect(bar.confirmTarget(10, 20)).toBe(false);
    bar.destroy();
  });

  it('cancelAim 清空瞄准', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    (bar as any)._onClick('elemental_storm');
    bar.cancelAim();
    expect(bar.aimingWeaponId).toBeNull();
    bar.destroy();
  });

  it('onActivate 回调在 confirmTarget 时被调用并携带目标坐标', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    const cb = vi.fn();
    bar.onActivate(cb);
    (bar as any)._onClick('elemental_storm');
    bar.confirmTarget(5, 7);
    expect(cb).toHaveBeenCalledWith('elemental_storm', 5, 7);
    bar.destroy();
  });
});

describe('SuperWeaponBar - 热键', () => {
  it('hotkey(1) 激活第一个超武瞄准', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    bar.hotkey(1);
    expect(bar.aimingWeaponId).toBe('elemental_storm');
    bar.destroy();
  });

  it('hotkey(2) 激活第二个超武瞄准', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    bar.hotkey(2);
    expect(bar.aimingWeaponId).toBe('solvent_bomb');
    bar.destroy();
  });

  it('hotkey(0) 越界不抛错', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    expect(() => bar.hotkey(0)).not.toThrow();
    expect(bar.aimingWeaponId).toBeNull();
    bar.destroy();
  });

  it('hotkey(99) 越界不抛错', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    expect(() => bar.hotkey(99)).not.toThrow();
    bar.destroy();
  });
});

describe('SuperWeaponBar - 冷却中点击', () => {
  it('冷却中的超武点击不进入瞄准', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    // 激活超武触发冷却
    const world: any = { players: [{ resources: { crystal: 10000, industry: 0 }, guilds: ['mages_guild'] }], techTrees: new Map(), canAfford: () => true, spend: () => {} };
    SuperWeaponSystem.activate(0, 'elemental_storm', 5, 5, world, [], []);
    // 冷却中点击不应进入瞄准
    (bar as any)._onClick('elemental_storm');
    expect(bar.aimingWeaponId).toBeNull();
    bar.destroy();
  });
});

describe('SuperWeaponBar - update 刷新', () => {
  it('update 不抛错（冷却0时显示水晶消耗）', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    expect(() => bar.update()).not.toThrow();
    bar.destroy();
  });

  it('激活后 update 显示持续倒计时', () => {
    const { scene } = makeScene();
    const bar = new SuperWeaponBar(scene, 0, 100, 100);
    const world: any = { players: [{ resources: { crystal: 10000, industry: 0 }, guilds: ['mages_guild'] }], techTrees: new Map(), canAfford: () => true, spend: () => {} };
    SuperWeaponSystem.activate(0, 'elemental_storm', 5, 5, world, [], []);
    expect(() => bar.update()).not.toThrow();
    bar.destroy();
  });
});
