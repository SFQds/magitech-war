/**
 * UITheme — 魔导工业革命 UI 设计令牌
 *
 * 统一管理所有 UI 组件的色彩、字号、边距，消除各组件硬编码 hex 的散装现状。
 * 视觉基调：暗紫魔导 + 四阵营色相 + 淡金描边（对标成熟 RTS 控制台）。
 *
 * 用法：组件 import { UITheme as T } from '../theme/UITheme';
 *       T.Color.PANEL_BG / T.Font.BASE / T.Spacing.MD 等。
 *
 * 色值同时以 number(Phaser) 与 string(CSS) 两种形式提供：
 *   T.Color.PANEL_BG        => number 0x0d0a1a
 *   T.ColorHex.PANEL_BG     => string '#0d0a1a'
 */

/** Phaser Graphics 用的数值色值（0xRRGGBB） */
export const Color = {
  // ===== 底色阶层（从深到浅）=====
  PANEL_BG: 0x0d0a1a,        // 最深 — 全屏背景 / 模态遮罩底
  CONSOLE_BG: 0x12102a,      // 控制台底色（顶栏/底栏）
  CARD_BG: 0x1a1830,         // 卡片/面板底
  CARD_HOVER: 0x25204a,      // 悬停态
  CARD_ACTIVE: 0x9b59b6,     // 选中/激活态（紫晶）

  // ===== 描边 =====
  BORDER: 0x5e3d78,          // 普通描边（暗紫金）
  BORDER_DIM: 0x3a2a4a,      // 弱描边
  ACCENT_GOLD: 0xffd700,     // 金色强调（选中描边/数字/高亮）
  ACCENT_PURPLE: 0x9b59b6,   // 紫晶强调（激活描边/能量）

  // ===== 文字三阶 =====
  TEXT_MAIN: 0xe8d5f5,       // 主文字（淡紫白）
  TEXT_BODY: 0xb0a8c8,       // 正文（灰紫）
  TEXT_DIM: 0x7f6a8e,        // 次要/说明（暗紫）
  TEXT_GOLD: 0xffd700,       // 金色数字（资源/费用）

  // ===== 状态色 =====
  HP_GREEN: 0x2ecc71,        // 生命条/成功
  HP_YELLOW: 0xf1c40f,       // 警告（中血量）
  HP_RED: 0xe74c3c,          // 危险（低血量/敌方）
  WARN: 0xff6644,            // 警告文字
  DISABLED: 0x4a4055,        // 禁用态灰

  // ===== 项目类别色（生产队列/命令卡分类）=====
  KIND_BUILD: 0xe67e22,      // 建造（橙）
  KIND_TRAIN: 0x2ecc71,      // 训练（绿）
  KIND_RESEARCH: 0x9b59b6,   // 研究（紫）
  KIND_HERO: 0xffd700,       // 英雄（金）
  KIND_SUPERWEAPON: 0xe74c3c,// 超武（红）

  // ===== 小地图地形 =====
  MM_WATER: 0x2244aa,
  MM_MOUNTAIN: 0x555555,
  MM_FOREST: 0x1a3a1a,
  MM_GRASS: 0x2d5a27,
  MM_FRIENDLY: 0x2ecc71,
  MM_ENEMY: 0xe74c3c,
  MM_RESOURCE: 0x44aaff,
  MM_VIEW: 0xffffff,
} as const;

/** CSS 字符串色值（Phaser.Text 的 color / backgroundColor 用） */
export const ColorHex = {
  PANEL_BG: '#0d0a1a',
  CONSOLE_BG: '#12102a',
  CARD_BG: '#1a1830',
  CARD_HOVER: '#25204a',
  CARD_ACTIVE: '#9b59b6',
  BORDER: '#5e3d78',
  BORDER_DIM: '#3a2a4a',
  ACCENT_GOLD: '#ffd700',
  ACCENT_PURPLE: '#9b59b6',
  TEXT_MAIN: '#e8d5f5',
  TEXT_BODY: '#b0a8c8',
  TEXT_DIM: '#7f6a8e',
  TEXT_GOLD: '#ffd700',
  HP_GREEN: '#2ecc71',
  HP_YELLOW: '#f1c40f',
  HP_RED: '#e74c3c',
  WARN: '#ff6644',
  DISABLED: '#4a4055',
  KIND_BUILD: '#e67e22',
  KIND_TRAIN: '#2ecc71',
  KIND_RESEARCH: '#9b59b6',
  KIND_HERO: '#ffd700',
  KIND_SUPERWEAPON: '#e74c3c',
  MM_WATER: '#2244aa',
  MM_MOUNTAIN: '#555555',
  MM_FOREST: '#1a3a1a',
  MM_GRASS: '#2d5a27',
  MM_FRIENDLY: '#2ecc71',
  MM_ENEMY: '#e74c3c',
  MM_RESOURCE: '#44aaff',
  MM_VIEW: '#ffffff',
} as const;

/** 字体栈 — 无自定义字体文件，使用系统等宽/无衬线栈，比 'Arial' 更有质感 */
export const FontFamily = {
  /** 主字体：偏正式的无衬线（标题/面板） */
  DISPLAY: "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  /** 正文字体：常规无衬线 */
  BODY: "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  /** 数字/等宽（资源、计数、计时） */
  MONO: "'Consolas', 'SF Mono', 'Courier New', monospace",
} as const;

/** 字号阶（px 字符串，便于直接传入 Phaser.Text fontSize） */
export const Font = {
  TITLE: '28px',     // 大标题（主菜单）
  H1: '22px',        // 一级标题（面板/模态标题）
  H2: '18px',        // 二级标题
  BASE: '14px',      // 正文
  SM: '12px',        // 小字
  TINY: '10px',      // 极小字（费用/热键/截断描述）
  MICRO: '9px',      // 微字（超武 cd）
} as const;

/** 间距与尺寸常量（px） */
export const Spacing = {
  XS: 2,
  SM: 4,
  MD: 8,
  LG: 12,
  XL: 16,
  XXL: 24,
} as const;

/** 圆角半径 */
export const Radius = {
  SM: 4,
  MD: 6,
  LG: 8,
  XL: 12,
} as const;

/**
 * 阵营色相 — 与 MenuScene.ts 的 FACTIONS 定义保持一致
 * 帝国靛紫 / 联邦橙 / 霜脊冰蓝 / 翡翠翠绿
 */
export interface FactionPalette {
  primary: number;     // 主色（描边/高亮）
  primaryHex: string;
  dark: number;        // 暗色（填充底）
  darkHex: string;
  glow: number;        // 发光色（淡主色，用于氛围）
}

export const FACTION_PALETTE: Record<string, FactionPalette> = {
  arcane_empire:      { primary: 0x6a4fff, primaryHex: '#6a4fff', dark: 0x2a1f5e, darkHex: '#2a1f5e', glow: 0x9b8fff },
  hammer_federation:  { primary: 0xff6a2e, primaryHex: '#ff6a2e', dark: 0x5e2a1a, darkHex: '#5e2a1a', glow: 0xff9a6a },
  frostridge_kingdom: { primary: 0x5ec8ff, primaryHex: '#5ec8ff', dark: 0x1a3a5e, darkHex: '#1a3a5e', glow: 0x9adcff },
  jade_confederation: { primary: 0x3cd08f, primaryHex: '#3cd08f', dark: 0x1a4e3a, darkHex: '#1a4e3a', glow: 0x6ce0b0 },
};

/** 默认（无阵营时）回退色 */
export const FACTION_DEFAULT: FactionPalette = {
  primary: Color.ACCENT_PURPLE,
  primaryHex: ColorHex.ACCENT_PURPLE,
  dark: Color.CARD_BG,
  darkHex: ColorHex.CARD_BG,
  glow: Color.ACCENT_PURPLE,
};

/** 取阵营色相，未知 id 回退默认 */
export function getFactionPalette(factionId?: string): FactionPalette {
  if (factionId && FACTION_PALETTE[factionId]) return FACTION_PALETTE[factionId];
  return FACTION_DEFAULT;
}

/** HP 百分比 → 颜色（绿→黄→红渐变） */
export function hpColor(pct: number): number {
  if (pct >= 0.6) return Color.HP_GREEN;
  if (pct >= 0.3) return Color.HP_YELLOW;
  return Color.HP_RED;
}

/** HP 百分比 → CSS 色字符串 */
export function hpColorHex(pct: number): string {
  if (pct >= 0.6) return ColorHex.HP_GREEN;
  if (pct >= 0.3) return ColorHex.HP_YELLOW;
  return ColorHex.HP_RED;
}

/** 统一导出（T.Color / T.Font / T.Spacing 范式） */
export const UITheme = {
  Color,
  ColorHex,
  FontFamily,
  Font,
  Spacing,
  Radius,
  FACTION_PALETTE,
  FACTION_DEFAULT,
  getFactionPalette,
  hpColor,
  hpColorHex,
};

export type UIThemeType = typeof UITheme;
