/**
 * UI 皮肤缩放脚本 — 将豆包生成的 UI 皮肤 PNG 缩放至游戏设计尺寸
 *
 * 输入: output/ui_skin/*.png (已去水印, 图标类已去背景)
 * 输出: public/assets/sprites/{key}.png
 *
 * 皮肤类 (9-slice) 精确缩放到设计尺寸; 图标/装饰类按 2x 显示尺寸缩放保证清晰。
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC_DIR = path.resolve(__dirname, '..', 'output', 'ui_skin');
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'sprites');

// key → [w, h]
const SIZE_MAP = {
  skin_panel_console: [256, 192],
  skin_panel_top: [256, 48],
  skin_btn_normal: [96, 32],
  skin_btn_hover: [96, 32],
  skin_btn_active: [96, 32],
  skin_card: [96, 96],
  ui_icon_crystal: [48, 48],
  ui_icon_industry: [48, 48],
  ui_icon_supply: [48, 48],
  ui_icon_timer: [48, 48],
  ui_deco_gear: [96, 96],
  ui_frame_portrait: [144, 144],
  ui_minimap_frame: [280, 280],
  ui_menu_bg: [1280, 720],
  ui_logo: [400, 160],
};

async function main() {
  let ok = 0, missing = 0;
  for (const [key, [w, h]] of Object.entries(SIZE_MAP)) {
    const src = path.join(SRC_DIR, `${key}.png`);
    const dst = path.join(OUT_DIR, `${key}.png`);
    if (!fs.existsSync(src)) {
      console.log(`  ⚠ 源文件缺失, 跳过: ${key}.png`);
      missing++;
      continue;
    }
    await sharp(src)
      .resize(w, h, { fit: 'fill' })
      .png()
      .toFile(dst);
    console.log(`  ✓ ${key}.png → ${w}×${h}`);
    ok++;
  }
  console.log(`\n完成: ${ok} 缩放, ${missing} 缺失`);
}

main().catch((e) => { console.error(e); process.exit(1); });
