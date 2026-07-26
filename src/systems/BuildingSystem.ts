/**
 * 建筑系统 — 公会专属建筑的每帧机制
 *
 * 纯逻辑：处理公会专属建筑的被动光环/采集增幅等持续效果。
 * 由 GameScene 每帧调用 update()。无 Phaser 依赖。
 *
 * 当前实现：
 *  - 维修站 (bld_repair_depot, 机械行会)：周围 6 格友方机械单位每秒回血 +3% maxHp
 *  - 传送门 (bld_teleport_gate, 法师公会)：成对建造，单位进入一端 1 格内瞬移到另一端（消耗水晶）
 */

import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import type { GameWorld } from '../core/GameWorld';

/** 维修站回血半径（Manhattan 距离，tile） */
const REPAIR_RADIUS = 6;
/** 维修站每秒回血占 maxHp 的比例 */
const REPAIR_HP_PER_SEC_RATIO = 0.03;
/** 维修站每秒回血下限（避免低 HP 机械单位回血过慢） */
const REPAIR_HP_PER_SEC_MIN = 2;

/** 传送门触发距离（单位进入此距离内触发传送，Manhattan） */
const TELEPORT_TRIGGER_RADIUS = 1;
/** 单次传送消耗水晶 */
const TELEPORT_COST = 20;
/** 单位传送后冷却（秒，防止反复触发） */
const TELEPORT_UNIT_COOLDOWN = 3;

export class BuildingSystem {
  /** 单位传送冷却：unitId -> 剩余秒数 */
  private static _teleportCooldowns = new Map<string, number>();

  /**
   * 每帧更新所有公会专属建筑的持续效果。
   * 由 GameScene.stepGuildAndHero 调用。
   */
  static update(
    units: Unit[],
    buildings: Building[],
    deltaSec: number,
    world?: GameWorld,
  ): void {
    BuildingSystem._updateRepairDepots(units, buildings, deltaSec);
    if (world) {
      BuildingSystem._updateTeleportGates(units, buildings, deltaSec, world);
    }
    BuildingSystem._tickTeleportCooldowns(deltaSec);
  }

  // ========== 维修站实现 ==========

  /** 维修站：周围 6 格友方机械单位每秒回血 */
  private static _updateRepairDepots(
    units: Unit[],
    buildings: Building[],
    deltaSec: number,
  ): void {
    const depots = buildings.filter(b =>
      b.isAlive && b.state !== 'constructing' && b.spriteKey === 'bld_repair_depot'
    );
    if (depots.length === 0) return;

    for (const depot of depots) {
      for (const u of units) {
        if (!u.isAlive || u.owner !== depot.owner) continue;
        if (u.armorType !== 'mechanical') continue;
        const d = Math.abs(depot.tileX - u.tileX) + Math.abs(depot.tileY - u.tileY);
        if (d > REPAIR_RADIUS) continue;
        const healPerSec = Math.max(u.maxHp * REPAIR_HP_PER_SEC_RATIO, REPAIR_HP_PER_SEC_MIN);
        u.hp = Math.min(u.maxHp, u.hp + healPerSec * deltaSec);
      }
    }
  }

  // ========== 传送门实现 ==========

  /** 传送门：单位进入一端 1 格内瞬移到另一端（消耗水晶，冷却防反复触发） */
  private static _updateTeleportGates(
    units: Unit[],
    buildings: Building[],
    deltaSec: number,
    world: GameWorld,
  ): void {
    void deltaSec; // cooldown 由 _tickTeleportCooldowns 统一推进
    // 按 owner 分组收集完成的传送门
    const gatesByOwner = new Map<number, Building[]>();
    for (const b of buildings) {
      if (!b.isAlive || b.state === 'constructing') continue;
      if (b.spriteKey !== 'bld_teleport_gate') continue;
      const arr = gatesByOwner.get(b.owner) ?? [];
      arr.push(b);
      gatesByOwner.set(b.owner, arr);
    }
    if (gatesByOwner.size === 0) return;

    for (const [owner, gates] of gatesByOwner) {
      // 需要至少 2 座传送门才能配对传送
      if (gates.length < 2) continue;
      for (const u of units) {
        if (!u.isAlive || u.owner !== owner) continue;
        // 工兵不传送（避免打乱采集）
        if (u.spriteKey === 'unit_worker') continue;
        // 冷却中跳过
        if ((BuildingSystem._teleportCooldowns.get(u.id) ?? 0) > 0) continue;
        // 找单位当前所在的传送门（入口）
        const entry = gates.find(g =>
          Math.abs(g.tileX - u.tileX) + Math.abs(g.tileY - u.tileY) <= TELEPORT_TRIGGER_RADIUS
        );
        if (!entry) continue;
        // 找另一端（出口）— 取距离最远的另一座传送门
        let exit: Building | null = null;
        let maxDist = -1;
        for (const g of gates) {
          if (g.id === entry.id) continue;
          const d = Math.abs(g.tileX - entry.tileX) + Math.abs(g.tileY - entry.tileY);
          if (d > maxDist) { maxDist = d; exit = g; }
        }
        if (!exit) continue;
        // 检查水晶
        if (!world.canAfford(owner, { crystal: TELEPORT_COST })) continue;
        // 执行传送：扣水晶、清路径、瞬移到出口附近、设冷却、重置战斗状态
        world.spend(owner, { crystal: TELEPORT_COST });
        u.clearPath();
        u.tileX = exit.tileX;
        u.tileY = exit.tileY;
        u.state = 'idle';
        u.targetEntityId = null;
        BuildingSystem._teleportCooldowns.set(u.id, TELEPORT_UNIT_COOLDOWN);
      }
    }
  }

  /** 推进单位传送冷却 */
  private static _tickTeleportCooldowns(deltaSec: number): void {
    if (BuildingSystem._teleportCooldowns.size === 0) return;
    for (const [id, cd] of BuildingSystem._teleportCooldowns) {
      const next = cd - deltaSec;
      if (next <= 0) BuildingSystem._teleportCooldowns.delete(id);
      else BuildingSystem._teleportCooldowns.set(id, next);
    }
  }

  // ========== 测试辅助 ==========

  /** 重置内部状态（测试用） */
  static resetForTest(): void {
    BuildingSystem._teleportCooldowns.clear();
  }
}
