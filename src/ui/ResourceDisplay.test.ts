/**
 * ResourceDisplay 单元测试 - 顶栏资源组 (SC2 三项分列)
 *
 * 新实现: 水晶/工业/供给 各自独立 Text, 通过 container 组织。
 * 断言点: update() 后三项数字正确; 供给越界变红。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({ default: class PhaserStub {} }));

import { ResourceDisplay } from './ResourceDisplay';
import { UITheme as T } from './theme/UITheme';

/** 记录所有 text 创建 + setText/setColor 调用的 stub scene */
function makeRecordScene(): { scene: any; texts: any[] } {
  const texts: any[] = [];
  // add.text(x, y, content) => content 作为初始 _text
  const makeText = (initial: string) => {
    const t: any = {
      _text: initial,
      _color: '',
      setText: (s: string) => { t._text = s; return t; },
      setColor: (c: string) => { t._color = c; return t; },
      setOrigin: () => t, setDepth: () => t, setScrollFactor: () => t, destroy: () => {},
    };
    texts.push(t);
    return t;
  };
  const container: any = { setDepth: () => container, setScrollFactor: () => container, add: () => container, destroy: () => {} };
  const scene: any = {
    add: {
      text: (_x: number, _y: number, content: string) => makeText(content ?? ''),
      container: () => container,
      image: (_x: number, _y: number, _key: string) => ({ setDisplaySize: function() { return this; }, setAlpha: function() { return this; }, destroy: () => {} }),
    },
    textures: { exists: () => false }, // stub 默认无皮肤纹理, 走 emoji 回退
  };
  return { scene, texts };
}

/** 从 texts 中按初始内容定位数字 Text (图标含 emoji, 数字初始为 '0'/'0/0') */
function findNumText(texts: any[], initial: string): any {
  return texts.find(t => t._text === initial);
}

describe('ResourceDisplay - 三项分列', () => {
  let setup: ReturnType<typeof makeRecordScene>;
  let display: ResourceDisplay;

  beforeEach(() => {
    setup = makeRecordScene();
    display = new ResourceDisplay(setup.scene);
  });

  it('构造时创建水晶/工业/供给三个数字 Text', () => {
    // 初始值: '0', '0', '0/0'
    expect(findNumText(setup.texts, '0')).toBeDefined();
    expect(findNumText(setup.texts, '0/0')).toBeDefined();
  });

  it('update 设置三项数字', () => {
    display.update(100, 50, 5, 20);
    const crystal = setup.texts.find(t => t._text === '100');
    const industry = setup.texts.find(t => t._text === '50');
    const supply = setup.texts.find(t => t._text === '5/20');
    expect(crystal).toBeDefined();
    expect(industry).toBeDefined();
    expect(supply).toBeDefined();
  });

  it('全零值', () => {
    display.update(0, 0, 0, 0);
    expect(setup.texts.some(t => t._text === '0')).toBe(true);
    expect(setup.texts.some(t => t._text === '0/0')).toBe(true);
  });

  it('供给越界时变红警示', () => {
    display.update(0, 0, 25, 20);
    const supply = setup.texts.find(t => t._text === '25/20');
    expect(supply).toBeDefined();
    expect(supply._color).toBe(T.ColorHex.HP_RED);
  });

  it('供给未越界时保持主色', () => {
    display.update(0, 0, 5, 20);
    const supply = setup.texts.find(t => t._text === '5/20');
    expect(supply._color).toBe(T.ColorHex.TEXT_MAIN);
  });

  it('多次 update 覆盖前值', () => {
    display.update(1, 1, 1, 1);
    display.update(2, 2, 2, 4);
    expect(setup.texts.some(t => t._text === '2')).toBe(true);
    expect(setup.texts.some(t => t._text === '2/4')).toBe(true);
    // 旧值 '1/1' 不应残留为当前值
    expect(setup.texts.find(t => t._text === '1/1')).toBeUndefined();
  });

  it('destroy 不抛错', () => {
    expect(() => display.destroy()).not.toThrow();
  });
});
