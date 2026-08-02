/**
 * lore 索引 — 把世界观/故事条目转为 CodexEntry 格式，供图鉴统一展示
 *
 * codex.ts 的 CODEX_ENTRIES 在导出时合并本文件的 LORE_CODEX_ENTRIES，
 * 使「世界观」「故事集」分类自动出现在图鉴分类导航。
 */
import { LORE_ENTRIES, type LoreEntry } from './worldLore';
import { STORY_ENTRIES, type StoryEntry } from './storyLore';
import type { CodexEntry } from '../codex';

/** lore 条目的 desc 摘要（取 body 首句，截断至 40 字） */
function loreDesc(entry: LoreEntry): string {
  const first = entry.body[0] ?? '';
  const dot = first.indexOf('。');
  const summary = dot > 0 ? first.slice(0, dot + 1) : first;
  return summary.length > 40 ? summary.slice(0, 40) + '…' : summary;
}

/** story 条目的 desc 摘要（era + character + 首句） */
function storyDesc(entry: StoryEntry): string {
  const head = [entry.era, entry.character].filter(Boolean).join(' · ');
  const first = entry.body[0] ?? '';
  const dot = first.indexOf('。');
  const summary = dot > 0 ? first.slice(0, dot + 1) : first;
  const body = summary.length > 30 ? summary.slice(0, 30) + '…' : summary;
  return head ? `${head}：${body}` : body;
}

/** 把 LoreEntry 转为 CodexEntry（category='lore'，携带 lore 字段） */
function toLoreCodex(entry: LoreEntry): CodexEntry {
  return {
    id: entry.id,
    name: entry.name,
    category: 'lore',
    desc: loreDesc(entry),
    lore: {
      chapter: entry.chapter,
      confidence: entry.confidence,
      body: entry.body,
    },
  };
}

/** 把 StoryEntry 转为 CodexEntry（category='story'，携带 story 字段） */
function toStoryCodex(entry: StoryEntry): CodexEntry {
  return {
    id: entry.id,
    name: entry.name,
    category: 'story',
    desc: storyDesc(entry),
    story: {
      era: entry.era,
      character: entry.character,
      body: entry.body,
    },
  };
}

/** 世界观条目（CodexEntry 格式） */
export const LORE_CODEX_ENTRIES: CodexEntry[] = LORE_ENTRIES.map(toLoreCodex);

/** 故事条目（CodexEntry 格式） */
export const STORY_CODEX_ENTRIES: CodexEntry[] = STORY_ENTRIES.map(toStoryCodex);

/** 全部 lore+story 条目（合并） */
export const ALL_LORE_ENTRIES: CodexEntry[] = [...LORE_CODEX_ENTRIES, ...STORY_CODEX_ENTRIES];

/** lore 章节标签（供图鉴排序/分组） */
export const LORE_CHAPTERS = ['水晶志', '编年史', '阵营志', '行会志', '世界谜团'] as const;
