/**
 * 中立单位与建筑控制器
 *
 * 管理地图上的中立野怪行为和中立建筑交互。
 * 中立单位的 owner = -1，不属于任何玩家。
 *
 * 中立单位行为：
 *   crystal_wisp: 被动漂浮，击杀掉落 50 水晶
 *   feral_mech:   巡逻移动、主动攻击靠近的军事单位
 *   mountain_beast: 守卫远古遗迹，被激怒后追击
 *
 * 中立建筑：
 *   trade_outpost:   占领后每 60 秒产出 100 水晶
 *   ancient_shrine:  占领后科技研究时间 -50%（一次性）
 *   abandoned_mine:  可修复为额外采矿场（产量 60%）
 *   watchtower:      占领后提供 15 tile 视野
 */

import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import type { GameWorld } from '../core/GameWorld';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';

// ============================================================
// 设计数据
// ============================================================

interface NeutralUnitDef {
  spriteKey: string;
  hp: number;
  attackDamage: number;
  attackType: string;
  attackRange: number;
  attackCooldown: number;
  speed: number;
  sight: number;
  armorType: string;
  /** 行为模式 */
  behavior: 'passive' | 'patrol' | 'guardian';
  /** 巡逻/守护中心点 */
  guardX?: number;
  guardY?: number;
  guardRadius?: number;
  /** 击杀奖励 */
  killReward?: { crystal?: number; xp?: number };
}

const NEUTRAL_UNIT_DEFS: Record<string, NeutralUnitDef> = {
  neutral_crystal_wisp: {
    spriteKey: 'neutral_crystal_wisp',
    hp: 50, attackDamage: 0, attackType: 'magic',
    attackRange: 0, attackCooldown: 0,
    speed: 1.5, sight: 4, armorType: 'light',
    behavior: 'passive',
    killReward: { crystal: 50 },
  },
  neutral_feral_mech: {
    spriteKey: 'neutral_feral_mech',
    hp: 300, attackDamage: 25, attackType: 'physical',
    attackRange: 4, attackCooldown: 1.2,
    speed: 1.8, sight: 6, armorType: 'mechanical',
    behavior: 'patrol', guardRadius: 8,
    killReward: { crystal: 100, xp: 20 },
  },
  neutral_mountain_beast: {
    spriteKey: 'neutral_mountain_beast',
    hp: 600, attackDamage: 40, attackType: 'physical',
    attackRange: 1, attackCooldown: 1.5,
    speed: 2.0, sight: 5, armorType: 'heavy',
    behavior: 'guardian', guardRadius: 6,
    killReward: { crystal: 200, xp: 50 },
  },
};

// ============================================================
// 中立单位状态追踪
// ============================================================

interface NeutralUnitState {
  unit: Unit;
  def: NeutralUnitDef;
  guardX: number;
  guardY: number;
  /** 巡逻移动计时 */ moveTimer: number;
  /** 当前巡逻方向 */ patrolDir: number;
  /** 是否被激怒（guardian 专用） */ provoked: boolean;
  /** 激怒目标 */ provokedTargetId: string | null;
}

// ============================================================
// 主控制器
// ============================================================

export class NeutralController {
  /** 中立单位状态 */
  private neutralUnits: NeutralUnitState[] = [];

  /**
   * 在地图上生成中立单位。
   * 调用时机：GameScene.create() 中地图初始化后。
   */
  static spawnNeutralUnit(
    world: GameWorld,
    defId: string,
    tileX: number,
    tileY: number,
  ): Unit | null {
    const def = NEUTRAL_UNIT_DEFS[defId];
    if (!def) return null;

    const unit = new Unit(
      -1, 'arcane_empire', tileX, tileY,
      def.hp, def.armorType as any, 'infantry',
      def.speed, def.attackDamage, def.attackType as any,
      def.attackRange, def.attackCooldown, def.sight,
      def.spriteKey,
    );
    // 中立单位不占补给
    unit.supplyCost = 0;
    return unit;
  }

  /** 注册已生成的中立单位，启动追踪 */
  register(unit: Unit, defId: string): void {
    const def = NEUTRAL_UNIT_DEFS[defId];
    if (!def) return;
    this.neutralUnits.push({
      unit,
      def,
      guardX: unit.tileX,
      guardY: unit.tileY,
      moveTimer: 0,
      patrolDir: 0,
      provoked: false,
      provokedTargetId: null,
    });
  }

  /**
   * 每帧更新所有中立单位。
   * @returns 掉落事件列表（击杀后产生的奖励）
   */
  update(
    allUnits: Unit[],
    buildings: Building[],
    deltaSec: number,
    world: GameWorld,
  ): { playerIndex: number; crystalReward: number; xpReward: number }[] {
    const rewards: { playerIndex: number; crystalReward: number; xpReward: number }[] = [];

    for (const ns of this.neutralUnits) {
      const u = ns.unit;
      if (!u.isAlive) continue;

      switch (ns.def.behavior) {
        case 'passive':
          // 水晶精魄：被动漂浮，微幅随机移动
          NeutralController._updatePassive(ns, deltaSec);
          break;
        case 'patrol':
          // 失控机甲：巡逻 + 攻击附近军事单位
          NeutralController._updatePatrol(ns, allUnits, buildings, deltaSec);
          break;
        case 'guardian':
          // 山兽：守卫遗迹，激怒后追击
          NeutralController._updateGuardian(ns, allUnits, deltaSec);
          break;
      }

      // 检测地形穿越：不可通行格则修正到附近
      if (!world.map.isPassable(Math.floor(u.tileX), Math.floor(u.tileY))) {
        const nearest = world.map.findNearbyPassable(
          Math.round(ns.guardX), Math.round(ns.guardY), 3,
        );
        if (nearest) { u.tileX = nearest.x; u.tileY = nearest.y; }
      }
    }

    return rewards;
  }

  /** 处理中立单位死亡：发放击杀奖励 */
  onNeutralKilled(unit: Unit, killerOwner: number): { crystalReward: number; xpReward: number } | null {
    const idx = this.neutralUnits.findIndex(ns => ns.unit.id === unit.id);
    if (idx < 0) return null;

    const def = this.neutralUnits[idx].def;
    this.neutralUnits.splice(idx, 1);

    const reward = { crystalReward: def.killReward?.crystal ?? 0, xpReward: def.killReward?.xp ?? 0 };
    return reward;
  }

  /** 获取所有存活中立单位 */
  getAliveNeutrals(): Unit[] {
    return this.neutralUnits
      .filter(ns => ns.unit.isAlive)
      .map(ns => ns.unit);
  }

  // ============ 行为更新 ============

  private static _updatePassive(ns: NeutralUnitState, deltaSec: number): void {
    // 水晶精魄：随机漂移
    ns.moveTimer += deltaSec;
    if (ns.moveTimer > 1.5) {
      ns.moveTimer = 0;
      const dx = (Math.random() - 0.5) * 2;
      const dy = (Math.random() - 0.5) * 2;
      ns.unit.tileX += dx;
      ns.unit.tileY += dy;
      // clamp to guard area
      const dist = Math.sqrt(
        (ns.unit.tileX - ns.guardX) ** 2 + (ns.unit.tileY - ns.guardY) ** 2,
      );
      if (dist > 4) {
        ns.unit.tileX = ns.guardX + (Math.random() - 0.5) * 3;
        ns.unit.tileY = ns.guardY + (Math.random() - 0.5) * 3;
      }
    }
  }

  private static _updatePatrol(
    ns: NeutralUnitState,
    allUnits: Unit[],
    buildings: Building[],
    deltaSec: number,
  ): void {
    const u = ns.unit;
    // 检查附近是否有玩家军事单位
    const nearbyEnemy = allUnits.find(e =>
      e.owner !== -1 && e.isAlive && e.spriteKey !== 'unit_worker' &&
      Math.abs(e.tileX - u.tileX) <= u.sight &&
      Math.abs(e.tileY - u.tileY) <= u.sight,
    );

    if (nearbyEnemy) {
      // 主动攻击
      if (!u.targetEntityId || u.targetEntityId !== nearbyEnemy.id) {
        u.attackTarget(nearbyEnemy.id);
      }
      // 向目标移动
      const dx = nearbyEnemy.tileX - u.tileX;
      const dy = nearbyEnemy.tileY - u.tileY;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const step = u.speed * deltaSec;
      if (len > u.attackRange) {
        u.tileX += (dx / len) * step;
        u.tileY += (dy / len) * step;
      }
      return;
    }

    // 巡逻移动
    ns.moveTimer += deltaSec;
    if (ns.moveTimer > 2.0) {
      ns.moveTimer = 0;
      ns.patrolDir = (ns.patrolDir + Math.PI / 3) % (Math.PI * 2);
    }
    const step = u.speed * 0.3 * deltaSec;
    u.tileX += Math.cos(ns.patrolDir) * step;
    u.tileY += Math.sin(ns.patrolDir) * step;

    // clamp to guard area
    const dist = Math.sqrt(
      (u.tileX - ns.guardX) ** 2 + (u.tileY - ns.guardY) ** 2,
    );
    const maxDist = ns.def.guardRadius ?? 8;
    if (dist > maxDist) {
      // 回头走
      const backX = ns.guardX - u.tileX;
      const backY = ns.guardY - u.tileY;
      const backLen = Math.sqrt(backX * backX + backY * backY) || 1;
      u.tileX += (backX / backLen) * step * 2;
      u.tileY += (backY / backLen) * step * 2;
      ns.patrolDir = Math.atan2(backY, backX);
    }
  }

  private static _updateGuardian(
    ns: NeutralUnitState,
    allUnits: Unit[],
    deltaSec: number,
  ): void {
    const u = ns.unit;
    // 检查附近是否有单位（任何玩家）
    const nearbyUnit = allUnits.find(e =>
      e.owner !== -1 && e.isAlive &&
      Math.abs(e.tileX - u.tileX) <= u.sight &&
      Math.abs(e.tileY - u.tileY) <= u.sight,
    );

    if (nearbyUnit && !ns.provoked) {
      ns.provoked = true;
      ns.provokedTargetId = nearbyUnit.id;
    }

    if (ns.provoked && ns.provokedTargetId) {
      const target = allUnits.find(e => e.id === ns.provokedTargetId);
      if (target && target.isAlive) {
        u.attackTarget(target.id);
        // 追击
        const dx = target.tileX - u.tileX;
        const dy = target.tileY - u.tileY;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const step = u.speed * deltaSec;
        if (len > u.attackRange) {
          u.tileX += (dx / len) * step;
          u.tileY += (dy / len) * step;
        }
      } else {
        // 目标消失，返回守卫点
        ns.provoked = false;
        ns.provokedTargetId = null;
      }
    } else {
      // 未激怒：微小随机移动，保持守卫区域
      const dist = Math.sqrt(
        (u.tileX - ns.guardX) ** 2 + (u.tileY - ns.guardY) ** 2,
      );
      if (dist > 3) {
        // 往回走
        const backX = ns.guardX - u.tileX;
        const backY = ns.guardY - u.tileY;
        const backLen = Math.sqrt(backX * backX + backY * backY) || 1;
        u.tileX += (backX / backLen) * u.speed * 0.5 * deltaSec;
        u.tileY += (backY / backLen) * u.speed * 0.5 * deltaSec;
      }
    }

    // 脱离追击距离后恢复
    if (ns.provoked) {
      const dist = Math.sqrt(
        (u.tileX - ns.guardX) ** 2 + (u.tileY - ns.guardY) ** 2,
      );
      if (dist > 15) {
        ns.provoked = false;
        ns.provokedTargetId = null;
        u.stopAttacking();
      }
    }
  }
}

// ============================================================
// 中立建筑定义
// ============================================================

export interface NeutralBuildingDef {
  spriteKey: string;
  hp: number;
  armorType: string;
  /** 占领后效果 */
  effect: string;
}

export const NEUTRAL_BUILDING_DEFS: Record<string, NeutralBuildingDef> = {
  neutral_trade_outpost: {
    spriteKey: 'neutral_trade_outpost',
    hp: 500, armorType: 'structure',
    effect: 'trade: 每60秒产出100水晶',
  },
  neutral_ancient_shrine: {
    spriteKey: 'neutral_ancient_shrine',
    hp: 800, armorType: 'structure',
    effect: 'shrine: 一次性科技研究时间-50%',
  },
  neutral_abandoned_mine: {
    spriteKey: 'neutral_abandoned_mine',
    hp: 300, armorType: 'structure',
    effect: 'mine: 可修复为采矿场(产量60%)',
  },
  neutral_watchtower: {
    spriteKey: 'neutral_watchtower',
    hp: 400, armorType: 'structure',
    effect: 'watchtower: 占领后提供15tile视野',
  },
};

/** 中立建筑占领状态追踪：buildingId -> { playerIndex, timer } */
export class NeutralBuildingManager {
  /** buildingId -> occupied player index */
  private occupied = new Map<string, number>();
  /** 贸易站产出计时：buildingId -> timer */
  private tradeTimers = new Map<string, number>();

  /** 尝试占领中立建筑。返回 true=成功 */
  capture(buildingId: string, playerIndex: number): boolean {
    this.occupied.set(buildingId, playerIndex);
    this.tradeTimers.set(buildingId, 0);
    return true;
  }

  /** 释放占领 */
  release(buildingId: string): void {
    this.occupied.delete(buildingId);
    this.tradeTimers.delete(buildingId);
  }

  /** 是否被占领 */
  isCaptured(buildingId: string): boolean {
    return this.occupied.has(buildingId);
  }

  /** 获取占领者 */
  getOwner(buildingId: string): number | null {
    return this.occupied.get(buildingId) ?? null;
  }

  /**
   * 每帧更新中立建筑效果。
   * @returns 贸易站产出：{ playerIndex, crystal }[]
   */
  update(
    buildings: Building[],
    deltaSec: number,
    world: GameWorld,
  ): { playerIndex: number; crystal: number }[] {
    const outputs: { playerIndex: number; crystal: number }[] = [];

    for (const bld of buildings) {
      if (!bld.isAlive) {
        this.release(bld.id);
        continue;
      }
      if (!this.isCaptured(bld.id)) continue;

      const defId = bld.spriteKey;

      // 贸易站：每60秒产出100水晶
      if (defId === 'neutral_trade_outpost') {
        const owner = this.getOwner(bld.id);
        if (owner === null) continue;

        let timer = this.tradeTimers.get(bld.id) ?? 0;
        timer += deltaSec;
        if (timer >= 60) {
          timer -= 60;
          outputs.push({ playerIndex: owner, crystal: 100 });
        }
        this.tradeTimers.set(bld.id, timer);
      }
    }

    return outputs;
  }
}