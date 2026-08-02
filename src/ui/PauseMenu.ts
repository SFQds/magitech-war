/**
 * 暂停菜单 — ESC 暂停游戏 + 弹出菜单
 *
 * 选项: 继续 / 保存 / 读档 / 重新开始 / 返回主菜单
 * 取自 UITheme, 金描边大面板 + 紫色按钮 hover。
 */
import Phaser from 'phaser';
import { UITheme as T } from './theme/UITheme';
import { drawPanelSkin } from './theme/UIWidget';

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
    const overlay = this.scene.add.rectangle(0, 0, width, height, T.Color.PANEL_BG, 0.75).setOrigin(0);
    this.container.add(overlay);

    // 面板 (金描边)
    const hasSaveLoad = !!(this.callbacks.onSave || this.callbacks.onLoad);
    const panelW = 300;
    const panelH = hasSaveLoad ? 360 : 280;
    // 面板底 (皮肤化: 暗紫魔导渐变 + 金雕花四角; 纹理缺失回退纯色)
    const panelBg = drawPanelSkin(this.scene, {
      x: cx - panelW / 2, y: cy - panelH / 2, w: panelW, h: panelH,
      skinKey: 'skin_panel_console', corner: 14,
    });
    this.container.add(panelBg);

    // 标题
    const title = this.scene.add.text(cx, cy - panelH / 2 + 32, '⏸  已暂停', {
      fontSize: T.Font.H1, color: T.ColorHex.TEXT_MAIN, fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add(title);

    // 分隔线
    const line = this.scene.add.rectangle(cx - panelW / 2 + 20, cy - panelH / 2 + 62, panelW - 40, 1, T.Color.ACCENT_GOLD, 0.4).setOrigin(0);
    this.container.add(line);

    // 按钮配置
    const btns: { label: string; cb: () => void; y: number }[] = [
      { label: '▶  继续', cb: () => this.hide(), y: cy - 50 },
    ];

    if (this.callbacks.onSave) {
      btns.push({ label: '💾  保存游戏', cb: () => { this.callbacks.onSave!(); }, y: cy });
    }
    if (this.callbacks.onLoad) {
      btns.push({ label: '📂  读取存档', cb: () => { this.callbacks.onLoad!(); }, y: cy + 50 });
    }

    btns.push(
      { label: '🔄  重新开始', cb: () => { this.hide(); this.callbacks.onRestart(); }, y: cy + 100 },
      { label: '🏠  返回主菜单', cb: () => { this.hide(); this.callbacks.onMainMenu(); }, y: cy + 150 },
    );

    for (const b of btns) {
      const btn = this.scene.add.text(cx, b.y, b.label, {
        fontSize: T.Font.BASE, color: T.ColorHex.TEXT_MAIN,
        backgroundColor: T.ColorHex.CARD_HOVER,
        padding: { x: 24, y: 8 }, fontFamily: T.FontFamily.BODY,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setStyle({ backgroundColor: T.ColorHex.ACCENT_PURPLE, color: '#ffffff' }));
      btn.on('pointerout', () => btn.setStyle({ backgroundColor: T.ColorHex.CARD_HOVER, color: T.ColorHex.TEXT_MAIN }));
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
