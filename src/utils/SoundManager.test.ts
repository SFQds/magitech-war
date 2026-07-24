/**
 * SoundManager 单元测试 - 状态机与边界保护
 *
 * 不测真实音频合成（属 L4 人工），只验证：
 *  - muted getter/setter
 *  - init 幂等性与无 AudioContext 的容错
 *  - play 在 muted/未 init/未知 name 时不抛错
 *  - play volume clamp 到 [0,1]
 *  - init 后 buffers 注册了所有音效 key
 *
 * 用 mock AudioContext 避免依赖 Web Audio API。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SoundManager } from './SoundManager';

// ============ Mock AudioContext ============

class MockGainNode {
  gain = { value: 0 };
  connect() {}
  disconnect() {}
}

class MockBufferSource {
  buffer: any = null;
  onended: (() => void) | null = null;
  connect() {}
  disconnect() {}
  start() {}
}

class MockAudioContext {
  state: 'running' | 'suspended' = 'running';
  sampleRate = 44100;
  destination = {};
  createBufferSource() { return new MockBufferSource(); }
  createGain() { return new MockGainNode(); }
  createBuffer(channels: number, length: number, _sr: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  resume() { this.state = 'running'; }
}

const ANY_CTX = globalThis as any;

beforeEach(() => {
  // 重置 SoundManager 静态状态（private static，用 any 访问）
  const SM = SoundManager as any;
  SM.ctx = null;
  SM.buffers = new Map();
  SM._initialized = false;
  SM._muted = false;
  // 默认提供 mock AudioContext
  ANY_CTX.AudioContext = MockAudioContext;
});

// ============ muted 状态 ============

describe('SoundManager.muted', () => {
  it('默认 false', () => {
    expect(SoundManager.muted).toBe(false);
  });

  it('setter true 后 getter 返回 true', () => {
    SoundManager.muted = true;
    expect(SoundManager.muted).toBe(true);
  });

  it('setter 可来回切换', () => {
    SoundManager.muted = true;
    SoundManager.muted = false;
    expect(SoundManager.muted).toBe(false);
  });
});

// ============ init ============

describe('SoundManager.init', () => {
  it('无 AudioContext 时不抛错且 _initialized 保持 false', () => {
    delete ANY_CTX.AudioContext;
    expect(() => SoundManager.init()).not.toThrow();
    expect((SoundManager as any)._initialized).toBe(false);
  });

  it('有 AudioContext 后 _initialized 置 true', () => {
    SoundManager.init();
    expect((SoundManager as any)._initialized).toBe(true);
  });

  it('重复调用幂等（第二次不重新生成）', () => {
    SoundManager.init();
    const buffersAfterFirst = (SoundManager as any).buffers.size;
    SoundManager.init();
    const buffersAfterSecond = (SoundManager as any).buffers.size;
    expect(buffersAfterSecond).toBe(buffersAfterFirst);
  });

  it('init 后注册 8 种音效 buffer', () => {
    SoundManager.init();
    const buffers: Map<string, unknown> = (SoundManager as any).buffers;
    expect(buffers.size).toBe(8);
    expect(buffers.has('select')).toBe(true);
    expect(buffers.has('build')).toBe(true);
    expect(buffers.has('attack')).toBe(true);
    expect(buffers.has('produce')).toBe(true);
    expect(buffers.has('death')).toBe(true);
    expect(buffers.has('heroDeath')).toBe(true);
    expect(buffers.has('victory')).toBe(true);
    expect(buffers.has('defeat')).toBe(true);
  });

  it('init 后 ctx 不为 null', () => {
    SoundManager.init();
    expect((SoundManager as any).ctx).not.toBeNull();
  });
});

// ============ play 边界保护 ============

describe('SoundManager.play 边界保护', () => {
  it('未 init（ctx=null）时不抛错', () => {
    expect(() => SoundManager.play('select')).not.toThrow();
  });

  it('muted=true 时即使已 init 也不抛错', () => {
    SoundManager.init();
    SoundManager.muted = true;
    expect(() => SoundManager.play('select')).not.toThrow();
  });

  it('已 init 但未知 name 不抛错', () => {
    SoundManager.init();
    expect(() => SoundManager.play('unknown_sound')).not.toThrow();
  });

  it('已 init 且已知 name 不抛错', () => {
    SoundManager.init();
    expect(() => SoundManager.play('select')).not.toThrow();
    expect(() => SoundManager.play('victory', 0.5)).not.toThrow();
  });

  it('suspended AudioContext 会触发 resume', () => {
    SoundManager.init();
    const ctx: MockAudioContext = (SoundManager as any).ctx;
    ctx.state = 'suspended';
    const resumeSpy = vi.spyOn(ctx, 'resume');
    SoundManager.play('select');
    expect(resumeSpy).toHaveBeenCalledTimes(1);
  });

  it('running AudioContext 不触发 resume', () => {
    SoundManager.init();
    const ctx: MockAudioContext = (SoundManager as any).ctx;
    ctx.state = 'running';
    const resumeSpy = vi.spyOn(ctx, 'resume');
    SoundManager.play('select');
    expect(resumeSpy).not.toHaveBeenCalled();
  });
});

// ============ play volume clamp ============

describe('SoundManager.play volume clamp', () => {
  it('默认 volume=0.3 传入 gain.value', () => {
    SoundManager.init();
    const ctx: MockAudioContext = (SoundManager as any).ctx;
    const gainSpy = vi.spyOn(ctx, 'createGain');
    SoundManager.play('select');
    expect(gainSpy.mock.results[0].value.gain.value).toBe(0.3);
  });

  it('volume=1 传入 gain.value=1（上界）', () => {
    SoundManager.init();
    const ctx: MockAudioContext = (SoundManager as any).ctx;
    const gainSpy = vi.spyOn(ctx, 'createGain');
    SoundManager.play('select', 1);
    expect(gainSpy.mock.results[0].value.gain.value).toBe(1);
  });

  it('volume=2 clamp 到 1', () => {
    SoundManager.init();
    const ctx: MockAudioContext = (SoundManager as any).ctx;
    const gainSpy = vi.spyOn(ctx, 'createGain');
    SoundManager.play('select', 2);
    expect(gainSpy.mock.results[0].value.gain.value).toBe(1);
  });

  it('volume=0 clamp 到 0', () => {
    SoundManager.init();
    const ctx: MockAudioContext = (SoundManager as any).ctx;
    const gainSpy = vi.spyOn(ctx, 'createGain');
    SoundManager.play('select', 0);
    expect(gainSpy.mock.results[0].value.gain.value).toBe(0);
  });

  it('volume=-1 clamp 到 0', () => {
    SoundManager.init();
    const ctx: MockAudioContext = (SoundManager as any).ctx;
    const gainSpy = vi.spyOn(ctx, 'createGain');
    SoundManager.play('select', -1);
    expect(gainSpy.mock.results[0].value.gain.value).toBe(0);
  });

  it('volume=0.5 正确传入', () => {
    SoundManager.init();
    const ctx: MockAudioContext = (SoundManager as any).ctx;
    const gainSpy = vi.spyOn(ctx, 'createGain');
    SoundManager.play('select', 0.5);
    expect(gainSpy.mock.results[0].value.gain.value).toBe(0.5);
  });
});
