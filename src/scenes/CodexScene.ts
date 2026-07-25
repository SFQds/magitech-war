/**
 * 图鉴场景 — 全屏浏览游戏内容
 *
 * 左侧分类标签(阵营/单位/建筑/科技/英雄/行会/超武/中立)
 * 右侧条目列表 + 详情面板(图标+名称+描述)
 * ESC 返回主菜单
 */
import Phaser from 'phaser';
import { CODEX_ENTRIES, getCodexByCategory, getCodexCategories } from '../config/codex';
import type { CodexEntry } from '../config/codex';

const PANEL_BG = 0x0d0a1a;
const CARD_BG = 0x1a1a2e;
const CARD_HOVER = 0x2a1a3a;
const ACCENT = 0x9b59b6;
const TEXT_MAIN = '#c8a2c8';
const TEXT_DIM = '#7f6a8e';

export class CodexScene extends Phaser.Scene {
  private currentCategory: CodexEntry['category'] = 'unit';
  private categoryButtons: { text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics; category: CodexEntry['category'] }[] = [];
  private listContainer!: Phaser.GameObjects.Container;
  private detailContainer!: Phaser.GameObjects.Container;
  private listElements: Phaser.GameObjects.GameObject[] = [];
  private detailElements: Phaser.GameObjects.GameObject[] = [];
  private selectedIndex = 0;

  constructor() { super({ key: 'CodexScene' }); }

  create(): void {
    const { width, height } = this.cameras.main;

    // 背景
    this.add.rectangle(0, 0, width, height, PANEL_BG, 1).setOrigin(0);

    // 标题
    this.add.text(width / 2, 30, '📖 图鉴 · 卡林渡口档案', {
      fontSize: '24px', color: TEXT_MAIN, fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    this.add.text(width / 2, 58, 'Magitech Codex', {
      fontSize: '11px', color: TEXT_DIM, fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    // 左侧分类栏
    const cats = getCodexCategories();
    const catX = 20;
    const catY = 90;
    const catW = 140;
    const catH = 36;
    this.categoryButtons = [];

    cats.forEach((c, i) => {
      const cy = catY + i * (catH + 4);
      const bg = this.add.graphics();
      this._drawCatButton(bg, catX, cy, catW, catH, c.category === this.currentCategory);
      const text = this.add.text(catX + catW / 2, cy + catH / 2, `${c.label} (${c.count})`, {
        fontSize: '13px', color: c.category === this.currentCategory ? '#ffffff' : TEXT_DIM,
        fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5);

      const hit = this.add.rectangle(catX, cy, catW, catH, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this._selectCategory(c.category));
      hit.on('pointerover', () => this._drawCatButton(bg, catX, cy, catW, catH, c.category === this.currentCategory, true));
      hit.on('pointerout', () => this._drawCatButton(bg, catX, cy, catW, catH, c.category === this.currentCategory, false));

      this.categoryButtons.push({ text, bg, category: c.category });
    });

    // 右侧列表 + 详情容器
    this.listContainer = this.add.container(180, 90);
    this.detailContainer = this.add.container(480, 90);

    // 返回提示
    this.add.text(width - 20, height - 20, 'ESC 返回主菜单', {
      fontSize: '12px', color: TEXT_DIM, fontFamily: 'Arial, sans-serif',
    }).setOrigin(1, 1);

    // ESC 返回
    this.input.keyboard!.on('keydown-ESC', () => {
      this.scene.start('MenuScene');
    });

    // 初始渲染
    this._renderList();
    this._renderDetail();
  }

  private _drawCatButton(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, selected: boolean, hover = false): void {
    g.clear();
    const fillColor = selected ? ACCENT : hover ? CARD_HOVER : CARD_BG;
    const alpha = selected ? 0.6 : 0.9;
    g.fillStyle(fillColor, alpha);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(selected ? 2 : 1, selected ? 0xffd700 : 0x5e3d78, 1);
    g.strokeRoundedRect(x, y, w, h, 6);
  }

  private _selectCategory(category: CodexEntry['category']): void {
    this.currentCategory = category;
    this.selectedIndex = 0;
    // 更新分类按钮高亮
    for (const cb of this.categoryButtons) {
      const isSel = cb.category === category;
      cb.text.setColor(isSel ? '#ffffff' : TEXT_DIM);
      const idx = this.categoryButtons.indexOf(cb);
      const catY = 90 + idx * 40;
      this._drawCatButton(cb.bg, 20, catY, 140, 36, isSel);
    }
    this._renderList();
    this._renderDetail();
  }

  private _renderList(): void {
    for (const el of this.listElements) el.destroy();
    this.listElements = [];

    const entries = getCodexByCategory(this.currentCategory);
    const listW = 280;
    const itemH = 42;

    // 列表背景
    const listBg = this.add.rectangle(0, 0, listW, 600, CARD_BG, 0.85).setOrigin(0);
    this.listContainer.add(listBg);
    this.listElements.push(listBg);

    entries.forEach((entry, i) => {
      const iy = i * (itemH + 4) + 8;
      const isSelected = i === this.selectedIndex;

      const itemBg = this.add.rectangle(4, iy, listW - 8, itemH, isSelected ? CARD_HOVER : 0x22223a, 0.9).setOrigin(0);
      this.listContainer.add(itemBg);
      this.listElements.push(itemBg);

      // 图标(如果有 spriteKey)
      if (entry.spriteKey && this.textures.exists(entry.spriteKey)) {
        const icon = this.add.image(20, iy + itemH / 2, entry.spriteKey).setDisplaySize(28, 28);
        this.listContainer.add(icon);
        this.listElements.push(icon);
      }

      const nameText = this.add.text(44, iy + 6, entry.name, {
        fontSize: '13px', color: isSelected ? '#ffffff' : TEXT_MAIN, fontFamily: 'Arial, sans-serif',
      });
      this.listContainer.add(nameText);
      this.listElements.push(nameText);

      const descShort = this.add.text(44, iy + 22, entry.desc.slice(0, 24) + (entry.desc.length > 24 ? '...' : ''), {
        fontSize: '10px', color: TEXT_DIM, fontFamily: 'Arial, sans-serif',
      });
      this.listContainer.add(descShort);
      this.listElements.push(descShort);

      const hit = this.add.rectangle(4, iy, listW - 8, itemH, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.selectedIndex = i;
        this._renderList();
        this._renderDetail();
      });
      hit.on('pointerover', () => { itemBg.fillColor = CARD_HOVER; });
      hit.on('pointerout', () => { itemBg.fillColor = isSelected ? CARD_HOVER : 0x22223a; });
      this.listContainer.add(hit);
      this.listElements.push(hit);
    });
  }

  private _renderDetail(): void {
    for (const el of this.detailElements) el.destroy();
    this.detailElements = [];

    const entries = getCodexByCategory(this.currentCategory);
    const entry = entries[this.selectedIndex];
    if (!entry) return;

    const detailW = 760;
    const detailH = 600;

    // 详情背景
    const bg = this.add.rectangle(0, 0, detailW, detailH, CARD_BG, 0.9).setOrigin(0);
    this.detailContainer.add(bg);
    this.detailElements.push(bg);

    // 边框
    const border = this.add.graphics();
    border.lineStyle(2, ACCENT, 1);
    border.strokeRoundedRect(0, 0, detailW, detailH, 8);
    this.detailContainer.add(border);
    this.detailElements.push(border);

    let y = 20;

    // 大图标
    if (entry.spriteKey && this.textures.exists(entry.spriteKey)) {
      const icon = this.add.image(60, y + 40, entry.spriteKey).setDisplaySize(64, 64);
      this.detailContainer.add(icon);
      this.detailElements.push(icon);
    }

    // 名称
    const nameText = this.add.text(110, y, entry.name, {
      fontSize: '22px', color: TEXT_MAIN, fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    });
    this.detailContainer.add(nameText);
    this.detailElements.push(nameText);

    // 分类标签
    const catLabel = this.add.text(110, y + 30, `分类: ${this._categoryLabel(entry.category)}`, {
      fontSize: '11px', color: TEXT_DIM, fontFamily: 'Arial, sans-serif',
    });
    this.detailContainer.add(catLabel);
    this.detailElements.push(catLabel);
    y += 70;

    // 分割线
    const line = this.add.rectangle(20, y, detailW - 40, 1, 0x5e3d78, 0.5).setOrigin(0);
    this.detailContainer.add(line);
    this.detailElements.push(line);
    y += 16;

    // 描述（自动换行）
    const descText = this.add.text(20, y, entry.desc, {
      fontSize: '14px', color: '#a0a0c0', fontFamily: 'Arial, sans-serif',
      wordWrap: { width: detailW - 40 },
    });
    this.detailContainer.add(descText);
    this.detailElements.push(descText);
  }

  private _categoryLabel(c: CodexEntry['category']): string {
    const labels: Record<CodexEntry['category'], string> = {
      faction: '阵营', unit: '单位', building: '建筑', tech: '科技',
      hero: '英雄', guild: '行会', superweapon: '超级武器',
      neutral_unit: '中立野怪', neutral_building: '中立建筑',
    };
    return labels[c];
  }
}
