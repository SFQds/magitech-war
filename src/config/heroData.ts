/**
 * 英雄数据配置 — 5级技能树完整定义
 */

import type { HeroData } from '../entities/Hero';
import { FACTION_DEFS } from './unitData';

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
      { name: '流水线空投', cooldown: 35, description: '空投3个水晶步枪兵' },
      { name: '空投+', cooldown: 30, description: '空投5步枪兵+1突击工兵' },
      { name: '紧急修复协议', cooldown: 50, description: '自身+周围机械每秒+5%HP，持续10秒' },
      { name: '修复+', cooldown: 40, description: '+8%/秒，免疫控制' },
      { name: '全功率运转', cooldown: 200, description: '对周围5格敌人造成150物理伤害' },
    ],
    reviveCooldown: 180,
    cost: { crystal: 800, supply: 5, time: 40 },
  },

  // ============ 新英雄: 塞巴斯蒂安·柯格斯沃 ============
  // 帝国叛逃子爵，符文引擎发明者。从圣殿撬走了三块奥古斯都符石。
  // 阵营: 奥术帝国 + 机械行会 + 炼金协会
  'hero_sebastian': {
    displayName: '塞巴斯蒂安',
    title: '符文引擎发明者',
    faction: 'arcane_empire',
    stats: {
      hp: 800, armor: 'mechanical', speed: 1.8,
      damage: 50, dmgType: 'physical', range: 5,
      cooldown: 2.0, sight: 6,
    },
    armorValue: 20,
    auraRadius: 10,
    passive: '工程光环：周围10格机械生产/建造+20%',
    active: { name: '部署炮台', cooldown: 25, description: '部署1座自动炮台(HP300/攻20/射6)，最多2座' },
    skillTree: [
      // Lv1: 部署炮台
      { name: '部署炮台', cooldown: 25, description: '部署1座自动炮台(HP300/攻20/射6)，最多2座' },
      // Lv2: 炮台+ — 上限+1，带符文护盾
      { name: '炮台+', cooldown: 20, description: '部署上限+1(3座)，炮台带符文护盾(100护盾)' },
      // Lv3: 符文引擎过载
      { name: '符文引擎过载', cooldown: 60, description: '攻速+50%/移速+30%，每秒-3%HP，15秒' },
      // Lv4: 过载+
      { name: '过载+', cooldown: 45, description: 'HP损失-1%/秒，+30%伤害减免' },
      // Lv5: 远古符文阵列
      { name: '远古符文阵列', cooldown: 150, description: '2秒无敌→500伤害AOE+眩晕3秒' },
    ],
    reviveCooldown: 200,
    cost: { crystal: 900, supply: 6, time: 45 },
  },

  // ============ 新英雄: 艾琳·灰烬 ============
  // 联邦矿工之女，大陆唯一"共鸣体质"持有者，安全共鸣器发明者。
  // 阵营: 铁锤联邦 + 法师公会 + 炼金协会
  'hero_eileen': {
    displayName: '艾琳',
    title: '共鸣体质持有者',
    faction: 'hammer_federation',
    stats: {
      hp: 280, armor: 'light', speed: 2.8,
      damage: 45, dmgType: 'magic', range: 5,
      cooldown: 1.2, sight: 8,
    },
    armorValue: 5,
    auraRadius: 8,
    passive: '矿工之光：周围8格采集+25%/建造+15%',
    active: { name: '水晶共鸣爆破', cooldown: 30, description: '引爆敌方水晶建筑/储备，伤害与储量成正比' },
    skillTree: [
      // Lv1: 水晶共鸣爆破
      { name: '水晶共鸣爆破', cooldown: 30, description: '引爆敌方水晶建筑/储备(AOE，伤害∝储量)' },
      // Lv2: 爆破+
      { name: '爆破+', cooldown: 25, description: '范围扩大+残留减速场6秒' },
      // Lv3: 矿工之盾
      { name: '矿工之盾', cooldown: 40, description: '范围内友方+150护盾，8秒' },
      // Lv4: 盾+
      { name: '盾+', cooldown: 30, description: '护盾250，破时AOE反击' },
      // Lv5: 地脉觉醒
      { name: '地脉觉醒', cooldown: 180, description: '全图揭示+标记敌人15秒，友方攻速+50%' },
    ],
    reviveCooldown: 160,
    cost: { crystal: 750, supply: 4, time: 35 },
  },
  // 批2: 霜脊王国英雄 — 固守与山之意志主题
  'hero_frost_a': {
    displayName: '艾纳尔',
    title: '霜脊第十四世山王',
    faction: 'frostridge_kingdom',
    stats: {
      hp: 900, armor: 'heavy', speed: 1.6,
      damage: 55, dmgType: 'physical', range: 2,
      cooldown: 1.8, sight: 6,
    },
    armorValue: 28,
    auraRadius: 10,
    passive: '山之王座：周围10格友方护甲+8',
    active: { name: '磐石壁垒', cooldown: 35, description: '自身+周围友方护甲翻倍，8秒' },
    skillTree: [
      // Lv1: 磐石壁垒
      { name: '磐石壁垒', cooldown: 35, description: '自身+周围友方护甲翻倍，8秒' },
      // Lv2: 壁垒+（持续时间12s 已实现；免疫击退 简化 TODO）
      { name: '壁垒+', cooldown: 28, description: '持续时间延长至12秒，附加免疫击退' },
      // Lv3: 山之怒
      { name: '山之怒', cooldown: 50, description: '对周围敌人造成相当于自身护甲值的物理伤害' },
      // Lv4: 怒+（伤害翻倍+眩晕2s 已实现）
      { name: '怒+', cooldown: 40, description: '伤害翻倍并眩晕2秒' },
      // Lv5: 万山臣服
      { name: '万山臣服', cooldown: 160, description: '大范围友方获得护盾300并嘲讽敌方' },
    ],
    reviveCooldown: 180,
    cost: { crystal: 800, supply: 5, time: 40 },
  },
  'hero_frost_b': {
    displayName: '希尔德',
    title: '深矿井首席勘探师',
    faction: 'frostridge_kingdom',
    stats: {
      hp: 380, armor: 'light', speed: 2.4,
      damage: 35, dmgType: 'crystal', range: 6,
      cooldown: 1.4, sight: 9,
    },
    armorValue: 6,
    auraRadius: 9,
    passive: '矿脉感应：周围9格采集+30%，视野+2',
    active: { name: '水晶裂隙', cooldown: 30, description: '在目标区域制造水晶裂隙，减速敌人并造成持续水晶伤害' },
    skillTree: [
      // Lv1: 水晶裂隙
      { name: '水晶裂隙', cooldown: 30, description: '目标区域水晶裂隙，减速50%并造成持续水晶伤害6秒' },
      // Lv2: 裂隙+（范围扩大+伤害提升 已实现；护甲-30% 简化 TODO）
      { name: '裂隙+', cooldown: 25, description: '范围扩大，附加护甲-30%' },
      // Lv3: 深矿涌动
      { name: '深矿涌动', cooldown: 45, description: '召唤水晶晶柱阻挡通路并对靠近者造成伤害' },
      // Lv4: 涌动+（伤害提升 已实现；击退 简化 TODO）
      { name: '涌动+', cooldown: 35, description: '晶柱数量+2并附带击退' },
      // Lv5: 山脉之心
      { name: '山脉之心', cooldown: 150, description: '全图矿脉短暂喷发，对敌方单位造成巨额水晶伤害' },
    ],
    reviveCooldown: 160,
    cost: { crystal: 750, supply: 4, time: 35 },
  },
  // 批3: 翡翠邦联英雄 — 灵活与贸易主题
  'hero_jade_a': {
    displayName: '卡林',
    title: '玉港独立信息商人',
    faction: 'jade_confederation',
    stats: {
      hp: 320, armor: 'light', speed: 2.8,
      damage: 30, dmgType: 'physical', range: 5,
      cooldown: 1.3, sight: 10,
    },
    armorValue: 5,
    auraRadius: 9,
    passive: '情报网：周围9格友方视野+3，隐形单位显形',
    active: { name: '市场操纵', cooldown: 30, description: '标记敌方单位20秒，受标记单位受到的伤害+25%' },
    skillTree: [
      { name: '市场操纵', cooldown: 30, description: '标记敌方单位20秒，受标记单位受到的伤害+25%' },
      { name: '操纵+', cooldown: 25, description: '标记范围扩大，附加移速-30%' },
      { name: '情报泄露', cooldown: 45, description: '揭示敌方全部建筑位置10秒' },
      { name: '泄露+', cooldown: 35, description: '揭示期间友方对敌方建筑伤害+30%' },
      { name: '玉港资本', cooldown: 140, description: '瞬间获得500水晶，但下60秒采集-50%' },
    ],
    reviveCooldown: 150,
    cost: { crystal: 700, supply: 4, time: 32 },
  },
  'hero_jade_b': {
    displayName: '薇拉',
    title: '翡翠邦联佣兵团长',
    faction: 'jade_confederation',
    stats: {
      hp: 650, armor: 'heavy', speed: 2.0,
      damage: 50, dmgType: 'physical', range: 2,
      cooldown: 1.6, sight: 7,
    },
    armorValue: 15,
    auraRadius: 8,
    passive: '佣兵契约：周围8格友方步兵攻击+15%',
    active: { name: '雇佣空降', cooldown: 35, description: '在目标位置空投2名佣兵剑士' },
    skillTree: [
      { name: '雇佣空降', cooldown: 35, description: '在目标位置空投2名佣兵剑士' },
      { name: '空降+', cooldown: 28, description: '空投3名佣兵剑士+1翡翠斥候' },
      { name: '战场佣金', cooldown: 40, description: '范围内友方击杀返还30%单位造价' },
      { name: '佣金+', cooldown: 32, description: '返还50%并附加攻速+20%' },
      { name: '翡翠军团', cooldown: 160, description: '召唤一支完整佣兵小队并全军+50%攻击10秒' },
    ],
    reviveCooldown: 170,
    cost: { crystal: 750, supply: 4, time: 36 },
  },
};

/** 获取阵营对应的英雄ID（默认返回第一个）。index=0 返回原英雄，index=1 返回新英雄。 */
export function getFactionHero(faction: string, index = 0): string | undefined {
  // 批1: 数据驱动——从 FACTION_DEFS 读取 heroIds，新增王国无需改此代码
  return FACTION_DEFS[faction]?.heroIds?.[index];
}

/** 获取阵营的所有英雄ID列表 */
export function getFactionHeroes(faction: string): string[] {
  // 批1: 数据驱动——从 FACTION_DEFS 读取 heroIds
  return FACTION_DEFS[faction]?.heroIds ?? [];
}