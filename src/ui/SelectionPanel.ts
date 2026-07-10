/**
 * 选中面板 — 显示当前选中单位的信息
 */

import Phaser from 'phaser';
import { Unit } from '../entities/Unit';
import { CATEGORY_NAMES, STATE_NAMES, getDisplayName } from '../config/unitData';

export class SelectionPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private nameText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private stateText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    const bg = scene.add.rectangle(0, 0, 200, 120, 0x1a1a2e, 0.9).setOrigin(0);
    this.nameText = scene.add.text(10, 8, '无选中', {
      fontSize: '14px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    });
    this.hpText = scene.add.text(10, 30, '', {
      fontSize: '12px', color: '#ff6666', fontFamily: 'Arial, sans-serif',
    });
    this.stateText = scene.add.text(10, 50, '', {
      fontSize: '12px', color: '#7f6a8e', fontFamily: 'Arial, sans-serif',
    });

    this.container = scene.add.container(x, y, [bg, this.nameText, this.hpText, this.stateText]);
    this.container.setDepth(150);
    this.container.setScrollFactor(0);
  }

  /** 更新选中信息 */
  showUnits(units: Unit[]): void {
    if (units.length === 0) {
      this.nameText.setText('无选中');
      this.hpText.setText('');
      this.stateText.setText('');
      return;
    }

    const u = units[0];
    const catName = CATEGORY_NAMES[u.category] ?? u.category;
    const stateName = STATE_NAMES[u.state] ?? u.state;
    const unitName = getDisplayName(u.spriteKey);
    this.nameText.setText(`${unitName}·${catName} (${units.length}个)`);
    this.hpText.setText(`生命: ${u.hp}/${u.maxHp}`);
    this.stateText.setText(`状态: ${stateName}`);

    if (units.length > 1) {
      const totalHp = units.reduce((s, u) => s + u.hp, 0);
      const totalMax = units.reduce((s, u) => s + u.maxHp, 0);
      this.hpText.setText(`总生命: ${totalHp}/${totalMax}`);
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}