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

export class BuildController {
  private scene: Phaser.Scene;
  private mode: BuildMode | null = null;
  private preview: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene) { this.scene = scene; }

  get isActive(): boolean { return this.mode !== null; }

  tryEnter(bldId: string, builderId: string, faction: string, world: GameWorld, getUnit: (id: string) => Unit | undefined): boolean {
    const cost = getBuildingCost(bldId, faction);
    if (!cost || !world.canAfford(0, { crystal: cost.crystal, industry: cost.industry })) return false;
    // 检查建造者是否空闲（不在建造其他东西）
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
      // 锁定工人为建造状态：先导航到建筑旁，到达后状态切为 building
      builder.stopAttacking();
      builder.clearPath();
      builder.aiLockedAction = 'building';
      bld.builderId = builder.id;
      MovementSystem.navigate(builder, { x: tileX, y: tileY + 1 }, map);
      // navigate 会设 state='moving'，到达时 clearPath 重置为 idle。
      // releaseBuilder 通过 builderId + aiLockedAction 释放，不依赖 state。
    }
    this.cancel();
    return true;
  }

  updateConstruction(deltaSec: number, buildings: Building[], getUnit: (id: string) => Unit | undefined): void {
    for (const bld of buildings) {
      if (!bld.isAlive || bld.state !== 'constructing') continue;
      // 检查建造者是否已到达工地（idle=已到，moving=还在路上）
      if (bld.builderId) {
        const builder = getUnit(bld.builderId);
        if (builder?.isAlive && builder.state === 'idle' && builder.aiLockedAction === 'building') {
          builder.state = 'building';
        }
      }
      const cost = getBuildingCost(bld.spriteKey, bld.faction);
      if (!cost) { bld.complete(); this.releaseBuilder(bld, getUnit); continue; }
      bld.buildProgress += deltaSec / cost.time;
      if (bld.buildProgress >= 1) {
        bld.complete();
        this.releaseBuilder(bld, getUnit);
        EventBus.emit(GameEvent.BUILDING_COMPLETE, {});
      }
    }
  }

  private releaseBuilder(bld: Building, getUnit: (id: string) => Unit | undefined): void {
    if (bld.builderId) {
      const builder = getUnit(bld.builderId);
      if (builder?.isAlive) {
        builder.state = 'idle';
        builder.aiLockedAction = null;
      }
      bld.builderId = null;
    }
  }

  destroy(): void { this.cancel(); }
}