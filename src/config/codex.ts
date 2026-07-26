/**
 * 图鉴数据 — 单位/建筑/科技/英雄/行会/超武/中立的简短描述
 *
 * 从 GAME_DATA.md / CODEX.md 提炼的 1-2 句定位描述，
 * 供 CodexScene 图鉴界面展示。与 config/ 下的数值定义互补。
 */

export interface CodexEntry {
  id: string;
  name: string;
  category: 'unit' | 'building' | 'tech' | 'hero' | 'guild' | 'superweapon' | 'neutral_unit' | 'neutral_building' | 'faction';
  desc: string;
  spriteKey?: string;
}

export const CODEX_ENTRIES: CodexEntry[] = [
  // ============ 阵营 ============
  { id: 'arcane_empire', name: '奥术帝国', category: 'faction', desc: '人类最古老的政治统一体，统治大陆中部两千年。以质量抵消数量，精兵路线，每一战损都疼。研究速度+15%，法师伤害+10%。' },
  { id: 'hammer_federation', name: '铁锤联邦', category: 'faction', desc: '全大陆最年轻的政治实体，立国不到150年。量产流水线暴兵，工厂不睡觉。建筑造价-20%，生产速度+15%。' },

  // ============ L1 通用单位 ============
  { id: 'unit_worker', name: '建造工兵', category: 'unit', spriteKey: 'unit_worker', desc: '基础建造/维修/采集单位。帝国征召劳工，联邦建设工程师。配发的小口径水晶枪几乎从不开。' },
  { id: 'unit_rifleman', name: '水晶步枪兵', category: 'unit', spriteKey: 'unit_rifleman', desc: '基础远程火力。一根铁管、一个弹簧、一盒碎脉晶。不需要法师，不需要训练，下午就能扛上阵地。' },
  { id: 'unit_scout_bike', name: '侦察摩托', category: 'unit', spriteKey: 'unit_scout_bike', desc: '快速无武装侦察单位。原型是联邦农用三轮，军方去掉了后斗加了轻合金护板。前挡玻璃有飞虫裂痕不修。' },
  { id: 'unit_transport', name: '运输卡车', category: 'unit', spriteKey: 'unit_transport', desc: '步兵/物资运输载具。12座全地形，倒车时会发出帝国人以为是引擎故障的齿轮换向音。' },

  // ============ L2 倾向单位 ============
  { id: 'unit_battle_mage', name: '战斗法师', category: 'unit', spriteKey: 'unit_battle_mage', desc: '精英远程法术单位。奥术充能满层时可十秒内套盾、增益、电弧链打穿三条掩体。法师公会倾向：造价-20%，伤害+20%。' },
  { id: 'unit_magitech_mech', name: '魔导机甲', category: 'unit', spriteKey: 'unit_magitech_mech', desc: '中型双足步行机甲，正面突击。胸甲默库里合金板受冲击自动释放偏转场。机械行会倾向：造价-20%，生命+25%。' },
  { id: 'unit_arcane_heavy', name: '奥术重步', category: 'unit', spriteKey: 'unit_arcane_heavy', desc: '重装魔法步兵。盔甲厚到能硬吃机甲冲撞而脚后跟只滑半掌。代价是转身时间大于步枪兵装填一次弹匣。' },
  { id: 'unit_void_probe', name: '虚空探针', category: 'unit', spriteKey: 'unit_void_probe', desc: '小型飞行侦察单位，无武装。视野极广，深紫半透明。虚空研究院倾向：造价-20%，视野+50%。' },
  { id: 'unit_assault_worker', name: '突击工兵', category: 'unit', spriteKey: 'unit_assault_worker', desc: '战斗+建造双用单位。"上午铺铁道，下午当步兵"。铁锤联邦倾向：造价-20%，建造速度1.3倍。' },
  { id: 'unit_grenadier', name: '掷弹兵', category: 'unit', spriteKey: 'unit_grenadier', desc: '中程范围攻击/debuff。第一轮烟雾瓶，第二轮酸液瓶。炼金协会倾向：造价-20%，范围+1。' },

  // ============ L3 专属单位 ============
  { id: 'unit_arcane_guard', name: '奥术守卫', category: 'unit', spriteKey: 'unit_arcane_guard', desc: '奥术帝国专属精英重步兵。两米二银白巨像，左臂外悬淡金符文环。护盾激活前有4秒窗口，破碎后30秒再生。' },
  { id: 'unit_hammer_squad', name: '铁锤步兵团', category: 'unit', spriteKey: 'unit_hammer_squad', desc: '铁锤联邦专属5人编队。AOE攻击各成员独立计算，不会一炮五杀。队形散开速度全大陆最快，因为不需要命令。' },
  { id: 'unit_arcane_cannon', name: '秘法炮台', category: 'unit', spriteKey: 'unit_arcane_cannon', desc: '法师公会+奥术帝国专属。浮空水晶炮塔，充能后下一发伤害×3。需研究奥术遗产。' },
  { id: 'unit_mobile_workshop', name: '移动工坊', category: 'unit', spriteKey: 'unit_mobile_workshop', desc: '机械行会+铁锤联邦专属。履带维修载具，周围友方机械单位持续回血。需研究机甲装配技术。' },
  { id: 'unit_alchemy_colossus', name: '炼金巨像', category: 'unit', spriteKey: 'unit_alchemy_colossus', desc: '炼金协会专属。HP800的巨型生物炼金体，死亡时自爆造成300范围炼金伤害。需研究高级药剂。' },
  { id: 'unit_unstable_crystal', name: '不稳定水晶炸弹', category: 'unit', spriteKey: 'unit_unstable_crystal', desc: '虚空研究院专属。部署后10秒爆炸，造成500范围水晶伤害（不分敌我）。需研究虚空增幅。' },
  { id: 'unit_rune_titan', name: '符文泰坦', category: 'unit', spriteKey: 'unit_rune_titan', desc: '奥术帝国+机械行会组合专属。HP1200的符文机械巨像，混合物理+魔法伤害。需研究奥术遗产+机甲装配。' },

  // ============ 英雄 ============
  { id: 'hero_isabelle', name: '伊莎贝尔·默库里', category: 'hero', spriteKey: 'hero_isabelle', desc: '默库里合金发明者，帝国学院有史以来最高魔力纯度记录保持者。被除名后出走。贤者之石光环+护盾+炼金转化+贤者之雨。' },
  { id: 'hero_marcus', name: '马库斯·铁砧', category: 'hero', spriteKey: 'hero_marcus', desc: '铁砧重工第三代厂长，泰坦原型机驾驶者。厂长光环+流水线空投+紧急修复+全功率运转。背上的软管结至今没人敢解。' },
  { id: 'hero_sebastian', name: '塞巴斯蒂安·柯格斯沃', category: 'hero', spriteKey: 'hero_sebastian', desc: '符文引擎发明者，帝国叛逃子爵。从圣殿撬走了三块奥古斯都符石。工程光环+部署炮台+符文过载+远古符文阵列。' },
  { id: 'hero_eileen', name: '艾琳·灰烬', category: 'hero', spriteKey: 'hero_eileen', desc: '联邦矿工之女，大陆唯一"共鸣体质"持有者，安全共鸣器发明者。矿工之光+水晶共鸣爆破+矿工之盾+地脉觉醒。' },

  // ============ 通用建筑 ============
  { id: 'bld_cc_empire', name: '帝国指挥中心', category: 'building', spriteKey: 'bld_cc_empire', desc: '缩小版浮空法师塔，地基下埋着十二冠家族直传1800年的原始符文基座。训练工兵/英雄，科技升级。' },
  { id: 'bld_cc_federation', name: '联邦指挥中心', category: 'building', spriteKey: 'bld_cc_federation', desc: '红砖加铁梁的工业建筑，烟囱冒紫烟。地下室有数十种补充加工设施，围城时能用碎水晶自我维修。' },
  { id: 'bld_barracks', name: '兵营', category: 'building', spriteKey: 'bld_barracks', desc: '训练步兵。帝国新兵入伍第一夜不准睡觉，要感受圣殿地基传来的古早符文余波。' },
  { id: 'bld_factory', name: '工厂', category: 'building', spriteKey: 'bld_factory', desc: '训练载具/机甲。联邦不用"兵营"这个词，进车间第一天发魔力放大器目镜、分配质检工位。' },
  { id: 'bld_refinery', name: '采矿场', category: 'building', spriteKey: 'bld_refinery', desc: '矿脉采集水晶。帝国入口有铜牌铸守护神名，联邦有"连续安全生产第XX天"告示牌。' },
  { id: 'bld_power_plant', name: '工业车间', category: 'building', spriteKey: 'bld_power_plant', desc: '提供+50工业产值。帝国魔力转换站，联邦水晶锅炉房。' },
  { id: 'bld_wall', name: '城墙', category: 'building', spriteKey: 'bld_wall', desc: '阻挡地面单位。帝国大理石符文加固，联邦钢筋混凝土现浇。联邦设计墙时有意让拆除成本远高于建造。' },
  { id: 'bld_turret', name: '炮塔', category: 'building', spriteKey: 'bld_turret', desc: '自动对地防御。感应器有速度阈值漏洞——死马绑平板车顺坡滑下，车速低于触发阈值就不开枪。' },

  // ============ 专属建筑 ============
  { id: 'bld_ancient_archive', name: '古代典籍馆', category: 'building', spriteKey: 'bld_ancient_archive', desc: '奥术帝国替代研究建筑，多一条法术线。小型圆形藏书室，穹顶+符文石柱。' },
  { id: 'bld_assembly_workshop', name: '流水线车间', category: 'building', spriteKey: 'bld_assembly_workshop', desc: '铁锤联邦替代兵营，3单位并行训练。三条传送带并行的厂房。' },
  { id: 'bld_repair_depot', name: '维修站', category: 'building', spriteKey: 'bld_repair_depot', desc: '机械行会专属。周围6格友方机械单位每秒回血。铁灰厂房带机械臂，橙色警示灯。' },
  { id: 'bld_alchemy_lab', name: '炼金工坊', category: 'building', spriteKey: 'bld_alchemy_lab', desc: '炼金协会专属。拥有此建筑时药剂调制消耗-25%，并作为炼金科技研究载体。紫色水晶蒸馏器与冒泡药剂瓶。' },
  { id: 'bld_void_resonator', name: '虚空共鸣器', category: 'building', spriteKey: 'bld_void_resonator', desc: '虚空研究院专属。矿脉附近的采集增幅站，采集×1.5但加速矿脉枯竭。深紫水晶尖塔向地下钻探。' },
  { id: 'bld_teleport_gate', name: '传送门', category: 'building', spriteKey: 'bld_teleport_gate', desc: '法师公会专属。成对建造，单位进入一端瞬移到另一端。两根紫色水晶柱之间悬浮发光圆环。' },

  // ============ 科技 ============
  { id: 'tech:advanced_mining', name: '高级采集 Lv1', category: 'tech', desc: '工兵采集+20%。200水晶，30秒。' },
  { id: 'tech:infantry_armor', name: '步兵护甲 Lv1', category: 'tech', desc: '步兵+5护甲。250水晶，35秒。' },
  { id: 'tech:structure_reinforce', name: '建筑加固 Lv1', category: 'tech', desc: '建筑HP+20%。300水晶，40秒。' },
  { id: 'tech:battle_mage_training', name: '战斗法师训练', category: 'tech', desc: '解锁unit_battle_mage。前置：无。' },
  { id: 'tech:mech_assembly', name: '机甲组装', category: 'tech', desc: '解锁unit_magitech_mech。' },
  { id: 'tech:arcane_legacy', name: '奥术遗产', category: 'tech', desc: '解锁unit_arcane_guard。400水晶，50秒。' },
  { id: 'tech:production_line_optimized', name: '流水线优化', category: 'tech', desc: '机械行会额外队列惩罚降为-5%。' },

  // ============ 行会 ============
  { id: 'mages_guild', name: '法师公会', category: 'guild', desc: '奥术充能：每30秒积累1层(上限3)。Lv1单体+50%伤害，Lv2范围护盾，Lv3大范围AOE+眩晕。与机械行会敌对。' },
  { id: 'mechanists_guild', name: '机械行会', category: 'guild', desc: '流水线协议：3个相同单位并行训练，额外队列-10%效率(优化后-5%)。与法师公会敌对。' },
  { id: 'alchemists_society', name: '炼金协会', category: 'guild', desc: '炼金调制：4种药剂(力量/铁皮/迅捷/腐蚀)，消耗水晶购买战斗buff。同类型不叠加。' },
  { id: 'void_institute', name: '虚空研究院', category: 'guild', desc: '水晶过载：30秒内全属性+50%，结束后损毁。优化科技后45秒+35%。' },

  // ============ 超级武器 ============
  { id: 'elemental_storm', name: '元素风暴', category: 'superweapon', desc: '法师公会超级武器。12秒内范围内敌方每秒受40魔法伤害。冷却300秒，消耗600水晶。' },
  { id: 'orbital_cannon', name: '轨道魔导炮', category: 'superweapon', desc: '机械行会超级武器。对目标区域造成单发300物理伤害(5x5范围)。冷却240秒，消耗500水晶。' },
  { id: 'solvent_bomb', name: '万能溶剂炸弹', category: 'superweapon', desc: '炼金协会超级武器。20秒内范围内敌方护甲-50%+持续腐蚀伤害。冷却270秒，消耗550水晶。' },
  { id: 'void_rift', name: '虚空裂隙', category: 'superweapon', desc: '虚空研究院超级武器。15秒内范围持续虚空伤害+间歇随机传送敌方单位。冷却360秒，消耗700水晶。' },

  // ============ 中立单位 ============
  { id: 'neutral_crystal_wisp', name: '水晶精魄', category: 'neutral_unit', spriteKey: 'neutral_crystal_wisp', desc: '被动漂浮的中立生物。击杀后掉落50水晶。半透明紫色光球，约1秒周期明暗呼吸。' },
  { id: 'neutral_feral_mech', name: '失控机甲', category: 'neutral_unit', spriteKey: 'neutral_feral_mech', desc: '巡逻型中立野怪，主动攻击靠近的军事单位。锈迹斑斑，右臂机关枪，左臂残缺冒火花。击杀奖励100水晶+20XP。' },
  { id: 'neutral_mountain_beast', name: '山兽', category: 'neutral_unit', spriteKey: 'neutral_mountain_beast', desc: '守护型中立野怪，守卫远古遗迹。被激怒后追击，脱战返回。深灰岩石+苔藓构成，眼发暗绿光。击杀奖励200水晶+50XP。' },

  // ============ 中立建筑 ============
  { id: 'neutral_trade_outpost', name: '废弃贸易站', category: 'neutral_building', spriteKey: 'neutral_trade_outpost', desc: '占领后每60秒产出100水晶。半毁木石结构，仍挂褪色翡翠邦联贸易旗。可被任一阵营占领。' },
  { id: 'neutral_ancient_shrine', name: '远古符文遗迹', category: 'neutral_building', spriteKey: 'neutral_ancient_shrine', desc: '占领后提供一次性科技加速(当前研究-50%时间)。被藤蔓覆盖的古老石阵，符文石碑发淡金光。' },
  { id: 'neutral_abandoned_mine', name: '废弃矿井', category: 'neutral_building', spriteKey: 'neutral_abandoned_mine', desc: '可派遣工兵修复为额外采矿场，产量为标准矿的60%。木质支撑半腐朽，锈蚀矿车里有暗紫水晶碎片。' },
  { id: 'neutral_watchtower', name: '废弃瞭望塔', category: 'neutral_building', spriteKey: 'neutral_watchtower', desc: '占领后提供大范围视野(15tiles)。高耸石砌塔楼，塔顶旧式油灯已熄灭。可被摧毁。' },
];

/** 按分类获取图鉴条目 */
export function getCodexByCategory(category: CodexEntry['category']): CodexEntry[] {
  return CODEX_ENTRIES.filter(e => e.category === category);
}

/** 获取所有分类及其条目数 */
export function getCodexCategories(): { category: CodexEntry['category']; count: number; label: string }[] {
  const labels: Record<CodexEntry['category'], string> = {
    faction: '阵营',
    unit: '单位',
    building: '建筑',
    tech: '科技',
    hero: '英雄',
    guild: '行会',
    superweapon: '超级武器',
    neutral_unit: '中立野怪',
    neutral_building: '中立建筑',
  };
  const cats = Array.from(new Set(CODEX_ENTRIES.map(e => e.category)));
  return cats.map(c => ({
    category: c,
    count: CODEX_ENTRIES.filter(e => e.category === c).length,
    label: labels[c],
  }));
}
