/**
 * 选中面板 — 中段显示当前选中单位信息 (SC2 控制台中段)
 *
 * - showUnits(units): 单选详情 (名称+HP条+状态) / 多选聚合
 * - showUnitsGrid(units, onSelect): 多选头像网格
 * 取自 UITheme, HP 条按百分比渐变 (绿→黄→红)。
 */

import Phaser from 'phaser';
import { Unit } from '../entities/Unit';
import { CATEGORY_NAMES, STATE_NAMES, getDisplayName } from '../config/unitData';
import { UITheme as T } from './theme/UITheme';
import { drawPanel, drawPanelSkin } from './theme/UIWidget';

const PANEL_W = 505;
const PANEL_H = 130;

const GRID_COLS = 8;
const GRID_CELL = 40;
const GRID_GAP = 4;

export class SelectionPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private hpText: Phaser.GameObjects.Text;
  private stateText: Phaser.GameObjects.Text;
  /** 多选网格容器 (主面板右侧扩展) */
  private gridContainer: Phaser.GameObjects.Container;
  private gridElements: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    // 背景: NineSlice 皮肤, 缺失回退纯色面板
    const skin = drawPanelSkin(scene, { x: 0, y: 0, w: PANEL_W, h: PANEL_H, skinKey: 'skin_panel_console', corner: 14 });
    this.bg = skin as unknown as Phaser.GameObjects.Graphics;

    this.nameText = scene.add.text(10, 6, '无选中', {
      fontSize: T.Font.H2, color: T.ColorHex.TEXT_MAIN, fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
    });
    // HP 条 (轨道 + 填充, 按百分比渐变色) — 初始隐藏, 有选中才显示
    this.hpBarBg = scene.add.rectangle(10, 32, PANEL_W - 20, 10, 0x333333).setOrigin(0).setVisible(false);
    this.hpBarFill = scene.add.rectangle(10, 32, 0, 10, T.Color.HP_GREEN).setOrigin(0);
    this.hpText = scene.add.text(10, 44, '', {
      fontSize: T.Font.SM, color: T.ColorHex.TEXT_BODY, fontFamily: T.FontFamily.MONO,
    });
    this.stateText = scene.add.text(10, 64, '', {
      fontSize: T.Font.SM, color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
    });

    this.container = scene.add.container(x, y, [this.bg, this.nameText, this.hpBarBg, this.hpBarFill, this.hpText, this.stateText]);
    this.container.setDepth(150);
    this.container.setScrollFactor(0);

    // 网格容器: 面板内部 (多选时覆盖在名称/HP区, 8列网格)
    this.gridContainer = scene.add.container(x + 6, y + 28);
    this.gridContainer.setDepth(150);
    this.gridContainer.setScrollFactor(0);
    this.gridContainer.setVisible(false);
  }

  /** 更新选中信息 (单选详情 + 多选文字聚合) */
  showUnits(units: Unit[]): void {
    this._clearGrid();
    this.gridContainer.setVisible(false);

    if (units.length === 0) {
      this.nameText.setText('无选中');
      this.hpBarBg.setVisible(false);   // 空态不残留 HP 轨道
      this.hpBarFill.width = 0;
      this.hpText.setText('');
      this.stateText.setText('');
      return;
    }
    this.hpBarBg.setVisible(true);

    const u = units[0];
    const catName = CATEGORY_NAMES[u.category] ?? u.category;
    const stateName = STATE_NAMES[u.state] ?? u.state;
    const unitName = getDisplayName(u.spriteKey);
    this.nameText.setText(`${unitName} · ${catName}  (${units.length})`);

    if (units.length > 1) {
      // 多选: HP 轨道让位给头像网格 (网格 y+28 起与 HP条 y+32 重叠)
      this.hpBarBg.setVisible(false);
      this.hpBarFill.width = 0;
      this.hpText.setText('');
      this.stateText.setText(''); // 数量已在 nameText「(N)」, 让位给网格
    } else {
      this._setHpBar(u.hp, u.maxHp);
      this.stateText.setText(`状态: ${stateName}`);
    }
  }

  /** 设置 HP 条 + 文字 (按百分比渐变色) */
  private _setHpBar(hp: number, maxHp: number): void {
    const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.hpBarFill.width = (PANEL_W - 20) * pct;
    this.hpBarFill.fillColor = T.hpColor(pct);
    this.hpText.setText(`HP ${Math.round(hp)}/${Math.round(maxHp)}`);
  }

  /** 多选网格模式: 渲染头像网格 + HP 条, 点击聚焦单单位 */
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

    const gridBg = this.scene.add.graphics();
    drawPanel(this.scene, gridBg, { x: 0, y: 0, w: gridW + 8, h: gridH + 8, border: 'dim' });
    this.gridContainer.add(gridBg);
    this.gridElements.push(gridBg);

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const cx = 4 + col * (GRID_CELL + GRID_GAP);
      const cy = 4 + row * (GRID_CELL + GRID_GAP);

      const cellBg = this.scene.add.rectangle(cx, cy, GRID_CELL, GRID_CELL, T.Color.CARD_BG, 0.9).setOrigin(0);
      this.gridContainer.add(cellBg);
      this.gridElements.push(cellBg);

      if (this.scene.textures.exists(unit.spriteKey)) {
        const icon = this.scene.add.image(cx + GRID_CELL / 2, cy + 14, unit.spriteKey);
        icon.setDisplaySize(24, 24);
        this.gridContainer.add(icon);
        this.gridElements.push(icon);
      }

      // HP 条 (按百分比渐变色)
      const hpPct = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0;
      const hpBarBg = this.scene.add.rectangle(cx + 4, cy + GRID_CELL - 12, GRID_CELL - 8, 4, 0x333333).setOrigin(0);
      const hpBarFill = this.scene.add.rectangle(cx + 4, cy + GRID_CELL - 12, (GRID_CELL - 8) * hpPct, 4, T.hpColor(hpPct)).setOrigin(0);
      this.gridContainer.add(hpBarBg);
      this.gridContainer.add(hpBarFill);
      this.gridElements.push(hpBarBg);
      this.gridElements.push(hpBarFill);

      const hitArea = this.scene.add.rectangle(cx, cy, GRID_CELL, GRID_CELL, 0xffffff, 0)
        .setOrigin(0).setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', () => onSelect(unit));
      hitArea.on('pointerover', () => { cellBg.fillColor = T.Color.CARD_HOVER; });
      hitArea.on('pointerout', () => { cellBg.fillColor = T.Color.CARD_BG; });
      this.gridContainer.add(hitArea);
      this.gridElements.push(hitArea);
    }
  }

  private _clearGrid(): void {
    for (const el of this.gridElements) el.destroy();
    this.gridElements = [];
  }

  hideGrid(): void {
    this._clearGrid();
    this.gridContainer.setVisible(false);
  }

  destroy(): void {
    this.container.destroy();
    this.gridContainer.destroy();
  }
}
