/**
 * 建造控制器 — 建造模式状态机
 */
import type Phaser from 'phaser';
import { Building } from '../entities/Building';
import { MovementSystem } from '../systems/MovementSystem';
import { getBuildingCost, createBuilding } from '../config/unitData';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import type { GameMap } from '../core/GameMap';
import type { GameWorld } from '../core/GameWorld';
import { Unit } from '../entities/Unit';

interface BuildMode { buildingDefId: string; builderId: string; }

/** 建造超时倍率（建造时间 ×3 后仍未完成→失败退款） */
const BUILD_TIMEOUT_MULT = 3;

export class BuildController {
  private scene: Phaser.Scene;
  private mode: BuildMode | null = null;
  private preview: Phaser.GameObjects.Image | null = null;
  /** 建造超时累积计时（秒），仅 constructing 且 builder 存活时增加 */
  private stuckTimers = new Map<string, number>();

  constructor(scene: Phaser.Scene) { this.scene = scene; }

  get isActive(): boolean { return this.mode !== null; }

  tryEnter(bldId: string, builderId: string, faction: string, world: GameWorld, getUnit: (id: string) => Unit | undefined): boolean {
    const cost = getBuildingCost(bldId, faction);
    if (!cost || !world.canAfford(0, { crystal: cost.crystal, industry: cost.industry })) return false;
    const builder = getUnit(builderId);
    if (builder && builder.state === 'building') return false;
    this.mode = { buildingDefId: bldId, builderId };
    if (!this.preview) {
      this.preview = this.scene.add.image(0, 0, bldId);
      this.preview.setAlpha(0.5).setDepth(30).setDisplaySize(48, 48);
    }
    return true;
  }

  cancel(): void {
    this.mode = null;
    if (this.preview) { this.preview.destroy(); this.preview = null; }
    EventBus.emit(GameEvent.SELECTION_CHANGED, { unitIds: [], playerIndex: 0 });
  }

  updatePreview(pointer: Phaser.Input.Pointer, map: GameMap, buildings: Building[]): void {
    if (!this.mode || !this.preview) return;
    const tx = Math.floor(pointer.worldX / 32);
    const ty = Math.floor(pointer.worldY / 32);
    this.preview.setPosition(tx * 32 + 16, ty * 32 + 16);
    const ok = map.inBounds(tx, ty) && map.isPassable(tx, ty) &&
      !buildings.some(b => b.isAlive && b.tileX === tx && b.tileY === ty);
    this.preview.setTint(ok ? 0x88ff88 : 0xff4444);
  }

  confirm(
    tileX: number, tileY: number, faction: string, world: GameWorld, map: GameMap,
    buildings: Building[], addBld: (b: Building) => void, getUnit: (id: string) => Unit | undefined,
  ): boolean {
    if (!this.mode) return false;
    const defId = this.mode.buildingDefId;
    const cost = getBuildingCost(defId, faction);
    if (!cost || !map.inBounds(tileX, tileY) || !map.isPassable(tileX, tileY)) return false;
    if (buildings.some(b => b.isAlive && b.tileX === tileX && b.tileY === tileY)) return false;
    if (!world.canAfford(0, { crystal: cost.crystal, industry: cost.industry })) return false;
    world.spend(0, { crystal: cost.crystal, industry: cost.industry });
    const bld = createBuilding(0, faction, defId, tileX, tileY);
    addBld(bld);
    const builder = getUnit(this.mode.builderId);
    if (builder?.isAlive) {
      builder.stopAttacking();
      builder.clearPath();
      builder.aiLockedAction = 'building';
      bld.builderId = builder.id;
      // 安全检查：目标 tile 必须可通过（找建筑旁最近可通过位）
      const navTarget = map.findNearbyPassable(tileX, tileY + 1, 3) ?? { x: tileX + 1, y: tileY + 1 };
      MovementSystem.navigate(builder, navTarget, map);
    }
    this.cancel();
    return true;
  }

  updateConstruction(deltaSec: number, buildings: Building[], getUnit: (id: string) => Unit | undefined, refundFn?: (cost: { crystal: number; industry: number }) => void): void {
    for (const bld of buildings) {
      if (!bld.isAlive || bld.state !== 'constructing') continue;

      const cost = getBuildingCost(bld.spriteKey, bld.faction);
      const maxTime = (cost?.time ?? 30) * BUILD_TIMEOUT_MULT;

      // 检查建造者是否存活
      if (bld.builderId) {
        const builder = getUnit(bld.builderId);
        if (!builder?.isAlive) {
          // 建造者死亡 → 建筑失败，退款
          this.failConstruction(bld, '建造者已阵亡！', refundFn);
          continue;
        }
        // 建造者已到达工地 → 切换状态
        if (builder.state === 'idle' && builder.aiLockedAction === 'building') {
          builder.state = 'building';
        }
        // 建造者存活但未到达 → 累计超时
        if (builder.state !== 'building') {
          const stuck = this.stuckTimers.get(bld.id) ?? 0;
          this.stuckTimers.set(bld.id, stuck + deltaSec);
          if (stuck + deltaSec >= maxTime) {
            this.failConstruction(bld, '建造者无法到达工地！', refundFn);
            continue;
          }
          continue; // 建造者还没到，不能推进进度
        }
      }

      // 正常推进建造进度
      if (!cost) { bld.complete(); this.releaseBuilder(bld, getUnit); continue; }
      bld.buildProgress += deltaSec / cost.time;
      if (bld.buildProgress >= 1) {
        bld.complete();
        this.releaseBuilder(bld, getUnit);
        EventBus.emit(GameEvent.BUILDING_COMPLETE, {});
      }
    }
  }

  /** 建造失败：销毁建筑 + 退还资源 + toast */
  private failConstruction(bld: Building, reason: string, refundFn?: (cost: { crystal: number; industry: number }) => void): void {
    const cost = getBuildingCost(bld.spriteKey, bld.faction);
    if (cost && refundFn) {
      refundFn({ crystal: cost.crystal, industry: cost.industry });
    }
    EventBus.emit(GameEvent.BUILDING_DESTROYED, { buildingId: bld.id, reason });
    // 将建筑标记为不存活（由 GameScene.cleanupDeadEntities 清理）
    bld.hp = 0;
    bld.isActive = false;
  }

  private releaseBuilder(bld: Building, getUnit: (id: string) => Unit | undefined): void {
    this.stuckTimers.delete(bld.id);
    if (bld.builderId) {
      const builder = getUnit(bld.builderId);
      if (builder?.isAlive) {
        builder.state = 'idle';
        builder.aiLockedAction = null;
      }
      bld.builderId = null;
    }
  }

  /** P1-N2 修复：放弃指定 builder 的所有在建建筑并退款 */
  cancelBuilderConstructions(
    builderId: string,
    buildings: Building[],
    refundFn?: (cost: { crystal: number; industry: number }) => void,
  ): void {
    for (const bld of buildings) {
      if (bld.builderId === builderId && bld.state === 'constructing') {
        this.failConstruction(bld, '建造者被重新指派', refundFn);
      }
    }
  }

  destroy(): void { this.stuckTimers.clear(); this.cancel(); }
}