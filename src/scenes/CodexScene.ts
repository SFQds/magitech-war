/**
 * 图鉴场景 — 卡林·渡口档案 (全屏浏览游戏内容 + 世界观)
 *
 * 三栏布局: 左分类导航 / 中条目列表(可滚动) / 右详情面板(可滚动)
 * 数据联动: 详情面板从 UNIT_DEFS/BUILDING_DEFS/HERO_DEFS/TECH_DEFS 查
 *          属性条/成本/解锁条件, codex.desc 保留作风味文字。
 * ESC 返回主菜单。
 */
import Phaser from 'phaser';
import { CODEX_ENTRIES, getCodexByCategory, getCodexCategories } from '../config/codex';
import type { CodexEntry } from '../config/codex';
import { UNIT_DEFS, BUILDING_DEFS, TECH_DEFS, FACTION_DEFS, getDisplayName } from '../config/unitData';
import { HERO_DEFS } from '../config/heroData';
import { UITheme as T } from '../ui/theme/UITheme';
import { drawPanel, drawButton, textStyle, drawPanelSkin, drawButtonSkin, setButtonSkinState } from '../ui/theme/UIWidget';
import type { ButtonState, SkinButtonOptions } from '../ui/theme/UIWidget';

// ===== 布局常量 (1280x720) =====
const VIEW_W = 1280;
const VIEW_H = 720;
const CAT_X = 16;
const CAT_Y = 80;
const CAT_W = 140;
const CAT_H = 34;
const CAT_PITCH = 40;
const LIST_X = CAT_X + CAT_W + 12;       // 168
const LIST_Y = 80;
const LIST_W = 280;
const LIST_H = 600;
const LIST_ITEM_H = 44;
const DETAIL_X = LIST_X + LIST_W + 12;   // 460
const DETAIL_Y = 80;
const DETAIL_W = VIEW_W - DETAIL_X - 16; // 804
const DETAIL_H = 600;

export class CodexScene extends Phaser.Scene {
  private currentCategory: CodexEntry['category'] = 'faction';
  private categoryButtons: { text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics | Phaser.GameObjects.NineSlice; skinOpts: SkinButtonOptions; category: CodexEntry['category'] }[] = [];
  private listContainer!: Phaser.GameObjects.Container;
  private detailContainer!: Phaser.GameObjects.Container;
  private listElements: Phaser.GameObjects.GameObject[] = [];
  private detailElements: Phaser.GameObjects.GameObject[] = [];
  private listMask!: Phaser.GameObjects.Rectangle;
  private detailMask!: Phaser.GameObjects.Rectangle;
  private selectedIndex = 0;
  /** 列表滚动偏移 (px) */
  private listScroll = 0;
  /** 详情滚动偏移 (px) */
  private detailScroll = 0;
  /** 当前列表条目总数 (用于滚动边界) */
  private listItemCount = 0;
  /** 当前详情内容总高度 (用于滚动边界) */
  private detailContentH = 0;

  constructor() { super({ key: 'CodexScene' }); }

  create(): void {
    // 背景
    const bgG = this.add.graphics();
    bgG.fillStyle(T.Color.PANEL_BG, 1);
    bgG.fillRect(0, 0, VIEW_W, VIEW_H);
    bgG.setDepth(-1).setScrollFactor(0);

    // 标题 (档案落款氛围)
    this.add.text(VIEW_W / 2, 28, '卡林·渡口档案', {
      fontSize: T.Font.TITLE, color: T.ColorHex.TEXT_MAIN, fontFamily: T.FontFamily.DISPLAY, fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0);
    this.add.text(VIEW_W / 2, 56, 'Magitech Codex · 纪元 1342', {
      fontSize: T.Font.SM, color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
    }).setOrigin(0.5).setScrollFactor(0);

    this._buildCategoryRail();
    this._buildListArea();
    this._buildDetailArea();

    // 返回提示
    this.add.text(VIEW_W - 16, VIEW_H - 12, 'ESC 返回主菜单', {
      fontSize: T.Font.SM, color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
    }).setOrigin(1, 1).setScrollFactor(0);

    // ESC 返回
    this.input.keyboard!.on('keydown-ESC', () => this.scene.start('MenuScene'));

    // 鼠标滚轮: 列表/详情分别滚动 (依据鼠标 x 位置判断焦点)
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objs: any, _dx: number, dy: number) => {
      const mx = this.input.x;
      if (mx >= LIST_X && mx <= LIST_X + LIST_W) {
        this.listScroll = Math.max(0, Math.min(this._listMaxScroll(), this.listScroll + dy * 0.5));
        this._renderList();
      } else if (mx >= DETAIL_X && mx <= DETAIL_X + DETAIL_W) {
        this.detailScroll = Math.max(0, Math.min(this._detailMaxScroll(), this.detailScroll + dy * 0.5));
        this._renderDetail();
      }
    });

    this._renderList();
    this._renderDetail();
  }

  private _buildCategoryRail(): void {
    const cats = getCodexCategories();
    this.categoryButtons = [];
    cats.forEach((c, i) => {
      const cy = CAT_Y + i * CAT_PITCH;
      const skinOpts: SkinButtonOptions = {
        x: CAT_X, y: cy, w: CAT_W, h: CAT_H,
        skinNormal: 'skin_btn_normal', skinHover: 'skin_btn_hover',
        skinActive: 'skin_btn_active', skinDisabled: 'skin_btn_normal', corner: 8,
      };
      let bg: Phaser.GameObjects.Graphics | Phaser.GameObjects.NineSlice;
      if (this.textures.exists('skin_btn_normal')) {
        bg = drawButtonSkin(this, { ...skinOpts, state: c.category === this.currentCategory ? 'active' : 'normal' });
        bg.setScrollFactor(0);
      } else {
        bg = this.add.graphics();
        this._drawCatButton(bg, skinOpts, c.category === this.currentCategory, false);
      }
      const text = this.add.text(CAT_X + CAT_W / 2, cy + CAT_H / 2, `${c.label} (${c.count})`, {
        fontSize: T.Font.SM, color: c.category === this.currentCategory ? '#ffffff' : T.ColorHex.TEXT_DIM,
        fontFamily: T.FontFamily.BODY,
      }).setOrigin(0.5).setScrollFactor(0);

      const hit = this.add.rectangle(CAT_X, cy, CAT_W, CAT_H, 0xffffff, 0).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this._selectCategory(c.category));
      hit.on('pointerover', () => this._drawCatButton(bg, skinOpts, c.category === this.currentCategory, true));
      hit.on('pointerout', () => this._drawCatButton(bg, skinOpts, c.category === this.currentCategory, false));

      this.categoryButtons.push({ text, bg, skinOpts, category: c.category });
    });
  }

  private _drawCatButton(bg: Phaser.GameObjects.Graphics | Phaser.GameObjects.NineSlice, skinOpts: SkinButtonOptions, selected: boolean, hover: boolean): void {
    const state: ButtonState = selected ? 'active' : hover ? 'hover' : 'normal';
    if (typeof (bg as Phaser.GameObjects.NineSlice).setTexture === 'function') {
      setButtonSkinState(bg as Phaser.GameObjects.NineSlice, skinOpts, state);
    } else {
      drawButton(this, bg as Phaser.GameObjects.Graphics, { x: skinOpts.x, y: skinOpts.y, w: skinOpts.w, h: skinOpts.h, state, radius: T.Radius.SM });
    }
  }

  private _selectCategory(category: CodexEntry['category']): void {
    this.currentCategory = category;
    this.selectedIndex = 0;
    this.listScroll = 0;
    this.detailScroll = 0;
    for (const cb of this.categoryButtons) {
      const isSel = cb.category === category;
      cb.text.setColor(isSel ? '#ffffff' : T.ColorHex.TEXT_DIM);
      this._drawCatButton(cb.bg, cb.skinOpts, isSel, false);
    }
    this._renderList();
    this._renderDetail();
  }

  private _buildListArea(): void {
    // 列表面板背景 (皮肤化 NineSlice, 缺失时回退纯色面板)
    const listBg = drawPanelSkin(this, { x: LIST_X, y: LIST_Y, w: LIST_W, h: LIST_H, skinKey: 'skin_panel_console', corner: 12 });
    listBg.setScrollFactor(0);
    // 滚动遮罩 (用于 clip 超出区域的条目)
    this.listMask = this.add.rectangle(LIST_X, LIST_Y, LIST_W, LIST_H, 0xffffff, 0).setOrigin(0).setScrollFactor(0);
    this.listContainer = this.add.container(LIST_X, LIST_Y);
    this.listContainer.setScrollFactor(0);
  }

  private _buildDetailArea(): void {
    const detailBg = drawPanelSkin(this, { x: DETAIL_X, y: DETAIL_Y, w: DETAIL_W, h: DETAIL_H, skinKey: 'skin_panel_console', corner: 12 });
    detailBg.setScrollFactor(0);
    this.detailMask = this.add.rectangle(DETAIL_X, DETAIL_Y, DETAIL_W, DETAIL_H, 0xffffff, 0).setOrigin(0).setScrollFactor(0);
    this.detailContainer = this.add.container(DETAIL_X, DETAIL_Y);
    this.detailContainer.setScrollFactor(0);
  }

  private _listMaxScroll(): number {
    const contentH = this.listItemCount * (LIST_ITEM_H + 4) + 8;
    return Math.max(0, contentH - LIST_H);
  }

  private _detailMaxScroll(): number {
    return Math.max(0, this.detailContentH - DETAIL_H);
  }

  private _renderList(): void {
    for (const el of this.listElements) el.destroy();
    this.listElements = [];

    const entries = getCodexByCategory(this.currentCategory);
    this.listItemCount = entries.length;

    entries.forEach((entry, i) => {
      const iy = 8 + i * (LIST_ITEM_H + 4) - this.listScroll;
      // 跳过完全在可视区外的条目 (性能 + 避免 clip 复杂度)
      if (iy + LIST_ITEM_H < 0 || iy > LIST_H) return;

      const isSelected = i === this.selectedIndex;
      const itemBg = this.add.graphics();
      const itemFill = isSelected ? T.Color.CARD_HOVER : T.Color.CARD_BG;
      itemBg.fillStyle(itemFill, 0.9);
      itemBg.fillRoundedRect(4, iy, LIST_W - 8, LIST_ITEM_H, T.Radius.SM);
      if (isSelected) {
        itemBg.lineStyle(1, T.Color.ACCENT_GOLD, 0.7);
        itemBg.strokeRoundedRect(4, iy, LIST_W - 8, LIST_ITEM_H, T.Radius.SM);
      }
      this.listContainer.add(itemBg);
      this.listElements.push(itemBg);

      // 图标
      if (entry.spriteKey && this.textures.exists(entry.spriteKey)) {
        const icon = this.add.image(22, iy + LIST_ITEM_H / 2, entry.spriteKey).setDisplaySize(28, 28);
        this.listContainer.add(icon);
        this.listElements.push(icon);
      }

      const nameText = this.add.text(44, iy + 6, entry.name, {
        fontSize: T.Font.BASE, color: isSelected ? T.ColorHex.TEXT_MAIN : T.ColorHex.TEXT_BODY,
        fontFamily: T.FontFamily.BODY, fontStyle: isSelected ? 'bold' : 'normal',
      });
      this.listContainer.add(nameText);
      this.listElements.push(nameText);

      const descShort = this.add.text(44, iy + 24, this._truncate(entry.desc, 22), {
        fontSize: T.Font.TINY, color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
      });
      this.listContainer.add(descShort);
      this.listElements.push(descShort);

      const hit = this.add.rectangle(4, iy, LIST_W - 8, LIST_ITEM_H, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.selectedIndex = i;
        this.detailScroll = 0;
        this._renderList();
        this._renderDetail();
      });
      hit.on('pointerover', () => { if (!isSelected) itemBg.fillStyle(T.Color.CARD_HOVER, 0.6); itemBg.fillRoundedRect(4, iy, LIST_W - 8, LIST_ITEM_H, T.Radius.SM); });
      hit.on('pointerout', () => { if (!isSelected) { itemBg.fillStyle(T.Color.CARD_BG, 0.9); itemBg.fillRoundedRect(4, iy, LIST_W - 8, LIST_ITEM_H, T.Radius.SM); } });
      this.listContainer.add(hit);
      this.listElements.push(hit);
    });

    // 滚动指示 (右侧细条)
    const maxScroll = this._listMaxScroll();
    if (maxScroll > 0) {
      const trackH = LIST_H - 8;
      const thumbH = Math.max(20, trackH * LIST_H / (this.listItemCount * (LIST_ITEM_H + 4) + 8));
      const thumbY = 4 + (trackH - thumbH) * (this.listScroll / maxScroll);
      const thumb = this.add.graphics();
      thumb.fillStyle(T.Color.ACCENT_GOLD, 0.4);
      thumb.fillRoundedRect(LIST_W - 8, thumbY, 4, thumbH, 2);
      this.listContainer.add(thumb);
      this.listElements.push(thumb);
    }
  }

  private _renderDetail(): void {
    for (const el of this.detailElements) el.destroy();
    this.detailElements = [];

    const entries = getCodexByCategory(this.currentCategory);
    const entry = entries[this.selectedIndex];
    if (!entry) { this.detailContentH = 0; return; }

    let y = 16 - this.detailScroll;

    // 大图标
    if (entry.spriteKey && this.textures.exists(entry.spriteKey)) {
      const icon = this.add.image(20, y + 4, entry.spriteKey).setDisplaySize(72, 72).setOrigin(0);
      this.detailContainer.add(icon);
      this.detailElements.push(icon);
      // 图标金边
      const pf = this.add.graphics();
      pf.lineStyle(1, T.Color.ACCENT_GOLD, 0.6);
      pf.strokeRoundedRect(20, y + 4, 72, 72, T.Radius.SM);
      this.detailContainer.add(pf);
      this.detailElements.push(pf);
    }

    // 名称 + 分类标签
    const nameText = this.add.text(104, y, entry.name, textStyle({
      size: T.Font.H1, color: T.ColorHex.TEXT_MAIN, family: T.FontFamily.DISPLAY, bold: true,
    }));
    this.detailContainer.add(nameText);
    this.detailElements.push(nameText);

    const catLabel = this.add.text(104, y + 32, `分类 · ${this._categoryLabel(entry.category)}`, {
      fontSize: T.Font.SM, color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
    });
    this.detailContainer.add(catLabel);
    this.detailElements.push(catLabel);
    y += 92;

    // 分隔线
    const line = this.add.rectangle(16, y, DETAIL_W - 32, 1, T.Color.ACCENT_GOLD, 0.4).setOrigin(0);
    this.detailContainer.add(line);
    this.detailElements.push(line);
    y += 14;

    // ===== 数据联动: 属性/成本/解锁 =====
    const dataLines = this._buildDataLines(entry);
    for (const dl of dataLines) {
      const t = this.add.text(16, y, dl, {
        fontSize: T.Font.SM, color: T.ColorHex.TEXT_BODY, fontFamily: T.FontFamily.MONO,
      });
      this.detailContainer.add(t);
      this.detailElements.push(t);
      y += 18;
    }
    if (dataLines.length > 0) y += 6;

    // ===== lore / story: 章节长文 (替代普通风味描述) =====
    if (entry.lore) {
      // 元信息: 章节 + 自信评级
      const meta = this.add.text(16, y, `${entry.lore.chapter}${entry.lore.confidence ? '  ·  自信 ' + entry.lore.confidence : ''}`, {
        fontSize: T.Font.SM, color: T.ColorHex.ACCENT_PURPLE, fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
      });
      this.detailContainer.add(meta);
      this.detailElements.push(meta);
      y += 22;
      // 分段正文
      for (const para of entry.lore.body) {
        const t = this.add.text(16, y, para, {
          fontSize: T.Font.BASE, color: T.ColorHex.TEXT_BODY, fontFamily: T.FontFamily.BODY,
          wordWrap: { width: DETAIL_W - 32 }, lineSpacing: 4,
        });
        this.detailContainer.add(t);
        this.detailElements.push(t);
        y += t.height + 10;
      }
    } else if (entry.story) {
      // 元信息: era + character
      const meta = this.add.text(16, y, [entry.story.era, entry.story.character].filter(Boolean).join('  ·  '), {
        fontSize: T.Font.SM, color: T.ColorHex.ACCENT_PURPLE, fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
      });
      this.detailContainer.add(meta);
      this.detailElements.push(meta);
      y += 22;
      // 分段正文
      for (const para of entry.story.body) {
        const t = this.add.text(16, y, para, {
          fontSize: T.Font.BASE, color: T.ColorHex.TEXT_BODY, fontFamily: T.FontFamily.BODY,
          wordWrap: { width: DETAIL_W - 32 }, lineSpacing: 4,
        });
        this.detailContainer.add(t);
        this.detailElements.push(t);
        y += t.height + 10;
      }
    } else {
      // ===== 普通条目: 风味描述 =====
      const descTitle = this.add.text(16, y, '◆ 档案记录', {
        fontSize: T.Font.SM, color: T.ColorHex.ACCENT_GOLD, fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
      });
      this.detailContainer.add(descTitle);
      this.detailElements.push(descTitle);
      y += 22;

      const descText = this.add.text(16, y, entry.desc, {
        fontSize: T.Font.BASE, color: T.ColorHex.TEXT_BODY, fontFamily: T.FontFamily.BODY,
        wordWrap: { width: DETAIL_W - 32 },
      });
      this.detailContainer.add(descText);
      this.detailElements.push(descText);
      y += descText.height + 8;
    }

    // 记录内容总高 (用于滚动边界)
    this.detailContentH = y + this.detailScroll;

    // 滚动指示
    const maxScroll = this._detailMaxScroll();
    if (maxScroll > 0) {
      const trackH = DETAIL_H - 8;
      const thumbH = Math.max(20, trackH * DETAIL_H / this.detailContentH);
      const thumbY = 4 + (trackH - thumbH) * (this.detailScroll / maxScroll);
      const thumb = this.add.graphics();
      thumb.fillStyle(T.Color.ACCENT_GOLD, 0.4);
      thumb.fillRoundedRect(DETAIL_W - 10, thumbY, 4, thumbH, 2);
      this.detailContainer.add(thumb);
      this.detailElements.push(thumb);
    }
  }

  /** 数据联动: 从游戏配置查属性/成本/解锁条件, 返回展示行 */
  private _buildDataLines(entry: CodexEntry): string[] {
    const lines: string[] = [];
    // 单位
    const ud = UNIT_DEFS[entry.id];
    if (ud) {
      const s = ud.stats;
      lines.push(`HP ${s.hp}  护甲 ${s.armorValue}(${s.armor})  攻击 ${s.damage}(${s.dmgType})`);
      lines.push(`射程 ${s.range}  移速 ${s.speed}  视野 ${s.sight}  类别 ${s.category}`);
      lines.push(`造价 💎${ud.cost.crystal}  👥${ud.cost.supply}  ⏱${ud.cost.time}s`);
      if (ud.exclusiveTo) {
        const parts: string[] = [];
        if (ud.exclusiveTo.faction) parts.push(FACTION_DEFS[ud.exclusiveTo.faction]?.name ?? ud.exclusiveTo.faction);
        if (ud.exclusiveTo.guild) parts.push(ud.exclusiveTo.guild);
        if (parts.length) lines.push(`专属: ${parts.join(' + ')}`);
      }
      if (ud.techReq?.length) lines.push(`需科技: ${ud.techReq.map(t => TECH_DEFS[t]?.name ?? t).join(', ')}`);
      return lines;
    }
    // 建筑
    const bd = BUILDING_DEFS[entry.id];
    if (bd) {
      lines.push(`HP ${bd.hp}`);
      lines.push(`造价 💎${bd.cost.crystal}  ⚙${bd.cost.industry}  ⏱${bd.cost.time}s`);
      lines.push(`提供 👥${bd.provides.supply}  ⚙${bd.provides.industry}`);
      if (bd.produces.length) lines.push(`训练: ${bd.produces.map(u => getDisplayName(u)).join(', ')}`);
      if (bd.combat) lines.push(`防御: 攻${bd.combat.damage}(${bd.combat.dmgType}) 射程${bd.combat.range}`);
      if (bd.exclusiveTo) {
        const parts: string[] = [];
        if (bd.exclusiveTo.faction) parts.push(FACTION_DEFS[bd.exclusiveTo.faction]?.name ?? bd.exclusiveTo.faction);
        if (bd.exclusiveTo.guild) parts.push(bd.exclusiveTo.guild);
        if (parts.length) lines.push(`专属: ${parts.join(' + ')}`);
      }
      return lines;
    }
    // 英雄
    const hd = HERO_DEFS[entry.id];
    if (hd) {
      const s = hd.stats;
      lines.push(`HP ${s.hp}  攻击 ${s.damage}(${s.dmgType})  护甲 ${hd.armorValue}(${s.armor})`);
      lines.push(`射程 ${s.range}  移速 ${s.speed}  视野 ${s.sight}`);
      lines.push(`称号: ${hd.title}`);
      lines.push(`被动: ${hd.passive}`);
      return lines;
    }
    // 科技
    const td = TECH_DEFS[entry.id.startsWith('tech:') ? entry.id.slice(5) : entry.id];
    if (td) {
      lines.push(`造价 💎${td.crystal}  ⏱${td.time}s`);
      if (td.prerequisites?.length) lines.push(`前置: ${td.prerequisites.map(p => TECH_DEFS[p]?.name ?? p).join(', ')}`);
      return lines;
    }
    // 阵营
    const fd = FACTION_DEFS[entry.id];
    if (fd) {
      lines.push(`经济: ${fd.econPassive}`);
      lines.push(`军事: ${fd.milPassive}`);
      return lines;
    }
    return lines;
  }

  private _truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  private _categoryLabel(c: CodexEntry['category']): string {
    const labels: Record<CodexEntry['category'], string> = {
      faction: '阵营', unit: '单位', building: '建筑', tech: '科技',
      hero: '英雄', guild: '行会', superweapon: '超级武器',
      neutral_unit: '中立野怪', neutral_building: '中立建筑',
      lore: '世界观', story: '故事集',
    };
    return labels[c] ?? c;
  }
}
