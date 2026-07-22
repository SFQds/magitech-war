/**
 * 英雄数据配置 — 5级技能树完整定义
 */

import type { HeroData } from '../entities/Hero';

export const HERO_DEFS: Record<string, HeroData> = {
  'hero_isabelle': {
    displayName: '伊莎贝尔',
    title: '默库里合金发明者',
    faction: 'arcane_empire',
    stats: {
      hp: 350, armor: 'light', speed: 2.2,
      damage: 40, dmgType: 'magic', range: 7,
      cooldown: 1.5, sight: 8,
    },
    armorValue: 8,
    auraRadius: 8,
    passive: '贤者之石：周围8格友方每秒+2HP',
    active: { name: '默库里合金镀层', cooldown: 30, description: '为受伤最重的友军+200护盾，直至被打掉' },
    skillTree: [
      // Lv1: 主动技能① — 默库里合金镀层
      { name: '默库里合金镀层', cooldown: 30, description: '为受伤最重的友军+200护盾，直至被打掉' },
      // Lv2: 升级主动① — 镀层+
      { name: '镀层+', cooldown: 25, description: '护盾提升至350，免疫debuff' },
      // Lv3: 主动技能② — 炼金转化
      { name: '炼金转化', cooldown: 60, description: '范围内敌方攻击延迟3秒' },
      // Lv4: 升级主动② — 转化+
      { name: '转化+', cooldown: 45, description: '投射物以50%伤害反弹' },
      // Lv5: 终极技能 — 贤者之雨
      { name: '贤者之雨', cooldown: 120, description: '大范围友军+150HP' },
    ],
    reviveCooldown: 180,
    cost: { crystal: 800, supply: 5, time: 40 },
  },
  'hero_marcus': {
    displayName: '马库斯',
    title: '铁砧重工第三代厂长',
    faction: 'hammer_federation',
    stats: {
      hp: 1000, armor: 'heavy', speed: 1.5,
      damage: 70, dmgType: 'physical', range: 4,
      cooldown: 2.5, sight: 6,
    },
    armorValue: 25,
    auraRadius: 12,
    passive: '厂长光环：周围12格生产建筑训练速度+20%',
    active: { name: '流水线空投', cooldown: 35, description: '空投3个水晶步枪兵' },
    skillTree: [
      // Lv1: 主动技能① — 流水线空投
      { name: '流水线空投', cooldown: 35, description: '空投3个水晶步枪兵' },
      // Lv2: 升级主动① — 空投+
      { name: '空投+', cooldown: 30, description: '空投5步枪兵+1突击工兵' },
      // Lv3: 主动技能② — 紧急修复协议
      { name: '紧急修复协议', cooldown: 50, description: '自身+周围机械每秒+5%HP，持续10秒' },
      // Lv4: 升级主动② — 修复+
      { name: '修复+', cooldown: 40, description: '+8%/秒，免疫控制' },
      // Lv5: 终极技能 — 全功率运转
      { name: '全功率运转', cooldown: 200, description: '对周围5格敌人造成150物理伤害' },
    ],
    reviveCooldown: 180,
    cost: { crystal: 800, supply: 5, time: 40 },
  },
};

/** 获取阵营对应的英雄ID */
export function getFactionHero(faction: string): string | undefined {
  if (faction === 'arcane_empire') return 'hero_isabelle';
  if (faction === 'hammer_federation') return 'hero_marcus';
  return undefined;
}