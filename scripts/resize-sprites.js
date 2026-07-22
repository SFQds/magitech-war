/**
 * 精灵缩放脚本 — 将豆包桌面生成的高分辨率 PNG 缩放至游戏设计尺寸
 *
 * 规则：
 * - 先将原图备份到 public/assets/sprites/_originals/
 * - 按设计规格缩放（单位 64²、载具/机甲 96²、建筑 96²、CC 128²、城墙 32²）
 * - 弹道类保持原尺寸（仅补全 Alpha 通道）
 * - 自动补全缺失的 Alpha 通道
 * - 全异步顺序处理，带完整统计输出
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SPRITES_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'sprites');
const BACKUP_DIR = path.join(SPRITES_DIR, '_originals');

// 目标尺寸映射（单位：像素），0 表示保持原始尺寸（仅补全 Alpha）
const SIZE_MAP = {
  // === 单位 (64×64) ===
  'unit_worker': 64,
  'unit_rifleman': 64,
  'unit_arcane_heavy': 64,
  'unit_battle_mage': 64,
  'unit_basic_turret': 64,
  'unit_arcane_guard': 64,
  'unit_hammer_squad': 64,
  'unit_grenadier': 64,
  'unit_assault_worker': 64,

  // === 载具/机甲 (96×96) ===
  'unit_magitech_mech': 96,
  'unit_scout_bike': 96,
  'unit_transport': 96,

  // === 特殊单位 ===
  'unit_void_probe': 32,

  // === 英雄 (96×96) ===
  'hero_isabelle': 96,
  'hero_marcus': 96,

  // === 建筑 (96×96) ===
  'bld_barracks': 96,
  'bld_factory': 96,
  'bld_refinery': 96,
  'bld_power_plant': 96,
  'bld_ancient_archive': 96,
  'bld_assembly_workshop': 96,

  // === 指挥中心 (128×128) ===
  'bld_cc_empire': 128,
  'bld_cc_federation': 128,

  // === 防御建筑 ===
  'bld_turret': 64,
  'bld_wall': 32,

  // === UI (24×24) ===
  'ui_crystal': 24,

  // === 弹道类 — 保持原尺寸 ===
  'proj_bullet': 0,
  'proj_magic_bolt': 0,
  'proj_cannon': 0,
};

function processFile(file) {
  return new Promise(async (resolve) => {
    const key = path.basename(file, '.png');
    const targetSize = SIZE_MAP[key];
    const srcPath = path.join(SPRITES_DIR, file);
    const backupPath = path.join(BACKUP_DIR, file);

    if (targetSize === undefined) {
      console.log(`⚠️  ${file}: 不在尺寸映射表中，跳过`);
      return resolve({ file, status: 'skipped', before: 0, after: 0 });
    }

    const beforeStat = fs.statSync(srcPath);
    const beforeKB = beforeStat.size / 1024;

    // 先备份原图（如果备份不存在）
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(srcPath, backupPath);
      console.log(`💾 ${file} → _originals/`);
    }

    try {
      const tmpPath = srcPath + '.tmp';
      const pipeline = sharp(srcPath).ensureAlpha().png({ compressionLevel: 9 });

      if (targetSize > 0) {
        pipeline.resize(targetSize, targetSize, {
          fit: 'inside',
          kernel: 'lanczos3',
        });
      }

      await pipeline.toFile(tmpPath);
      fs.renameSync(tmpPath, srcPath);

      const afterStat = fs.statSync(srcPath);
      const afterKB = afterStat.size / 1024;
      const pct = ((1 - afterStat.size / beforeStat.size) * 100).toFixed(1);

      if (targetSize === 0) {
        console.log(`✅ ${file}: 保持原尺寸 + Alpha补全 (${beforeKB.toFixed(1)}KB → ${afterKB.toFixed(1)}KB, -${pct}%)`);
      } else {
        console.log(`✅ ${file}: ${targetSize}×${targetSize} (${beforeKB.toFixed(1)}KB → ${afterKB.toFixed(1)}KB, -${pct}%)`);
      }

      resolve({ file, status: 'ok', before: beforeStat.size, after: afterStat.size, targetSize });
    } catch (err) {
      console.error(`❌ ${file}: ${err.message}`);
      resolve({ file, status: 'error', before: beforeStat.size, after: beforeStat.size, error: err.message });
    }
  });
}

async function main() {
  // 创建备份目录
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`📁 创建备份目录: ${BACKUP_DIR}`);
  }

  const pngFiles = fs.readdirSync(SPRITES_DIR)
    .filter(f => f.endsWith('.png') && !f.startsWith('_'));

  console.log(`🖼  找到 ${pngFiles.length} 个 PNG 文件\n`);

  const results = [];
  for (const file of pngFiles) {
    const r = await processFile(file);
    results.push(r);
  }

  // 统计
  const totalBefore = results.reduce((s, r) => s + r.before, 0);
  const totalAfter = results.reduce((s, r) => s + r.after, 0);
  const ok = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log('\n═══════════════════════════════════');
  console.log(`📊 处理完成: ${results.length} 个文件`);
  console.log(`   成功: ${ok}  跳过: ${skipped}  失败: ${errors}`);
  console.log(`   总压缩前: ${(totalBefore / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   总压缩后: ${(totalAfter / 1024 / 1024).toFixed(1)} MB`);
  if (totalBefore > 0) {
    console.log(`   节省: ${((1 - totalAfter / totalBefore) * 100).toFixed(1)}%`);
  }
  console.log(`   原图备份: ${BACKUP_DIR}`);
  console.log('═══════════════════════════════════');
}

main().catch(err => {
  console.error('_fatal:', err);
  process.exit(1);
});
