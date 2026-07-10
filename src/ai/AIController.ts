/**
 * AI 控制器 — 主控制器，每2秒 tick 一次
 *
 * 三层架构：
 *   StrategyManager (每25s) → StrategyDirective
 *   EconomyAI + MilitaryAI (每2s) → 读取 directive → AnyCommand[]
 */
import type { GameWorld } from '../core/GameWorld';
import type { AnyCommand } from '../types/commands';
import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';
import type { ResourceField } from '../entities/ResourceField';
import { EconomyAI } from './EconomyAI';
import { MilitaryAI } from './MilitaryAI';
import { StrategyManager, type StrategyDirective } from './StrategyManager';

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
  private economyAI: EconomyAI;
  private militaryAI: MilitaryAI;
  private strategyMgr: StrategyManager;
  private tickTimer: number = 0;
  private tickInterval: number;
  private strategyTimer: number = 0;
  private currentDirective: StrategyDirective = StrategyManager.DEFAULT_DIRECTIVE;

  constructor(world: GameWorld, playerIndex: number, difficulty: AIDifficulty = 'normal') {
    this.world = world;
    this.playerIndex = playerIndex;
    this.tickInterval = DIFFICULTY_MULTIPLIERS[difficulty].tickInterval;
    this.strategyMgr = new StrategyManager(world, playerIndex);
    this.economyAI = new EconomyAI(world, playerIndex, DIFFICULTY_MULTIPLIERS[difficulty].resourceBonus);
    this.militaryAI = new MilitaryAI(world, playerIndex);
  }

  /** 每帧调用，返回 AI 决策的命令列表 */
  update(deltaSec: number, units: Unit[], buildings: Building[], fields: ResourceField[]): AnyCommand[] {
    // 策略层评估 (每 25s)
    this.strategyTimer += deltaSec;
    if (this.strategyTimer >= 25) {
      this.currentDirective = this.strategyMgr.evaluate(this.strategyTimer, units, buildings, fields);
      this.strategyTimer = 0;
    }

    // 运营层评估 (每 2s)
    this.tickTimer += deltaSec;
    if (this.tickTimer < this.tickInterval) return [];
    this.tickTimer = 0;

    const commands: AnyCommand[] = [];
    commands.push(...this.economyAI.evaluate(buildings, units, fields, this.currentDirective));
    commands.push(...this.militaryAI.evaluate(units, buildings, this.currentDirective));
    return commands;
  }
}