/**
 * 音效管理器 — 使用 Web Audio API 合成音效，无外部音频文件依赖
 *
 * 每种音效通过振荡器+噪声实时合成，缓存为 AudioBuffer 供即时播放
 */

export class SoundManager {
  private static ctx: AudioContext | null = null;
  private static buffers = new Map<string, AudioBuffer>();
  private static _initialized = false;
  private static _muted = false;

  /** 初始化（需要在用户交互后调用以解锁 AudioContext） */
  static init(): void {
    if (SoundManager._initialized) return;
    try {
      SoundManager.ctx = new AudioContext();
    } catch {
      // Web Audio API 不可用
      return;
    }
    SoundManager._generateAll();
    SoundManager._initialized = true;
  }

  /** 播放音效 */
  static play(name: string, volume = 0.3): void {
    if (SoundManager._muted || !SoundManager.ctx) return;

    // 解锁挂起的 AudioContext（浏览器策略）
    if (SoundManager.ctx.state === 'suspended') {
      SoundManager.ctx.resume();
    }

    const buf = SoundManager.buffers.get(name);
    if (!buf) return;

    const src = SoundManager.ctx.createBufferSource();
    const gain = SoundManager.ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    src.buffer = buf;
    src.connect(gain);
    gain.connect(SoundManager.ctx.destination);
    // P4-C7: disconnect nodes on end to avoid Web Audio node accumulation
    src.onended = () => {
      try { src.disconnect(); gain.disconnect(); } catch (e) { /* already disconnected */ }
    };
    src.start();
  }

  /** 静音开关 */
  static get muted(): boolean { return SoundManager._muted; }
  static set muted(v: boolean) { SoundManager._muted = v; }

  // ============ 音效生成 ============

  private static _generateAll(): void {
    SoundManager._genSelect();
    SoundManager._genBuild();
    SoundManager._genAttack();
    SoundManager._genProduce();
    SoundManager._genDeath();
    SoundManager._genHeroDeath();
    SoundManager._genVictory();
    SoundManager._genDefeat();
  }

  /** 短期噪声发生器 */
  private static _noise(duration: number, sampleRate: number): Float32Array {
    const len = Math.floor(duration * sampleRate);
    const buf = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      buf[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  private static _genSelect(): void {
    const ctx = SoundManager.ctx!;
    const sr = ctx.sampleRate;
    const dur = 0.06;
    const len = Math.floor(dur * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.max(0, 1 - t / dur);
      data[i] = Math.sin(2 * Math.PI * 1200 * t) * env * 0.5;
    }
    SoundManager.buffers.set('select', buf);
  }

  private static _genBuild(): void {
    const ctx = SoundManager.ctx!;
    const sr = ctx.sampleRate;
    const dur = 0.25;
    const len = Math.floor(dur * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    const noise = SoundManager._noise(dur, sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // 两段锤击
      const env1 = Math.exp(-t * 60);
      const env2 = Math.exp(-(t - 0.12) * 60) * (t > 0.12 ? 1 : 0);
      const env = env1 + env2 * 0.7;
      data[i] = (Math.sin(2 * Math.PI * 160 * t) * 0.3 + noise[i] * 0.5) * env;
    }
    SoundManager.buffers.set('build', buf);
  }

  private static _genAttack(): void {
    const ctx = SoundManager.ctx!;
    const sr = ctx.sampleRate;
    const dur = 0.15;
    const len = Math.floor(dur * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    const noise = SoundManager._noise(dur, sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 30);
      // 低频冲击 + 高频噪声
      data[i] = (Math.sin(2 * Math.PI * (90 - t * 200) * t) * 0.4 + noise[i] * 0.6) * env;
    }
    SoundManager.buffers.set('attack', buf);
  }

  private static _genProduce(): void {
    const ctx = SoundManager.ctx!;
    const sr = ctx.sampleRate;
    const dur = 0.4;
    const len = Math.floor(dur * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 5);
      // 双音叠加：基础音 + 高泛音
      const tone = Math.sin(2 * Math.PI * 600 * t) * 0.3 +
                   Math.sin(2 * Math.PI * 900 * t) * 0.15 +
                   Math.sin(2 * Math.PI * 1200 * t) * 0.1;
      data[i] = tone * env;
    }
    SoundManager.buffers.set('produce', buf);
  }

  private static _genDeath(): void {
    const ctx = SoundManager.ctx!;
    const sr = ctx.sampleRate;
    const dur = 0.35;
    const len = Math.floor(dur * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    const noise = SoundManager._noise(dur, sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 8);
      // 频率下坠
      const freq = 300 - t * 500;
      data[i] = (Math.sin(2 * Math.PI * Math.max(40, freq) * t) * 0.35 + noise[i] * 0.3) * env;
    }
    SoundManager.buffers.set('death', buf);
  }

  /** 英雄阵亡音效 — 低沉下坠 + 低音轰 + 噪声，≈0.7s */
  private static _genHeroDeath(): void {
    const ctx = SoundManager.ctx!;
    const sr = ctx.sampleRate;
    const dur = 0.7;
    const len = Math.floor(dur * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    const noise = SoundManager._noise(dur, sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 4.5);
      // 主音：深频率下坠（250→25 Hz），比普通 death（300→40 Hz）更厚重
      const freq = 250 - t * 320;
      const main = Math.sin(2 * Math.PI * Math.max(25, freq) * t) * 0.4;
      // 低频轰鸣（50Hz 持续 0.35s 后衰减）
      const subEnv = t < 0.35 ? 1 : Math.exp(-(t - 0.35) * 8);
      const sub = Math.sin(2 * Math.PI * 48 * t) * 0.28 * subEnv;
      const hiss = noise[i] * 0.22;
      data[i] = (main + sub + hiss) * env;
    }
    SoundManager.buffers.set('heroDeath', buf);
  }

  private static _genVictory(): void {
    const ctx = SoundManager.ctx!;
    const sr = ctx.sampleRate;
    const dur = 1.2;
    const len = Math.floor(dur * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    // 三段上行音阶: C-E-G-C
    const notes = [
      { freq: 523, start: 0,      dur: 0.3 },  // C5
      { freq: 659, start: 0.25,   dur: 0.3 },  // E5
      { freq: 784, start: 0.5,    dur: 0.3 },  // G5
      { freq: 1047, start: 0.75,  dur: 0.4 },  // C6
    ];
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let sample = 0;
      for (const n of notes) {
        if (t >= n.start && t < n.start + n.dur) {
          const localT = t - n.start;
          const env = Math.exp(-localT * 4) * (1 - Math.exp(-localT * 30));
          sample += Math.sin(2 * Math.PI * n.freq * t) * env * 0.25;
        }
      }
      data[i] = sample;
    }
    SoundManager.buffers.set('victory', buf);
  }

  private static _genDefeat(): void {
    const ctx = SoundManager.ctx!;
    const sr = ctx.sampleRate;
    const dur = 1.0;
    const len = Math.floor(dur * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    // 下行音阶: C-Bb-Ab-G
    const notes = [
      { freq: 523, start: 0,      dur: 0.25 },
      { freq: 466, start: 0.22,   dur: 0.25 },
      { freq: 415, start: 0.44,   dur: 0.25 },
      { freq: 392, start: 0.66,   dur: 0.3 },
    ];
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let sample = 0;
      for (const n of notes) {
        if (t >= n.start && t < n.start + n.dur) {
          const localT = t - n.start;
          const env = Math.exp(-localT * 3) * (1 - Math.exp(-localT * 25));
          sample += Math.sin(2 * Math.PI * n.freq * t) * env * 0.22;
        }
      }
      data[i] = sample;
    }
    SoundManager.buffers.set('defeat', buf);
  }
}