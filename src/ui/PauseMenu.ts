/**
 * 暂停菜单 — ESC 暂停游戏 + 弹出菜单
 *
 * 选项: 继续 / 重开 / 返回主菜单
 */
import Phaser from 'phaser';

export interface PauseMenuCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  /** 保存游戏回调（可选，不提供则隐藏保存按钮） */
  onSave?: () => void;
  /** 读档回调（可选，不提供则隐藏读档按钮） */
  onLoad?: () => void;
}

export class PauseMenu {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private callbacks: PauseMenuCallbacks;
  private _visible = false;

  constructor(scene: Phaser.Scene, callbacks: PauseMenuCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(500);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);
    this._build();
  }

  private _build(): void {
    const { width, height } = this.scene.cameras.main;
    const cx = width / 2;
    const cy = height / 2;

    // 半透明遮罩
    const overlay = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0);
    this.container.add(overlay);

    // 面板背景（根据按钮数量动态调整高度）
    const hasSaveLoad = !!(this.callbacks.onSave || this.callbacks.onLoad);
    const panelW = 280;
    const panelH = hasSaveLoad ? 340 : 260;
    const panelBg = this.scene.add.rectangle(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 0x1a1a2e, 0.95).setOrigin(0);
    this.container.add(panelBg);

    // 边框
    const border = this.scene.add.graphics();
    border.lineStyle(2, 0x9b59b6, 1);
    border.strokeRoundedRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 10);
    this.container.add(border);

    // 标题
    const title = this.scene.add.text(cx, cy - panelH / 2 + 30, '⏸ 已暂停', {
      fontSize: '22px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    this.container.add(title);

    // 按钮配置
    const btns: { label: string; cb: () => void; y: number }[] = [
      { label: '▶  继续', cb: () => this.hide(), y: cy - 40 },
    ];

    if (this.callbacks.onSave) {
      btns.push({ label: '💾  保存游戏', cb: () => { this.callbacks.onSave!(); }, y: cy + 10 });
    }
    if (this.callbacks.onLoad) {
      btns.push({ label: '📂  读取存档', cb: () => { this.callbacks.onLoad!(); }, y: cy + 60 });
    }

    btns.push(
      { label: '🔄  重新开始', cb: () => { this.hide(); this.callbacks.onRestart(); }, y: cy + 110 },
      { label: '🏠  返回主菜单', cb: () => { this.hide(); this.callbacks.onMainMenu(); }, y: cy + 160 },
    );

    for (const b of btns) {
      const btn = this.scene.add.text(cx, b.y, b.label, {
        fontSize: '16px', color: '#ffffff', backgroundColor: '#4a3060',
        padding: { x: 20, y: 8 }, fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#5e3d78' }));
      btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#4a3060' }));
      btn.on('pointerdown', b.cb);
      this.container.add(btn);
    }
  }

  show(): void {
    this._visible = true;
    this.container.setVisible(true);
    this.scene.time.timeScale = 0;
  }

  hide(): void {
    this._visible = false;
    this.container.setVisible(false);
    this.scene.time.timeScale = 1;
    this.callbacks.onResume();
  }

  get isVisible(): boolean { return this._visible; }

  destroy(): void { this.container.destroy(); }
}
