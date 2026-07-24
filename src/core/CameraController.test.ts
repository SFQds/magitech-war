/**
 * CameraController 单元测试 - 边缘滚动、缩放、居中
 *
 * 用 vi.mock('phaser') 提供 Phaser.Math.Clamp 真实实现，
 * camera 用 stub 记录 scrollX/scrollY/zoom 变化。
 * 不测 Phaser 真实渲染（属 L4 人工），只验证：
 *  - update 边缘滚动的四个方向
 *  - zoomAt 的 clamp 边界（minZoom/maxZoom）
 *  - centerOn 转发到 camera.centerOn
 *  - 构造时 setBounds 用 mapTileW*tileSize
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 提供 Phaser.Math.Clamp 真实实现（CameraController 依赖）
vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
    },
  },
}));

import { CameraController } from './CameraController';

function makeCamera() {
  const cam: any = {
    width: 1280,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    _zoom: 1,
    _bounds: null as any,
    _center: { x: 0, y: 0 } as any,
    setBounds(x: number, y: number, w: number, h: number) { cam._bounds = { x, y, w, h }; },
    setZoom(z: number) { cam._zoom = z; },
    centerOn(x: number, y: number) { cam._center = { x, y }; },
  };
  Object.defineProperty(cam, 'zoom', { get: () => cam._zoom });
  return cam;
}

describe('CameraController - 构造与 setBounds', () => {
  it('setBounds 用 mapTileW*tileSize 计算 mapWidth/Height', () => {
    const cam = makeCamera();
    new CameraController(cam, 16, 20, 32);
    expect(cam._bounds).toEqual({ x: 0, y: 0, w: 512, h: 640 }); // 16*32, 20*32
  });

  it('自定义 tileSize 生效', () => {
    const cam = makeCamera();
    new CameraController(cam, 10, 10, 64);
    expect(cam._bounds).toEqual({ x: 0, y: 0, w: 640, h: 640 });
  });

  it('默认 tileSize=32', () => {
    const cam = makeCamera();
    new CameraController(cam, 32, 32);
    expect(cam._bounds).toEqual({ x: 0, y: 0, w: 1024, h: 1024 });
  });
});

describe('CameraController.update - 边缘滚动', () => {
  let cam: any;
  let ctrl: CameraController;

  beforeEach(() => {
    cam = makeCamera();
    ctrl = new CameraController(cam, 16, 16, 32);
  });

  it('指针在左侧边缘（x<30）scrollX 减 8', () => {
    ctrl.update({ x: 10, y: 360 } as any);
    expect(cam.scrollX).toBe(-8);
    expect(cam.scrollY).toBe(0);
  });

  it('指针在右侧边缘（x>width-30）scrollX 加 8', () => {
    ctrl.update({ x: 1270, y: 360 } as any); // 1280-30=1250
    expect(cam.scrollX).toBe(8);
    expect(cam.scrollY).toBe(0);
  });

  it('指针在顶部边缘（y<30）scrollY 减 8', () => {
    ctrl.update({ x: 640, y: 10 } as any);
    expect(cam.scrollX).toBe(0);
    expect(cam.scrollY).toBe(-8);
  });

  it('指针在底部边缘（y>height-30）scrollY 加 8', () => {
    ctrl.update({ x: 640, y: 710 } as any); // 720-30=690
    expect(cam.scrollX).toBe(0);
    expect(cam.scrollY).toBe(8);
  });

  it('指针在左上角同时滚动 X 和 Y', () => {
    ctrl.update({ x: 10, y: 10 } as any);
    expect(cam.scrollX).toBe(-8);
    expect(cam.scrollY).toBe(-8);
  });

  it('指针在右下角同时滚动 X 和 Y', () => {
    ctrl.update({ x: 1270, y: 710 } as any);
    expect(cam.scrollX).toBe(8);
    expect(cam.scrollY).toBe(8);
  });

  it('指针在中央不滚动', () => {
    ctrl.update({ x: 640, y: 360 } as any);
    expect(cam.scrollX).toBe(0);
    expect(cam.scrollY).toBe(0);
  });

  it('边缘阈值边界：x=30 不触发左滚（严格 <）', () => {
    ctrl.update({ x: 30, y: 360 } as any);
    expect(cam.scrollX).toBe(0);
  });

  it('边缘阈值边界：x=29 触发左滚', () => {
    ctrl.update({ x: 29, y: 360 } as any);
    expect(cam.scrollX).toBe(-8);
  });

  it('边缘阈值边界：x=1250 不触发右滚（width-30=1250，严格 >）', () => {
    ctrl.update({ x: 1250, y: 360 } as any);
    expect(cam.scrollX).toBe(0);
  });

  it('边缘阈值边界：x=1251 触发右滚', () => {
    ctrl.update({ x: 1251, y: 360 } as any);
    expect(cam.scrollX).toBe(8);
  });

  it('多次 update 累积滚动', () => {
    ctrl.update({ x: 10, y: 10 } as any);
    ctrl.update({ x: 10, y: 10 } as any);
    ctrl.update({ x: 10, y: 10 } as any);
    expect(cam.scrollX).toBe(-24);
    expect(cam.scrollY).toBe(-24);
  });

  it('x 左滚与 y 底滚可同时触发', () => {
    ctrl.update({ x: 10, y: 710 } as any);
    expect(cam.scrollX).toBe(-8);
    expect(cam.scrollY).toBe(8);
  });
});

describe('CameraController.zoomAt - 缩放 clamp', () => {
  let cam: any;
  let ctrl: CameraController;

  beforeEach(() => {
    cam = makeCamera();
    ctrl = new CameraController(cam, 16, 16, 32);
  });

  it('初始 zoom=1.0', () => {
    expect(cam._zoom).toBe(1.0);
  });

  it('delta>0（滚轮上）缩小 zoom', () => {
    ctrl.zoomAt(1);
    expect(cam._zoom).toBeCloseTo(0.9, 5);
  });

  it('delta<0（滚轮下）放大 zoom', () => {
    ctrl.zoomAt(-1);
    expect(cam._zoom).toBeCloseTo(1.1, 5);
  });

  it('delta=0 视为放大（delta>0 false -> +0.1）', () => {
    ctrl.zoomAt(0);
    expect(cam._zoom).toBeCloseTo(1.1, 5);
  });

  it('zoom 不低于 minZoom=0.5', () => {
    for (let i = 0; i < 20; i++) ctrl.zoomAt(1);
    expect(cam._zoom).toBe(0.5);
  });

  it('zoom 不超过 maxZoom=2.0', () => {
    for (let i = 0; i < 20; i++) ctrl.zoomAt(-1);
    expect(cam._zoom).toBe(2.0);
  });

  it('zoom 在 0.5 边界时再缩小仍保持 0.5', () => {
    for (let i = 0; i < 10; i++) ctrl.zoomAt(1);
    expect(cam._zoom).toBe(0.5);
    ctrl.zoomAt(1);
    expect(cam._zoom).toBe(0.5);
  });

  it('zoom 在 2.0 边界时再放大仍保持 2.0', () => {
    for (let i = 0; i < 10; i++) ctrl.zoomAt(-1);
    expect(cam._zoom).toBe(2.0);
    ctrl.zoomAt(-1);
    expect(cam._zoom).toBe(2.0);
  });

  it('zoom 从 0.5 放大可回升', () => {
    for (let i = 0; i < 10; i++) ctrl.zoomAt(1);
    expect(cam._zoom).toBe(0.5);
    ctrl.zoomAt(-1);
    expect(cam._zoom).toBeCloseTo(0.6, 5);
  });

  it('setZoom 被调用（验证转发）', () => {
    const spy = vi.spyOn(cam, 'setZoom');
    ctrl.zoomAt(-1);
    expect(spy).toHaveBeenCalledWith(1.1);
  });
});

describe('CameraController.centerOn - 转发', () => {
  it('转发到 camera.centerOn', () => {
    const cam = makeCamera();
    const ctrl = new CameraController(cam, 16, 16, 32);
    ctrl.centerOn(100, 200);
    expect(cam._center).toEqual({ x: 100, y: 200 });
  });

  it('多次 centerOn 取最后一次', () => {
    const cam = makeCamera();
    const ctrl = new CameraController(cam, 16, 16, 32);
    ctrl.centerOn(1, 2);
    ctrl.centerOn(3, 4);
    expect(cam._center).toEqual({ x: 3, y: 4 });
  });

  it('centerOn 不改变 scrollX/scrollY（由 camera 内部处理）', () => {
    const cam = makeCamera();
    const ctrl = new CameraController(cam, 16, 16, 32);
    ctrl.centerOn(100, 200);
    expect(cam.scrollX).toBe(0); // stub 不实现 scrollX 联动
    expect(cam.scrollY).toBe(0);
  });
});
