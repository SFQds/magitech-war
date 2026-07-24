/**
 * ProductionQueueUI 单元测试 - 进度条数学计算 + 取消门控
 *
 * vi.mock('phaser') 提供 stub，使 UI 模块可在 node 测试环境导入。
 * 断言点：进度条宽度 Math.min(158*progress, 158)、fillColor nullish 合并、取消按钮门控。
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

  function rect(x: number, y: number, w: number, h: number, color: number, alpha?: number): any {
    rectCalls.push({ x, y, w, h, color, alpha });
    return {
      setOrigin: () => ({ setOrigin: () => ({ setOrigin: () => rect(x, y, w, h, color, alpha) }) }),
    };
  }
  // setOrigin returns self-chain; need a proper chainable rect
  function makeRect(x: number, y: number, w: number, h: number, color: number, alpha?: number): any {
    const r: any = {
      x, y, w, h, color, alpha,
      setOrigin: () => r,
      setInteractive: () => r,
      on: () => r,
      destroy: () => {},
    };
    return r;
  }

  function makeText(x: number, y: number, text: string, style: any): any {
    textCalls.push({ x, y, text, style });
    const t: any = {
      x, y, text, style,
      setOrigin: () => t,
      setInteractive: () => t,
      on: (evt: string, cb: () => void) => { if (evt === 'pointerdown') cancelBtnHandlers.push(cb); return t; },
      destroy: () => {},
    };
    return t;
  }

  const container: any = {
    items: [] as any[],
    setDepth: () => container,
    setScrollFactor: () => container,
    add: (children: any) => { const arr = Array.isArray(children) ? children : [children]; container.items.push(...arr); },
    removeAll: () => { container.items = []; },
    destroy: () => {},
  };

  const scene: any = {
    add: {
      container: () => container,
      rectangle: (x: number, y: number, w: number, h: number, color: number, alpha?: number) => {
        rectCalls.push({ x, y, w, h, color, alpha });
        return makeRect(x, y, w, h, color, alpha);
      },
      text: (x: number, y: number, text: string, style: any) => makeText(x, y, text, style),
    },
    cameras: { main: { width: camWidth } },
    scene: { get: () => ({ commandExecutor }) },
  };
  return { scene, rectCalls, textCalls, cancelBtnHandlers, commandExecutor };
}

import { ProductionQueueUI } from './ProductionQueue';

describe('ProductionQueueUI - 进度条与取消门控', () => {
  let setup: ReturnType<typeof makeRecordScene>;
  let queue: ProductionQueueUI;

  beforeEach(() => {
    setup = makeRecordScene();
    queue = new ProductionQueueUI(setup.scene);
  });

  it('布局: startX=width-180, 项 y 步进 50', () => {
    queue.update([
      { name: 'a', progress: 0 },
      { name: 'b', progress: 0 },
      { name: 'c', progress: 0 },
    ]);
    // bg rectangle 是每个 item 的第一个 rect (x=startX, y=startY+i*50)
    // startX = 1280-180 = 1100
    const bgs = setup.rectCalls.filter((r, i) => r.w === 170); // bg 宽 170
    expect(bgs[0].x).toBe(1100);
    expect(bgs[0].y).toBe(10);
    expect(bgs[1].y).toBe(60);
    expect(bgs[2].y).toBe(110);
  });

  it('fillColor 默认 0x2ecc71 (item.color 缺省)', () => {
    queue.update([{ name: 'a', progress: 0 }]);
    // barFill 是宽 <=158 且 color 为 fill 的 rect
    const barFills = setup.rectCalls.filter(r => r.w <= 158 && r.w >= 0 && r.h === 10);
    // barBg(0x333333) + barFill(0x2ecc71)
    const fill = barFills.find(r => r.color === 0x2ecc71);
    expect(fill).toBeDefined();
  });

  it('fillColor 自定义 0xff0000 覆盖默认', () => {
    queue.update([{ name: 'a', progress: 0, color: 0xff0000 }]);
    const fill = setup.rectCalls.find(r => r.color === 0xff0000);
    expect(fill).toBeDefined();
  });

  it('进度条宽度 progress=0.5 -> 79', () => {
    queue.update([{ name: 'a', progress: 0.5, color: 0x2ecc71 }]);
    const fill = setup.rectCalls.find(r => r.color === 0x2ecc71);
    expect(fill!.w).toBe(79);
  });

  it('进度条宽度 progress>=1 钳制 158', () => {
    queue.update([{ name: 'a', progress: 1.5, color: 0x2ecc71 }]);
    const fill = setup.rectCalls.find(r => r.color === 0x2ecc71);
    expect(fill!.w).toBe(158);
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

  it('触发 train 项 pointerdown -> ->}execute cancel_train (queueIndex 缺省 -1)', () => {
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
