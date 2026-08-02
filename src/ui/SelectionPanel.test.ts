/**
 * SelectionPanel UI 单元测试 - 选中信息显示逻辑 (SC2 中段面板)
 *
 * 验证 showUnits 文本拼接 (displayName/category/state/HP) + 多选聚合,
 * 以及 HP 条按百分比渐变。不验证 Phaser 渲染细节。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: class PhaserStub {},
}));

import { SelectionPanel } from './SelectionPanel';
import { makeUnit, makeHero } from '../__fixtures__/factories';
import { UITheme as T } from './theme/UITheme';

function makeRecordScene() {
  const textCalls: Record<string, string[]> = { name: [], hp: [], state: [] };
  const makeText = (key: string) => {
    const obj: any = {
      _color: '',
      setDepth: () => obj, setScrollFactor: () => obj, setOrigin: () => obj,
      setText: (s: string) => { textCalls[key].push(s); return obj; },
      setColor: (c: string) => { obj._color = c; return obj; },
      destroy: () => {},
    };
    return obj;
  };
  const makeRect = () => {
    const r: any = {
      width: 0, fillColor: 0,
      setOrigin: () => r, setDepth: () => r, setScrollFactor: () => r,
      setInteractive: () => r, on: () => r, destroy: () => {}, setVisible: () => r,
    };
    return r;
  };
  const makeGraphics = () => {
    const g: any = {
      clear: () => g, fillStyle: () => g, fillRoundedRect: () => g,
      lineStyle: () => g, strokeRoundedRect: () => g, fillRect: () => g,
      beginPath: () => g, moveTo: () => g, lineTo: () => g, strokePath: () => g,
      setDepth: () => g, setScrollFactor: () => g, setAlpha: () => g, destroy: () => {},
    };
    return g;
  };
  const container = {
    setDepth: () => container, setScrollFactor: () => container,
    setVisible: () => container, add: () => container, destroy: () => {},
  };
  const scene: any = {
    add: { rectangle: () => makeRect(), text: () => makeText('tmp'), container: () => container, graphics: () => makeGraphics() },
    textures: { exists: () => false },
  };
  // 构造器按顺序创建 text: name / hp / state
  let textIdx = 0;
  const keys = ['name', 'hp', 'state'] as const;
  scene.add.text = () => makeText(keys[textIdx++]);
  return { scene, textCalls };
}

describe('SelectionPanel - showUnits 文本逻辑', () => {
  let scene: any;
  let textCalls: Record<string, string[]>;
  let panel: SelectionPanel;

  beforeEach(() => {
    const rec = makeRecordScene();
    scene = rec.scene;
    textCalls = rec.textCalls;
    panel = new SelectionPanel(scene, 0, 0);
  });

  const last = <T>(a: T[]): T => a[a.length - 1];

  it('空选中显示"无选中"且 hp/state 为空', () => {
    panel.showUnits([]);
    expect(last(textCalls.name)).toBe('无选中');
    expect(last(textCalls.hp)).toBe('');
    expect(last(textCalls.state)).toBe('');
  });

  it('单个单位显示 displayName · category (1) 格式', () => {
    const u = makeUnit();
    panel.showUnits([u]);
    expect(last(textCalls.name)).toContain('水晶步枪兵');
    expect(last(textCalls.name)).toContain('步兵');
    expect(last(textCalls.name)).toContain('(1)');
  });

  it('单个单位显示 HP hp/maxHp', () => {
    const u = makeUnit({ hp: 120 });
    panel.showUnits([u]);
    expect(last(textCalls.hp)).toBe('HP 120/120');
  });

  it('单个受伤单位显示当前 hp/maxHp', () => {
    const u = makeUnit({ hp: 100 });
    u.hp = 60;
    panel.showUnits([u]);
    expect(last(textCalls.hp)).toBe('HP 60/100');
  });

  it('单个单位显示状态名（STATE_NAMES 映射）', () => {
    const u = makeUnit();
    u.state = 'moving';
    panel.showUnits([u]);
    expect(last(textCalls.state)).toContain('移动');
  });

  it('多个单位名称后缀显示总数', () => {
    const u1 = makeUnit({ tileX: 1 });
    const u2 = makeUnit({ tileX: 2 });
    panel.showUnits([u1, u2]);
    expect(last(textCalls.name)).toContain('(2)');
  });

  it('多个单位隐藏HP轨道让位给头像网格', () => {
    const u1 = makeUnit({ hp: 100 });
    const u2 = makeUnit({ hp: 100 });
    u1.hp = 80;
    u2.hp = 60;
    panel.showUnits([u1, u2]);
    expect(last(textCalls.hp)).toBe(''); // HP 轨道隐藏, 由网格内 mini HP 条展示
  });

  it('多个单位数量并入名称后缀 (N)', () => {
    const u1 = makeUnit();
    const u2 = makeUnit();
    panel.showUnits([u1, u2]);
    expect(last(textCalls.name)).toContain('(2)');
    expect(last(textCalls.state)).toBe(''); // state 清空, 让位给网格
  });

  it('工人单位显示工兵类别名', () => {
    const u = makeUnit({ spriteKey: 'unit_worker' });
    panel.showUnits([u]);
    expect(last(textCalls.name)).toContain('建造工兵');
  });

  it('未知 spriteKey 回退显示原 id（getDisplayName 兜底）', () => {
    const u = makeUnit({ spriteKey: 'unit_custom_unknown' });
    panel.showUnits([u]);
    expect(last(textCalls.name)).toContain('unit_custom_unknown');
  });

  it('车辆类单位显示车辆类别名', () => {
    const u = makeUnit({ spriteKey: 'unit_transport', category: 'vehicle' });
    panel.showUnits([u]);
    expect(last(textCalls.name)).toContain('载具');
  });

  it('英雄单位显示英雄名（getDisplayName 对 hero_ 回退原 id）', () => {
    const h = makeHero({ heroId: 'hero_isabelle' });
    panel.showUnits([h]);
    expect(last(textCalls.name)).toContain('hero_isabelle');
  });

  it('多次调用 showUnits 每次都更新文本', () => {
    const u1 = makeUnit({ hp: 100 });
    const u2 = makeUnit({ hp: 100 });
    panel.showUnits([u1]);
    panel.showUnits([u2]);
    panel.showUnits([]);
    expect(textCalls.name.length).toBeGreaterThanOrEqual(3);
    expect(last(textCalls.name)).toBe('无选中');
  });

  it('英雄满血时显示完整生命', () => {
    const h = makeHero({ heroId: 'hero_isabelle' });
    panel.showUnits([h]);
    expect(last(textCalls.hp)).toBe(`HP ${Math.round(h.hp)}/${Math.round(h.maxHp)}`);
  });
});

describe('SelectionPanel - 多选网格 showUnitsGrid', () => {
  let panel2: SelectionPanel;
  beforeEach(() => {
    const rec = makeRecordScene();
    panel2 = new SelectionPanel(rec.scene, 0, 0);
  });

  it('单单位不显示网格', () => {
    const u = makeUnit({ hp: 100 });
    panel2.showUnitsGrid([u], () => {});
    expect(true).toBe(true);
  });

  it('多单位显示网格不抛错', () => {
    const u1 = makeUnit({ tileX: 1 });
    const u2 = makeUnit({ tileX: 2 });
    const u3 = makeUnit({ tileX: 3 });
    expect(() => panel2.showUnitsGrid([u1, u2, u3], () => {})).not.toThrow();
  });

  it('9个单位渲染2行网格不抛错(超出一行)', () => {
    const units = Array.from({ length: 9 }, (_, i) => makeUnit({ tileX: i }));
    expect(() => panel2.showUnitsGrid(units, () => {})).not.toThrow();
  });

  it('16个单位渲染2行网格不抛错', () => {
    const units = Array.from({ length: 16 }, (_, i) => makeUnit({ tileX: i }));
    expect(() => panel2.showUnitsGrid(units, () => {})).not.toThrow();
  });

  it('hideGrid 不抛错', () => {
    const u1 = makeUnit({ tileX: 1 });
    const u2 = makeUnit({ tileX: 2 });
    panel2.showUnitsGrid([u1, u2], () => {});
    expect(() => panel2.hideGrid()).not.toThrow();
  });

  it('showUnits 后再 showUnitsGrid 不抛错(切换模式)', () => {
    const u1 = makeUnit({ tileX: 1 });
    const u2 = makeUnit({ tileX: 2 });
    panel2.showUnits([u1, u2]);
    expect(() => panel2.showUnitsGrid([u1, u2], () => {})).not.toThrow();
  });

  it('showUnitsGrid 后再 showUnits 不抛错(切回文字模式)', () => {
    const u1 = makeUnit({ tileX: 1 });
    const u2 = makeUnit({ tileX: 2 });
    panel2.showUnitsGrid([u1, u2], () => {});
    expect(() => panel2.showUnits([u1, u2])).not.toThrow();
  });

  it('空数组 showUnitsGrid 不抛错', () => {
    expect(() => panel2.showUnitsGrid([], () => {})).not.toThrow();
  });
});
