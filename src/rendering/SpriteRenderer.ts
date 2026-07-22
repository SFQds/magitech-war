/**
 * 精灵渲染器 — 同步实体状态到 Phaser Image 对象
 *
 * 处理：位置同步、闪光衰减、选中高亮、血条绘制
 * 从 GameScene.syncSprites() 抽离。
 */

import Phaser from 'phaser';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { HpBarRenderer } from './HpBarRenderer';
import { tileToWorld } from '../utils/MathUtils';
import type { FogOfWar } from '../core/FogOfWar';

export class SpriteRenderer {
  /** 复用避免每帧 new Set + map 分配 */
  private _activeIds = new Set<string>();

  constructor(
    private unitSprites: Map<string, Phaser.GameObjects.Image>,
    private buildingSprites: Map<string, Phaser.GameObjects.Image>,
    private flashTimers: Map<string, number>,
    private hpBarRenderer: HpBarRenderer,
    /** P0-B6 修复：注入迷雾用于隐藏不可见区域的敌方单位，避免迷雾透视 */
    private fogOfWar: FogOfWar | null = null,
    /** 本地玩家索引（默认 0），用于判断单位敌我 */
    private localPlayerIndex: number = 0,
  ) {}

  /**
   * 同步所有实体精灵
   * @param dt 帧间隔（秒）
   * @param units 所有单位
   * @param buildings 所有建筑
   * @param selectedUnitIds 当前选中单位ID集合
   * @param selectedBuildingId 当前选中建筑ID（null=无）
   */
  sync(
    dt: number,
    units: Unit[],
    buildings: Building[],
    selectedUnitIds: Set<string>,
    selectedBuildingId: string | null,
  ): void {
    // === 单位精灵 ===
    for (const unit of units) {
      const sprite = this.unitSprites.get(unit.id);
      if (!sprite) continue;

      const w = tileToWorld(unit.tileX, unit.tileY);
      sprite.setPosition(w.x, w.y);

      if (unit.isAlive) {
        // P0-B6 修复：敌方单位在不可见区域隐藏（迷雾透视漏洞修复）
        // 己方/盟方单位始终可见；敌方单位需通过 fog.isVisible 才显示
        const isVisibleByFog = !this.fogOfWar
          || unit.owner === this.localPlayerIndex
          || this.fogOfWar.isVisible(Math.round(unit.tileX), Math.round(unit.tileY));
        if (!isVisibleByFog) {
          sprite.setAlpha(0);
          this.hpBarRenderer.clear(unit.id);
          continue;
        }

        const flashRemain = this.flashTimers.get(unit.id);
        if (flashRemain && flashRemain > 0) {
          sprite.setTint(0xffffff);
          sprite.setAlpha(1.0);
          this.flashTimers.set(unit.id, flashRemain - dt);
        } else {
          this.flashTimers.delete(unit.id);
          sprite.setAlpha(0.9);
          if (selectedUnitIds.has(unit.id)) {
            sprite.setTint(0xffff55);
          } else {
            sprite.clearTint();
          }
        }

        if (unit.hpPercent < 1.0) {
          this.hpBarRenderer.draw(unit.id, w.x - 8, w.y - 14, unit.hpPercent);
        } else {
          this.hpBarRenderer.clear(unit.id);
        }
      } else {
        sprite.setAlpha(0);
        this.hpBarRenderer.clear(unit.id);
      }
    }

    // 清理残留血条 — 复用 Set 避免每帧分配
    this._activeIds.clear();
    for (const u of units) this._activeIds.add(u.id);
    for (const b of buildings) this._activeIds.add(b.id);
    this.hpBarRenderer.cleanup(this._activeIds);

    // === 建筑精灵 ===
    for (const bld of buildings) {
      const sprite = this.buildingSprites.get(bld.id);
      if (!sprite || !bld.isAlive) continue;

      // P1-质疑9 修复：敌方建筑在迷雾未探索区域隐藏（与单位对称）
      const bVisibleByFog = !this.fogOfWar
        || bld.owner === this.localPlayerIndex
        || this.fogOfWar.isVisible(bld.tileX, bld.tileY);
      if (!bVisibleByFog) {
        sprite.setAlpha(0);
        this.hpBarRenderer.clear(bld.id);
        continue;
      }

      const w = tileToWorld(bld.tileX, bld.tileY);
      sprite.setPosition(w.x, w.y);

      if (bld.hpPercent < 1.0) {
        this.hpBarRenderer.draw(bld.id, w.x - 12, w.y - 16, bld.hpPercent);
      } else {
        this.hpBarRenderer.clear(bld.id);
      }

      const flashRemain = this.flashTimers.get(bld.id);
      if (flashRemain && flashRemain > 0) {
        sprite.setTint(0xffffff);
        sprite.setAlpha(1.0);
        this.flashTimers.set(bld.id, flashRemain - dt);
      } else {
        this.flashTimers.delete(bld.id);
        if (bld.id === selectedBuildingId) {
          sprite.setTint(0xffff55);
        } else {
          sprite.clearTint();
        }
        sprite.setAlpha(0.9);
      }
    }
  }

  destroy(): void {
    for (const [, s] of this.unitSprites) s.destroy();
    for (const [, s] of this.buildingSprites) s.destroy();
    this.unitSprites.clear();
    this.buildingSprites.clear();
  }
}