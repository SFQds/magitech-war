/**
 * 死亡清理系统 — 移除死亡单位/建筑/枯竭矿点，处理退款与状态收尾
 *
 * 纯逻辑 + 回调注入：核心退款/状态逻辑在此，Phaser 相关的 sprite 销毁、选中高亮、
 * 英雄XP奖励通过回调注入由 GameScene 提供。从 GameScene.cleanupDeadEntities 抽离。
 *
 * 回调约定（与 UnitSpawner/CommandExecutor 的注入风格一致）：
 *  - removeUnitSprite(id) / removeBuildingSprite(id) / removeFieldSprite(id)：销毁 sprite
 *  - onUnitRemoved(id) / onBuildingRemoved(id)：实体注册表移除（GameScene.removeUnit/Building）
 *  - rewardBuildingXp(destroyedOwner)：建筑被摧毁时奖励对方英雄 XP
 *  - updateSelectionHighlight()：选中变化后重绘防御塔射程圈
 *  - getSelection() / setSelection(ids) / clearSelection()：读写 InputController 选中集
 */

import type { GameWorld } from '../core/GameWorld';
import type { EntityRegistry } from '../core/EntityRegistry';
import type { Unit } from '../entities/Unit';
import { UNIT_DEFS, TECH_DEFS, getUnitCostWithFaction } from '../config/unitData';
import { HERO_DEFS } from '../config/heroData';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';

export interface DeathCleanupCallbacks {
  removeUnitSprite: (id: string) => void;
  removeBuildingSprite: (id: string) => void;
  removeFieldSprite: (id: string) => void;
  onUnitRemoved: (id: string) => void;
  onBuildingRemoved: (id: string) => void;
  rewardBuildingXp: (destroyedOwner: number) => void;
  updateSelectionHighlight: () => void;
  getSelection: () => string[];
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  /** 读取/清理当前选中建筑（GameScene.selectedBuildingId 的代理） */
  consumeIfSelectedBuilding: (id: string) => boolean;
}

export class DeathCleanupSystem {
  constructor(
    private readonly world: GameWorld,
    private readonly entities: EntityRegistry,
    private readonly cb: DeathCleanupCallbacks,
  ) {}

  /** 每帧清理：死亡单位、死亡建筑、枯竭矿点 */
  cleanup(): void {
    this.cleanupUnits();
    this.cleanupBuildings();
    this.cleanupFields();
  }

  /** 死亡单位：退还 supply、释放采集位、选中清理、运输车 cargo 释放 */
  private cleanupUnits(): void {
    for (let i = this.entities.units.length - 1; i >= 0; i--) {
      const u = this.entities.units[i];
      // Hero 复活中（reviveTimer !== 0）跳过；cargo 中的单位跳过
      if (u.isAlive) continue;
      const isHeroReviving = (u as any).reviveTimer !== 0;
      if (isHeroReviving) continue;
      if ((u as Unit).isCargo) continue;

      const player = this.world.players[u.owner];
      if (player) {
        const refund = (u as Unit).supplyCost ?? 1;
        player.resources.supply = Math.max(0, player.resources.supply - refund);
      }
      if (u.targetResourceId) {
        const f = this.entities.getField(u.targetResourceId);
        if (f && f.currentGatherers > 0) f.currentGatherers--;
        u.targetResourceId = null;
      }
      const sel = this.cb.getSelection();
      if (sel.includes(u.id)) {
        // P2-质疑31 修复：只移除阵亡单位，保留其余选中（不再整组清空）
        const newSel = sel.filter(id => id !== u.id);
        this.cb.setSelection(newSel);
        this.cb.updateSelectionHighlight();
        EventBus.emit(GameEvent.SELECTION_CHANGED, { unitIds: newSel, playerIndex: 0 });
      }
      this.cb.onUnitRemoved(u.id);

      // P0-2 修复：运输车被摧毁时释放 cargo 内单位（退还 supply + 清除 isCargo）
      const deadTransport = u as Unit;
      if (deadTransport.cargo && deadTransport.cargo.length > 0) {
        const cargoPlayer = this.world.players[deadTransport.owner];
        for (const passenger of deadTransport.cargo) {
          passenger.isCargo = false;
          // 退还 cargo 内单位占用的 supply
          if (cargoPlayer) {
            const cargoRefund = passenger.supplyCost ?? 0;
            cargoPlayer.resources.supply = Math.max(0, cargoPlayer.resources.supply - cargoRefund);
          }
          // 从选中集移除
          const psel = this.cb.getSelection();
          if (psel.includes(passenger.id)) {
            this.cb.clearSelection();
            this.cb.updateSelectionHighlight();
          }
          // 从实体注册表移除（cargo 单位仍在 units 数组中，需清理）
          this.entities.removeUnit(passenger.id);
          this.cb.removeUnitSprite(passenger.id);
        }
        deadTransport.cargo = [];
      }
    }
  }

  /** 死亡建筑：摧毁事件、英雄XP、生产队列退款、研究退款、释放工人、选中清理 */
  private cleanupBuildings(): void {
    for (let i = this.entities.buildings.length - 1; i >= 0; i--) {
      const bld = this.entities.buildings[i];
      if (bld.isAlive) continue;

      const player = this.world.players[bld.owner];
      // P1-5: 发送建筑摧毁事件（战斗摧毁、建造失败都发）
      EventBus.emit(GameEvent.BUILDING_DESTROYED, {
        buildingId: bld.id, playerIndex: bld.owner,
        reason: bld.state === 'constructing' ? 'construction_failed' : 'destroyed',
      });
      // P1-1: 建筑击杀奖励英雄XP (50 XP)
      if (bld.state !== 'constructing') {
        this.cb.rewardBuildingXp(bld.owner);
      }
      // P0-退款修复：用入队时的折扣价退款（与 execTrain 一致），避免拆建筑刷水晶
      if (bld.productionQueue.length > 0 && player) {
        const faction = this.world.players[bld.owner]?.faction;
        const guilds = this.world.players[bld.owner]?.guilds;
        for (const item of bld.productionQueue) {
          const ud = UNIT_DEFS[item.unitDefId];
          const heroD = HERO_DEFS[item.unitDefId];
          if (ud) {
            const cost = getUnitCostWithFaction(item.unitDefId, faction, guilds) ?? ud.cost;
            this.world.refund(bld.owner, { crystal: cost.crystal, supply: cost.supply });
          } else if (heroD) {
            this.world.refund(bld.owner, { crystal: heroD.cost.crystal, supply: heroD.cost.supply });
          }
        }
        bld.productionQueue.length = 0;
      }
      // 退还进行中的科技研究
      if (bld.researchingTechId && player) {
        const tech = TECH_DEFS[bld.researchingTechId];
        if (tech) {
          const progress = Math.max(0, Math.min(1, bld.researchProgress));
          const refundAmount = Math.floor(tech.crystal * (1 - progress));
          if (refundAmount > 0) {
            this.world.refund(bld.owner, { crystal: refundAmount });
          }
        }
        bld.researchingTechId = null;
      }
      // supplyCap/industryCap 由 ResourceSystem 每帧自动重算，此处不手动扣减（避免双重扣除）
      // 通知 HUD 刷新资源
      if (player) {
        EventBus.emit(GameEvent.RESOURCE_CHANGED, {
          playerIndex: bld.owner, resource: 'crystal', newValue: player.resources.crystal, delta: 0,
        });
      }
      // 如果建筑正在建造中，释放工人
      if (bld.builderId) {
        const builder = this.entities.getUnit(bld.builderId);
        if (builder?.isAlive) {
          builder.state = 'idle';
          builder.aiLockedAction = null;
        }
      }
      if (this.cb.consumeIfSelectedBuilding(bld.id)) {
        this.cb.updateSelectionHighlight();
      }
      this.cb.onBuildingRemoved(bld.id);
    }
  }

  /** 枯竭矿点：注销资源格、移除注册、销毁 sprite */
  private cleanupFields(): void {
    for (let i = this.entities.fields.length - 1; i >= 0; i--) {
      const field = this.entities.fields[i];
      if (field.isDepleted || !field.isActive) {
        this.world.map.unregisterResourceTile(field.tileX, field.tileY);
        this.entities.removeField(field.id);
        this.cb.removeFieldSprite(field.id);
      }
    }
  }
}
