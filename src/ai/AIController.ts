/**
 * AI 控制器 — 主控制器，每2秒 tick 一次
 *
 * 评估战场状态，调度 EconomyAI 和 MilitaryAI
 */

import type { GameWorld } from '../core/GameWorld';
import type { AnyCommand } from '../types/commands';
import { EconomyAI } from './EconomyAI';
import { MilitaryAI } from './MilitaryAI';

export type AIDifficulty = 'easy' | 'normal' | 'hard';

/** 难度倍率 */
const DIFFICULTY_MULTIPLIERS: Record<AIDifficulty, { resourceBonus: number; tickInterval: number }> = {
  easy:   { resourceBonus: 0.7, tickInterval: 4.0 },
  normal: { resourceBonus: 1.0, tickInterval: 2.0 },
  hard:   { resourceBonus: 2.0, tickInterval: 1.5 },
};

export class AIController {
  private world: GameWorld;
  private playerIndex: number;
  private difficulty: AIDifficulty;
  private economyAI: EconomyAI;
  private militaryAI: MilitaryAI;
  private tickTimer: number = 0;
  private tickInterval: number;

  constructor(world: GameWorld, playerIndex: number, difficulty: AIDifficulty = 'normal') {
    this.world = world;
    this.playerIndex = playerIndex;
    this.difficulty = difficulty;
    this.tickInterval = DIFFICULTY_MULTIPLIERS[difficulty].tickInterval;
    this.economyAI = new EconomyAI(world, playerIndex, DIFFICULTY_MULTIPLIERS[difficulty].resourceBonus);
    this.militaryAI = new MilitaryAI(world, playerIndex);
  }

  /** 每帧调用 */
  update(deltaSec: number): AnyCommand[] {
    this.tickTimer += deltaSec;

    if (this.tickTimer < this.tickInterval) return [];
    this.tickTimer = 0;

    const commands: AnyCommand[] = [];

    // 经济决策
    commands.push(...this.economyAI.evaluate());

    // 军事决策
    commands.push(...this.militaryAI.evaluate());

    return commands;
  }
}