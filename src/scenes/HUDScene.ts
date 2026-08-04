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
import { SuperWeaponBar } from '../ui/SuperWeaponBar';
import { HeroPanel } from '../ui/HeroPanel';
import { PauseMenu } from '../ui/PauseMenu';
import { FpsCounter } from '../ui/FpsCounter';
import { Tooltip } from '../ui/Tooltip';
import { CameraController } from '../core/CameraController';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import type { SelectionData } from '../types/events';
import { UNIT_DEFS, BUILDING_DEFS, TECH_DEFS, getDisplayName, getBuildingCost } from '../config/unitData';
import type { CommandResult } from '../controllers/CommandExecutor';
import { HeroSystem } from '../systems/HeroSystem';
import { serialize, save as saveGame, load as loadGame, loadLatest } from '../save/SaveLoadSystem';
import type { SaveMeta } from '../save/SaveData';
import { UITheme as T } from '../ui/theme/UITheme';
import { CODEX_ENTRIES } from '../config/codex';
import { drawPanel, drawPanelSkin, textStyle } from '../ui/theme/UIWidget';

// ===== SC2 三段式控制台布局常量 (1280x720) =====
const VIEW_W = 1280;
const VIEW_H = 720;
const TOP_BAR_H = 40;
const CONSOLE_Y = VIEW_H - 140;          // 底栏起点 y=580
const CONSOLE_H = 140;
// 左段：小地图区 (控制台高140, 内边距8 → 124 见方)
const MM_SIZE = 124;
const MM_X = 10;
const MM_Y = CONSOLE_Y + 8;              // y=588, 底部 712 不越界
// 超武栏：小地图左缘上方悬浮竖排 (不动控制台三段宽度)
const SW_BAR_X = 12;
const SW_BAR_Y = CONSOLE_Y - 8 - 4 * 50; // 底部对齐控制台, 向上排 4 槽
// 中段：选择/英雄面板区
const SEL_X = 180;
const SEL_Y = CONSOLE_Y + 10;            // y=590
const SEL_W = 505;
// 右段：命令卡区
const CMD_X = 695;
// 阵营徽记位置（顶栏右侧）
const EMBLEM_X = VIEW_W - 16;

export class HUDScene extends Phaser.Scene {
  private resourceDisplay!: ResourceDisplay;
  private selectionPanel!: SelectionPanel;
  private commandCard!: CommandCard;
  private productionQueue!: ProductionQueueUI;
  private minimap!: Minimap;
  private superWeaponBar!: SuperWeaponBar;
  private heroPanel!: HeroPanel;
  private pauseMenu!: PauseMenu;
  private fpsCounter!: FpsCounter;
  private tooltip!: Tooltip;
  private attackMoveText!: Phaser.GameObjects.Text;
  /** 阵营徽记：顶栏右侧的阵营色点 + 名称（代入感） */
  private _emblem!: Phaser.GameObjects.Container;
  /** P1-10 修复：保存所有 EventBus 监听器引用，shutdown 时逐个 off */
  private _eventHandlers: { event: string; handler: (data: unknown) => void }[] = [];
  /** P2-3：PATH_FAILED toast 节流 — 单位 id → 上次 toast 的时间戳(ms)，400ms 内去重 */
  private _lastPathFailToast = new Map<string, number>();
  /** P1-5：GRACE_WARNING toast 节流 — playerIndex → 上次 toast 秒值，秒数变化才再播 */
  private _lastGraceWarnSec = new Map<number, number>();

  constructor() { super({ key: 'HUDScene' }); }

  create(): void {
    // ===== 顶栏: NineSlice 皮肤 (皮肤缺失时回退纯色面板) =====
    const topSkin = drawPanelSkin(this, { x: 0, y: 0, w: VIEW_W, h: TOP_BAR_H, skinKey: 'skin_panel_top', corner: 12 });
    topSkin.setDepth(99).setScrollFactor(0);

    // ===== 底栏控制台: NineSlice 皮肤 =====
    const consoleSkin = drawPanelSkin(this, { x: 0, y: CONSOLE_Y, w: VIEW_W, h: CONSOLE_H, skinKey: 'skin_panel_console', corner: 20 });
    consoleSkin.setDepth(99).setScrollFactor(0);

    // 三段分隔线 (双线夹珠: 2px 金线 + 中央暗金圆点)
    const sepG = this.add.graphics();
    const drawSep = (sx: number) => {
      sepG.lineStyle(1, T.Color.ACCENT_GOLD, 0.25);
      sepG.beginPath();
      sepG.moveTo(sx - 1, CONSOLE_Y + 8); sepG.lineTo(sx - 1, VIEW_H - 8);
      sepG.moveTo(sx + 1, CONSOLE_Y + 8); sepG.lineTo(sx + 1, VIEW_H - 8);
      sepG.strokePath();
      sepG.fillStyle(T.Color.ACCENT_GOLD, 0.45);
      sepG.fillCircle(sx, CONSOLE_Y + CONSOLE_H / 2, 3);
    };
    drawSep(MM_X + MM_SIZE + 6);
    drawSep(SEL_X + SEL_W + 5);
    sepG.setDepth(99).setScrollFactor(0);

    // 顶栏右端魔导齿轮组装饰 (大小咬合, 反向缓转, 半透明不抢眼)
    if (this.textures.exists('ui_deco_gear')) {
      const gearL = this.add.image(VIEW_W - 46, 20, 'ui_deco_gear')
        .setDisplaySize(30, 30).setAlpha(0.35).setDepth(98).setScrollFactor(0);
      this.tweens.add({ targets: gearL, angle: 360, duration: 20000, repeat: -1 });
      const gearR = this.add.image(VIEW_W - 22, 26, 'ui_deco_gear')
        .setDisplaySize(18, 18).setAlpha(0.28).setDepth(98).setScrollFactor(0);
      this.tweens.add({ targets: gearR, angle: -360, duration: 13000, repeat: -1 });
    }

    this.resourceDisplay = new ResourceDisplay(this);
    // 中段: 选择面板 + 英雄面板 (英雄选中时覆盖在选择面板上方)
    this.selectionPanel = new SelectionPanel(this, SEL_X, SEL_Y);
    // 英雄面板覆盖选择面板同位 (选中英雄时), 不再悬浮游戏视区中央
    this.heroPanel = new HeroPanel(this, SEL_X, SEL_Y);

    // P1-UI 批6: 暂停菜单
    this.pauseMenu = new PauseMenu(this, {
      onResume: () => {},
      onRestart: () => { this.scene.stop('GameScene'); this.scene.start('GameScene', (this.scene.get('GameScene') as any)?.registry?.get('lastStartData') ?? {}); },
      onMainMenu: () => { this.scene.stop('GameScene'); this.scene.start('MenuScene'); },
      onSave: () => this.doSave(),
      onLoad: () => this.doLoad(),
    });
    // 审1: Tooltip 必须在 CommandCard 之前实例化(onHover 回调引用)
    this.tooltip = new Tooltip(this);
    this.commandCard = new CommandCard(this);
    this.commandCard.onHover((lines, x, y) => {
      if (lines) this.tooltip.show(x, y, lines);
      else this.tooltip.hide();
    });
    this.productionQueue = new ProductionQueueUI(this);

    this.attackMoveText = this.add.text(VIEW_W / 2, CONSOLE_Y - 14, '⚔ 攻击移动模式', {
      fontSize: '14px', color: T.ColorHex.WARN, backgroundColor: T.ColorHex.CONSOLE_BG,
      padding: { x: 12, y: 4 }, fontFamily: T.FontFamily.BODY,
    }).setOrigin(0.5).setDepth(250).setScrollFactor(0).setAlpha(0);

    this.setupEvents();

    // P1-UI 批6: ESC 暂停菜单（HUDScene 层，优先于 GameScene 的 ESC）
    // 审3: 建造模式/瞄准模式时先避让，让 GameScene 处理
    this.input.keyboard!.on('keydown-ESC', () => {
      const gs = this.scene.get('GameScene') as any;
      const isBuilding = gs?.buildController?.isActive;
      const isAiming = this.superWeaponBar?.aimingWeaponId;
      const isAttackMove = gs?.attackMoveMode;
      if (isBuilding || isAiming || isAttackMove) return; // 让 GameScene 处理
      if (this.pauseMenu?.isVisible) {
        this.pauseMenu.hide();
      } else {
        this.pauseMenu?.show();
      }
    });

    // P1-UI 批7: FPS 计数器 (Tooltip 已在前面实例化)
    this.fpsCounter = new FpsCounter(this);

    // 阵营徽记: 顶栏右侧阵营色点+名称 (代入感, 延迟取 GameScene 阵营数据)
    this._emblem = this.add.container(0, 0).setDepth(200).setScrollFactor(0);
    this.time.delayedCall(300, () => this._updateEmblem());

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
    // P1-超武: 每帧刷新超武按钮冷却显示
    if (this.superWeaponBar) {
      this.superWeaponBar.update();
    }
    // P1-UI 批7: FPS 刷新
    if (this.fpsCounter) {
      this.fpsCounter.update(1 / 60);
    }
  }

  initMinimap(map: GameMap, fog: FogOfWar, cameraCtrl?: CameraController): void {
    this.minimap = new Minimap(this, map, fog, MM_X, MM_Y, MM_SIZE);
    if (cameraCtrl) this.minimap.setCameraCtrl(cameraCtrl);
  }

  /** 联机(修复4): 客户端应用主机快照后同步 minimap 的迷雾引用 */
  setMinimapFog(fog: FogOfWar): void {
    if (this.minimap) this.minimap.setFog(fog);
  }

  private setupEvents(): void {
    // P1-10 修复：使用 _on 注册监听器，shutdown 时逐个 off

    this._on(GameEvent.RESOURCE_CHANGED, () => this.refreshResourceDisplay());

    this._on(GameEvent.SELECTION_CHANGED, (data: unknown) => {
      const d = data as SelectionData;
      if (d.playerIndex !== 0) return;
      if (d.unitIds.length === 0) { this.selectionPanel.showUnits([]); this.commandCard.clear(); this.heroPanel.hide(); return; }

      const gs = this.scene.get('GameScene') as any;
      const units = d.unitIds.map((id: string) => gs.units?.find((u: Unit) => u.id === id)).filter(Boolean) as Unit[];
      this.selectionPanel.showUnits(units);

      // P1-UI 批4: 单选英雄时显示英雄详情面板
      if (units.length === 1 && units[0] instanceof Hero) {
        this.heroPanel.show(units[0] as Hero);
      } else {
        this.heroPanel.hide();
      }

      // P1-UI 批3: 多选时显示头像网格
      if (units.length > 1) {
        this.selectionPanel.showUnitsGrid(units, (unit: Unit) => {
          // 点击头像聚焦该单位
          this.selectionPanel.showUnits([unit]);
          gs.inputCtrl?.setSelection([unit.id]);
          EventBus.emit(GameEvent.SELECTION_CHANGED, { unitIds: [unit.id], playerIndex: 0 } as SelectionData);
        });
      }

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
                }, gs.resourceFields, gs.world);
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
        const btns: { label: string; cost: string; spriteKey?: string; callback: () => void; hotkey?: string; tooltipLines?: string[] }[] = [];
        const playerFaction = gs.world?.players?.[0]?.faction;
        const playerGuilds: string[] = gs.world?.players?.[0]?.guilds ?? [];
        for (const [bldId, def] of Object.entries(BUILDING_DEFS)) {
          if (def.cost.crystal > 0) {
            // 批1: 建筑 exclusiveTo 门控 — 阵营/行会不符不显示建造按钮
            if (def.exclusiveTo?.faction && def.exclusiveTo.faction !== playerFaction) continue;
            if (def.exclusiveTo?.guild && !playerGuilds.includes(def.exclusiveTo.guild)) continue;
            const cost = getBuildingCost(bldId, playerFaction);
            btns.push({ label: `建造${def.displayName}`, cost: cost ? `💎${cost.crystal}` : `💎?`, spriteKey: bldId, callback: () => this.enterBuildMode(units[0].id, bldId), tooltipLines: this._flavor(bldId) });
          }
        }
        // P1-UI: 追加通用命令按钮
        btns.push(...this._buildCommandButtons(units, gs));
        this.commandCard.setCommands(btns);
        return;
      }

      // P1-UI: 普通单位（非英雄非工兵）选中时显示命令按钮
      if (units.length >= 1 && !units.some(u => u instanceof Hero)) {
        const btns = this._buildCommandButtons(units, gs);
        if (btns.length > 0) this.commandCard.setCommands(btns);
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
        const playerGuilds: string[] = gs2.world?.players?.[0]?.guilds ?? [];
        for (const uid of def.produces) {
          const ud = UNIT_DEFS[uid];
          // 跳过阵营专属兵种（非本阵营不显示按钮）
          if (ud?.exclusiveTo?.faction && ud.exclusiveTo.faction !== playerFaction) continue;
          // 批1: 跳过行会专属兵种（玩家行会列表不含该 guild 不显示按钮）
          if (ud?.exclusiveTo?.guild && !playerGuilds.includes(ud.exclusiveTo.guild)) continue;
          const techsMet = !ud?.techReq?.length || ud.techReq.every((tid: string) => gs2.getTechTree?.(0)?.isResearched(tid));
          const label = techsMet ? getDisplayName(uid) : `${getDisplayName(uid)} 🔒`;
          const callback = techsMet ? () => this.issueTrainCommand(bld.id, uid) : () => this.showToast('科技未解锁');
          btns.push({ label, cost: ud ? `💎${ud.cost.crystal} 👥${ud.cost.supply}` : '💎?', spriteKey: uid, callback, disabled: !techsMet, tooltipLines: this._flavor(uid) });
        }
      }
      if (bld.state !== 'constructing' && def?.researches) {
        const gs2 = this.scene.get('GameScene') as any;
        const techTree = gs2.getTechTree?.(0);
        const playerFaction = gs2.world?.players?.[0]?.faction;
        const playerGuilds: string[] = gs2.world?.players?.[0]?.guilds ?? [];
        for (const tid of def.researches) {
          const td = TECH_DEFS[tid];
          if (!td) continue;
          // 批3: 跳过公会/阵营不符的科技（未研究且不在研究中时才隐藏；
          // 已研究或正在研究中仍显示，便于确认/取消）
          const guildMismatch = td.exclusiveTo?.guild && !playerGuilds.includes(td.exclusiveTo.guild);
          const factionMismatch = td.exclusiveTo?.faction && td.exclusiveTo.faction !== playerFaction;
          const researched = techTree?.isResearched(tid);
          const researching = bld.researchingTechId === tid;
          if ((guildMismatch || factionMismatch) && !researched && !researching) continue;
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
      // P1-超武: 初始化超武栏（小地图上方）
      if (!this.superWeaponBar) {
        this.superWeaponBar = new SuperWeaponBar(this, 0, SW_BAR_X, SW_BAR_Y);
        this.superWeaponBar.onActivate((weaponId: string, tileX: number, tileY: number) => {
          const gs = this.scene.get('GameScene') as any;
          const result = gs?.execButtonCommand({
            type: 'superweapon', playerIndex: 0, unitIds: [], weaponId, target: { x: tileX, y: tileY }, frame: 0,
          });
          if (result && !result.ok) this.showToast(result.reason);
          else if (result) this.refreshResourceDisplay();
        });
      }
    });
  }

  /** 阵营徽记: 顶栏右侧阵营色点+名称 (代入感) */
  private _updateEmblem(): void {
    const gs = this.scene.get('GameScene') as any;
    const factionId: string = gs?.world?.players?.[0]?.faction ?? 'arcane_empire';
    const pal = T.getFactionPalette(factionId);
    const factionName: Record<string, string> = {
      arcane_empire: '奥术帝国', hammer_federation: '铁锤联邦',
      frostridge_kingdom: '霜脊王国', jade_confederation: '翡翠邦联',
    };
    this._emblem.removeAll(true);
    // 阵营徽记: 主色圆 + 双层发光 + 金描边
    const dot = this.add.graphics();
    dot.fillStyle(pal.primary, 0.15);
    dot.fillCircle(EMBLEM_X - 70, 20, 11);
    dot.fillStyle(pal.primary, 0.3);
    dot.fillCircle(EMBLEM_X - 70, 20, 8);
    dot.fillStyle(pal.primary, 1);
    dot.fillCircle(EMBLEM_X - 70, 20, 6);
    dot.lineStyle(1, T.Color.ACCENT_GOLD, 0.6);
    dot.strokeCircle(EMBLEM_X - 70, 20, 6);
    this._emblem.add(dot);
    // 阵营名 (阵营主色)
    const name = this.add.text(EMBLEM_X - 60, 20, factionName[factionId] ?? factionId, {
      fontSize: T.Font.SM, color: pal.primaryHex, fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this._emblem.add(name);
  }

  private showToast(msg: string): void {
    const { width, height } = this.cameras.main;
    const text = this.add.text(width / 2, height / 2, msg, textStyle({
      size: '18px', color: T.ColorHex.WARN, backgroundColor: T.ColorHex.CARD_BG,
      padding: { x: 16, y: 8 }, family: T.FontFamily.BODY, align: 'center',
    })).setOrigin(0.5).setDepth(300).setScrollFactor(0);
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
    const result = gs.execButtonCommand({
      type: 'train', playerIndex: 0, buildingId, unitDefId,
    }) as CommandResult | undefined;
    if (result && !result.ok) this.showToast(result.reason);
    else if (result) this.refreshResourceDisplay();
  }

  private issueResearchCommand(buildingId: string, techDefId: string): void {
    const gs = this.scene.get('GameScene') as any;
    const result = gs.execButtonCommand({
      type: 'research', playerIndex: 0, buildingId, techDefId,
    }) as CommandResult | undefined;
    if (result && !result.ok) this.showToast(result.reason);
    else if (result) this.refreshResourceDisplay();
  }

  /** P1-14：取消研究中的科技，按剩余进度退款 */
  private issueCancelResearchCommand(buildingId: string): void {
    const gs = this.scene.get('GameScene') as any;
    const result = gs.execButtonCommand({
      type: 'cancel_research', playerIndex: 0, buildingId,
    }) as CommandResult | undefined;
    if (result && !result.ok) this.showToast(result.reason);
    // 成功提示由 RESEARCH_CANCELED 监听器统一处理并刷新资源
  }

  /** 从图鉴取风味文字首句, 供命令按钮 tooltip 增加代入感 */
  private _flavor(defId: string): string[] {
    const entry = CODEX_ENTRIES.find(e => e.id === defId);
    if (!entry) return [];
    const first = entry.desc.split('。')[0];
    return [entry.name, first + '。'];
  }

  /** P1-UI: 构建通用命令按钮（停止/坚守/攻击移动），标注热键 */
  private _buildCommandButtons(units: Unit[], gs: any): { label: string; cost: string; callback: () => void; hotkey?: string; disabled?: boolean; tooltipLines?: string[] }[] {
    const btns: { label: string; cost: string; callback: () => void; hotkey?: string; disabled?: boolean; tooltipLines?: string[] }[] = [];
    const ids = units.map(u => u.id);
    btns.push({
      label: '停止', cost: 'S', hotkey: 'S',
      tooltipLines: ['停止', '停止当前动作，取消移动/攻击/采集'],
      callback: () => {
        for (const id of ids) {
          gs.execButtonCommand({ type: 'stop', playerIndex: 0, unitIds: [id], frame: 0 });
        }
      },
    });
    btns.push({
      label: '坚守', cost: 'H', hotkey: 'H',
      tooltipLines: ['坚守', '原地不动，不会自动追击敌人'],
      callback: () => {
        for (const id of ids) {
          gs.execButtonCommand({ type: 'hold_position', playerIndex: 0, unitIds: [id], frame: 0 });
        }
      },
    });
    btns.push({
      label: '攻击移动', cost: 'A', hotkey: 'A',
      tooltipLines: ['攻击移动', '移动到目标点，途中遇敌自动攻击'],
      callback: () => {
        if (gs.toggleAttackMove) gs.toggleAttackMove();
      },
    });
    return btns;
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

  // ========== 存档/读档 ==========

  private doSave(): void {
    const gs = this.scene.get('GameScene') as any;
    if (!gs?.world) { this.showToast('存档失败：游戏未初始化'); return; }

    try {
      const meta: SaveMeta = {
        mapId: gs._mapId ?? 'map_valley',
        mapWidth: gs.world.map.config.width,
        mapHeight: gs.world.map.config.height,
        playerFaction: gs._playerFaction ?? 'arcane_empire',
        aiFaction: gs.world.players[1]?.faction ?? 'hammer_federation',
        aiDifficulty: gs._aiDifficulty ?? 'normal',
        playerGuilds: [...(gs._playerGuilds ?? ['mages_guild', 'alchemists_society'])],
        aiGuilds: [...(gs.world.players[1]?.guilds ?? [])],
      };

      const data = serialize({
        world: gs.world,
        entities: gs._entities ?? gs.entities,
        gameTimer: gs.gameOverCtrl?.gameTimer ?? 0,
        graceTimers: gs.gameOverCtrl?.graceTimers ?? [0, 0],
        meta,
      });

      const name = `auto_${Date.now()}`;
      const result = saveGame(name, data);
      if (result.ok) {
        this.showToast('✅ 游戏已保存');
      } else {
        this.showToast(`❌ 保存失败: ${result.reason}`);
      }
    } catch (e: any) {
      this.showToast(`❌ 保存异常: ${e?.message ?? '未知错误'}`);
    }
  }

  private doLoad(): void {
    const latest = loadLatest();
    if (!latest.ok) {
      this.showToast(`❌ 读档失败: ${latest.reason}`);
      return;
    }

    // 重启 GameScene 并传入存档数据
    this.scene.stop('GameScene');
    this.scene.start('GameScene', {
      loadFromSave: latest.data,
    });
  }
}