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

/** 建筑全失宽限期（秒）：超过后才判歼灭 */
const GRACE_LIMIT = 60;
/** 30 分钟限时（秒） */
const MAX_TIME = 30 * 60;

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
      const text = winner === -1 ? '🤝 同归于尽！平局' : winner === 0 ? '🏆 胜利！敌方基地已被摧毁' : '💀 失败…我方基地已被摧毁';
      const color = winner === -1 ? '#aaaaaa' : winner === 0 ? '#ffd700' : '#ff4444';
      this.scene.add.text(1280 / 2, 720 / 2 - 20, text, {
        fontSize: '32px', color, backgroundColor: '#1a1a2ecc',
        padding: { x: 24, y: 12 },
      }).setOrigin(0.5).setDepth(200).setScrollFactor(0);
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
      const resultText = winner === 0 ? '🏆 时间到！你赢了！' : winner === 1 ? '💀 时间到…你输了' : '🤝 平局！';
      const scoreText = `\n你的分数: ${p0Score}  |  敌方分数: ${p1Score}`;
      this.scene.add.text(1280 / 2, 720 / 2 - 20, resultText + scoreText, {
        fontSize: '28px', color: winner === 0 ? '#ffd700' : '#ff6644',
        backgroundColor: '#1a1a2ecc', padding: { x: 24, y: 12 },
        align: 'center',
      }).setOrigin(0.5).setDepth(200).setScrollFactor(0);
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

  /** P1-C7: 游戏结束后显示重开按钮 */
  private addRestartButton(): void {
    const btn = this.scene.add.text(1280 / 2, 720 / 2 + 60, '🔄 再来一局', {
      fontSize: '24px', color: '#ffffff', backgroundColor: '#2a5a2acc',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => { this.scene.scene.start('MenuScene'); });
    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#3a7a3acc' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#2a5a2acc' }));
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
        fontSize: '16px', color: '#ffd700',
        backgroundColor: '#1a1a2ecc', padding: { x: 12, y: 4 },
        fontFamily: 'Arial, sans-serif',
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
