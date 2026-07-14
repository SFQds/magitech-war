/**
 * 军事 AI — 运营层：目标权重选择、防守调度、持续单位管理
 *
 * 读取 StrategyDirective，不再"流放"已交战单位 — 每 tick 持续评估所有作战单位。
 */

import type { GameWorld } from '../core/GameWorld';
import type { AnyCommand } from '../types/commands';
import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';
import type { StrategyDirective } from './StrategyManager';
import type { AIDifficulty } from './AIController';

/** 目标权重基础分 */
const BUILDING_PRIORITY: Record<string, number> = {
  bld_cc_empire: 80,
  bld_cc_federation: 80,
  bld_barracks: 60,
  bld_factory: 60,
};

/** 建筑回复半径（tile） */
const RECOVER_RADIUS = 3;
/** 回复目标 HP 百分比 */
const RECOVER_HP_TARGET = 0.7;

export class MilitaryAI {
  private world: GameWorld;
  private playerIndex: number;
  private difficulty: AIDifficulty;
  /** 风筝检测：unitId → { targetId, distance, unchangedTicks } */
  private kiteTracker = new Map<string, { targetId: string; distance: number; unchangedTicks: number }>();
  /** 撤退冷却：unitId → remaining ticks（防止乒乓效应） */
  private retreatCooldown = new Map<string, number>();

  constructor(world: GameWorld, playerIndex: number, difficulty: AIDifficulty = 'normal') {
    this.world = world;
    this.playerIndex = playerIndex;
    this.difficulty = difficulty;
  }

  /** 按难度调整的撤退阈值 */
  private get retreatThreshold(): number {
    if (this.difficulty === 'easy') return 0.15;   // easy: HP极低才撤（容易送）
    if (this.difficulty === 'hard') return 0.45;   // hard: HP低于45%就撤（生存优先）
    return 0.30; // normal
  }

  /** 按难度调整的风筝灵敏度（tick数，越低越敏感） */
  private get kiteTickThreshold(): number {
    if (this.difficulty === 'easy') return 6;    // 反应慢
    if (this.difficulty === 'hard') return 2;    // 反应快
    return 3;
  }

  /** easy AI 是否不撤退（故意犯错） */
  private get skipRetreat(): boolean {
    return this.difficulty === 'easy';
  }

  /** easy AI 进攻警惕性（低=不主动攻击，让玩家发育） */
  private get attackThreshold(): number {
    if (this.difficulty === 'easy') return 6;    // 需要6个空闲单位才进攻
    if (this.difficulty === 'hard') return 1;    // 有1个就进攻
    return 1;
  }

  evaluate(
    units: Unit[],
    buildings: Building[],
    directive: StrategyDirective,
  ): AnyCommand[] {
    const commands: AnyCommand[] = [];

    const ownCombat = units.filter(
      u => u.owner === this.playerIndex && u.isAlive && u.spriteKey !== 'unit_worker'
    );
    const ownBuildings = buildings.filter(
      b => b.owner === this.playerIndex && b.isAlive
    );
    const enemyUnits = units.filter(
      u => u.owner !== this.playerIndex && u.isAlive
    );
    const enemyBuildings = buildings.filter(
      b => b.owner !== this.playerIndex && b.isAlive
    );

    if (ownCombat.length === 0) {
      this.kiteTracker.clear();
      return commands;
    }

    // === 持续管理：对所有作战单位评估（不跳过任何状态） ===
    for (const unit of ownCombat) {
      const target = unit.targetEntityId
        ? (units.find(u => u.id === unit.targetEntityId) ?? buildings.find(b => b.id === unit.targetEntityId))
        : null;

      // 目标已死亡或不存在 → 重置
      if (unit.targetEntityId && !target) {
        unit.stopAttacking();
        unit.holdPosition = false;
        unit.aiLockedAction = null;
        this.kiteTracker.delete(unit.id);
        continue;
      }

      // 防守单位：目标存活则继续防守，不清除
      if (unit.aiLockedAction === 'defend' && target) continue;
      // 防守目标消失 → 清除锁定
      if (unit.aiLockedAction === 'defend' && !target) {
        unit.stopAttacking();
        unit.aiLockedAction = null;
        unit.holdPosition = false;
        continue;
      }

      // 撤退/恢复状态
      if (unit.aiLockedAction === 'retreat' || unit.aiLockedAction === 'recover') {
        // 检查是否到达建筑附近
        const nearOwnBuilding = ownBuildings.some(b => {
          const d = Math.abs(unit.tileX - b.tileX) + Math.abs(unit.tileY - b.tileY);
          return d <= RECOVER_RADIUS;
        });

        if (nearOwnBuilding) {
          unit.aiLockedAction = 'recover';
          unit.holdPosition = false;
          unit.hp = Math.min(unit.maxHp, unit.hp + 3 * 2);
          if (unit.hpPercent >= RECOVER_HP_TARGET) {
            unit.aiLockedAction = null;
            unit.stopAttacking();
            this.retreatCooldown.set(unit.id, 3);
          }
          continue;
        }
        // 尚未到达建筑 → 继续移动
        continue;
      }

      // HP 过低 → 开始撤退（easy AI 不撤退，故意犯错）
      const cooldownRemaining = this.retreatCooldown.get(unit.id) ?? 0;
      if (!this.skipRetreat && unit.hpPercent < this.retreatThreshold && cooldownRemaining <= 0) {
        unit.stopAttacking();
        unit.holdPosition = false;
        unit.aiLockedAction = 'retreat';

        if (ownBuildings.length === 0) continue; // 无己方建筑，无法撤退

        // 撤退到离敌人平均位置最远的己方建筑（避免退到交战区）
        // 计算所有敌方单位的平均位置
        let enemyAvgX = 0, enemyAvgY = 0;
        if (enemyUnits.length > 0) {
          enemyAvgX = enemyUnits.reduce((s, e) => s + e.tileX, 0) / enemyUnits.length;
          enemyAvgY = enemyUnits.reduce((s, e) => s + e.tileY, 0) / enemyUnits.length;
        }
        const safestBld = ownBuildings.reduce((best, b) => {
          const dToEnemy = Math.abs(b.tileX - enemyAvgX) + Math.abs(b.tileY - enemyAvgY);
          const bestD = Math.abs(best.tileX - enemyAvgX) + Math.abs(best.tileY - enemyAvgY);
          return dToEnemy > bestD ? b : best;
        });

        commands.push({
          type: 'move',
          playerIndex: this.playerIndex,
          unitIds: [unit.id],
          target: { x: safestBld.tileX, y: safestBld.tileY + 1 },
          frame: 0,
        });
        this.kiteTracker.delete(unit.id);
        continue;
      }

      // 风筝检测
      if (target && unit.targetEntityId) {
        const currentDist = Math.abs(unit.tileX - target.tileX) + Math.abs(unit.tileY - target.tileY);
        const record = this.kiteTracker.get(unit.id);
        if (record && record.targetId === unit.targetEntityId) {
          if (currentDist >= record.distance) {
            record.unchangedTicks++;
            if (record.unchangedTicks >= this.kiteTickThreshold) {
              unit.stopAttacking();
              this.kiteTracker.delete(unit.id);
              const altTarget = this.selectBestTarget(
                [unit], enemyUnits.filter(e => e.id !== unit.targetEntityId), enemyBuildings, ownBuildings
              );
              if (altTarget) {
                unit.attackTarget(altTarget.id);
                commands.push({
                  type: 'attack_move',
                  playerIndex: this.playerIndex,
                  unitIds: [unit.id],
                  target: { x: Math.round(altTarget.tileX), y: Math.round(altTarget.tileY) },
                  frame: 0,
                });
              }
            }
          } else {
            record.distance = currentDist;
            record.unchangedTicks = 0;
          }
        } else {
          this.kiteTracker.set(unit.id, { targetId: unit.targetEntityId, distance: currentDist, unchangedTicks: 0 });
        }
      }
    }

    // === 防守调度：每个受威胁建筑独立分配防御者 ===
    if (enemyUnits.length > 0) {
      // 收集已被分配防御的敌人 ID（防重复）
      const alreadyDefended = new Set(
        ownCombat.filter(u => u.aiLockedAction === 'defend' && u.targetEntityId).map(u => u.targetEntityId!)
      );

      for (const bld of ownBuildings) {
        const nearbyEnemies = enemyUnits.filter(e => {
          const d = Math.abs(e.tileX - bld.tileX) + Math.abs(e.tileY - bld.tileY);
          return d <= 8 && !alreadyDefended.has(e.id);
        });
        if (nearbyEnemies.length === 0) continue;

        for (const enemy of nearbyEnemies) {
          // 优先 idle，其次 pursuing，最后可打断 attacking 的单位
          let defender = ownCombat.find(u =>
            u.holdPosition === false && u.aiLockedAction === null && u.state === 'idle'
          );
          if (!defender) {
            defender = ownCombat.find(u =>
              u.holdPosition === false && u.aiLockedAction === null && u.state === 'pursuing'
            );
          }
          if (!defender) {
            defender = ownCombat.find(u =>
              u.holdPosition === false && u.aiLockedAction === null
            );
          }
          if (!defender) break;

          defender.stopAttacking();
          defender.holdPosition = false;
          defender.aiLockedAction = 'defend';
          defender.attackTarget(enemy.id);

          commands.push({
            type: 'attack_move',
            playerIndex: this.playerIndex,
            unitIds: [defender.id],
            target: { x: Math.round(enemy.tileX), y: Math.round(enemy.tileY) },
            frame: 0,
          });
        }
      }
    }

    // === 进攻分配：每个空闲单位独立选择最佳目标 ===
    const unassigned = ownCombat.filter(u =>
      u.isAlive &&
      u.targetEntityId === null &&
      u.state === 'idle' &&
      u.holdPosition === false &&
      u.aiLockedAction === null
    );

    if (unassigned.length >= this.attackThreshold) {
      for (const unit of unassigned) {
        const best = this.selectBestTarget([unit], enemyUnits, enemyBuildings, ownBuildings);
        if (!best) continue;

        unit.attackTarget(best.id);
        commands.push({
          type: 'attack_move',
          playerIndex: this.playerIndex,
          unitIds: [unit.id],
          target: { x: Math.round(best.tileX), y: Math.round(best.tileY) },
          frame: 0,
        });
      }
    }

    // 清理无效的风筝记录 + 减少撤退冷却
    for (const [unitId] of this.kiteTracker) {
      if (!units.some(u => u.id === unitId && u.isAlive)) {
        this.kiteTracker.delete(unitId);
      }
    }
    for (const [unitId, ticks] of this.retreatCooldown) {
      if (ticks <= 1) {
        this.retreatCooldown.delete(unitId);
      } else {
        this.retreatCooldown.set(unitId, ticks - 1);
      }
    }

    return commands;
  }

  // ============ 目标选择 ============

  private selectBestTarget(
    ownUnits: Unit[],
    enemies: Unit[],
    enemyBuildings: Building[],
    ownBuildings: Building[],
  ): { id: string; tileX: number; tileY: number } | null {
    let bestScore = -Infinity;
    let best: { id: string; tileX: number; tileY: number } | null = null;

    // 用每个自己单位独立计算距离（如果传入多个，用平均位置）
    const avgX = ownUnits.reduce((s, u) => s + u.tileX, 0) / ownUnits.length;
    const avgY = ownUnits.reduce((s, u) => s + u.tileY, 0) / ownUnits.length;

    // 权重常量
    const UNIT_ATTACKING_OUR_BUILDING = 100;
    const UNIT_ATTACKING_OUR_UNIT = 80;
    const UNIT_LOW_HP = 75;
    const UNIT_HIGH_DPS = 55;
    const UNIT_DEFAULT = 40;

    // 评估单位（优先于建筑 — 有敌方单位在附近时先清单位）
    for (const enemy of enemies) {
      let priority = UNIT_DEFAULT;
      if (enemy.targetEntityId && ownBuildings.some(b => b.id === enemy.targetEntityId)) {
        priority = UNIT_ATTACKING_OUR_BUILDING;
      } else if (enemy.targetEntityId && ownUnits.some(u => u.id === enemy.targetEntityId)) {
        priority = UNIT_ATTACKING_OUR_UNIT; // 敌人在攻击我方单位 → 高优先
      } else if (enemy.hpPercent < 0.3) {
        priority = UNIT_LOW_HP;
      } else if (enemy.attackDamage >= 25) {
        priority = UNIT_HIGH_DPS;
      }

      const dist = Math.abs(avgX - enemy.tileX) + Math.abs(avgY - enemy.tileY);
      const score = priority * Math.max(1 / (dist + 1), 0.15);
      if (score > bestScore) {
        bestScore = score;
        best = { id: enemy.id, tileX: enemy.tileX, tileY: enemy.tileY };
      }
    }

    // 评估建筑
    for (const bld of enemyBuildings) {
      const priority = BUILDING_PRIORITY[bld.spriteKey] ?? 40;
      const dist = Math.abs(avgX - bld.tileX) + Math.abs(avgY - bld.tileY);
      const score = priority * Math.max(1 / (dist + 1), 0.15);
      if (score > bestScore) {
        bestScore = score;
        best = { id: bld.id, tileX: bld.tileX, tileY: bld.tileY };
      }
    }

    return best;
  }
}