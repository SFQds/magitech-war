/**
 * ProductionQueueUI 单元测试 - 进度条数学 + 取消门控 (主题版)
 *
 * 断言: 进度条宽度钳制、fillColor nullish 合并、取消按钮门控、
 * 取消命令派发 (train/research + queueIndex)。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: class PhaserStub {},
}));

interface RectCall { x: number; y: number; w: number; h: number; color: number; alpha?: number; }

function makeRecordScene(camWidth = 1280): {
  scene: any;
  rectCalls: RectCall[];
  textCalls: { x: number; y: number; text: string; style: any }[];
  cancelBtnHandlers: (() => void)[];
  commandExecutor: { execute: ReturnType<typeof vi.fn> };
} {
  const rectCalls: RectCall[] = [];
  const textCalls: { x: number; y: number; text: string; style: any }[] = [];
  const cancelBtnHandlers: (() => void)[] = [];
  const commandExecutor = { execute: vi.fn() };

  function makeRect(x: number, y: number, w: number, h: number, color: number, alpha?: number): any {
    rectCalls.push({ x, y, w, h, color, alpha });
    const r: any = {
      x, y, w, h, color, alpha,
      setOrigin: () => r, setInteractive: () => r, on: () => r, destroy: () => {},
    };
    return r;
  }

  function makeText(x: number, y: number, text: string, style: any): any {
    textCalls.push({ x, y, text, style });
    const t: any = {
      x, y, text, style,
      setOrigin: () => t, setInteractive: () => t,
      on: (evt: string, cb: () => void) => { if (evt === 'pointerdown') cancelBtnHandlers.push(cb); return t; },
      destroy: () => {},
    };
    return t;
  }

  // graphics stub (drawPanel 回退用)
  function makeGraphics(): any {
    const g: any = {
      clear: () => g, fillStyle: () => g, fillRoundedRect: () => g,
      lineStyle: () => g, strokeRoundedRect: () => g, fillRect: () => g,
      beginPath: () => g, moveTo: () => g, lineTo: () => g, strokePath: () => g,
      setAlpha: () => g, destroy: () => {},
    };
    return g;
  }

  const container: any = {
    items: [] as any[],
    setDepth: () => container, setScrollFactor: () => container,
    add: (children: any) => { const arr = Array.isArray(children) ? children : [children]; container.items.push(...arr); },
    removeAll: () => { container.items = []; },
    destroy: () => {},
  };

  const scene: any = {
    add: {
      container: () => container,
      rectangle: (x: number, y: number, w: number, h: number, color: number, alpha?: number) => makeRect(x, y, w, h, color, alpha),
      text: (x: number, y: number, text: string, style: any) => makeText(x, y, text, style),
      graphics: () => makeGraphics(),
    },
    textures: { exists: () => false },
    cameras: { main: { width: camWidth } },
    scene: { get: () => ({ commandExecutor }) },
  };
  return { scene, rectCalls, textCalls, cancelBtnHandlers, commandExecutor };
}

import { ProductionQueueUI } from './ProductionQueue';
import { UITheme as T } from './theme/UITheme';

describe('ProductionQueueUI - 进度条与取消门控', () => {
  let setup: ReturnType<typeof makeRecordScene>;
  let queue: ProductionQueueUI;

  beforeEach(() => {
    setup = makeRecordScene();
    queue = new ProductionQueueUI(setup.scene);
  });

  it('布局: startX=width-190, 项 y 步进 44, 起始 y=44', () => {
    queue.update([
      { name: 'a', progress: 0 },
      { name: 'b', progress: 0 },
      { name: 'c', progress: 0 },
    ]);
    // 进度条轨道 (barBg) 宽 168, h=6, 用于定位
    const bars = setup.rectCalls.filter(r => r.w === 168 && r.h === 6);
    // startX = 1280-190 = 1090
    expect(bars[0].x).toBe(1090 + 6);
    expect(bars[0].y).toBe(44 + 24);
    expect(bars[1].y).toBe(44 + 44 + 24);
    expect(bars[2].y).toBe(44 + 88 + 24);
  });

  it('fillColor 默认 KIND_TRAIN (item.color 缺省)', () => {
    queue.update([{ name: 'a', progress: 0 }]);
    const fill = setup.rectCalls.find(r => r.color === T.Color.KIND_TRAIN);
    expect(fill).toBeDefined();
  });

  it('fillColor 自定义覆盖默认', () => {
    queue.update([{ name: 'a', progress: 0, color: 0xff0000 }]);
    const fill = setup.rectCalls.find(r => r.color === 0xff0000);
    expect(fill).toBeDefined();
  });

  it('进度条宽度 progress=0.5 -> 84', () => {
    queue.update([{ name: 'a', progress: 0.5, color: T.Color.KIND_TRAIN }]);
    const fill = setup.rectCalls.find(r => r.color === T.Color.KIND_TRAIN);
    expect(fill!.w).toBe(84);
  });

  it('进度条宽度 progress>=1 钳制 168', () => {
    queue.update([{ name: 'a', progress: 1.5, color: T.Color.KIND_TRAIN }]);
    const fill = setup.rectCalls.find(r => r.color === T.Color.KIND_TRAIN);
    expect(fill!.w).toBe(168);
  });

  it('取消按钮门控: cancelType+buildingId 均存在 -> 创建 ✖', () => {
    queue.update([{ name: 'a', progress: 0, cancelType: 'train', buildingId: 'b1' }]);
    expect(setup.textCalls.some(t => t.text === '✖')).toBe(true);
  });

  it('取消按钮门控: 无 cancelType -> 不创建 ✖', () => {
    queue.update([{ name: 'a', progress: 0, buildingId: 'b1' }]);
    expect(setup.textCalls.some(t => t.text === '✖')).toBe(false);
  });

  it('取消按钮门控: buildingId=undefined -> 不创建 ✖', () => {
    queue.update([{ name: 'a', progress: 0, cancelType: 'train' }]);
    expect(setup.textCalls.some(t => t.text === '✖')).toBe(false);
  });

  it('触发 train 项 pointerdown -> execute cancel_train (queueIndex 缺省 -1)', () => {
    queue.update([{ name: 'a', progress: 0, cancelType: 'train', buildingId: 'b1' }]);
    expect(setup.cancelBtnHandlers.length).toBe(1);
    setup.cancelBtnHandlers[0]!();
    expect(setup.commandExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cancel_train', buildingId: 'b1', queueIndex: -1 }),
    );
  });

  it('触发 research 项 pointerdown -> execute cancel_research (无 queueIndex 键)', () => {
    queue.update([{ name: 'a', progress: 0, cancelType: 'research', buildingId: 'b1' }]);
    setup.cancelBtnHandlers[0]!();
    const call = setup.commandExecutor.execute.mock.calls[0][0];
    expect(call.type).toBe('cancel_research');
    expect(call.buildingId).toBe('b1');
    expect(call).not.toHaveProperty('queueIndex');
  });

  it('train 项带 queueIndex -> 传入 queueIndex', () => {
    queue.update([{ name: 'a', progress: 0, cancelType: 'train', buildingId: 'b1', queueIndex: 2 }]);
    setup.cancelBtnHandlers[0]!();
    expect(setup.commandExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ queueIndex: 2 }),
    );
  });
});
