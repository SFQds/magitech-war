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
import { GuildSystem, ALCHEMY_POTIONS } from '../systems/GuildSystem';

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

  /** Attack eagerness by difficulty (low = needs more idle units to attack). */
  private get attackThreshold(): number {
    if (this.difficulty === 'easy') return 6;
    if (this.difficulty === 'hard') return 1;
    return 3; // P2-AI: normal now distinct from hard (3 vs 1)
  }

  /** AI 行会技能冷却（毫秒） */
  private _potionCooldown = 0;
  private _voidCooldown = 0;
  private _potionIndex = 0;

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
    // P1-AI3: AI respects fog of war (units real-time visible, buildings explored/visible memory)
    const fog = this.world.fogOfWar;
    const enemyUnits = units.filter(
      u => u.owner !== this.playerIndex && u.isAlive &&
        fog.isVisible(Math.round(u.tileX), Math.round(u.tileY))
    );
    const enemyBuildings = buildings.filter(
      b => b.owner !== this.playerIndex && b.isAlive &&
        (fog.isExplored(Math.round(b.tileX), Math.round(b.tileY)) || fog.isVisible(Math.round(b.tileX), Math.round(b.tileY)))
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
          // P1-AI2: base regen is a design; only hard AI gets the bonus heal near buildings.
          if (this.difficulty === 'hard') {
            unit.hp = Math.min(unit.maxHp, unit.hp + 3 * 2);
          }
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

        if (ownBuildings.length === 0) {
            // P1-7 修复：无建筑时退出撤退→转为进攻模式，避免永久锁定
            unit.aiLockedAction = null;
            unit.holdPosition = false;
            unit.stopAttacking();
            continue;
          }

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
          // P1-AI5: pick nearest idle defender to the enemy, not global first idle.
          const idleCandidates = ownCombat.filter(u =>
            u.holdPosition === false && u.aiLockedAction === null && u.state === 'idle'
          );
          let defender: Unit | undefined;
          const nearest = (arr: Unit[]) => arr.reduce((best, u) => {
            const dU = Math.abs(u.tileX - enemy.tileX) + Math.abs(u.tileY - enemy.tileY);
            const dB = Math.abs(best.tileX - enemy.tileX) + Math.abs(best.tileY - enemy.tileY);
            return dU < dB ? u : best;
          }, arr[0]);
          if (idleCandidates.length > 0) defender = nearest(idleCandidates);
          if (!defender) {
            const pursueCandidates = ownCombat.filter(u =>
              u.holdPosition === false && u.aiLockedAction === null && u.state === 'pursuing'
            );
            if (pursueCandidates.length > 0) defender = nearest(pursueCandidates);
          }
          if (!defender) {
            const anyCandidates = ownCombat.filter(u =>
              u.holdPosition === false && u.aiLockedAction === null
            );
            if (anyCandidates.length > 0) defender = nearest(anyCandidates);
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

    // === P1-AI药剂: AI 使用炼金药剂和虚空过载 ===
    this._useGuildAbilities(units, enemyUnits, commands);

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

  // ============ P1-AI: 行会技能使用 ============

  /** AI 在战斗时自动使用炼金药剂和虚空过载 */
  private _useGuildAbilities(
    allUnits: Unit[], enemyUnits: Unit[], _commands: AnyCommand[],
  ): void {
    const guilds = this.world.players[this.playerIndex]?.guilds ?? [];
    const crystal = this.world.players[this.playerIndex]?.resources.crystal ?? 0;
    const now = Date.now();

    // 炼金药剂：有敌人且冷却结束 + 水晶充足
    if (guilds.includes('alchemists_society') && enemyUnits.length > 0 && now >= this._potionCooldown) {
      // 选进攻中的己方战斗单位
      const combatUnits = allUnits.filter(u =>
        u.owner === this.playerIndex && u.isAlive &&
        u.spriteKey !== 'unit_worker' &&
        (u.state === 'attacking' || u.state === 'pursuing') &&
        u.alchemyBuffTimer <= 0,
      );
      if (combatUnits.length > 0) {
        // 轮换药剂类型（与玩家 Q 键一致）
        this._potionIndex = (this._potionIndex + 1) % ALCHEMY_POTIONS.length;
        const potion = ALCHEMY_POTIONS[this._potionIndex];
        if (crystal >= potion.crystalCost) {
          this.world.spend(this.playerIndex, { crystal: potion.crystalCost });
          for (const unit of combatUnits) {
            GuildSystem.applyAlchemyPotion(unit, potion);
          }
          this._potionCooldown = now + 8000; // 8s cooldown (比玩家 5s 略长)
        }
      }
    }

    // 虚空过载：有敌人且冷却结束
    if (guilds.includes('void_institute') && enemyUnits.length > 0 && now >= this._voidCooldown) {
      const overloadUnits = allUnits.filter(u =>
        u.owner === this.playerIndex && u.isAlive &&
        u.spriteKey !== 'unit_worker' && !u.spriteKey.startsWith('hero_') &&
        (u.state === 'attacking' || u.state === 'pursuing') &&
        !u.isVoidOvercharged,
      );
      if (overloadUnits.length > 0) {
        const hasOpt = this.world.techTrees.get(this.playerIndex)?.isResearched('tech:production_line_optimized') ?? false;
        for (const unit of overloadUnits) {
          GuildSystem.activateVoidOverload(unit, hasOpt);
        }
        this._voidCooldown = now + 12000; // 12s cooldown (比玩家 8s 略长)
      }
    }
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