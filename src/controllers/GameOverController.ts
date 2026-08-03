/**
 * 胜负与计时控制器 — 歼灭判定 / 宽限期 / 30 分钟限时 / 分数 / 重开按钮
 *
 * Phaser 依赖：绘制结算文本与重开按钮、HUD 计时文本。
 * 从 GameScene 抽离：checkGameOver / _advanceGraceTimers / addRestartButton /
 * calcScore / stepTimer 及相关字段。
 */

import Phaser from 'phaser';
import type { GameWorld } from '../core/GameWorld';
import type { EntityRegistry } from '../core/EntityRegistry';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { UITheme as T } from '../ui/theme/UITheme';
import { drawPanelSkin, drawButtonSkin, setButtonSkinState, makeHitArea } from '../ui/theme/UIWidget';
import { CODEX_ENTRIES } from '../config/codex';

/** 建筑全失宽限期（秒）：超过后才判歼灭 */
const GRACE_LIMIT = 60;
/** 30 分钟限时（秒） */
const MAX_TIME = 30 * 60;
/** 结算面板尺寸 (皮肤化: skin_panel_console 九宫格底) */
const RESULT_PANEL_W = 520;
const RESULT_PANEL_H = 220;

export class GameOverController {
  private readonly scene: Phaser.Scene;
  private readonly world: GameWorld;
  private readonly entities: EntityRegistry;

  private _gameOver = false;
  private _gameTimer = 0;
  private _graceTimers: [number, number] = [0, 0];
  private _prevGraceWarnSecond: [number, number] = [-1, -1];
  private _scoreTimerDisplay: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene, world: GameWorld, entities: EntityRegistry) {
    this.scene = scene;
    this.world = world;
    this.entities = entities;
  }

  /** 是否已结束 */
  get isOver(): boolean { return this._gameOver; }

  /** 游戏计时器（秒，存档用） */
  get gameTimer(): number { return this._gameTimer; }
  set gameTimer(v: number) { this._gameTimer = v; }

  /** 宽限期计时器（存档用） */
  get graceTimers(): [number, number] { return this._graceTimers; }
  set graceTimers(v: [number, number]) { this._graceTimers = v; }

  /** 建筑全失歼灭判定 + 30 分钟限时判定 */
  checkGameOver(): void {
    if (this._gameOver) return;

    const aliveBuildings = (owner: number) =>
      this.entities.buildings.some(b => b.owner === owner && b.isAlive);

    const playerHasBld = aliveBuildings(0);
    const aiHasBld = aliveBuildings(1);
    // P1-C5: also check worker to avoid deadlock when buildings lost but worker hides
    const playerHasWorker = this.entities.units.some(u => u.owner === 0 && u.isAlive && u.spriteKey === 'unit_worker');
    const aiHasWorker = this.entities.units.some(u => u.owner === 1 && u.isAlive && u.spriteKey === 'unit_worker');

    // P1-5：建筑存在即立刻清零宽限计时；建筑不存在则（由 stepTimer 推进累计）
    if (playerHasBld) this._graceTimers[0] = 0;
    if (aiHasBld) this._graceTimers[1] = 0;

    // 任一方宽限期满才判歼灭
    const playerExpired = !playerHasBld && !playerHasWorker && this._graceTimers[0] >= GRACE_LIMIT;
    const aiExpired = !aiHasBld && !aiHasWorker && this._graceTimers[1] >= GRACE_LIMIT;

    if (playerExpired || aiExpired) {
      this._gameOver = true;
      // P1-4 修复：双方同帧互毁 → 平局
      const winner = playerExpired && aiExpired ? -1 : aiExpired ? 0 : 1;
      EventBus.emit(GameEvent.GAME_OVER, { winnerIndex: winner, reason: 'annihilated' });
      this._drawResultOverlay();
      const text = winner === -1 ? '🤝 同归于尽！平局' : winner === 0 ? '🏆 胜利！敌方基地已被摧毁' : '💀 失败…我方基地已被摧毁';
      const color = winner === -1 ? '#aaaaaa' : winner === 0 ? T.ColorHex.TEXT_GOLD : T.ColorHex.HP_RED;
      this.scene.add.text(1280 / 2, 720 / 2 - 40, text, {
        fontSize: '32px', color,
        padding: { x: 24, y: 12 }, fontFamily: T.FontFamily.DISPLAY, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(200).setScrollFactor(0);
      this._addLoreQuote(winner);
      this.addRestartButton();
      return;
    }

    // 30分钟限时胜利（按分数）
    if (this._gameTimer >= MAX_TIME) {
      this._gameOver = true;
      const p0Score = this.calcScore(0);
      const p1Score = this.calcScore(1);
      const winner = p0Score > p1Score ? 0 : p1Score > p0Score ? 1 : -1;
      EventBus.emit(GameEvent.GAME_OVER, { winnerIndex: winner, reason: 'timeout' });
      this._drawResultOverlay();
      const resultText = winner === 0 ? '🏆 时间到！你赢了！' : winner === 1 ? '💀 时间到…你输了' : '🤝 平局！';
      const scoreText = `\n你的分数: ${p0Score}  |  敌方分数: ${p1Score}`;
      this.scene.add.text(1280 / 2, 720 / 2 - 40, resultText + scoreText, {
        fontSize: '28px', color: winner === 0 ? T.ColorHex.TEXT_GOLD : T.ColorHex.WARN,
        padding: { x: 24, y: 12 },
        align: 'center', fontFamily: T.FontFamily.DISPLAY, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(200).setScrollFactor(0);
      this._addLoreQuote(winner);
      this.addRestartButton();
    }
  }

  /** P2-质疑28: 标签页隐藏时仍推进宽限期，防止暂停作弊 */
  advanceGraceTimers(ds: number): void {
    const aliveBldFn = (owner: number) =>
      this.entities.buildings.some(b => b.owner === owner && b.isAlive);
    for (let pi = 0 as 0 | 1; pi <= 1; pi = (pi + 1) as 0 | 1) {
      if (aliveBldFn(pi)) continue;
      this._graceTimers[pi] += ds;
    }
    this.checkGameOver();
  }

  /** 结算弹窗底: 半透明遮罩 + skin_panel_console 面板 (皮肤化, 纹理缺失回退纯色) */
  private _drawResultOverlay(): void {
    const cx = 1280 / 2;
    const cy = 720 / 2;
    // 半透明遮罩 (让战场仍可见但聚焦结算面板)
    this.scene.add.rectangle(0, 0, 1280, 720, T.Color.PANEL_BG, 0.6)
      .setOrigin(0).setDepth(198).setScrollFactor(0);
    // 面板底 (暗紫魔导渐变 + 金雕花四角; 纹理缺失回退纯色)
    const panelBg = drawPanelSkin(this.scene, {
      x: cx - RESULT_PANEL_W / 2, y: cy - RESULT_PANEL_H / 2,
      w: RESULT_PANEL_W, h: RESULT_PANEL_H,
      skinKey: 'skin_panel_console', corner: 14,
    });
    panelBg.setDepth(199).setScrollFactor(0);
  }

  /** P1-C7: 游戏结束后显示重开按钮 (皮肤化: skin_btn_* 三态) */
  private addRestartButton(): void {
    const cx = 1280 / 2;
    const cy = 720 / 2 + 80;
    const w = 180, h = 44;
    const skinOpts = {
      x: cx - w / 2, y: cy - h / 2, w, h,
      skinNormal: 'skin_btn_normal', skinHover: 'skin_btn_hover', skinActive: 'skin_btn_active',
      skinDisabled: 'skin_btn_normal', corner: 10,
    };
    // 按钮底: 有皮肤用 NineSlice, 缺失回退 Graphics 纯色
    const bg = drawButtonSkin(this.scene, { ...skinOpts, state: 'normal' });
    bg.setDepth(201).setScrollFactor(0);
    // 文字叠在按钮底上
    this.scene.add.text(cx, cy, '🔄 再来一局', {
      fontSize: '22px', color: '#ffffff', fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(202).setScrollFactor(0);
    // 热区 + 三态切换 (仅 NineSlice 路径需要 setButtonSkinState; Graphics 回退无纹理可切)
    const hasSkin = this.scene.textures.exists('skin_btn_normal');
    const hit = makeHitArea(this.scene, skinOpts.x, skinOpts.y, w, h);
    hit.setDepth(203).setScrollFactor(0);
    hit.on('pointerover', () => {
      if (hasSkin) setButtonSkinState(bg as Phaser.GameObjects.NineSlice, skinOpts, 'hover');
    });
    hit.on('pointerout', () => {
      if (hasSkin) setButtonSkinState(bg as Phaser.GameObjects.NineSlice, skinOpts, 'normal');
    });
    hit.on('pointerdown', () => { this.scene.scene.start('MenuScene'); });
  }

  /** 结算时显示一句对应 lore 引文 (代入感) */
  private _addLoreQuote(winner: number): void {
    const quotes: Record<number, { id: string; fallback: string }> = {
      [-1]: { id: 'lore_chronicle_crystal_war', fallback: '帝国历史上第一次无法用军事手段解决一场政治分裂。' },
      0: { id: 'lore_chronicle_first_engine', fallback: '从今天起，制造魔力不需要议会的许可了。' },
      1: { id: 'lore_faction_empire', fallback: '所以是七年。倒计时已经开始。' },
    };
    const q = quotes[winner] ?? quotes[1];
    const entry = CODEX_ENTRIES.find(e => e.id === q.id);
    const quote = entry?.lore?.body?.[0] ?? q.fallback;
    this.scene.add.text(1280 / 2, 720 / 2 + 30, `「${quote.slice(0, 50)}${quote.length > 50 ? '…' : ''}」`, {
      fontSize: '14px', color: T.ColorHex.TEXT_DIM,
      padding: { x: 16, y: 6 }, fontFamily: T.FontFamily.BODY, fontStyle: 'italic',
      align: 'center', wordWrap: { width: 600 },
    }).setOrigin(0.5).setDepth(200).setScrollFactor(0);
  }

  /** 计算玩家分数（用于限时判定） */
  calcScore(playerIndex: number): number {
    const player = this.world.players[playerIndex];
    let score = player?.resources.crystal ?? 0;
    for (const u of this.entities.units) {
      if (u.owner !== playerIndex || !u.isAlive) continue;
      score += (u.maxHp + u.attackDamage * 10) * 0.5;
    }
    for (const b of this.entities.buildings) {
      if (b.owner !== playerIndex || !b.isAlive) continue;
      score += b.maxHp * 0.3;
    }
    return Math.round(score);
  }

  /** 每帧推进游戏计时与宽限期警告广播 */
  stepTimer(ds: number): void {
    if (this._gameOver) return;
    this._gameTimer += ds;
    // HUD 计时器显示
    const mins = Math.floor(this._gameTimer / 60);
    const secs = Math.floor(this._gameTimer % 60);
    const timeStr = `⏱ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (!this._scoreTimerDisplay) {
      this._scoreTimerDisplay = this.scene.add.text(1280 / 2, 10, timeStr, {
        fontSize: '16px', color: T.ColorHex.TEXT_GOLD,
        backgroundColor: T.ColorHex.CARD_BG + 'cc', padding: { x: 12, y: 4 },
        fontFamily: T.FontFamily.MONO, fontStyle: 'bold',
      }).setOrigin(0.5, 0).setDepth(250).setScrollFactor(0);
    } else {
      this._scoreTimerDisplay.setText(timeStr);
    }

    // P1-5：推进建筑全失宽限计时器并按整秒广播警告
    const aliveBldFn = (owner: number) =>
      this.entities.buildings.some(b => b.owner === owner && b.isAlive);
    for (let pi = 0 as 0 | 1; pi <= 1; pi = (pi + 1) as 0 | 1) {
      if (aliveBldFn(pi)) continue; // 有建筑不累计
      this._graceTimers[pi] += ds;
      // 每秒广播一次剩余秒（取整秒值，节流避免每帧高频触发）
      const secondsLeft = Math.max(0, Math.ceil(GRACE_LIMIT - this._graceTimers[pi]));
      if (secondsLeft !== this._prevGraceWarnSecond[pi]) {
        this._prevGraceWarnSecond[pi] = secondsLeft;
        EventBus.emit(GameEvent.GRACE_WARNING, {
          playerIndex: pi, secondsLeft,
        } as any);
      }
    }
  }

  /** Phaser 场景关闭时清理计时文本 */
  destroy(): void {
    if (this._scoreTimerDisplay) { this._scoreTimerDisplay.destroy(); this._scoreTimerDisplay = null; }
  }
}
