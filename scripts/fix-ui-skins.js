/**
 * UI 皮肤资产修正脚本 (视觉验收后)
 *
 * 1. skin_btn_*: trim 去掉按钮周围的深色底, 重缩放到 96×32
 * 2. skin_card: 裁掉底部 6% (水印残字), 重缩放 96×96
 * 3. ui_menu_bg: 裁掉底部 9% (豆包水印), 重缩放 1280×720
 * 4. ui_frame_portrait / ui_minimap_frame: 中央打孔透明 (镂空相框)
 */

const path = require('path');
const sharp = require('sharp');

const DIR = path.resolve(__dirname, '..', 'public', 'assets', 'sprites');

async function trimAndResize(key, w, h) {
  const p = path.join(DIR, `${key}.png`);
  await sharp(p).trim({ threshold: 12 }).resize(w, h, { fit: 'fill' }).png().toFile(p + '.tmp');
  require('fs').renameSync(p + '.tmp', p);
  console.log(`  ✓ ${key}: trim → ${w}×${h}`);
}

async function cropBottomAndResize(key, cutPct, w, h) {
  const p = path.join(DIR, `${key}.png`);
  const meta = await sharp(p).metadata();
  const keepH = Math.round(meta.height * (1 - cutPct));
  await sharp(p)
    .extract({ left: 0, top: 0, width: meta.width, height: keepH })
    .resize(w, h, { fit: 'fill' })
    .png().toFile(p + '.tmp');
  require('fs').renameSync(p + '.tmp', p);
  console.log(`  ✓ ${key}: 裁底 ${cutPct * 100}% → ${w}×${h}`);
}

async function punchHole(key, innerPct) {
  const p = path.join(DIR, `${key}.png`);
  const meta = await sharp(p).metadata();
  const W = meta.width, H = meta.height;
  const iw = Math.round(W * innerPct), ih = Math.round(H * innerPct);
  const left = Math.round((W - iw) / 2), top = Math.round((H - ih) / 2);
  // dest-out: 用不透明方块擦除中央区域
  const hole = await sharp({
    create: { width: iw, height: ih, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  }).png().toBuffer();
  await sharp(p).ensureAlpha()
    .composite([{ input: hole, left, top, blend: 'dest-out' }])
    .png().toFile(p + '.tmp');
  require('fs').renameSync(p + '.tmp', p);
  console.log(`  ✓ ${key}: 中央打孔 ${Math.round(innerPct * 100)}% 镂空`);
}

async function main() {
  await trimAndResize('skin_btn_normal', 96, 32);
  await trimAndResize('skin_btn_hover', 96, 32);
  await trimAndResize('skin_btn_active', 96, 32);
  await cropBottomAndResize('skin_card', 0.06, 96, 96);
  await cropBottomAndResize('ui_menu_bg', 0.09, 1280, 720);
  await punchHole('ui_frame_portrait', 0.72);
  await punchHole('ui_minimap_frame', 0.82);
  console.log('修正完成');
}

main().catch((e) => { console.error(e); process.exit(1); });
