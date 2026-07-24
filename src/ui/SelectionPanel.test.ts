/**
 * SelectionPanel UI 单元测试 - 选中信息显示逻辑
 *
 * 用 vi.mock('phaser') 让 SelectionPanel 可在 node 环境导入。
 * 重点验证 showUnits 的文本拼接逻辑（displayName/category/state/hp 聚合），
 * 不验证 Phaser 渲染细节。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: class PhaserStub {},
}));

import { SelectionPanel } from './SelectionPanel';
import { makeUnit, makeHero } from '../__fixtures__/factories';

// 记录每次 setText 的调用，便于断言显示内容
function makeRecordScene() {
  const textCalls: Record<string, string[]> = {
    name: [], hp: [], state: [],
  };
  const makeText = (key: string) => {
    const obj = {
      setDepth: () => obj,
      setScrollFactor: () => obj,
      setOrigin: () => obj,
      setText: (s: string) => { textCalls[key].push(s); return obj; },
      destroy: () => {},
    };
    return obj;
  };
  const rect = {
    setOrigin: () => rect,
    setDepth: () => rect,
    setScrollFactor: () => rect,
    destroy: () => {},
  };
  const container = {
    setDepth: () => container,
    setScrollFactor: () => container,
    destroy: () => {},
  };
  const scene: any = {
    add: {
      rectangle: () => rect,
      text: () => makeText('tmp'),
      container: () => container,
    },
  };
  // 让构造器按顺序拿到 3 个 text：name / hp / state
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

  it('单个单位显示 displayName·category (1个) 格式', () => {
    const u = makeUnit(); // unit_rifleman = 水晶步枪兵, infantry
    panel.showUnits([u]);
    expect(last(textCalls.name)).toContain('水晶步枪兵');
    expect(last(textCalls.name)).toContain('步兵');
    expect(last(textCalls.name)).toContain('1个');
  });

  it('单个单位显示生命 hp/maxHp', () => {
    const u = makeUnit({ hp: 120 });
    panel.showUnits([u]);
    expect(last(textCalls.hp)).toBe('生命: 120/120');
  });

  it('单个受伤单位显示当前 hp/maxHp', () => {
    const u = makeUnit({ hp: 100 });
    u.hp = 60;
    panel.showUnits([u]);
    expect(last(textCalls.hp)).toBe('生命: 60/100');
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
    expect(last(textCalls.name)).toContain('2个');
  });

  it('多个单位 hp 显示总生命（reduce 聚合）', () => {
    const u1 = makeUnit({ hp: 100 });
    const u2 = makeUnit({ hp: 100 });
    u1.hp = 80;
    u2.hp = 60;
    panel.showUnits([u1, u2]);
    // 总生命: (80+60)/(100+100) = 140/200
    expect(last(textCalls.hp)).toBe('总生命: 140/200');
  });

  it('多个单位状态显示第一个单位的状态', () => {
    const u1 = makeUnit();
    u1.state = 'attacking';
    const u2 = makeUnit();
    u2.state = 'moving';
    panel.showUnits([u1, u2]);
    // STATE_NAMES['attacking']
    expect(last(textCalls.state)).toContain('攻击');
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
    // getDisplayName('hero_isabelle') 不在 UNIT/BUILDING_DEFS -> 回退 'hero_isabelle'
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
    expect(last(textCalls.hp)).toBe(`生命: ${h.hp}/${h.maxHp}`);
  });
});
