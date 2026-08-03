import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { HUDScene } from './scenes/HUDScene';
import { CodexScene } from './scenes/CodexScene';
import { LobbyScene } from './scenes/LobbyScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#1a1a2e',
  parent: document.body,
  scene: [BootScene, MenuScene, LobbyScene, GameScene, HUDScene, CodexScene],
  render: {
    pixelArt: true,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

// 禁用游戏画布上的右键菜单
game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());