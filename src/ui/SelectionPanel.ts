/**
 * 选中面板 — 显示当前选中单位的信息
 *
 * P1-UI 批3: 增加多选网格模式。
 * - showUnits(units): 保留原有逻辑（单选详情 + 多选文字聚合），向后兼容
 * - showUnitsGrid(units, onSelect): 多选时渲染 4×N 头像网格（spriteKey 缩略图 + HP 条），点击聚焦
 */

import Phaser from 'phaser';
import { Unit } from '../entities/Unit';
import { CATEGORY_NAMES, STATE_NAMES, getDisplayName } from '../config/unitData';

const GRID_COLS = 4;
const GRID_CELL = 44;
const GRID_GAP = 4;

export class SelectionPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private nameText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private stateText: Phaser.GameObjects.Text;
  /** P1-UI 批3: 网格容器（多选模式专用，独立于主 container） */
  private gridContainer: Phaser.GameObjects.Container;
  private gridElements: Phaser.GameObjects.GameObject[] = [];

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

    // P1-UI 批3: 网格容器在主面板右侧扩展
    this.gridContainer = scene.add.container(x + 210, y);
    this.gridContainer.setDepth(150);
    this.gridContainer.setScrollFactor(0);
    this.gridContainer.setVisible(false);
  }

  /** 更新选中信息（原有逻辑，向后兼容） */
  showUnits(units: Unit[]): void {
    // 多选网格模式：先清空网格，再用原逻辑显示文字聚合
    this._clearGrid();
    this.gridContainer.setVisible(false);

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

  /** P1-UI 批3: 多选网格模式 — 渲染头像网格 + HP 条，点击聚焦单个单位 */
  showUnitsGrid(units: Unit[], onSelect: (unit: Unit) => void): void {
    this._clearGrid();
    if (units.length <= 1) {
      this.gridContainer.setVisible(false);
      return;
    }

    this.gridContainer.setVisible(true);
    const rows = Math.ceil(units.length / GRID_COLS);
    const gridW = GRID_COLS * (GRID_CELL + GRID_GAP);
    const gridH = rows * (GRID_CELL + GRID_GAP);

    // 网格背景
    const gridBg = this.scene.add.rectangle(0, 0, gridW + 8, gridH + 8, 0x1a1a2e, 0.9).setOrigin(0);
    this.gridContainer.add(gridBg);
    this.gridElements.push(gridBg);

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const cx = 4 + col * (GRID_CELL + GRID_GAP);
      const cy = 4 + row * (GRID_CELL + GRID_GAP);

      // 单元格背景
      const cellBg = this.scene.add.rectangle(cx, cy, GRID_CELL, GRID_CELL, 0x2a1a3a, 0.9).setOrigin(0);
      this.gridContainer.add(cellBg);
      this.gridElements.push(cellBg);

      // 头像缩略图（如果纹理存在）
      if (this.scene.textures.exists(unit.spriteKey)) {
        const icon = this.scene.add.image(cx + GRID_CELL / 2, cy + 14, unit.spriteKey);
        icon.setDisplaySize(24, 24);
        this.gridContainer.add(icon);
        this.gridElements.push(icon);
      }

      // HP 条
      const hpBarBg = this.scene.add.rectangle(cx + 4, cy + GRID_CELL - 12, GRID_CELL - 8, 4, 0x333333).setOrigin(0);
      const hpPct = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0;
      const hpBarFill = this.scene.add.rectangle(cx + 4, cy + GRID_CELL - 12, (GRID_CELL - 8) * hpPct, 4, 0x2ecc71).setOrigin(0);
      this.gridContainer.add(hpBarBg);
      this.gridContainer.add(hpBarFill);
      this.gridElements.push(hpBarBg);
      this.gridElements.push(hpBarFill);

      // 点击热区
      const hitArea = this.scene.add.rectangle(cx, cy, GRID_CELL, GRID_CELL, 0xffffff, 0)
        .setOrigin(0).setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', () => onSelect(unit));
      hitArea.on('pointerover', () => { cellBg.fillColor = 0x3a2a5a; });
      hitArea.on('pointerout', () => { cellBg.fillColor = 0x2a1a3a; });
      this.gridContainer.add(hitArea);
      this.gridElements.push(hitArea);
    }

    // 同时更新主面板显示总数
    this.nameText.setText(`选中 ${units.length} 个单位`);
    this.hpText.setText('');
    this.stateText.setText('');
  }

  /** P1-UI 批3: 清空网格元素 */
  private _clearGrid(): void {
    for (const el of this.gridElements) {
      el.destroy();
    }
    this.gridElements = [];
  }

  /** P1-UI 批3: 隐藏网格 */
  hideGrid(): void {
    this._clearGrid();
    this.gridContainer.setVisible(false);
  }

  destroy(): void {
    this.container.destroy();
    this.gridContainer.destroy();
  }
}
