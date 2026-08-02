/**
 * UITheme 单元测试 - 纯常量模块，无需 mock phaser
 *
 * 断言点：
 * - 色值常量 number 与 string 双形式一致
 * - 阵营色相映射正确（四阵营 + 未知回退）
 * - hpColor 阶梯（绿/黄/红）
 * - 字号/间距/圆角常量存在且非空
 */
import { describe, it, expect } from 'vitest';
import { UITheme as T, Color, ColorHex, FACTION_PALETTE, FACTION_DEFAULT, getFactionPalette, hpColor, hpColorHex } from './UITheme';

describe('UITheme - 色值常量', () => {
  it('Color 与 ColorHex 键集一致', () => {
    expect(Object.keys(Color).sort()).toEqual(Object.keys(ColorHex).sort());
  });

  it('number 与 string 形式数值一致', () => {
    // PANEL_BG: 0x0d0a1a => '#0d0a1a'
    expect(ColorHex.PANEL_BG).toBe('#' + Color.PANEL_BG.toString(16).padStart(6, '0'));
    expect(ColorHex.ACCENT_GOLD).toBe('#' + Color.ACCENT_GOLD.toString(16).padStart(6, '0'));
  });

  it('关键色值非空且合理', () => {
    expect(Color.PANEL_BG).toBeGreaterThan(0);
    expect(Color.ACCENT_GOLD).toBe(0xffd700);
    expect(Color.ACCENT_PURPLE).toBe(0x9b59b6);
  });
});

describe('UITheme - 阵营色相', () => {
  it('四阵营均有 primary/dark/glow', () => {
    for (const id of ['arcane_empire', 'hammer_federation', 'frostridge_kingdom', 'jade_confederation']) {
      const pal = FACTION_PALETTE[id];
      expect(pal).toBeDefined();
      expect(pal.primary).toBeGreaterThan(0);
      expect(pal.dark).toBeGreaterThan(0);
      expect(pal.glow).toBeGreaterThan(0);
      expect(pal.primaryHex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('帝国靛紫 / 联邦橙 / 霜脊冰蓝 / 翡翠翠绿 主色值', () => {
    expect(FACTION_PALETTE.arcane_empire.primary).toBe(0x6a4fff);
    expect(FACTION_PALETTE.hammer_federation.primary).toBe(0xff6a2e);
    expect(FACTION_PALETTE.frostridge_kingdom.primary).toBe(0x5ec8ff);
    expect(FACTION_PALETTE.jade_confederation.primary).toBe(0x3cd08f);
  });

  it('getFactionPalette 未知 id 回退默认', () => {
    const pal = getFactionPalette('unknown_faction');
    expect(pal.primary).toBe(FACTION_DEFAULT.primary);
  });

  it('getFactionPalette 空值回退默认', () => {
    expect(getFactionPalette(undefined).primary).toBe(FACTION_DEFAULT.primary);
  });
});

describe('UITheme - hpColor 阶梯', () => {
  it('>=0.6 绿', () => {
    expect(hpColor(1.0)).toBe(Color.HP_GREEN);
    expect(hpColor(0.6)).toBe(Color.HP_GREEN);
  });
  it('0.3..0.6 黄', () => {
    expect(hpColor(0.5)).toBe(Color.HP_YELLOW);
    expect(hpColor(0.3)).toBe(Color.HP_YELLOW);
  });
  it('<0.3 红', () => {
    expect(hpColor(0.29)).toBe(Color.HP_RED);
    expect(hpColor(0)).toBe(Color.HP_RED);
  });
  it('hex 版本与 number 版本对应', () => {
    expect(hpColorHex(0.8)).toBe(ColorHex.HP_GREEN);
    expect(hpColorHex(0.4)).toBe(ColorHex.HP_YELLOW);
    expect(hpColorHex(0.1)).toBe(ColorHex.HP_RED);
  });
});

describe('UITheme - 字号/间距/圆角', () => {
  it('Font 阶存在且递减', () => {
    const sizes = [T.Font.TITLE, T.Font.H1, T.Font.H2, T.Font.BASE, T.Font.SM, T.Font.TINY, T.Font.MICRO];
    const nums = sizes.map(s => parseInt(s, 10));
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i]).toBeLessThanOrEqual(nums[i - 1]);
    }
  });
  it('Spacing 递增', () => {
    expect(T.Spacing.XS).toBeLessThan(T.Spacing.SM);
    expect(T.Spacing.SM).toBeLessThan(T.Spacing.MD);
    expect(T.Spacing.MD).toBeLessThan(T.Spacing.LG);
  });
  it('Radius 存在', () => {
    expect(T.Radius.MD).toBeGreaterThan(0);
    expect(T.Radius.LG).toBeGreaterThan(T.Radius.MD);
  });
});
