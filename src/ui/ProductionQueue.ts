/**
 * 生产队列 UI — 顶栏右侧, 显示建筑当前生产进度
 *
 * 取自 UITheme, 进度条用类别色 (建造橙/训练绿/研究紫), 描金边面板。
 */

import Phaser from 'phaser';
import { UITheme as T } from './theme/UITheme';
import { drawPanelSkin } from './theme/UIWidget';

export class ProductionQueueUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setScrollFactor(0);
  }

  /** 更新生产队列显示（支持点击取消训练项） */
  update(queue: Array<{ name: string; progress: number; color?: number; cancelType?: 'train' | 'research'; buildingId?: string; queueIndex?: number }>): void {
    this.container.removeAll(true);

    const { width } = this.scene.cameras.main;
    const startX = width - 190;
    const startY = 44;

    queue.forEach((item, i) => {
      const y = startY + i * 44;
      // 面板背景 (皮肤化: skin_panel_console 小卡槽; 纹理缺失回退纯色)
      const bg = drawPanelSkin(this.scene, { x: startX, y, w: 180, h: 38, skinKey: 'skin_panel_console', corner: 8 });
      this.container.add(bg);

      const label = this.scene.add.text(startX + 6, y + 3, item.name, {
        fontSize: T.Font.SM, color: T.ColorHex.TEXT_MAIN, fontFamily: T.FontFamily.BODY,
      });
      this.container.add(label);

      // 进度条 (轨道 + 类别色填充)
      const fillColor = item.color ?? T.Color.KIND_TRAIN;
      const barBg = this.scene.add.rectangle(startX + 6, y + 24, 168, 6, 0x333333).setOrigin(0);
      const barFill = this.scene.add.rectangle(startX + 6, y + 24, Math.min(168 * item.progress, 168), 6, fillColor).setOrigin(0);
      this.container.add(barBg);
      this.container.add(barFill);

      // 取消按钮
      if (item.cancelType && item.buildingId !== undefined) {
        const cancelBtn = this.scene.add.text(startX + 162, y + 4, '✖', {
          fontSize: T.Font.SM, color: T.ColorHex.HP_RED, fontFamily: T.FontFamily.BODY,
        }).setInteractive({ useHandCursor: true });
        cancelBtn.on('pointerdown', () => {
          const gs = this.scene.scene.get('GameScene') as any;
          if (item.cancelType === 'train') {
            gs.commandExecutor?.execute({
              type: 'cancel_train', playerIndex: 0, unitIds: [],
              buildingId: item.buildingId, queueIndex: item.queueIndex ?? -1, frame: 0,
            });
          } else if (item.cancelType === 'research') {
            gs.commandExecutor?.execute({
              type: 'cancel_research', playerIndex: 0, unitIds: [],
              buildingId: item.buildingId, frame: 0,
            });
          }
        });
        this.container.add(cancelBtn);
      }
    });
  }

  destroy(): void {
    this.container.destroy();
  }
}
