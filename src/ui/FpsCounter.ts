/**
 * FPS 计数器 — 左上角显示帧率，F3 切换
 */
import Phaser from 'phaser';

export class FpsCounter {
  private scene: Phaser.Scene;
  private text: Phaser.GameObjects.Text;
  private _visible = false;
  private _updateTimer = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.text = scene.add.text(4, 40, '', {
      fontSize: '11px', color: '#2ecc71', fontFamily: 'monospace',
      backgroundColor: '#000000', padding: { x: 4, y: 2 },
    }).setOrigin(0).setDepth(400).setScrollFactor(0).setAlpha(0.8);
    this.text.setVisible(false);

    // F3 切换
    scene.input.keyboard?.on('keydown-F3', () => this.toggle());
  }

  toggle(): void {
    this._visible = !this._visible;
    this.text.setVisible(this._visible);
  }

  update(_deltaSec: number): void {
    if (!this._visible) return;
    this._updateTimer++;
    if (this._updateTimer % 10 !== 0) return; // 每10帧刷新
    const fps = Math.round(this.scene.game.loop.actualFps);
    this.text.setText(`FPS ${fps}`);
  }

  get isVisible(): boolean { return this._visible; }

  destroy(): void { this.text.destroy(); }
}
