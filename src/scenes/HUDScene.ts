/**
 * HUD 场景 — 覆盖在 GameScene 上的透明 UI 层
 *
 * 管理资源面板、小地图、选中面板、命令卡、生产队列
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
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import type { SelectionData } from '../types/events';
import { ProductionSystem } from '../systems/ProductionSystem';

export class HUDScene extends Phaser.Scene {
  private resourceDisplay!: ResourceDisplay;
  private selectionPanel!: SelectionPanel;
  private commandCard!: CommandCard;
  private productionQueue!: ProductionQueueUI;
  private minimap!: Minimap;

  // 攻击移动提示
  private attackMoveText!: Phaser.GameObjects.Text;

  // 引用来自 GameScene 的数据（通过事件更新）
  private currentUnits: Unit[] = [];
  private currentBuildings: Building[] = [];

  constructor() {
    super({ key: 'HUDScene' });
  }

  create(): void {
    // 顶部资源条背景
    this.add.rectangle(0, 0, 1280, 40, 0x1a1a2e, 0.85).setOrigin(0, 0).setDepth(99).setScrollFactor(0);

    // 底部命令面板背景
    this.add.rectangle(0, 720 - 80, 1280, 80, 0x1a1a2e, 0.85).setOrigin(0, 0).setDepth(99).setScrollFactor(0);

    // UI 组件
    this.resourceDisplay = new ResourceDisplay(this);
    this.selectionPanel = new SelectionPanel(this, 10, 720 - 80 - 130);
    this.commandCard = new CommandCard(this);
    this.productionQueue = new ProductionQueueUI(this);

    // 攻击移动模式提示文字
    this.attackMoveText = this.add.text(1280 / 2, 720 - 90, '⚔ 攻击移动模式', {
      fontSize: '16px',
      color: '#ff6644',
      backgroundColor: '#1a1a2e',
      padding: { x: 12, y: 4 },
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setDepth(250).setScrollFactor(0).setAlpha(0);

    // 订阅事件
    this.setupEvents();
  }

  /** 当 GameScene 启动后，获取 World 引用以初始化小地图 */
  initMinimap(map: GameMap, fog: FogOfWar): void {
    this.minimap = new Minimap(this, map, fog, 1280 - 160, 720 - 80 - 160, 150);
  }

  private setupEvents(): void {
    // 资源变化 — 聚合各资源数据，刷新显示
    EventBus.on(GameEvent.RESOURCE_CHANGED, () => {
      this.refreshResourceDisplay();
    });

    // 选中变化
    EventBus.on(GameEvent.SELECTION_CHANGED, (data: unknown) => {
      const d = data as SelectionData;
      if (d.playerIndex !== 0) return;

      if (d.unitIds.length === 0) {
        this.selectionPanel.showUnits([]);
        this.commandCard.clear();
        return;
      }

      // 从 GameScene 获取单位引用
      const gameScene = this.scene.get('GameScene') as any;
      const units = d.unitIds
        .map((id: string) => gameScene.units?.find((u: Unit) => u.id === id))
        .filter(Boolean) as Unit[];

      this.selectionPanel.showUnits(units);

      // 如果是工人，显示建造按钮
      if (units.length === 1 && units[0].spriteKey === 'unit_worker') {
        this.commandCard.setCommands([
          { label: '建造兵营', cost: '💎300', callback: () => this.enterBuildMode(units[0].id, 'bld_barracks') },
        ]);
      }
    });

    // 选中建筑
    EventBus.on(GameEvent.BUILDING_SELECTED, (data: any) => {
      if (data.playerIndex !== 0) return;

      const gameScene = this.scene.get('GameScene') as any;
      const bld = gameScene.buildings?.find((b: Building) => b.id === data.buildingId) as Building | undefined;

      if (!bld) return;

      // 按建筑类型显示不同的训练按钮
      if (bld.spriteKey === 'bld_cc_empire') {
        this.commandCard.setCommands([
          { label: '训练工人', cost: '💎100 👥1', callback: () => this.issueTrainCommand(bld.id, 'unit_worker') },
        ]);
      } else if (bld.spriteKey === 'bld_barracks') {
        this.commandCard.setCommands([
          { label: '训练步兵', cost: '💎150 👥1', callback: () => this.issueTrainCommand(bld.id, 'unit_rifleman') },
          { label: '战斗法师', cost: '💎250 👥2', callback: () => this.issueTrainCommand(bld.id, 'unit_battle_mage') },
        ]);
      } else {
        // 其他建筑默认
        this.commandCard.setCommands([
          { label: '训练工人', cost: '💎100 👥1', callback: () => this.issueTrainCommand(bld.id, 'unit_worker') },
          { label: '训练步兵', cost: '💎150 👥1', callback: () => this.issueTrainCommand(bld.id, 'unit_rifleman') },
        ]);
      }
    });

    // 生产开始/完成
    EventBus.on(GameEvent.PRODUCTION_STARTED, () => this.updateProductionQueueUI());
    EventBus.on(GameEvent.PRODUCTION_COMPLETE, () => this.updateProductionQueueUI());

    // 单位创建/击杀
    EventBus.on(GameEvent.UNIT_CREATED, () => this.scheduleMinimapUpdate());
    EventBus.on(GameEvent.UNIT_KILLED, () => this.scheduleMinimapUpdate());

    // 攻击移动模式切换
    EventBus.on('attackmove:toggle', (data: any) => {
      this.attackMoveText.setAlpha(data.active ? 1 : 0);
    });

    // 初始刷新（延迟等 GameScene 创建完）
    this.time.delayedCall(500, () => {
      this.refreshResourceDisplay();

      // 如果 MiniMap 还没初始化，尝试从 GameScene 获取
      if (!this.minimap) {
        const gs = this.scene.get('GameScene') as any;
        if (gs?.world?.map && gs?.world?.fogOfWar) {
          this.initMinimap(gs.world.map, gs.world.fogOfWar);
        }
      }
      this.scheduleMinimapUpdate();
    });
  }

  /** 从 GameScene 轮询完整资源状态 */
  private refreshResourceDisplay(): void {
    const gameScene = this.scene.get('GameScene') as any;
    const players = gameScene.world?.players;
    if (!players || !players[0]) return;
    const r = players[0].resources;
    this.resourceDisplay.update(r.crystal, r.industry, r.supply, r.supplyCap);
  }

  /** 向 GameScene 发出训练命令 */
  private issueTrainCommand(buildingId: string, unitDefId: string): void {
    const gameScene = this.scene.get('GameScene') as any;
    const bld = gameScene.buildings?.find((b: Building) => b.id === buildingId) as Building | undefined;
    if (!bld) return;

    if (!bld.canEnqueue()) return;

    // 按单位类型查成本
    const costs: Record<string, { crystal: number; supply: number; time: number }> = {
      unit_worker:      { crystal: 100, supply: 1, time: 8 },
      unit_rifleman:    { crystal: 150, supply: 1, time: 10 },
      unit_battle_mage: { crystal: 250, supply: 2, time: 15 },
    };
    const cost = costs[unitDefId];
    if (!cost) return;

    if (!gameScene.world.canAfford(0, { crystal: cost.crystal, supply: cost.supply })) return;

    gameScene.world.spend(0, { crystal: cost.crystal, supply: cost.supply });
    ProductionSystem.startProduction(bld, unitDefId, cost.time);
    EventBus.emit(GameEvent.PRODUCTION_STARTED, {
      buildingId: bld.id,
      playerIndex: 0,
      unitDefId,
      totalTime: cost.time,
    });
    this.refreshResourceDisplay();
  }

  /** 进入建造模式 */
  private enterBuildMode(builderId: string, buildingDefId: string): void {
    const gameScene = this.scene.get('GameScene') as any;
    if (gameScene.enterBuildMode) {
      gameScene.enterBuildMode(buildingDefId, builderId);
    }
  }

  /** 更新生产队列 UI */
  private updateProductionQueueUI(): void {
    const gameScene = this.scene.get('GameScene') as any;
    const buildings: Building[] = gameScene.buildings ?? [];
    const playerBuildings = buildings.filter(
      (b: Building) => b.owner === 0 && b.isAlive && b.productionQueue.length > 0
    );

    const queue: Array<{ name: string; progress: number }> = [];
    for (const bld of playerBuildings) {
      for (const item of bld.productionQueue) {
        queue.push({
          name: item.unitDefId.replace('unit_', ''),
          progress: item.timeRemaining > 0
            ? 1 - (item.timeRemaining / item.totalTime)
            : 1,
        });
      }
    }
    this.productionQueue.update(queue);
  }

  /** 小地图更新（延迟合并，避免频繁重绘） */
  private minimapUpdateScheduled = false;
  private scheduleMinimapUpdate(): void {
    if (this.minimapUpdateScheduled) return;
    this.minimapUpdateScheduled = true;
    this.time.delayedCall(200, () => {
      this.minimapUpdateScheduled = false;
      if (this.minimap) {
        const gameScene = this.scene.get('GameScene') as any;
        this.minimap.update(
          gameScene.units ?? [],
          gameScene.buildings ?? [],
          0,
        );
      }
    });
  }

  /** 每帧更新（从 GameScene 的 update 中调用，或通过事件） */
  updateResources(crystal: number, industry: number, supply: number, supplyCap: number): void {
    this.resourceDisplay.update(crystal, industry, supply, supplyCap);
  }
}