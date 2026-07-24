/**
 * sprites.ts 数据完整性测试 - PNG_SPRITE_KEYS 结构/磁盘匹配/实体引用
 *
 * L1 单元：纯数据校验，依赖 fs 读取磁盘 PNG（vitest node 环境支持）。
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore - tsconfig has no @types/node, vitest provides fs at runtime
import * as fs from 'fs';
// @ts-ignore
import * as path from 'path';
import { PNG_SPRITE_KEYS } from './sprites';
import { UNIT_DEFS, BUILDING_DEFS } from './unitData';
import { HERO_DEFS } from './heroData';

// @ts-ignore
const SPRITE_DIR = path.resolve(__dirname as unknown as string, '../../public/assets/sprites');

describe('PNG_SPRITE_KEYS - 结构', () => {
  it('是非空数组', () => {
    expect(PNG_SPRITE_KEYS.length).toBeGreaterThan(0);
  });

  it('无重复 key', () => {
    expect(new Set(PNG_SPRITE_KEYS).size).toBe(PNG_SPRITE_KEYS.length);
  });

  it('所有 key 匹配命名规范 ^(unit_|bld_|hero_|proj_|ui_)[a-z_]+$', () => {
    for (const key of PNG_SPRITE_KEYS) {
      expect(key).toMatch(/^(unit_|bld_|hero_|proj_|ui_)[a-z_]+$/);
    }
  });
});

describe('PNG_SPRITE_KEYS - 磁盘文件匹配', () => {
  it('每个 PNG_SPRITE_KEYS 都有对应 {key}.png', () => {
    for (const key of PNG_SPRITE_KEYS) {
      expect(fs.existsSync(path.join(SPRITE_DIR, `${key}.png`))).toBe(true);
    }
  });

  it('磁盘上的 PNG 孤儿文件 (不在 PNG_SPRITE_KEYS 中)', () => {
    const files = fs.readdirSync(SPRITE_DIR)
      .filter((f: string) => f.endsWith('.png'))
      .map((f: string) => f.replace(/\.png$/, ''));
    const keySet = new Set(PNG_SPRITE_KEYS);
    const orphans = files.filter((f: string) => !keySet.has(f as any));
    // 当前已知孤儿: unit_basic_turret (AssetGenerator 仍画但 UNIT_DEFS 已移除)
    expect(orphans).toEqual(['unit_basic_turret']);
  });
});

describe('PNG_SPRITE_KEYS - 实体定义正向引用', () => {
  it('每个 UNIT_DEFS key 都在 PNG_SPRITE_KEYS 中', () => {
    const set = new Set(PNG_SPRITE_KEYS);
    for (const key of Object.keys(UNIT_DEFS)) {
      expect(set.has(key as any)).toBe(true);
    }
  });

  it('每个 HERO_DEFS key 都在 PNG_SPRITE_KEYS 中', () => {
    const set = new Set(PNG_SPRITE_KEYS);
    for (const key of Object.keys(HERO_DEFS)) {
      expect(set.has(key as any)).toBe(true);
    }
  });

  it('每个 BUILDING_DEFS key 都在 PNG_SPRITE_KEYS 中', () => {
    const set = new Set(PNG_SPRITE_KEYS);
    for (const key of Object.keys(BUILDING_DEFS)) {
      expect(set.has(key as any)).toBe(true);
    }
  });

  it('每个非 melee attackEffect 都在 PNG_SPRITE_KEYS 中', () => {
    const set = new Set(PNG_SPRITE_KEYS);
    for (const def of Object.values(UNIT_DEFS)) {
      if (def.attackEffect !== 'melee') {
        expect(set.has(def.attackEffect as any)).toBe(true);
      }
    }
  });
});

describe('PNG_SPRITE_KEYS - 反向引用 (孤儿检测)', () => {
  it('每个 unit_/bld_/hero_ 前缀的 key 都有对应实体定义', () => {
    const entityKeys = new Set([
      ...Object.keys(UNIT_DEFS),
      ...Object.keys(HERO_DEFS),
      ...Object.keys(BUILDING_DEFS),
    ]);
    const orphans = PNG_SPRITE_KEYS.filter(
      k => /^(unit_|bld_|hero_)/.test(k) && !entityKeys.has(k),
    );
    expect(orphans).toEqual([]);
  });
});
