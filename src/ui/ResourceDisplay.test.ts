/**
 * ResourceDisplay 单元测试 - 纯文本格式化
 *
 * vi.mock('phaser') 提供 stub，使 UI 模块可在 node 测试环境导入。
 * 断言点：update() 后 text.setText 被以正确格式字符串调用。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// stub phaser 模块：ResourceDisplay 构造函数调用 scene.add.text().setDepth().setScrollFactor()
vi.mock('phaser', () => ({
  default: class PhaserStub {},
}));

// 记录 setText 调用的 stub scene
function makeRecordScene(): { scene: any; setTextCalls: string[] } {
  const setTextCalls: string[] = [];
  const textObj = {
    setDepth: () => textObj,
    setScrollFactor: () => textObj,
    setText: (s: string) => { setTextCalls.push(s); return textObj; },
    destroy: () => {},
  };
  const scene: any = {
    add: { text: () => textObj },
  };
  return { scene, setTextCalls };
}

import { ResourceDisplay } from './ResourceDisplay';

describe('ResourceDisplay - 文本格式化', () => {
  let setup: ReturnType<typeof makeRecordScene>;
  let display: ResourceDisplay;

  beforeEach(() => {
    setup = makeRecordScene();
    display = new ResourceDisplay(setup.scene);
  });

  it('update 格式化: crystal/industry/supply/supplyCap', () => {
    display.update(100, 50, 5, 20);
    expect(setup.setTextCalls).toContain('💎 100  ⚙ 50  👥 5/20');
  });

  it('全零值', () => {
    display.update(0, 0, 0, 0);
    expect(setup.setTextCalls).toContain('💎 0  ⚙ 0  👥 0/0');
  });

  it('supply 超过 supplyCap 原样显示越界 (无钳制)', () => {
    display.update(0, 0, 25, 20);
    expect(setup.setTextCalls).toContain('💎 0  ⚙ 0  👥 25/20');
  });

  it('多次 update 覆盖前值', () => {
    display.update(1, 1, 1, 1);
    display.update(2, 2, 2, 4);
    expect(setup.setTextCalls[setup.setTextCalls.length - 1]).toBe('💎 2  ⚙ 2  👥 2/4');
  });
});
