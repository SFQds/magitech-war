/**
 * HUD 场景 — 覆盖在 GameScene 上的透明 UI 层
 */

import Phaser from 'phaser';
import { GameMap } from '../core/GameMap';
import { FogOfWar } from '../core/FogOfWar';
import { Unit } from '../entities/Unit';
import { Hero } from '../entities/Hero';
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
import { UNIT_DEFS, BUILDING_DEFS, TECH_DEFS, getDisplayName, getBuildingCost } from '../config/unitData';
import type { CommandResult } from '../controllers/CommandExecutor';
import { HeroSystem } from '../systems/HeroSystem';

export class HUDScene extends Phaser.Scene {
  private resourceDisplay!: ResourceDisplay;
  private selectionPanel!: SelectionPanel;
  private commandCard!: CommandCard;
  private productionQueue!: ProductionQueueUI;
  private minimap!: Minimap;
  private attackMoveText!: Phaser.GameObjects.Text;
  /** P1-10 修复：保存所有 EventBus 监听器引用，shutdown 时逐个 off */
  private _eventHandlers: { event: string; handler: (data: unknown) => void }[] = [];
  /** P2-3：PATH_FAILED toast 节流 — 单位 id → 上次 toast 的时间戳(ms)，400ms 内去重 */
  private _lastPathFailToast = new Map<string, number>();
  /** P1-5：GRACE_WARNING toast 节流 — playerIndex → 上次 toast 秒值，秒数变化才再播 */
  private _lastGraceWarnSec = new Map<number, number>();

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

    // P1-10 修复：注册场景关闭清理 — 逐个 off 所有 EventBus 监听器
    this.events.on('shutdown', () => {
      for (const { event, handler } of this._eventHandlers) {
        EventBus.off(event, handler);
      }
      this._eventHandlers = [];
    });
  }

  /** P1-10 修复：注册 EventBus 监听器并保存引用供 shutdown 清理 */
  private _on(event: string, handler: (data: unknown) => void): void {
    EventBus.on(event, handler);
    this._eventHandlers.push({ event, handler });
  }

  /** 每帧刷新进度条 + 小地图 */
  update(): void {
    if ((this.game.loop.frame % 8) === 0) {
      this.updateProductionQueueUI();
    }
    // P1-质疑19 修复：小地图每帧更新（单位移动/相机平移需要实时反映）
    if (this.minimap) {
      const gs = this.scene.get('GameScene') as any;
      this.minimap.update(gs?.units ?? [], gs?.buildings ?? [], 0);
    }
  }

  initMinimap(map: GameMap, fog: FogOfWar, cameraCtrl?: CameraController): void {
    this.minimap = new Minimap(this, map, fog, 1280 - 160, 720 - 80 - 160, 150);
    if (cameraCtrl) this.minimap.setCameraCtrl(cameraCtrl);
  }

  private setupEvents(): void {
    // P1-10 修复：使用 _on 注册监听器，shutdown 时逐个 off

    this._on(GameEvent.RESOURCE_CHANGED, () => this.refreshResourceDisplay());

    this._on(GameEvent.SELECTION_CHANGED, (data: unknown) => {
      const d = data as SelectionData;
      if (d.playerIndex !== 0) return;
      if (d.unitIds.length === 0) { this.selectionPanel.showUnits([]); this.commandCard.clear(); return; }

      const gs = this.scene.get('GameScene') as any;
      const units = d.unitIds.map((id: string) => gs.units?.find((u: Unit) => u.id === id)).filter(Boolean) as Unit[];
      this.selectionPanel.showUnits(units);

      // === 英雄技能按钮 ===
      if (units.length === 1 && units[0] instanceof Hero) {
        const hero = units[0] as Hero;
        const btns: { label: string; cost: string; spriteKey?: string; callback: () => void; disabled?: boolean }[] = [];
        const slots = hero.getAvailableSkillSlots();

        for (const slotIdx of slots) {
          const info = HeroSystem.getSkillInfo(hero, slotIdx);
          if (!info) continue;
          const cdText = info.available ? '' : ` ⏳${Math.ceil(info.currentCooldown)}s`;
          const label = info.unlocked
            ? (info.available ? info.name : `${info.name}${cdText}`)
            : '🔒 Lv' + ([1, 3, 5][slotIdx]);
          const cost = info.available ? info.name : info.unlocked ? `${Math.ceil(info.currentCooldown)}s` : '未解锁';
          btns.push({
            label,
            cost,
            callback: () => {
              if (info.available) {
                HeroSystem.activateSkill(hero, slotIdx, {
                  units: gs.units ?? [],
                  buildings: gs.buildings ?? [],
                });
              }
            },
            disabled: !info.available,
          });
        }

        // 英雄等级和XP条
        const xpPct = hero.level >= hero.maxLevel ? 100 : Math.round((hero.xp / hero.xpToNextLevel) * 100);
        btns.push({
          label: `⭐ Lv ${hero.level}/${hero.maxLevel}`,
          cost: hero.level < hero.maxLevel ? `XP ${hero.xp}/${hero.xpToNextLevel} (${xpPct}%)` : 'MAX',
          callback: () => {},
          disabled: true,
        });

        this.commandCard.setCommands(btns);
        return;
      }

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

    this._on(GameEvent.BUILDING_SELECTED, (data: any) => {
      if (data.playerIndex !== 0) return;
      const gs = this.scene.get('GameScene') as any;
      const bld = gs.buildings?.find((b: Building) => b.id === data.buildingId) as Building | undefined;
      if (!bld) { this.commandCard.clear(); return; }
      const def = BUILDING_DEFS[bld.spriteKey];
      const btns: any[] = [];
      // 建造中的建筑不显示训练/研究按钮
      if (bld.state !== 'constructing' && def?.produces) {
        const gs2 = this.scene.get('GameScene') as any;
        const playerFaction = gs2.world?.players?.[0]?.faction;
        for (const uid of def.produces) {
          const ud = UNIT_DEFS[uid];
          // 跳过阵营专属兵种（非本阵营不显示按钮）
          if (ud?.exclusiveTo?.faction && ud.exclusiveTo.faction !== playerFaction) continue;
          const techsMet = !ud?.techReq?.length || ud.techReq.every((tid: string) => gs2.getTechTree?.(0)?.isResearched(tid));
          const label = techsMet ? getDisplayName(uid) : `${getDisplayName(uid)} 🔒`;
          const callback = techsMet ? () => this.issueTrainCommand(bld.id, uid) : () => this.showToast('科技未解锁');
          btns.push({ label, cost: ud ? `💎${ud.cost.crystal} 👥${ud.cost.supply}` : '💎?', spriteKey: uid, callback, disabled: !techsMet });
        }
      }
      if (bld.state !== 'constructing' && def?.researches) {
        const gs2 = this.scene.get('GameScene') as any;
        const techTree = gs2.getTechTree?.(0);
        for (const tid of def.researches) {
          const td = TECH_DEFS[tid];
          if (!td) continue;
          const researched = techTree?.isResearched(tid);
          const researching = bld.researchingTechId === tid;
          // 检查前置科技
          const prereqsMet = !td.prerequisites?.length || td.prerequisites.every((p: string) => techTree?.isResearched(p));
          const canResearch = !researched && !researching && prereqsMet;
          // P1-14：研究中的科技显示「取消」按钮并可点击，触发 cancel_research 命令退款
          const label = researching ? `${td.name} ✖ 取消` : researched ? `${td.name} ✅` : !prereqsMet ? `${td.name} 🔒` : td.name;
          const cost = researching
            ? `${Math.floor(td.crystal * (1 - bld.researchProgress))}↩`
            : researched ? '完成' : !prereqsMet ? '🔒' : `💎${td.crystal}`;
          const callback = researching
            ? () => this.issueCancelResearchCommand(bld.id)
            : () => { if (canResearch) this.issueResearchCommand(bld.id, tid); };
          // 研究中按钮置为可用，允许点击取消
          const disabled = researching ? false : !canResearch;
          btns.push({ label, cost, callback, disabled });
        }
      }
      this.commandCard.setCommands(btns.length > 0 ? btns : []);
    });

    // P2-质疑33: 建造中建筑选中时显示进度 + 取消建造按钮
    this._on(GameEvent.BUILDING_SELECTED, (data: any) => {
      if (data.playerIndex !== 0) return;
      const gs = this.scene.get('GameScene') as any;
      const bld = gs.buildings?.find((b: Building) => b.id === data.buildingId) as Building | undefined;
      if (!bld || bld.state !== 'constructing') return;
      // 取消建造：调用 cancelBuilderConstructions 退款
      this.commandCard.setCommands([{
        label: `🏗 建造中 ${Math.floor(bld.buildProgress * 100)}%`,
        cost: '取消',
        callback: () => {
          if (gs.buildController?.cancelBuilderConstructions) {
            gs.buildController.cancelBuilderConstructions(
              bld.builderId, gs.buildings,
              (cost: any) => { gs.world?.refund?.(0, cost); },
            );
          }
        },
      }]);
    });

    this._on(GameEvent.PRODUCTION_STARTED, () => this.updateProductionQueueUI());
    this._on(GameEvent.PRODUCTION_COMPLETE, () => this.updateProductionQueueUI());
    this._on(GameEvent.UNIT_CREATED, () => this.scheduleMinimapUpdate());
    this._on(GameEvent.UNIT_KILLED, () => this.scheduleMinimapUpdate());
    this._on(GameEvent.ATTACK_MOVE_TOGGLE, (data: any) => this.attackMoveText.setAlpha(data.active ? 1 : 0));

    // P1-5: 行会和英雄技能事件监听
    this._on(GameEvent.ABILITY_USED, (data: any) => {
      this.showToast(`技能已激活: ${data.abilityId}`);
    });
    this._on(GameEvent.UNIT_DESTROYED, () => {
      this.scheduleMinimapUpdate();
    });
    this._on(GameEvent.HERO_LEVELED, (data: any) => {
      this.showToast(`英雄升到 Lv ${data.newLevel}!`);
      // 刷新命令卡（新技能可能解锁）
      const gs = this.scene.get('GameScene') as any;
      const selection = gs.inputCtrl?.getSelection?.() ?? [];
      if (selection.length > 0) {
        EventBus.emit(GameEvent.SELECTION_CHANGED, {
          unitIds: selection, playerIndex: 0,
        } as SelectionData);
      }
    });

    // P2-3：玩家发起的寻路失败 toast（400ms 同单位去重；AI 失败不提示）
    this._on(GameEvent.PATH_FAILED, (data: any) => {
      if (data?.playerIndex !== 0) return;
      const now = Date.now();
      const last = this._lastPathFailToast.get(data.unitId) ?? 0;
      if (now - last < 400) return;
      this._lastPathFailToast.set(data.unitId, now);
      const tip = data.reason === 'start_blocked'
        ? '⚠ 部队当前位置不可通行'
        : '⚠ 部队无法到达目标点';
      this.showToast(tip);
    });

    // P1-14：科技取消反馈
    this._on(GameEvent.RESEARCH_CANCELED, (data: any) => {
      if (data?.playerIndex !== 0) return;
      const msg = data.refundAmount > 0
        ? `已取消研究，退还 💎${data.refundAmount}`
        : '已取消研究（无可退款）';
      this.showToast(msg);
      this.refreshResourceDisplay();
      // 选中的建筑研究面板需要刷新
      EventBus.emit(GameEvent.PRODUCTION_STARTED, { buildingId: data.buildingId } as any);
    });

    // P1-5：建筑全失宽限期警告（按秒值变化节流）
    this._on(GameEvent.GRACE_WARNING, (data: any) => {
      const pi: number = data?.playerIndex ?? -1;
      if (pi !== 0) return;
      const sec = Math.ceil(data.secondsLeft);
      const last = this._lastGraceWarnSec.get(pi) ?? Number.MAX_SAFE_INTEGER;
      if (sec === last) return;
      this._lastGraceWarnSec.set(pi, sec);
      // 只在关键节点提示（60、30、10 内每秒），避免一直刷屏
      if (sec === 60 || sec === 30 || sec <= 10) {
        this.showToast(`⚠ 基地全失！${sec} 秒内重建，否则失败`);
      }
    });

    this.time.delayedCall(500, () => {
      this.refreshResourceDisplay();
      if (!this.minimap) { const gs = this.scene.get('GameScene') as any; if (gs?.world?.map) this.initMinimap(gs.world.map, gs.world.fogOfWar); }
      this.scheduleMinimapUpdate();
    });
  }

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
    const result = gs.commandExecutor?.execute({
      type: 'train', playerIndex: 0, buildingId, unitDefId,
    }) as CommandResult | undefined;
    if (result && !result.ok) this.showToast(result.reason);
    else if (result) this.refreshResourceDisplay();
  }

  private issueResearchCommand(buildingId: string, techDefId: string): void {
    const gs = this.scene.get('GameScene') as any;
    const result = gs.commandExecutor?.execute({
      type: 'research', playerIndex: 0, buildingId, techDefId,
    }) as CommandResult | undefined;
    if (result && !result.ok) this.showToast(result.reason);
    else if (result) this.refreshResourceDisplay();
  }

  /** P1-14：取消研究中的科技，按剩余进度退款 */
  private issueCancelResearchCommand(buildingId: string): void {
    const gs = this.scene.get('GameScene') as any;
    const result = gs.commandExecutor?.execute({
      type: 'cancel_research', playerIndex: 0, buildingId,
    }) as CommandResult | undefined;
    if (result && !result.ok) this.showToast(result.reason);
    // 成功提示由 RESEARCH_CANCELED 监听器统一处理并刷新资源
  }

  private enterBuildMode(builderId: string, buildingDefId: string): void {
    const gs = this.scene.get('GameScene') as any;
    if (gs.enterBuildMode) gs.enterBuildMode(buildingDefId, builderId);
  }

  private updateProductionQueueUI(): void {
    const gs = this.scene.get('GameScene') as any;
    const queue: { name: string; progress: number; color?: number; cancelType?: 'train' | 'research'; buildingId?: string; queueIndex?: number }[] = [];
    for (const bld of (gs.buildings ?? []) as Building[]) {
      if (bld.owner !== 0 || !bld.isAlive) continue;
      if (bld.state === 'constructing') {
        queue.push({ name: `🏗 ${gs.entities ? (getDisplayName(bld.spriteKey) ?? '建筑') : '建筑'}`, progress: bld.buildProgress, color: 0xf39c12 });
      }
      if (bld.state === 'researching' && bld.researchingTechId) {
        const td = TECH_DEFS[bld.researchingTechId];
        queue.push({ name: `🔬 ${td?.name ?? '科技'}`, progress: bld.researchProgress, color: 0x9b59b6, cancelType: 'research', buildingId: bld.id });
      }
      for (let qi = 0; qi < bld.productionQueue.length; qi++) {
        const item = bld.productionQueue[qi];
        queue.push({
          name: getDisplayName(item.unitDefId),
          progress: item.timeRemaining > 0 ? 1 - item.timeRemaining / item.totalTime : 1,
          color: 0x2ecc71,
          cancelType: 'train' as const,
          buildingId: bld.id,
          queueIndex: qi,
        });
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