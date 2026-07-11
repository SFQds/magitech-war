/**
 * HUD 场景 — 覆盖在 GameScene 上的透明 UI 层
 */

import Phaser from 'phaser';
import { GameMap } from '../core/GameMap';
import { FogOfWar } from '../core/FogOfWar';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceDisplay } from '../ui/ResourceDisplay';
import { SelectionPanel } from '../ui/SelectionPanel';
import { CommandCard } from '../ui/CommandCard';
import { ProductionQueueUI } from '../ui/ProductionQueue';
import { Minimap } from '../ui/Minimap';
import { CameraController } from '../core/CameraController';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import type { SelectionData } from '../types/events';
import { ProductionSystem } from '../systems/ProductionSystem';
import { UNIT_DEFS, BUILDING_DEFS, TECH_DEFS, getDisplayName, getBuildingCost, getFactionBonuses } from '../config/unitData';

export class HUDScene extends Phaser.Scene {
  private resourceDisplay!: ResourceDisplay;
  private selectionPanel!: SelectionPanel;
  private commandCard!: CommandCard;
  private productionQueue!: ProductionQueueUI;
  private minimap!: Minimap;
  private attackMoveText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'HUDScene' }); }

  create(): void {
    this.add.rectangle(0, 0, 1280, 40, 0x1a1a2e, 0.85).setOrigin(0, 0).setDepth(99).setScrollFactor(0);
    this.add.rectangle(0, 720 - 80, 1280, 80, 0x1a1a2e, 0.85).setOrigin(0, 0).setDepth(99).setScrollFactor(0);

    this.resourceDisplay = new ResourceDisplay(this);
    this.selectionPanel = new SelectionPanel(this, 10, 720 - 80 - 130);
    this.commandCard = new CommandCard(this);
    this.productionQueue = new ProductionQueueUI(this);

    this.attackMoveText = this.add.text(1280 / 2, 720 - 90, '⚔ 攻击移动模式', {
      fontSize: '16px', color: '#ff6644', backgroundColor: '#1a1a2e',
      padding: { x: 12, y: 4 }, fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setDepth(250).setScrollFactor(0).setAlpha(0);

    this.setupEvents();
  }

  initMinimap(map: GameMap, fog: FogOfWar, cameraCtrl?: CameraController): void {
    this.minimap = new Minimap(this, map, fog, 1280 - 160, 720 - 80 - 160, 150);
    if (cameraCtrl) this.minimap.setCameraCtrl(cameraCtrl);
  }

  private setupEvents(): void {
    // 清理上次游戏残留的监听器，防止重复触发
    EventBus.offAll(GameEvent.RESOURCE_CHANGED);
    EventBus.offAll(GameEvent.SELECTION_CHANGED);
    EventBus.offAll(GameEvent.BUILDING_SELECTED);
    EventBus.offAll(GameEvent.PRODUCTION_STARTED);
    EventBus.offAll(GameEvent.PRODUCTION_COMPLETE);
    EventBus.offAll(GameEvent.UNIT_CREATED);
    EventBus.offAll(GameEvent.UNIT_KILLED);
    EventBus.offAll('attackmove:toggle');

    EventBus.on(GameEvent.RESOURCE_CHANGED, () => this.refreshResourceDisplay());

    EventBus.on(GameEvent.SELECTION_CHANGED, (data: unknown) => {
      const d = data as SelectionData;
      if (d.playerIndex !== 0) return;
      if (d.unitIds.length === 0) { this.selectionPanel.showUnits([]); this.commandCard.clear(); return; }

      const gs = this.scene.get('GameScene') as any;
      const units = d.unitIds.map((id: string) => gs.units?.find((u: Unit) => u.id === id)).filter(Boolean) as Unit[];
      this.selectionPanel.showUnits(units);

      if (units.length === 1 && units[0].spriteKey === 'unit_worker') {
        const btns: { label: string; cost: string; spriteKey?: string; callback: () => void }[] = [];
        const playerFaction = gs.world?.players?.[0]?.faction;
        for (const [bldId, def] of Object.entries(BUILDING_DEFS)) {
          if (def.cost.crystal > 0) {
            const cost = getBuildingCost(bldId, playerFaction);
            btns.push({ label: `建造${def.displayName}`, cost: cost ? `💎${cost.crystal}` : `💎?`, spriteKey: bldId, callback: () => this.enterBuildMode(units[0].id, bldId) });
          }
        }
        this.commandCard.setCommands(btns);
      }
    });

    EventBus.on(GameEvent.BUILDING_SELECTED, (data: any) => {
      if (data.playerIndex !== 0) return;
      const gs = this.scene.get('GameScene') as any;
      const bld = gs.buildings?.find((b: Building) => b.id === data.buildingId) as Building | undefined;
      if (!bld) { this.commandCard.clear(); return; }
      const def = BUILDING_DEFS[bld.spriteKey];
      const btns: any[] = [];
      // 训练按钮
      if (def?.produces) {
        const gs2 = this.scene.get('GameScene') as any;
        for (const uid of def.produces) {
          const ud = UNIT_DEFS[uid];
          // 检查科技需求
          const techsMet = !ud?.techReq?.length || ud.techReq.every((tid: string) => gs2.techTree?.isResearched(tid));
          const label = techsMet ? getDisplayName(uid) : `${getDisplayName(uid)} 🔒`;
          const callback = techsMet ? () => this.issueTrainCommand(bld.id, uid) : () => this.showToast('科技未解锁');
          btns.push({ label, cost: ud ? `💎${ud.cost.crystal} 👥${ud.cost.supply}` : '💎?', spriteKey: uid, callback });
        }
      }
      // 研究按钮
      if (def?.researches) {
        const gs2 = this.scene.get('GameScene') as any;
        const techTree = gs2.techTree;
        for (const tid of def.researches) {
          const td = TECH_DEFS[tid];
          if (!td) continue;
          const researched = techTree?.isResearched(tid);
          const researching = bld.researchingTechId === tid;
          const label = researching ? `${td.name} ⏳` : researched ? `${td.name} ✅` : td.name;
          const cost = researched ? '完成' : `💎${td.crystal}`;
          btns.push({ label, cost, callback: () => { if (!researched && !researching) this.issueResearchCommand(bld.id, tid); } });
        }
      }
      this.commandCard.setCommands(btns.length > 0 ? btns : []);
    });

    EventBus.on(GameEvent.PRODUCTION_STARTED, () => this.updateProductionQueueUI());
    EventBus.on(GameEvent.PRODUCTION_COMPLETE, () => this.updateProductionQueueUI());
    EventBus.on(GameEvent.UNIT_CREATED, () => this.scheduleMinimapUpdate());
    EventBus.on(GameEvent.UNIT_KILLED, () => this.scheduleMinimapUpdate());
    EventBus.on('attackmove:toggle', (data: any) => this.attackMoveText.setAlpha(data.active ? 1 : 0));

    this.time.delayedCall(500, () => {
      this.refreshResourceDisplay();
      if (!this.minimap) { const gs = this.scene.get('GameScene') as any; if (gs?.world?.map) this.initMinimap(gs.world.map, gs.world.fogOfWar); }
      this.scheduleMinimapUpdate();
    });
  }

  /** 屏幕中央短暂浮动提示 */
  private showToast(msg: string): void {
    const { width, height } = this.cameras.main;
    const text = this.add.text(width / 2, height / 2, msg, {
      fontSize: '20px', color: '#ff6644', backgroundColor: '#1a1a2e',
      padding: { x: 16, y: 8 }, fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setDepth(300).setScrollFactor(0);
    this.tweens.add({
      targets: text, alpha: 0, y: text.y - 40, duration: 1200,
      onComplete: () => text.destroy(),
    });
  }

  private refreshResourceDisplay(): void {
    const gs = this.scene.get('GameScene') as any;
    const r = gs.world?.players?.[0]?.resources;
    if (r) this.resourceDisplay.update(r.crystal, r.industry, r.supply, r.supplyCap);
  }

  private issueTrainCommand(buildingId: string, unitDefId: string): void {
    const gs = this.scene.get('GameScene') as any;
    const bld = gs.buildings?.find((b: Building) => b.id === buildingId) as Building | undefined;
    if (!bld || !bld.canEnqueue()) return;
    const def = UNIT_DEFS[unitDefId];
    if (!def) return;
    const { crystal, supply, time } = def.cost;
    if (!gs.world.canAfford(0, { crystal, supply })) {
      this.showToast('资源不足');
      return;
    }
    gs.world.spend(0, { crystal, supply });
    ProductionSystem.startProduction(bld, unitDefId, time);
    EventBus.emit(GameEvent.PRODUCTION_STARTED, { buildingId: bld.id, playerIndex: 0, unitDefId, totalTime: time });
    this.refreshResourceDisplay();
  }

  private issueResearchCommand(buildingId: string, techDefId: string): void {
    const gs = this.scene.get('GameScene') as any;
    const bld = gs.buildings?.find((b: Building) => b.id === buildingId) as Building | undefined;
    if (!bld || bld.state !== 'idle') return;
    const td = TECH_DEFS[techDefId];
    if (!td) return;
    if (!gs.world.canAfford(0, { crystal: td.crystal })) {
      this.showToast('水晶不足');
      return;
    }
    gs.world.spend(0, { crystal: td.crystal });
    bld.researchingTechId = techDefId;
    bld.researchProgress = 0;
    // 应用阵营研究速度加成（帝国 +15%）
    const bonuses = getFactionBonuses(bld.faction);
    bld.researchTotalTime = td.time * bonuses.researchSpeedMult;
    bld.state = 'researching';
    EventBus.emit(GameEvent.PRODUCTION_STARTED, { buildingId: bld.id, playerIndex: 0, unitDefId: techDefId, totalTime: td.time });
    this.refreshResourceDisplay();
  }

  private enterBuildMode(builderId: string, buildingDefId: string): void {
    const gs = this.scene.get('GameScene') as any;
    if (gs.enterBuildMode) gs.enterBuildMode(buildingDefId, builderId);
  }

  private updateProductionQueueUI(): void {
    const gs = this.scene.get('GameScene') as any;
    const queue: { name: string; progress: number }[] = [];
    for (const bld of (gs.buildings ?? []) as Building[]) {
      if (bld.owner !== 0 || !bld.isAlive) continue;
      for (const item of bld.productionQueue) {
        queue.push({ name: getDisplayName(item.unitDefId), progress: item.timeRemaining > 0 ? 1 - item.timeRemaining / item.totalTime : 1 });
      }
    }
    this.productionQueue.update(queue);
  }

  private minimapUpdateScheduled = false;
  private scheduleMinimapUpdate(): void {
    if (this.minimapUpdateScheduled) return;
    this.minimapUpdateScheduled = true;
    this.time.delayedCall(200, () => {
      this.minimapUpdateScheduled = false;
      if (this.minimap) { const gs = this.scene.get('GameScene') as any; this.minimap.update(gs.units ?? [], gs.buildings ?? [], 0); }
    });
  }

  updateResources(crystal: number, industry: number, supply: number, supplyCap: number): void {
    this.resourceDisplay.update(crystal, industry, supply, supplyCap);
  }
}