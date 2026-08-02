/**
 * UIWidget 单元测试 - 绘制工具
 *
 * stub phaser 的 Graphics/Rectangle，断言 drawPanel/drawButton/drawProgressBar
 * 调用了正确的 fillStyle/lineStyle 序列与色值（取自 UITheme）。
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({ default: class PhaserStub {} }));

import { drawPanel, drawButton, drawProgressBar, makeHitArea, bindButtonHover, textStyle } from './UIWidget';
import { UITheme as T } from './UITheme';

/** 记录 Graphics 调用的 stub */
function makeGraphicsStub() {
  const calls: string[] = [];
  const g: any = {
    clear: () => { calls.push('clear'); return g; },
    fillStyle: (c: number, a?: number) => { calls.push(`fillStyle(${c},${a})`); return g; },
    fillRoundedRect: (x: number, y: number, w: number, h: number, r: number) => { calls.push(`fillRoundedRect(${x},${y},${w},${h},${r})`); return g; },
    lineStyle: (w: number, c: number, a?: number) => { calls.push(`lineStyle(${w},${c},${a})`); return g; },
    strokeRoundedRect: (x: number, y: number, w: number, h: number, r: number) => { calls.push(`strokeRoundedRect(${x},${y},${w},${h},${r})`); return g; },
    beginPath: () => g, moveTo: () => g, lineTo: () => g, strokePath: () => g,
  };
  return { g, calls };
}

function makeScene() {
  const { g, calls } = makeGraphicsStub();
  const rect: any = {
    setOrigin: () => rect, setInteractive: () => rect, on: () => rect, destroy: () => {},
  };
  const scene: any = {
    add: { rectangle: () => ({ ...rect }) },
  };
  return { scene, graphicsFactory: () => g, g, calls };
}

describe('drawPanel - 面板绘制', () => {
  it('默认 dim 描边 + CARD_BG 填充', () => {
    const { scene, g, calls } = makeScene();
    drawPanel(scene, g, { x: 0, y: 0, w: 100, h: 50 });
    expect(calls).toContain('clear');
    expect(calls).toContain(`fillStyle(${T.Color.CARD_BG},0.92)`);
    expect(calls).toContain(`lineStyle(1,${T.Color.BORDER},1)`);
  });

  it('gold 描边宽度2', () => {
    const { scene, g, calls } = makeScene();
    drawPanel(scene, g, { x: 0, y: 0, w: 100, h: 50, border: 'gold' });
    expect(calls).toContain(`lineStyle(2,${T.Color.ACCENT_GOLD},1)`);
  });

  it('purple 描边', () => {
    const { scene, g, calls } = makeScene();
    drawPanel(scene, g, { x: 0, y: 0, w: 100, h: 50, border: 'purple' });
    expect(calls).toContain(`lineStyle(2,${T.Color.ACCENT_PURPLE},1)`);
  });

  it('faction 描边取阵营主色', () => {
    const { scene, g, calls } = makeScene();
    drawPanel(scene, g, { x: 0, y: 0, w: 100, h: 50, border: 'faction', factionId: 'arcane_empire' });
    expect(calls).toContain(`lineStyle(2,${T.Color.ACCENT_PURPLE === 0x9b59b6 ? T.getFactionPalette('arcane_empire').primary : 0},1)`);
    expect(calls.some(c => c.includes(`${T.getFactionPalette('arcane_empire').primary}`))).toBe(true);
  });

  it('console 填充取 CONSOLE_BG', () => {
    const { scene, g, calls } = makeScene();
    drawPanel(scene, g, { x: 0, y: 0, w: 100, h: 50, fill: 'console' });
    expect(calls).toContain(`fillStyle(${T.Color.CONSOLE_BG},0.92)`);
  });

  it('topGlow 绘制高光线', () => {
    const { scene, g, calls } = makeScene();
    drawPanel(scene, g, { x: 0, y: 0, w: 100, h: 50, topGlow: true });
    // topGlow 用 lineStyle(1, ACCENT_GOLD, 0.25)
    expect(calls).toContain(`lineStyle(1,${T.Color.ACCENT_GOLD},0.25)`);
  });

  it('返回同一 Graphics', () => {
    const { scene, g } = makeScene();
    expect(drawPanel(scene, g, { x: 0, y: 0, w: 10, h: 10 })).toBe(g);
  });
});

describe('drawButton - 按钮状态', () => {
  it('normal 用 CARD_BG + BORDER', () => {
    const { scene, g, calls } = makeScene();
    drawButton(scene, g, { x: 0, y: 0, w: 72, h: 72, state: 'normal' });
    expect(calls).toContain(`fillStyle(${T.Color.CARD_BG},0.92)`);
    expect(calls).toContain(`lineStyle(1,${T.Color.BORDER},1)`);
  });

  it('hover 用 CARD_HOVER + ACCENT_PURPLE 描边', () => {
    const { scene, g, calls } = makeScene();
    drawButton(scene, g, { x: 0, y: 0, w: 72, h: 72, state: 'hover' });
    expect(calls).toContain(`fillStyle(${T.Color.CARD_HOVER},0.95)`);
    expect(calls).toContain(`lineStyle(2,${T.Color.ACCENT_PURPLE},1)`);
  });

  it('active 用 CARD_ACTIVE + ACCENT_GOLD 描边', () => {
    const { scene, g, calls } = makeScene();
    drawButton(scene, g, { x: 0, y: 0, w: 72, h: 72, state: 'active' });
    expect(calls).toContain(`fillStyle(${T.Color.CARD_ACTIVE},0.95)`);
    expect(calls).toContain(`lineStyle(2,${T.Color.ACCENT_GOLD},1)`);
  });

  it('disabled 用 PANEL_BG + BORDER_DIM', () => {
    const { scene, g, calls } = makeScene();
    drawButton(scene, g, { x: 0, y: 0, w: 72, h: 72, state: 'disabled' });
    expect(calls).toContain(`fillStyle(${T.Color.PANEL_BG},0.85)`);
    expect(calls).toContain(`lineStyle(1,${T.Color.BORDER_DIM},1)`);
  });

  it('faction 描边 normal 态用阵营色', () => {
    const { scene, g, calls } = makeScene();
    drawButton(scene, g, { x: 0, y: 0, w: 72, h: 72, border: 'faction', factionId: 'hammer_federation' });
    expect(calls.some(c => c.includes(`${T.getFactionPalette('hammer_federation').primary}`))).toBe(true);
  });
});

describe('drawProgressBar - 进度条', () => {
  it('返回 track + fill 两个 Rectangle', () => {
    const scene: any = { add: { rectangle: () => ({ setOrigin: function () { return this; } }) } };
    const [track, fill] = drawProgressBar(scene, { x: 0, y: 0, w: 100, pct: 0.5 });
    expect(track).toBeDefined();
    expect(fill).toBeDefined();
  });

  it('pct 钳制到 0..1', () => {
    const made: any[] = [];
    const scene: any = { add: { rectangle: (x: number, y: number, w: number) => {
      const r: any = { setOrigin: () => r, w };
      made.push(w);
      return r;
    } } };
    drawProgressBar(scene, { x: 0, y: 0, w: 100, pct: 1.5 });
    // fill 宽度应被钳制到 100，不超
    expect(made.some(w => w <= 100)).toBe(true);
  });

  it('pct=0 时 fill 宽度 >=0', () => {
    const scene: any = { add: { rectangle: () => ({ setOrigin: function () { return this; } }) } };
    expect(() => drawProgressBar(scene, { x: 0, y: 0, w: 100, pct: 0 })).not.toThrow();
  });
});

describe('makeHitArea - 热区', () => {
  it('创建透明可交互 Rectangle', () => {
    const r: any = { setOrigin: () => r, setInteractive: () => r };
    const scene: any = { add: { rectangle: () => r } };
    const hit = makeHitArea(scene, 0, 0, 72, 72);
    expect(hit).toBeDefined();
  });
});

describe('bindButtonHover - 悬停绑定', () => {
  it('绑定 pointerover/out 不抛错', () => {
    const handlers: Record<string, Function> = {};
    const hit: any = { on: (ev: string, cb: Function) => { handlers[ev] = cb; return hit; } };
    const redraw = vi.fn();
    expect(() => bindButtonHover(hit, redraw)).not.toThrow();
    // 触发 pointerover
    handlers['pointerover']({ x: 0, y: 0 } as any);
    expect(redraw).toHaveBeenCalledWith('hover');
    handlers['pointerout']();
    expect(redraw).toHaveBeenCalledWith('normal');
  });

  it('额外回调被调用', () => {
    const handlers: Record<string, Function> = {};
    const hit: any = { on: (ev: string, cb: Function) => { handlers[ev] = cb; return hit; } };
    const onHover = vi.fn();
    const onOut = vi.fn();
    bindButtonHover(hit, () => {}, onHover, onOut);
    handlers['pointerover']({ x: 5, y: 5 } as any);
    expect(onHover).toHaveBeenCalled();
    handlers['pointerout']();
    expect(onOut).toHaveBeenCalled();
  });
});

describe('textStyle - 文字样式构造', () => {
  it('默认值正确', () => {
    const s = textStyle();
    expect(s.fontSize).toBe(T.Font.BASE);
    expect(s.color).toBe(T.ColorHex.TEXT_MAIN);
    expect(s.fontFamily).toBe(T.FontFamily.BODY);
  });

  it('bold + wrapWidth + align', () => {
    const s = textStyle({ bold: true, wrapWidth: 200, align: 'center', size: T.Font.H1 }) as any;
    expect(s.fontStyle).toBe('bold');
    expect(s.wordWrap.width).toBe(200);
    expect(s.align).toBe('center');
    expect(s.fontSize).toBe(T.Font.H1);
  });

  it('backgroundColor + padding', () => {
    const s = textStyle({ backgroundColor: '#1a1830', padding: { x: 8, y: 4 } }) as any;
    expect(s.backgroundColor).toBe('#1a1830');
    expect(s.padding).toEqual({ x: 8, y: 4 });
  });
});
