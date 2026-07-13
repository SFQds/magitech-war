/**
 * 英雄数据配置
 */

import type { HeroData } from '../entities/Hero';

export const HERO_DEFS: Record<string, HeroData> = {
  'hero:isabelle': {
    displayName: '伊莎贝尔',
    title: '默库里合金发明者',
    faction: 'arcane_empire',
    stats: {
      hp: 350, armor: 'light', speed: 2.2,
      damage: 40, dmgType: 'magic', range: 7,
      cooldown: 1.5, sight: 8,
    },
    armorValue: 8,
    passive: '贤者之石：周围8格友方每秒+2HP',
    active: { name: '默库里合金镀层', cooldown: 30, description: '为目标+200护盾，持续20秒' },
    reviveCooldown: 180,
    cost: { crystal: 800, supply: 5, time: 40 },
  },
  'hero:marcus': {
    displayName: '马库斯',
    title: '铁砧重工第三代厂长',
    faction: 'hammer_federation',
    stats: {
      hp: 1000, armor: 'heavy', speed: 1.5,
      damage: 70, dmgType: 'physical', range: 4,
      cooldown: 2.5, sight: 6,
    },
    armorValue: 25,
    passive: '厂长光环：周围12格生产建筑训练速度+20%',
    active: { name: '流水线空投', cooldown: 35, description: '空投3个水晶步枪兵' },
    reviveCooldown: 180,
    cost: { crystal: 800, supply: 5, time: 40 },
  },
};

/** 获取阵营对应的英雄ID */
export function getFactionHero(faction: string): string | undefined {
  if (faction === 'arcane_empire') return 'hero:isabelle';
  if (faction === 'hammer_federation') return 'hero:marcus';
  return undefined;
}