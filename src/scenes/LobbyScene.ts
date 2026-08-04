/**
 * 联机大厅场景 — 局域网 1v1 对战匹配
 *
 * 流程:
 *  - 主机: 自动连 ws://localhost:3000/lan (本机中继), 等待客户端加入
 *  - 客户端: 输入主机 IP, 连 ws://<IP>:3000/lan
 *  - 双方各自选阵营+行会, 点准备
 *  - 主机双方均准备后点"开始游戏" → 双方 scene.start('GameScene', { netMode, ...init })
 *
 * 中继在 vite.config.mts 的 lanRelayPlugin 中挂载 (dev server 同进程)。
 */

import Phaser from 'phaser';
import { FACTION_DEFS } from '../config/unitData';
import { GUILD_NAMES, VALID_GUILD_PAIRS } from '../types/data';
import type { GuildId } from '../types/data';
import { UITheme as T } from '../ui/theme/UITheme';
import { drawPanelSkin } from '../ui/theme/UIWidget';
import { NetHost } from '../net/NetServer';
import { NetClient } from '../net/NetClient';
import type { GameInitData, PlayerLobbyInfo } from '../net/NetMessages';

const FACTIONS = [
  { id: 'arcane_empire', color: '#6a4fff' },
  { id: 'hammer_federation', color: '#ff6a2e' },
  { id: 'frostridge_kingdom', color: '#5ec8ff' },
  { id: 'jade_confederation', color: '#3cd08f' },
];
const ALL_GUILDS: GuildId[] = ['mages_guild', 'mechanists_guild', 'alchemists_society', 'void_institute'];

const MAP_ID = 'map_valley'; // 联机暂固定用山谷地图

export class LobbyScene extends Phaser.Scene {
  private role: 'host' | 'client' = 'host';
  private net: NetHost | NetClient | null = null;

  // 本地选择
  private selectedFaction = 'arcane_empire';
  private selectedGuilds: GuildId[] = ['mages_guild', 'alchemists_society'];
  private myReady = false;

  // 对方选择 (从网络收到)
  private peerFaction = '';
  private peerGuilds: string[] = [];
  private peerReady = false;
  private peerConnected = false;

  // UI 引用
  private statusText!: Phaser.GameObjects.Text;
  private peerInfoText!: Phaser.GameObjects.Text;
  private factionTexts: Phaser.GameObjects.Text[] = [];
  private guildTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private readyBtn!: Phaser.GameObjects.Text;
  private startBtn!: Phaser.GameObjects.Text;
  private ipInput!: Phaser.GameObjects.Text;
  private connectBtn!: Phaser.GameObjects.Text;
  private ipValue = 'localhost';

  constructor() {
    super({ key: 'LobbyScene' });
  }

  init(data: { role: 'host' | 'client' }): void {
    this.role = data.role ?? 'host';
  }

  create(): void {
    const { width, height } = this.cameras.main;
    const cx = width / 2;

    // 背景
    if (this.textures.exists('ui_menu_bg')) {
      this.add.image(cx, height / 2, 'ui_menu_bg').setDisplaySize(width, height).setDepth(-1);
    }
    // 面板
    drawPanelSkin(this, { x: 140, y: 60, w: width - 280, h: height - 120, skinKey: 'skin_panel_console', corner: 14 })
      .setDepth(0).setScrollFactor(0).setAlpha(0.92);

    // 标题
    this.add.text(cx, 90, this.role === 'host' ? '🌐 局域网联机 — 主机' : '🌐 局域网联机 — 客户端', {
      fontSize: '28px', color: T.ColorHex.TEXT_GOLD, fontFamily: T.FontFamily.DISPLAY, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(1);

    // 返回按钮
    const backBtn = this.add.text(180, 90, '◀ 返回', {
      fontSize: '18px', color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
    }).setOrigin(0.5).setDepth(1).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => { this.cleanup(); this.scene.start('MenuScene'); });

    // 状态文本
    this.statusText = this.add.text(cx, 130, '', {
      fontSize: '16px', color: T.ColorHex.TEXT_MAIN, fontFamily: T.FontFamily.BODY,
    }).setOrigin(0.5).setDepth(1);

    // === 客户端: 主机 IP 输入 ===
    if (this.role === 'client') {
      this.add.text(cx, 170, '主机 IP:', {
        fontSize: '16px', color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
      }).setOrigin(1, 0.5).setDepth(1);
      this.ipInput = this.add.text(cx + 10, 170, this.ipValue, {
        fontSize: '16px', color: T.ColorHex.TEXT_GOLD, fontFamily: T.FontFamily.MONO,
        backgroundColor: T.ColorHex.CARD_BG, padding: { x: 8, y: 4 },
      }).setOrigin(0, 0.5).setDepth(1).setInteractive({ useHandCursor: true });
      this.ipInput.on('pointerdown', () => this.promptIP());
      this.connectBtn = this.add.text(cx + 200, 170, '🔗 连接', {
        fontSize: '16px', color: '#ffffff', fontFamily: T.FontFamily.BODY,
        backgroundColor: '#1a4e3a', padding: { x: 12, y: 4 },
      }).setOrigin(0.5).setDepth(1).setInteractive({ useHandCursor: true });
      this.connectBtn.on('pointerdown', () => this.connectToHost());
    }

    // === 阵营选择 (4 个, 横排) ===
    this.add.text(220, 210, '选择阵营:', {
      fontSize: '16px', color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
    }).setDepth(1);
    FACTIONS.forEach((f, i) => {
      const tx = 220 + i * 120;
      const txt = this.add.text(tx, 240, FACTION_DEFS[f.id]?.name ?? f.id, {
        fontSize: '15px', color: f.color, fontFamily: T.FontFamily.BODY,
        backgroundColor: T.ColorHex.CARD_BG, padding: { x: 10, y: 6 },
      }).setOrigin(0.5).setDepth(1).setInteractive({ useHandCursor: true });
      txt.on('pointerdown', () => this.selectFaction(f.id));
      this.factionTexts.push(txt);
    });

    // === 行会选择 (4 个, 2x2) ===
    this.add.text(220, 290, '选择行会 (2个):', {
      fontSize: '16px', color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
    }).setDepth(1);
    ALL_GUILDS.forEach((g, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const tx = 240 + col * 140, ty = 320 + row * 36;
      const txt = this.add.text(tx, ty, GUILD_NAMES[g], {
        fontSize: '14px', color: T.ColorHex.TEXT_MAIN, fontFamily: T.FontFamily.BODY,
        backgroundColor: T.ColorHex.CARD_BG, padding: { x: 8, y: 4 },
      }).setOrigin(0.5).setDepth(1).setInteractive({ useHandCursor: true });
      txt.on('pointerdown', () => this.toggleGuild(g));
      this.guildTexts.set(g, txt);
    });

    // === 准备按钮 ===
    this.readyBtn = this.add.text(cx, 440, '✓ 准备', {
      fontSize: '20px', color: '#ffffff', fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
      backgroundColor: '#1a4e3a', padding: { x: 24, y: 10 },
    }).setOrigin(0.5).setDepth(1).setInteractive({ useHandCursor: true });
    this.readyBtn.on('pointerdown', () => this.toggleReady());

    // === 开始按钮 (仅主机显示, 双方准备后可点) ===
    this.startBtn = this.add.text(cx, 500, '▶ 开始游戏', {
      fontSize: '22px', color: '#ffffff', fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
      backgroundColor: '#4a3060', padding: { x: 28, y: 12 },
    }).setOrigin(0.5).setDepth(1).setInteractive({ useHandCursor: true });
    this.startBtn.on('pointerdown', () => this.startGame());
    this.startBtn.setVisible(this.role === 'host');

    // === 对方信息 ===
    this.peerInfoText = this.add.text(cx, 570, '', {
      fontSize: '14px', color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
      align: 'center',
    }).setOrigin(0.5).setDepth(1);

    this.updateFactionUI();
    this.updateGuildUI();
    this.updateStatus();
    this.updatePeerInfo();

    // 主机自动连接中继
    if (this.role === 'host') {
      this.net = new NetHost('Host');
      (this.net as NetHost).on({
        onClientJoin: (name) => {
          this.peerConnected = true;
          this.updateStatus(); this.updatePeerInfo();
          // 联机同步: host 把自己的选择状态发给 client, 让 client 看到 host 的阵营/行会/准备
          this.sendHostStateToClient();
        },
        onPeerDisconnect: () => { this.peerConnected = false; this.peerReady = false; this.updateStatus(); this.updatePeerInfo(); },
        onLobbyUpdate: (info) => { this.peerFaction = info.faction; this.peerGuilds = info.guilds; this.peerReady = info.ready; this.updatePeerInfo(); this.updateStartBtn(); },
      });
      (this.net as NetHost).connect();
      this.updateStatus();
    }
  }

  /** 联机同步: host 把自己的选择状态(阵营/行会/准备)发给 client */
  private sendHostStateToClient(): void {
    if (this.role !== 'host' || !this.net) return;
    const myInfo: PlayerLobbyInfo = {
      name: 'Host',
      faction: this.selectedFaction,
      guilds: [...this.selectedGuilds],
      ready: this.myReady,
    };
    this.net.send({ t: 'lobby_state', host: myInfo, client: null });
  }

  // === 交互处理 ===

  private selectFaction(id: string): void {
    this.selectedFaction = id;
    this.updateFactionUI();
    this.sendLobbyUpdate();
  }

  private toggleGuild(g: GuildId): void {
    if (this.selectedGuilds.includes(g)) {
      if (this.selectedGuilds.length <= 1) return; // 至少留 1 个
      this.selectedGuilds = this.selectedGuilds.filter(x => x !== g);
    } else {
      if (this.selectedGuilds.length >= 2) {
        // 替换第一个
        this.selectedGuilds[0] = g;
      } else {
        this.selectedGuilds.push(g);
      }
    }
    // 校验行会组合有效性
    if (!VALID_GUILD_PAIRS.some(p => p.includes(this.selectedGuilds[0]) && p.includes(this.selectedGuilds[1]))) {
      // 找一个包含当前首个的有效搭配
      const valid = VALID_GUILD_PAIRS.find(p => p.includes(this.selectedGuilds[0]));
      if (valid) this.selectedGuilds = [...valid];
    }
    this.updateGuildUI();
    this.sendLobbyUpdate();
  }

  private toggleReady(): void {
    this.myReady = !this.myReady;
    this.readyBtn.setText(this.myReady ? '✓ 已准备' : '✓ 准备');
    this.readyBtn.setStyle({ backgroundColor: this.myReady ? '#2a6a4a' : '#1a4e3a' });
    this.sendLobbyUpdate();
    this.updateStartBtn();
  }

  private sendLobbyUpdate(): void {
    if (!this.net) return;
    const info: PlayerLobbyInfo = {
      name: this.role === 'host' ? 'Host' : 'Client',
      faction: this.selectedFaction,
      guilds: [...this.selectedGuilds],
      ready: this.myReady,
    };
    this.net.send({ t: 'lobby_update', sender: this.role, info });
    // 联机同步: host 每次改选择也把最新状态推给 client (client 侧用 lobby_state 更新)
    if (this.role === 'host') this.sendHostStateToClient();
  }

  // === 客户端连接 ===

  private promptIP(): void {
    // Phaser 无原生输入框, 用 window.prompt
    const input = window.prompt('输入主机局域网 IP (如 192.168.1.100):', this.ipValue);
    if (input && input.trim()) {
      this.ipValue = input.trim();
      this.ipInput.setText(this.ipValue);
    }
  }

  private connectToHost(): void {
    if (this.net) { (this.net as NetClient).disconnect(); this.net = null; }
    this.net = new NetClient(this.ipValue, 3000);
    (this.net as NetClient).on({
      onOpen: () => { this.updateStatus(); },
      onLobbyState: (host) => {
        this.peerConnected = true;
        this.peerFaction = host.faction;
        this.peerGuilds = host.guilds;
        this.peerReady = host.ready;
        this.updateStatus(); this.updatePeerInfo();
      },
      onStart: (init) => { this.launchGame(init, 'client'); },
      onDisconnect: () => { this.peerConnected = false; this.updateStatus(); },
    });
    (this.net as NetClient).connect('Client');
    this.updateStatus();
  }

  // === 开始游戏 ===

  private updateStartBtn(): void {
    if (this.role !== 'host') return;
    const canStart = this.myReady && this.peerConnected && this.peerReady;
    this.startBtn.setStyle({ backgroundColor: canStart ? '#2a6a4a' : '#3a2a4a', color: canStart ? '#ffffff' : '#7f6a8e' });
  }

  private startGame(): void {
    if (this.role !== 'host') return;
    if (!this.myReady || !this.peerConnected || !this.peerReady) return;
    const init: GameInitData = {
      map: MAP_ID,
      // 协议字段; 客户端实际用自己输入的 ipValue 连中继, 主机自身用 localhost
      hostIP: 'localhost',
      hostFaction: this.selectedFaction,
      hostGuilds: [...this.selectedGuilds],
      clientFaction: this.peerFaction || 'hammer_federation',
      clientGuilds: (this.peerGuilds.length === 2 ? this.peerGuilds : ['mages_guild', 'alchemists_society']),
    };
    this.net?.send({ t: 'start', init });
    this.launchGame(init, 'host');
  }

  private launchGame(init: GameInitData, mode: 'host' | 'client'): void {
    this.cleanup();
    // 客户端用自己实际连接主机的 IP 连中继 (主机自身用 localhost);
    // 客户端已知道 ipValue, 比依赖 init.hostIP 更可靠。
    const hostIP = mode === 'client' ? this.ipValue : 'localhost';
    this.scene.start('GameScene', {
      netMode: mode,
      map: init.map,
      // 客户端据此建立到中继的连接 (修复: 不再硬编码 localhost)
      netHostIP: hostIP,
      playerFaction: mode === 'host' ? init.hostFaction : init.clientFaction,
      playerGuilds: mode === 'host' ? init.hostGuilds : init.clientGuilds,
      // 联机不用 AI, 但 GameScene.init 期望 aiDifficulty; 给个默认值, host 模式下 AI 会被禁用
      aiDifficulty: 'normal',
      // 联机对手信息 (供 GameScene 设置 owner 1)
      opponentFaction: mode === 'host' ? init.clientFaction : init.hostFaction,
      opponentGuilds: mode === 'host' ? init.clientGuilds : init.hostGuilds,
    });
  }

  // === UI 更新 ===

  private updateFactionUI(): void {
    this.factionTexts.forEach((txt, i) => {
      const isSelected = FACTIONS[i].id === this.selectedFaction;
      txt.setStyle({ backgroundColor: isSelected ? FACTIONS[i].color : T.ColorHex.CARD_BG, color: isSelected ? '#ffffff' : FACTIONS[i].color });
    });
  }

  private updateGuildUI(): void {
    ALL_GUILDS.forEach((g) => {
      const txt = this.guildTexts.get(g);
      if (!txt) return;
      const isSelected = this.selectedGuilds.includes(g);
      txt.setStyle({ backgroundColor: isSelected ? T.ColorHex.ACCENT_PURPLE : T.ColorHex.CARD_BG, color: isSelected ? '#ffffff' : T.ColorHex.TEXT_MAIN });
    });
  }

  private updateStatus(): void {
    if (this.role === 'host') {
      this.statusText.setText(this.peerConnected ? '✅ 客户端已连接' : '⏳ 等待客户端加入... (ws://本机IP:3000/lan)');
    } else {
      if (!this.net || !(this.net as NetClient).isConnected) {
        this.statusText.setText('未连接 — 输入主机 IP 后点连接');
      } else {
        this.statusText.setText('✅ 已连接主机');
      }
    }
  }

  private updatePeerInfo(): void {
    if (!this.peerConnected) {
      this.peerInfoText.setText('对方: 未连接');
      return;
    }
    const fname = FACTION_DEFS[this.peerFaction]?.name ?? this.peerFaction;
    const gnames = this.peerGuilds.map(g => GUILD_NAMES[g as GuildId] ?? g).join(' + ');
    this.peerInfoText.setText(`对方: ${fname} | ${gnames} | ${this.peerReady ? '✓已准备' : '未准备'}`);
  }

  private cleanup(): void {
    if (this.net) {
      if (this.net instanceof NetHost) this.net.disconnect();
      else (this.net as NetClient).disconnect();
      this.net = null;
    }
  }

  shutdown(): void { this.cleanup(); }
}
