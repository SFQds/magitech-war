/**
 * InputController 单元测试 - 选中管理与命令队列纯逻辑
 *
 * 用 vi.mock('phaser') 让模块可导入，scene.input/scene.add 用 stub 注入。
 * 不测真实指针事件分发（属 L4 人工），只验证：
 *  - setSelection / addToSelection / getSelection / clearSelection（含去重）
 *  - pushCommand 的 frame 自增与 commandQueue 累积
 *  - popCommands 返回拷贝并清空原队列
 *  - getPlayerIndex
 *  - 回调注册（onSingleClick/onSelection/onRightClick）的回调被调用
 *  - setupInput 的 HUD 区域过滤逻辑（pointerdown handler 注入测试）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: class PhaserStub {},
}));

import { InputController } from './InputController';
import type { AnyCommand } from '../types/commands';

// 记录 input 事件 handler，便于手动触发
function makeScene() {
  const handlers: Record<string, ((p: any) => void)[]> = {
    pointerdown: [], pointermove: [], pointerup: [],
  };
  const graphics = {
    setDepth: () => graphics,
    clear: () => {},
    lineStyle: () => graphics,
    strokeRect: () => graphics,
    fillStyle: () => graphics,
    fillRect: () => graphics,
  };
  const scene: any = {
    add: { graphics: () => graphics },
    input: {
      on: (ev: string, cb: (p: any) => void) => { handlers[ev].push(cb); },
    },
  };
  return { scene, handlers };
}

function makePointer(opts: Partial<{
  x: number; y: number; worldX: number; worldY: number; rightDown: boolean;
}> = {}) {
  const {
    x = 100, y = 100, worldX = x, worldY = y, rightDown = false,
  } = opts;
  return {
    x, y, worldX, worldY,
    rightButtonDown: () => rightDown,
  };
}

describe('InputController - 选中管理', () => {
  let ctrl: InputController;

  beforeEach(() => {
    const { scene } = makeScene();
    ctrl = new InputController(scene, 0);
  });

  it('初始 getSelection 返回空数组', () => {
    expect(ctrl.getSelection()).toEqual([]);
  });

  it('setSelection 覆盖当前选中', () => {
    ctrl.setSelection(['u1', 'u2']);
    expect(ctrl.getSelection()).toEqual(['u1', 'u2']);
    ctrl.setSelection(['u3']);
    expect(ctrl.getSelection()).toEqual(['u3']);
  });

  it('setSelection([]) 清空选中', () => {
    ctrl.setSelection(['u1', 'u2']);
    ctrl.setSelection([]);
    expect(ctrl.getSelection()).toEqual([]);
  });

  it('clearSelection 清空选中', () => {
    ctrl.setSelection(['u1', 'u2']);
    ctrl.clearSelection();
    expect(ctrl.getSelection()).toEqual([]);
  });

  it('addToSelection 追加新单位', () => {
    ctrl.setSelection(['u1']);
    ctrl.addToSelection(['u2', 'u3']);
    expect(ctrl.getSelection()).toEqual(['u1', 'u2', 'u3']);
  });

  it('addToSelection 去重（已有 id 不重复加入）', () => {
    ctrl.setSelection(['u1', 'u2']);
    ctrl.addToSelection(['u2', 'u3']);
    expect(ctrl.getSelection()).toEqual(['u1', 'u2', 'u3']);
  });

  it('addToSelection 空数组不改变选中', () => {
    ctrl.setSelection(['u1']);
    ctrl.addToSelection([]);
    expect(ctrl.getSelection()).toEqual(['u1']);
  });

  it('addToSelection 对空选中等同于 setSelection', () => {
    ctrl.addToSelection(['u1', 'u2']);
    expect(ctrl.getSelection()).toEqual(['u1', 'u2']);
  });

  it('getSelection 返回内部引用（非拷贝）', () => {
    ctrl.setSelection(['u1']);
    const sel = ctrl.getSelection();
    sel.push('u2');
    // 内部数组被外部修改（当前实现行为）
    expect(ctrl.getSelection()).toEqual(['u1', 'u2']);
  });
});

describe('InputController - 命令队列', () => {
  let ctrl: InputController;

  beforeEach(() => {
    const { scene } = makeScene();
    ctrl = new InputController(scene, 0);
  });

  it('初始 popCommands 返回空数组', () => {
    expect(ctrl.popCommands()).toEqual([]);
  });

  it('pushCommand 后 popCommands 返回该命令', () => {
    const cmd: AnyCommand = { type: 'move', frame: 0, unitIds: ['u1'], target: { x: 1, y: 1 } } as any;
    ctrl.pushCommand(cmd);
    expect(ctrl.popCommands()).toEqual([cmd]);
  });

  it('pushCommand 为每条命令赋递增 frame', () => {
    const c1: AnyCommand = { type: 'move' } as any;
    const c2: AnyCommand = { type: 'move' } as any;
    const c3: AnyCommand = { type: 'move' } as any;
    ctrl.pushCommand(c1);
    ctrl.pushCommand(c2);
    ctrl.pushCommand(c3);
    const cmds = ctrl.popCommands();
    expect(cmds[0].frame).toBe(0);
    expect(cmds[1].frame).toBe(1);
    expect(cmds[2].frame).toBe(2);
  });

  it('pushCommand 覆盖传入的 frame 字段', () => {
    const cmd: AnyCommand = { type: 'move', frame: 999 } as any;
    ctrl.pushCommand(cmd);
    expect(ctrl.popCommands()[0].frame).toBe(0);
  });

  it('popCommands 清空队列（再 pop 返回空）', () => {
    ctrl.pushCommand({ type: 'move' } as any);
    ctrl.pushCommand({ type: 'move' } as any);
    ctrl.popCommands();
    expect(ctrl.popCommands()).toEqual([]);
  });

  it('popCommands 返回拷贝（修改返回值不影响内部）', () => {
    ctrl.pushCommand({ type: 'move' } as any);
    const cmds = ctrl.popCommands();
    cmds.push({ type: 'attack' } as any);
    // 内部已清空，push 到拷贝不影响
    expect(ctrl.popCommands()).toEqual([]);
  });

  it('多次 push 后 popCommands 返回全部并保持顺序', () => {
    for (let i = 0; i < 5; i++) {
      ctrl.pushCommand({ type: 'move', frame: i } as any);
    }
    const cmds = ctrl.popCommands();
    expect(cmds).toHaveLength(5);
    expect(cmds.map(c => c.frame)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('InputController - playerIndex', () => {
  it('默认 playerIndex=0', () => {
    const { scene } = makeScene();
    const ctrl = new InputController(scene);
    expect(ctrl.getPlayerIndex()).toBe(0);
  });

  it('显式传入 playerIndex=1', () => {
    const { scene } = makeScene();
    const ctrl = new InputController(scene, 1);
    expect(ctrl.getPlayerIndex()).toBe(1);
  });

  it('playerIndex 可为任意数字', () => {
    const { scene } = makeScene();
    const ctrl = new InputController(scene, 5);
    expect(ctrl.getPlayerIndex()).toBe(5);
  });
});

describe('InputController - 回调注册', () => {
  let ctrl: InputController;
  let scene: any;
  let handlers: Record<string, ((p: any) => void)[]>;

  beforeEach(() => {
    const rec = makeScene();
    scene = rec.scene;
    handlers = rec.handlers;
    ctrl = new InputController(scene, 0);
  });

  it('onSingleClick 回调在单击时被调用（拖拽距离<5px）', () => {
    const cb = vi.fn();
    ctrl.onSingleClick(cb);
    // pointerdown 启动框选（中屏区域）
    handlers.pointerdown[0](makePointer({ x: 100, y: 100, worldX: 100, worldY: 100 }));
    // pointerup 单击（dragStart==dragEnd）
    handlers.pointerup[0](makePointer({ x: 100, y: 100, worldX: 100, worldY: 100 }));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toEqual({ x: 3, y: 3 }); // worldToTile(100,100,32)
  });

  it('onSelection 回调在框选时被调用（拖拽距离>=5px）', () => {
    const cb = vi.fn();
    ctrl.onSelection(cb);
    handlers.pointerdown[0](makePointer({ x: 100, y: 100, worldX: 100, worldY: 100 }));
    handlers.pointermove[0](makePointer({ x: 200, y: 100, worldX: 200, worldY: 100 }));
    handlers.pointerup[0](makePointer({ x: 200, y: 100, worldX: 200, worldY: 100 }));
    expect(cb).toHaveBeenCalledTimes(1);
    const box = cb.mock.calls[0][0];
    expect(box.x).toBe(100);
    expect(box.y).toBe(100);
    expect(box.width).toBe(100);
    expect(box.height).toBe(0);
  });

  it('未注册回调时不抛错（emitClick 安全）', () => {
    handlers.pointerdown[0](makePointer({ x: 100, y: 100, worldX: 100, worldY: 100 }));
    expect(() => handlers.pointerup[0](makePointer({ x: 100, y: 100, worldX: 100, worldY: 100 }))).not.toThrow();
  });

  it('onRightClick 回调在右键+有选中时被调用', () => {
    const cb = vi.fn();
    ctrl.onRightClick(cb);
    ctrl.setSelection(['u1']);
    // 右键 pointerdown 是 handlers.pointerdown[1]（第二个注册的 pointerdown）
    handlers.pointerdown[1](makePointer({ x: 100, y: 100, worldX: 100, worldY: 100, rightDown: true }));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toEqual({ x: 3, y: 3 });
  });

  it('onRightClick 无选中时不调用', () => {
    const cb = vi.fn();
    ctrl.onRightClick(cb);
    // 未 setSelection，selectedUnitIds 为空
    handlers.pointerdown[1](makePointer({ x: 100, y: 100, worldX: 100, worldY: 100, rightDown: true }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('onRightClick 左键按下时不调用', () => {
    const cb = vi.fn();
    ctrl.onRightClick(cb);
    ctrl.setSelection(['u1']);
    handlers.pointerdown[1](makePointer({ x: 100, y: 100, worldX: 100, worldY: 100, rightDown: false }));
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('InputController - HUD 区域过滤', () => {
  let ctrl: InputController;
  let handlers: Record<string, ((p: any) => void)[]>;

  beforeEach(() => {
    const rec = makeScene();
    handlers = rec.handlers;
    ctrl = new InputController(rec.scene, 0);
  });

  it('顶部资源栏（y<50）不启动框选，pointerup 无副作用', () => {
    const cb = vi.fn();
    ctrl.onSingleClick(cb);
    handlers.pointerdown[0](makePointer({ x: 100, y: 30, worldX: 100, worldY: 30 }));
    handlers.pointerup[0](makePointer({ x: 100, y: 30, worldX: 100, worldY: 30 }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('底部命令卡区（y>640）不启动框选', () => {
    const cb = vi.fn();
    ctrl.onSingleClick(cb);
    handlers.pointerdown[0](makePointer({ x: 100, y: 700, worldX: 100, worldY: 700 }));
    handlers.pointerup[0](makePointer({ x: 100, y: 700, worldX: 100, worldY: 700 }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('右下角小地图区不启动框选', () => {
    const cb = vi.fn();
    ctrl.onSingleClick(cb);
    // sy > 720-160-80=480 && x > 1280-160=1120
    handlers.pointerdown[0](makePointer({ x: 1200, y: 500, worldX: 1200, worldY: 500 }));
    handlers.pointerup[0](makePointer({ x: 1200, y: 500, worldX: 1200, worldY: 500 }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('中屏区域（50<=y<=640, 非小地图）正常启动框选', () => {
    const cb = vi.fn();
    ctrl.onSingleClick(cb);
    handlers.pointerdown[0](makePointer({ x: 100, y: 100, worldX: 100, worldY: 100 }));
    handlers.pointerup[0](makePointer({ x: 100, y: 100, worldX: 100, worldY: 100 }));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
