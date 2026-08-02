/**
 * UIWidget — 可复用的 UI 绘制工具
 *
 * 在 Phaser Graphics / Text / Rectangle 之上封装"魔导工业"风格的常用绘制：
 * - drawPanel:    圆角面板 + 金/紫描边 + 可选顶部高光线
 * - drawButton:   命令槽按钮（含 hover/active/disabled 状态）
 * - drawProgressBar: 进度条（轨道 + 填充 + 类别色）
 * - makeHitArea:  透明点击热区
 *
 * 设计原则：
 * 1. 每个函数返回创建的 GameObject，调用方负责加入 container / 销毁
 * 2. 所有色值取自 UITheme，不再硬编码 hex
 * 3. 重绘遵循"先 clear 再绘"模式，避免内存泄漏
 * 4. 与现有组件接口兼容（hover/out 回调风格一致）
 */
import Phaser from 'phaser';
import { UITheme as T } from './UITheme';

/** 面板描边风格 */
export type PanelBorder = 'gold' | 'purple' | 'dim' | 'faction';

export interface DrawPanelOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 填充色（默认 CARD_BG）；若传 'console' 用 CONSOLE_BG */
  fill?: number | 'console';
  /** 填充透明度，默认 0.92 */
  fillAlpha?: number;
  /** 描边风格，默认 'dim' */
  border?: PanelBorder;
  /** 描边宽度，默认 1（gold/purple 默认 2） */
  borderWidth?: number;
  /** 圆角半径，默认 Radius.MD */
  radius?: number;
  /** 是否绘制顶部一条淡金高光（控制台质感），默认 false */
  topGlow?: boolean;
  /** 阵营 id，border='faction' 时取该阵营主色描边 */
  factionId?: string;
}

/** 绘制圆角面板到指定 Graphics。返回该 Graphics（调用方需加入显示列表） */
export function drawPanel(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, opts: DrawPanelOptions): Phaser.GameObjects.Graphics {
  const {
    x, y, w, h,
    fill = T.Color.CARD_BG,
    fillAlpha = 0.92,
    border = 'dim',
    radius = T.Radius.MD,
    topGlow = false,
    factionId,
  } = opts;

  const fillColor = fill === 'console' ? T.Color.CONSOLE_BG : fill;
  let borderColor: number;
  let borderWidth = opts.borderWidth;
  switch (border) {
    case 'gold':   borderColor = T.Color.ACCENT_GOLD;   borderWidth = borderWidth ?? 2; break;
    case 'purple': borderColor = T.Color.ACCENT_PURPLE; borderWidth = borderWidth ?? 2; break;
    case 'faction':{
      const pal = T.getFactionPalette(factionId);
      borderColor = pal.primary;
      borderWidth = borderWidth ?? 2;
      break;
    }
    case 'dim':
    default:       borderColor = T.Color.BORDER;        borderWidth = borderWidth ?? 1; break;
  }

  g.clear();
  // 主体填充
  g.fillStyle(fillColor, fillAlpha);
  g.fillRoundedRect(x, y, w, h, radius);
  // 描边
  g.lineStyle(borderWidth, borderColor, 1);
  g.strokeRoundedRect(x, y, w, h, radius);
  // 顶部高光（薄一条淡金，模拟金属反光）
  if (topGlow) {
    g.lineStyle(1, T.Color.ACCENT_GOLD, 0.25);
    g.beginPath();
    g.moveTo(x + radius + 2, y + 1);
    g.lineTo(x + w - radius - 2, y + 1);
    g.strokePath();
  }
  return g;
}

/** 按钮状态 */
export type ButtonState = 'normal' | 'hover' | 'active' | 'disabled';

export interface DrawButtonOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  state?: ButtonState;
  /** 圆角半径，默认 Radius.MD */
  radius?: number;
  /** 描边风格，默认 'dim'；active 时自动转 gold */
  border?: PanelBorder;
  factionId?: string;
}

/** 绘制命令槽按钮背景到指定 Graphics（hover/active/disabled 状态自动取色） */
export function drawButton(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, opts: DrawButtonOptions): Phaser.GameObjects.Graphics {
  const { x, y, w, h, state = 'normal', radius = T.Radius.MD, factionId } = opts;

  let fill: number;
  let border: number;
  let borderWidth: number;
  let alpha: number;
  switch (state) {
    case 'active':
      fill = T.Color.CARD_ACTIVE; border = T.Color.ACCENT_GOLD;   borderWidth = 2; alpha = 0.95; break;
    case 'hover':
      fill = T.Color.CARD_HOVER;  border = T.Color.ACCENT_PURPLE; borderWidth = 2; alpha = 0.95; break;
    case 'disabled':
      fill = T.Color.PANEL_BG;    border = T.Color.BORDER_DIM;    borderWidth = 1; alpha = 0.85; break;
    case 'normal':
    default:
      fill = T.Color.CARD_BG;     border = T.Color.BORDER;        borderWidth = 1; alpha = 0.92; break;
  }
  // faction 描边覆盖（normal/hover 时用阵营色）
  if (opts.border === 'faction' && state !== 'disabled' && state !== 'active') {
    border = T.getFactionPalette(factionId).primary;
  }

  g.clear();
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(borderWidth, border, 1);
  g.strokeRoundedRect(x, y, w, h, radius);
  return g;
}

export interface ProgressBarOptions {
  x: number;
  y: number;
  w: number;
  h?: number;
  pct: number;            // 0..1
  fillColor?: number;     // 默认 HP_GREEN
  trackColor?: number;    // 默认 0x333333
  radius?: number;
}

/** 绘制进度条（轨道 + 填充）。返回 [trackRect, fillRect] 两个 Rectangle，调用方负责 add/destroy */
export function drawProgressBar(scene: Phaser.Scene, opts: ProgressBarOptions): [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Rectangle] {
  const { x, y, w, h = 8, pct, fillColor = T.Color.HP_GREEN, trackColor = 0x333333, radius = 0 } = opts;
  const clamped = Math.max(0, Math.min(1, pct));
  const track = scene.add.rectangle(x, y, w, h, trackColor).setOrigin(0);
  const fill = scene.add.rectangle(x, y, Math.max(0, w * clamped), h, fillColor).setOrigin(0);
  if (radius > 0) {
    // Phaser Rectangle 无圆角，保持矩形；radius 仅作未来兼容占位
  }
  return [track, fill];
}

/** 创建透明点击热区 */
export function makeHitArea(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
}

// ===== 皮肤化 (NineSlice) =====

export interface SkinPanelOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 皮肤纹理 key (如 skin_panel_console) */
  skinKey: string;
  /** 九宫格四角切片尺寸 (默认 16) */
  corner?: number;
  /** 透明度, 默认 1 */
  alpha?: number;
}

/** 用 NineSlice 皮肤绘制面板底。纹理缺失时回退 drawPanel 纯色 */
export function drawPanelSkin(scene: Phaser.Scene, opts: SkinPanelOptions): Phaser.GameObjects.NineSlice | Phaser.GameObjects.Graphics {
  const { x, y, w, h, skinKey, corner = 16, alpha = 1 } = opts;
  if (scene.textures.exists(skinKey)) {
    const ns = scene.add.nineslice(x, y, skinKey, undefined, w, h, corner, corner, corner, corner).setOrigin(0).setAlpha(alpha);
    return ns;
  }
  // 回退: 纯色面板
  const g = scene.add.graphics();
  drawPanel(scene, g, { x, y, w, h, border: 'dim' });
  g.setAlpha(alpha);
  return g;
}

export interface SkinButtonOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 三态皮肤 key */
  skinNormal: string;
  skinHover?: string;
  skinActive?: string;
  skinDisabled?: string;
  state?: ButtonState;
  corner?: number;
}

/** 用 NineSlice 皮肤绘制按钮底。state 决定用哪张皮肤; 纹理缺失回退 drawButton */
export function drawButtonSkin(scene: Phaser.Scene, opts: SkinButtonOptions): Phaser.GameObjects.NineSlice | Phaser.GameObjects.Graphics {
  const { x, y, w, h, skinNormal, skinHover, skinActive, skinDisabled, state = 'normal', corner = 8 } = opts;
  const keyMap: Record<ButtonState, string> = {
    normal: skinNormal,
    hover: skinHover ?? skinNormal,
    active: skinActive ?? skinNormal,
    disabled: skinDisabled ?? skinNormal,
  };
  const key = keyMap[state];
  if (scene.textures.exists(key)) {
    return scene.add.nineslice(x, y, key, undefined, w, h, corner, corner, corner, corner).setOrigin(0);
  }
  const g = scene.add.graphics();
  drawButton(scene, g, { x, y, w, h, state });
  return g;
}

/** 切换已有 NineSlice 按钮的皮肤 (hover/active 时替换纹理) */
export function setButtonSkinState(ns: Phaser.GameObjects.NineSlice, opts: SkinButtonOptions, state: ButtonState): void {
  const keyMap: Record<ButtonState, string> = {
    normal: opts.skinNormal,
    hover: opts.skinHover ?? opts.skinNormal,
    active: opts.skinActive ?? opts.skinNormal,
    disabled: opts.skinDisabled ?? opts.skinNormal,
  };
  const key = keyMap[state];
  if (ns.scene.textures.exists(key)) ns.setTexture(key);
}

// ===== 光影辅助 =====

/** 外发光 (在目标四周绘制柔和的辉光圈, 用多层递增矩形模拟) */
export function drawOuterGlow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, layers = 3): void {
  for (let i = layers; i >= 1; i--) {
    const pad = i * 2;
    const alpha = 0.06 * (layers - i + 1);
    g.fillStyle(color, alpha);
    g.fillRoundedRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 6 + pad);
  }
}

/** 内阴影 (顶部暗边, 模拟凹陷) */
export function drawInsetShadow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, radius = 4): void {
  g.fillStyle(0x000000, 0.3);
  g.fillRoundedRect(x, y, w, 3, { tl: radius, tr: radius, bl: 0, br: 0 });
}

/** 为按钮绑定 hover/out 重绘回调（沿用现有组件的 graphics.clear+重绘 模式） */
export function bindButtonHover(
  hitArea: Phaser.GameObjects.Rectangle,
  redraw: (state: ButtonState) => void,
  onHoverExtra?: (pointer: Phaser.Input.Pointer) => void,
  onOutExtra?: () => void,
): void {
  hitArea.on('pointerover', (pointer: Phaser.Input.Pointer) => {
    redraw('hover');
    onHoverExtra?.(pointer);
  });
  hitArea.on('pointerout', () => {
    redraw('normal');
    onOutExtra?.();
  });
}

/** 统一文字样式构造器 — 减少各组件重复的 TextStyle 字面量 */
export interface TextStyleOpts {
  size?: string;        // 默认 Font.BASE
  color?: string;       // 默认 ColorHex.TEXT_MAIN
  family?: string;      // 默认 FontFamily.BODY
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  wrapWidth?: number;
  backgroundColor?: string;
  padding?: { x: number; y: number };
}

export function textStyle(opts: TextStyleOpts = {}): Phaser.Types.GameObjects.Text.TextStyle {
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontSize: opts.size ?? T.Font.BASE,
    color: opts.color ?? T.ColorHex.TEXT_MAIN,
    fontFamily: opts.family ?? T.FontFamily.BODY,
    align: opts.align ?? 'left',
  };
  if (opts.bold) style.fontStyle = 'bold';
  if (opts.wrapWidth) style.wordWrap = { width: opts.wrapWidth };
  if (opts.backgroundColor) style.backgroundColor = opts.backgroundColor;
  if (opts.padding) style.padding = opts.padding;
  return style;
}

/** 统一导出 */
export const UIWidget = {
  drawPanel,
  drawButton,
  drawProgressBar,
  makeHitArea,
  bindButtonHover,
  textStyle,
  drawPanelSkin,
  drawButtonSkin,
  setButtonSkinState,
  drawOuterGlow,
  drawInsetShadow,
};

export type UIWidgetType = typeof UIWidget;
