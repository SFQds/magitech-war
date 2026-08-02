/**
 * lore 数据完整性测试 — 世界观 + 故事条目
 */
import { describe, it, expect } from 'vitest';
import { LORE_ENTRIES } from './worldLore';
import { STORY_ENTRIES } from './storyLore';
import { ALL_LORE_ENTRIES, LORE_CODEX_ENTRIES, STORY_CODEX_ENTRIES } from './index';
import { CODEX_ENTRIES, getCodexByCategory, getCodexCategories } from '../codex';

describe('LORE_ENTRIES - 世界观数据完整性', () => {
  it('24 条 (水晶4 + 编年8 + 阵营4 + 行会5 + 谜团4 = 25, 含关系图)', () => {
    expect(LORE_ENTRIES.length).toBeGreaterThanOrEqual(24);
  });

  it('每条有 id/name/chapter/confidence/body', () => {
    for (const e of LORE_ENTRIES) {
      expect(e.id).toBeTruthy();
      expect(e.name).toBeTruthy();
      expect(e.chapter).toBeTruthy();
      expect(typeof e.confidence).toBe('string');
      expect(e.body.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('id 无重复', () => {
    const ids = LORE_ENTRIES.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('chapter 值合法', () => {
    const valid = new Set(['水晶志', '编年史', '阵营志', '行会志', '世界谜团']);
    for (const e of LORE_ENTRIES) {
      expect(valid.has(e.chapter)).toBe(true);
    }
  });

  it('每个 body 段落为非空字符串', () => {
    for (const e of LORE_ENTRIES) {
      for (const para of e.body) {
        expect(typeof para).toBe('string');
        expect(para.length).toBeGreaterThan(5);
      }
    }
  });

  it('四阵营志覆盖 (empire/federation/frostridge/jade)', () => {
    const ids = LORE_ENTRIES.map(e => e.id);
    expect(ids).toContain('lore_faction_empire');
    expect(ids).toContain('lore_faction_federation');
    expect(ids).toContain('lore_faction_frostridge');
    expect(ids).toContain('lore_faction_jade');
  });

  it('四行会志覆盖 (mages/mechanical/alchemy/void)', () => {
    const ids = LORE_ENTRIES.map(e => e.id);
    expect(ids).toContain('lore_guild_mages');
    expect(ids).toContain('lore_guild_mechanical');
    expect(ids).toContain('lore_guild_alchemy');
    expect(ids).toContain('lore_guild_void');
  });
});

describe('STORY_ENTRIES - 故事数据完整性', () => {
  it('21 条故事', () => {
    expect(STORY_ENTRIES.length).toBe(21);
  });

  it('每条有 id/name/era/character/body', () => {
    for (const e of STORY_ENTRIES) {
      expect(e.id).toBeTruthy();
      expect(e.name).toBeTruthy();
      expect(typeof e.era).toBe('string');
      expect(typeof e.character).toBe('string');
      expect(e.body.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('id 无重复', () => {
    const ids = STORY_ENTRIES.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个 body 段落为非空字符串', () => {
    for (const e of STORY_ENTRIES) {
      for (const para of e.body) {
        expect(typeof para).toBe('string');
        expect(para.length).toBeGreaterThan(5);
      }
    }
  });

  it('编号 001-021 全覆盖', () => {
    const ids = STORY_ENTRIES.map(e => e.id);
    for (let n = 1; n <= 21; n++) {
      const prefix = `story_${String(n).padStart(3, '0')}`;
      expect(ids.some(id => id.startsWith(prefix)), `${prefix} missing`).toBe(true);
    }
  });
});

describe('lore/index - 合并到 codex', () => {
  it('LORE_CODEX_ENTRIES 与 LORE_ENTRIES 数量一致', () => {
    expect(LORE_CODEX_ENTRIES.length).toBe(LORE_ENTRIES.length);
  });

  it('STORY_CODEX_ENTRIES 与 STORY_ENTRIES 数量一致', () => {
    expect(STORY_CODEX_ENTRIES.length).toBe(STORY_ENTRIES.length);
  });

  it('ALL_LORE_ENTRIES = lore + story', () => {
    expect(ALL_LORE_ENTRIES.length).toBe(LORE_ENTRIES.length + STORY_ENTRIES.length);
  });

  it('LORE_CODEX_ENTRIES category 全为 lore 且带 lore 字段', () => {
    for (const e of LORE_CODEX_ENTRIES) {
      expect(e.category).toBe('lore');
      expect(e.lore).toBeDefined();
      expect(e.lore!.body.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('STORY_CODEX_ENTRIES category 全为 story 且带 story 字段', () => {
    for (const e of STORY_CODEX_ENTRIES) {
      expect(e.category).toBe('story');
      expect(e.story).toBeDefined();
      expect(e.story!.body.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('CODEX_ENTRIES 包含全部 lore+story (合并成功)', () => {
    for (const e of ALL_LORE_ENTRIES) {
      expect(CODEX_ENTRIES.some(c => c.id === e.id), `${e.id} not in CODEX_ENTRIES`).toBe(true);
    }
  });

  it('图鉴分类含「世界观」和「故事集」', () => {
    const cats = getCodexCategories();
    expect(cats.some(c => c.category === 'lore' && c.label === '世界观')).toBe(true);
    expect(cats.some(c => c.category === 'story' && c.label === '故事集')).toBe(true);
  });

  it('getCodexByCategory("lore") 返回所有世界观条目', () => {
    expect(getCodexByCategory('lore').length).toBe(LORE_ENTRIES.length);
  });

  it('getCodexByCategory("story") 返回所有故事条目', () => {
    expect(getCodexByCategory('story').length).toBe(STORY_ENTRIES.length);
  });

  it('lore/story 条目的 desc 非空 (满足 codex.test 的 desc.length>5 约束)', () => {
    for (const e of ALL_LORE_ENTRIES) {
      expect(e.desc.length).toBeGreaterThan(5);
    }
  });
});
