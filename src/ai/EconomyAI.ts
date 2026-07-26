/**
 * 经济 AI — 资源管理、建造决策、军事扩张
 *
 * 读取 StrategyDirective 调整建造/训练优先级。
 * 支持难度差异化：Hard 更早出兵、更激进扩张。
 */

import type { GameWorld } from '../core/GameWorld';
import type { AnyCommand } from '../types/commands';
import type { Building } from '../entities/Building';
import type { Unit } from '../entities/Unit';
import type { ResourceField } from '../entities/ResourceField';
import type { StrategyDirective } from './StrategyManager';
import { UNIT_DEFS, BUILDING_DEFS, TECH_DEFS, getBuildingCost as getBuildingCostWithDiscount } from '../config/unitData';
import type { BuildCommand, ResearchCommand, TrainCommand } from '../types/commands';
import { MAX_CRYSTAL, AI_RESCUE_CRYSTAL_MIN } from '../config/balance';

/** 构造 Build 命令（类型安全，不含 as any）。可选 position 用于精确定位（精炼厂靠矿、炮塔守要害）。 */
function makeBuildCmd(playerIndex: number, bldId: string, pos?: { x: number; y: number }): BuildCommand {
  return { type: 'build', playerIndex, unitIds: [], buildingDefId: bldId, position: pos ?? { x: 0, y: 0 }, frame: 0 };
}
/** 构造 Research 命令 */
function makeResearchCmd(playerIndex: number, bldId: string, techId: string): ResearchCommand {
  return { type: 'research', playerIndex, unitIds: [], buildingId: bldId, techDefId: techId, frame: 0 };
}
/** 构造 Train 命令 */
function makeTrainCmd(playerIndex: number, bldId: string, unitId: string): TrainCommand {
  return { type: 'train', playerIndex, unitIds: [], buildingId: bldId, unitDefId: unitId, count: 1, frame: 0 };
}

export class EconomyAI {
  private world: GameWorld;
  private playerIndex: number;
  private playerFaction: string;
  private difficulty: 'easy' | 'normal' | 'hard';
  /** 资源倍率 (easy=0.7, normal=1.0, hard=2.0) — 影响AI有效水晶 */
  private resourceMult: number;

  constructor(world: GameWorld, playerIndex: number, difficulty: 'easy' | 'normal' | 'hard', resourceMult = 1.0) {
    this.world = world;
    this.playerIndex = playerIndex;
    this.difficulty = difficulty;
    this.resourceMult = resourceMult;
    this.playerFaction = world.getPlayer(playerIndex)?.faction ?? 'hammer_federation';
  }

  /** 从 UNIT_DEFS 动态读取水晶成本 */
  private getUnitCost(unitDefId: string): number {
    return UNIT_DEFS[unitDefId]?.cost?.crystal ?? 999;
  }

  /** 从 BUILDING_DEFS 动态读取建筑水晶成本（含阵营折扣） */
  private getBuildingCost(bldDefId: string): number {
    const cost = getBuildingCostWithDiscount(bldDefId, this.playerFaction);
    return cost?.crystal ?? 999;
  }

  /** 从 TECH_DEFS 动态读取科技水晶成本 */
  private getTechCost(techDefId: string): number {
    return TECH_DEFS[techDefId]?.crystal ?? 999;
  }

  /** 每次 tick 输出建造/训练命令 */
  evaluate(
    buildings: Building[],
    units: Unit[],
    fields: ResourceField[],
    directive: StrategyDirective,
  ): AnyCommand[] {
    const commands: AnyCommand[] = [];
    const player = this.world.getPlayer(this.playerIndex);
    if (!player) return commands;

    const crystal = player.resources.crystal;
    const { supply, supplyCap } = player.resources;

    const faction = player.faction;
    const techBldId = faction === 'arcane_empire' ? 'bld_ancient_archive' : 'bld_assembly_workshop';
    const heroId = faction === 'arcane_empire' ? 'hero_isabelle' : 'hero_marcus';

    // 难度系数：Hard 更激进（更早建造），Easy 更保守（更晚建造）
    const aggressMultiplier = this.difficulty === 'hard' ? 0.7
                           : this.difficulty === 'easy' ? 1.5 : 1.0;

    // P1-R2 修复：直接用 aggressMultiplier 作为资源门槛因子，不再用 resourceMult
    // （resourceMult 已通过 canAfford 的真实检查体现难度，此处双重应用会导致 Easy 过度保守）
    const resourceFactor = aggressMultiplier;

    const workerCount = units.filter(
      u => u.owner === this.playerIndex && u.isAlive && u.spriteKey === 'unit_worker'
    ).length;

    const combatCount = units.filter(
      // P1-AI6: exclude hero_ prefix (aura not combat power) and worker to avoid premature defense.
      u => u.owner === this.playerIndex && u.isAlive &&
        u.spriteKey !== 'unit_worker' && !u.spriteKey.startsWith('hero_')
    ).length;

    // === P3: 反制兵种 — 分析敌方单位构成，调整训练优先级 ===
    const counterUnits = this._getCounterUnits(units, directive);

    // 0. 指派空闲工人去采集
    const activeFields = fields.filter(f => f.isActive && !f.isDepleted);
    if (activeFields.length > 0) {
      const idleWorkers = units.filter(u =>
        u.owner === this.playerIndex && u.isAlive &&
        u.spriteKey === 'unit_worker' && u.state === 'idle'
      );
      for (const worker of idleWorkers) {
        let closest: ResourceField | null = null;
        let closestDist = Infinity;
        for (const f of activeFields) {
          const d = Math.abs(worker.tileX - f.tileX) + Math.abs(worker.tileY - f.tileY);
          if (d < closestDist) { closestDist = d; closest = f; }
        }
        if (closest) {
          commands.push({
            type: 'gather', playerIndex: this.playerIndex,
            unitIds: [worker.id], resourceFieldId: closest!.id, frame: 0,
          });
        }
      }
    }

    // P0-C5 修复：unit_arcane_guard 由 bld_ancient_archive（buildingType='tech'）生产，
    // 但 ownProductions 原仅含 'production' 类建筑，导致 arcane_guard 永不匹配。
    // 这里把可训练的 tech 类生产建筑（ancient_archive / assembly_workshop）也纳入。
    const ownProductions = buildings.filter(
      b => b.owner === this.playerIndex && b.isAlive && b.canEnqueue() &&
        (b.buildingType === 'production' ||
         b.spriteKey === 'bld_ancient_archive' ||
         b.spriteKey === 'bld_assembly_workshop')
    );
    if (ownProductions.length === 0) {
      // P1-AI3 修复：CC cost=0 被 AI 滥用为无限免费重建。移除 CC 重建逻辑，
      // 无生产建筑时靠 60s 宽限判负机制处理，不再零成本复活 CC。
      return commands;
    }

    const hasBarracks = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_barracks'
    );
    const hasFactory = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_factory'
    );
    const hasRefinery = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_refinery'
    );
    const hasPowerPlant = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_power_plant'
    );
    const hasTechBuilding = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive &&
        (b.spriteKey === 'bld_ancient_archive' || b.spriteKey === 'bld_assembly_workshop')
    );
    const hasHero = units.some(
      u => u.owner === this.playerIndex && u.isAlive && (u.spriteKey === 'hero_isabelle' || u.spriteKey === 'hero_marcus')
    );
    const hasScout = units.some(
      u => u.owner === this.playerIndex && u.isAlive && u.spriteKey === 'unit_scout_bike'
    );
    const wallCount = buildings.filter(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_wall'
    ).length;
    const hasTurret = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_turret'
    );
    // 批A-D: 公会专属建筑存在性标志（AI 按行会建造对应建筑）
    const aiGuilds = this.world.players[this.playerIndex]?.guilds ?? [];
    const hasRepairDepot = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_repair_depot'
    );
    const hasAlchemyLab = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_alchemy_lab'
    );
    const hasVoidResonator = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_void_resonator'
    );
    const teleportGateCount = buildings.filter(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_teleport_gate'
    ).length;

    const cc = ownProductions.find(b =>
      b.spriteKey === 'bld_cc_empire' || b.spriteKey === 'bld_cc_federation'
    ) ?? ownProductions[0];

    // 1. 工人数量维护
    const targetWorkers = directive.expansion > 0.5 ? 8 : 5;

    // P0-2 修复：AI安全网 — 当0工人且水晶不足时，被动提供最低水晶收入以免永久死锁
    if (workerCount === 0 && crystal < 100) {
      // P0-A4 修复：原 Math.ceil(100 / resourceMult) 方向反了（hard 给 50 卡死、easy 给 143 反而更多）
      // 改为乘法 + 保底 100：hard 给 200、normal 给 100、easy 给 100（保底确保能造 1 工人）
      const rescueCrystal = Math.max(AI_RESCUE_CRYSTAL_MIN, Math.ceil(AI_RESCUE_CRYSTAL_MIN * this.resourceMult));
      // P4-A11: clamp to MAX_CRYSTAL to respect the global cap (avoid bypassing world.refund guard)
      player.resources.crystal = Math.min(MAX_CRYSTAL, Math.max(player.resources.crystal, rescueCrystal));
    }

    if (crystal >= 100 && supply < supplyCap && workerCount < targetWorkers) {
      commands.push(makeTrainCmd(this.playerIndex, cc.id, 'unit_worker'));
    }

    // 2. 建造建筑 — 带智能选址：精炼厂靠矿、电厂靠后、炮塔守咽喉
    const buildCostThreshold = (cost: number) => crystal >= cost * resourceFactor;

    // P5: 计算战略位置（CC朝向敌方的方向、最近矿点等）
    const stratPos = this._computeStrategicPositions(cc, buildings, fields);

    if (directive.aggression < 0.7 || (!hasBarracks && !hasFactory)) {
      if (!hasBarracks && buildCostThreshold(this.getBuildingCost('bld_barracks'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_barracks', stratPos.production));
      }
      if (!hasFactory && buildCostThreshold(this.getBuildingCost('bld_factory'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_factory', stratPos.production));
      }
    }
    // P5: 精炼厂建在最靠近水晶矿的位置
    if (!hasRefinery && buildCostThreshold(this.getBuildingCost('bld_refinery'))) {
      commands.push(makeBuildCmd(this.playerIndex, 'bld_refinery', stratPos.refinery));
    }
    // P5: 电厂建在后方（CC 远离矿点方向）
    if (!hasPowerPlant && hasFactory && buildCostThreshold(this.getBuildingCost('bld_power_plant'))) {
      commands.push(makeBuildCmd(this.playerIndex, 'bld_power_plant', stratPos.rear));
    }
    if (!hasTechBuilding && buildCostThreshold(this.getBuildingCost(techBldId))) {
      commands.push(makeBuildCmd(this.playerIndex, techBldId, stratPos.tech));
    }

    // 批A-D: 公会专属建筑 — AI 按行会建造对应建筑（有经济基础后）
    if (crystal > 500) {
      if (aiGuilds.includes('mechanists_guild') && !hasRepairDepot &&
          buildCostThreshold(this.getBuildingCost('bld_repair_depot'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_repair_depot', stratPos.rear));
      }
      if (aiGuilds.includes('alchemists_society') && !hasAlchemyLab &&
          buildCostThreshold(this.getBuildingCost('bld_alchemy_lab'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_alchemy_lab', stratPos.tech));
      }
      if (aiGuilds.includes('void_institute') && !hasVoidResonator &&
          buildCostThreshold(this.getBuildingCost('bld_void_resonator'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_void_resonator', stratPos.refinery));
      }
      // 传送门成对建造：最多建 2 座
      if (aiGuilds.includes('mages_guild') && teleportGateCount < 2 &&
          buildCostThreshold(this.getBuildingCost('bld_teleport_gate'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_teleport_gate', stratPos.defense));
      }
    }

    // P1-AI1: 供给不足时扩产第二兵营/工厂（突破 90 人口硬上限）
    const barracksCount = buildings.filter(b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_barracks').length;
    const factoryCount = buildings.filter(b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_factory').length;
    if (supply >= supplyCap - 5 && hasFactory) {
      if (barracksCount < 2 && buildCostThreshold(this.getBuildingCost('bld_barracks'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_barracks'));
      }
      if (factoryCount < 2 && buildCostThreshold(this.getBuildingCost('bld_factory'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_factory'));
      }
    }

    // 2.5 防御建筑 — 炮塔/城墙建在面向敌方的前线位置
    if (combatCount >= 5 || crystal > 600) {
      if (wallCount < 4 && buildCostThreshold(this.getBuildingCost('bld_wall'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_wall', stratPos.defense));
      }
      if (!hasTurret && buildCostThreshold(this.getBuildingCost('bld_turret'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_turret', stratPos.defense));
      }
    }

    // 3. 科技研究：找任意空闲且有科技槽的建筑，选择一个未研究的科技
    const techBld = buildings.find(
      b => b.owner === this.playerIndex && b.isAlive && b.state === 'idle' &&
        !b.researchingTechId && BUILDING_DEFS[b.spriteKey]?.researches?.length
    );
    if (techBld) {
      const tt = this.world.techTrees.get(this.playerIndex);
      // 批3: 过滤掉公会/阵营不符的科技（exclusiveTo.guild/faction 门控）
      const aiGuilds = this.world.players[this.playerIndex]?.guilds ?? [];
      const aiFaction = this.world.players[this.playerIndex]?.faction;
      const availTechs = (BUILDING_DEFS[techBld.spriteKey]?.researches ?? []).filter(
        tid => {
          const td = TECH_DEFS[tid];
          if (!td) return false;
          if (td.exclusiveTo?.guild && !aiGuilds.includes(td.exclusiveTo.guild)) return false;
          if (td.exclusiveTo?.faction && td.exclusiveTo.faction !== aiFaction) return false;
          return !tt?.isResearched(tid) && this.getTechCost(tid) < crystal * resourceFactor;
        }
      );
      if (availTechs.length > 0) {
        // P2-AI2: sort by prerequisites count then crystal cost - prefer foundational/cheaper techs first.
        const sortedTechs = availTechs.slice().sort((a, b) => {
          const ta = TECH_DEFS[a];
          const tb = TECH_DEFS[b];
          const pa = (ta?.prerequisites?.length ?? 0);
          const pb = (tb?.prerequisites?.length ?? 0);
          if (pa !== pb) return pa - pb;
          return (ta?.crystal ?? 0) - (tb?.crystal ?? 0);
        });
        commands.push(makeResearchCmd(this.playerIndex, techBld.id, sortedTechs[0]));
      }
    }

    // 4. 训练英雄（拥有足够水晶 且 尚未拥有）
    const heroCost = this.getUnitCost(heroId);
    if (!hasHero && crystal >= heroCost && supply < supplyCap - 4) {
      commands.push(makeTrainCmd(this.playerIndex, cc.id, heroId));
    }

    // 5. 训练侦察摩托（至少 1 辆）
    const scoutCost = this.getUnitCost('unit_scout_bike');
    const factoryBld = ownProductions.find(b => b.spriteKey === 'bld_factory');
    if (!hasScout && hasFactory && crystal >= scoutCost && supply < supplyCap && factoryBld) {
      commands.push(makeTrainCmd(this.playerIndex, factoryBld.id, 'unit_scout_bike'));
    }

    // 6. 按 counterUnits + directive.preferredUnits 优先级训练战斗单位
    const trainedBuildings = new Set<string>();
    const tt = this.world.techTrees.get(this.playerIndex);
    // 反制单位优先于常规偏好单位
    const trainPriority = [...counterUnits, ...directive.preferredUnits.filter(id => !counterUnits.includes(id))];
    for (const unitDefId of trainPriority) {
      if (unitDefId === 'unit_worker') continue;
      if (supply >= supplyCap) continue;

      // P1-AI16 修复：训练前检查科技前置，避免空发 train 命令被 execTrain 拒
      const unitDef = UNIT_DEFS[unitDefId];
      if (unitDef?.techReq && !unitDef.techReq.every((tid) => tt?.isResearched(tid))) continue;

      const unitCost = this.getUnitCost(unitDefId);
      if (crystal < unitCost) continue;

      let producer = ownProductions.find(b => {
        if (trainedBuildings.has(b.id)) return false;
        if (unitDefId === 'unit_magitech_mech') return b.spriteKey === 'bld_factory';
        if (unitDefId === 'unit_hammer_squad') return b.spriteKey === 'bld_factory';
        if (unitDefId === 'unit_scout_bike') return b.spriteKey === 'bld_factory';
        if (unitDefId === 'unit_arcane_guard') return b.spriteKey === 'bld_ancient_archive';
        if (unitDefId === 'unit_battle_mage') return b.spriteKey === 'bld_barracks';
        if (unitDefId === 'unit_arcane_heavy') return b.spriteKey === 'bld_barracks';
        if (unitDefId === 'unit_rifleman') return b.spriteKey === 'bld_barracks';
if (unitDefId === 'unit_grenadier') return b.spriteKey === 'bld_barracks';
        if (unitDefId === 'unit_assault_worker') return b.spriteKey === 'bld_barracks';
        if (unitDefId === 'unit_void_probe') return b.spriteKey === 'bld_factory';
	        return false;
      });
      if (!producer) continue;

      commands.push({
        type: 'train', playerIndex: this.playerIndex,
        unitIds: [], buildingId: producer.id,
        unitDefId, count: 1, frame: 0,
      });
      trainedBuildings.add(producer.id);
    }

    return commands;
  }

  /** P3: 分析敌方单位构成，返回需要训练的反制单位 ID 列表。
   *    - 敌方机械多 -> 优先 grenadier (alchemy 克 mechanical)、crystal 类单位
   *    - 敌方护盾多 -> 优先 grenadier (alchemy 克 shield ×2)
   *    - 敌方重甲多 -> 优先 battle_mage (magic 克 heavy +25%)
   *    - 敌方法师多 -> 优先 rifleman (physical 对 light 无惩罚，量大便宜)
   */
  private _getCounterUnits(units: Unit[], directive: StrategyDirective): string[] {
    const enemyUnits = units.filter(u => u.owner !== this.playerIndex && u.isAlive);
    if (enemyUnits.length === 0) return [];

    const counts: Record<string, number> = {};
    for (const u of enemyUnits) {
      const armor = u.armorType;
      counts[armor] = (counts[armor] ?? 0) + 1;
    }

    const total = enemyUnits.length;
    const result: string[] = [];
    const faction = this.playerFaction;

    // 机械占比 > 33% -> 炼金克制（grenadier）
    if ((counts['mechanical'] ?? 0) / total > 0.33) {
      // P3-COUNTER: alchemy dmg x1.0 vs mechanical (no bonus) BUT mechanical takes +25% from crystal
      // grenadier 的 alchemy 对机械无加成，但 grenadier 是 AOE，仍有用
      result.push('unit_grenadier');
    }

    // 护盾占比 > 20% -> 炼金/魔法克制
    if ((counts['shield'] ?? 0) / total > 0.20) {
      // alchemy ×2 vs shield, magic ×1.5 vs shield
      result.push('unit_grenadier'); // alchemy 最克护盾
      result.push('unit_battle_mage');
    }

    // 重甲占比 > 33% -> 魔法克制
    if ((counts['heavy'] ?? 0) / total > 0.33) {
      result.push('unit_battle_mage'); // magic +25% vs heavy
      if (faction === 'arcane_empire') result.push('unit_arcane_heavy');
    }

    // 轻甲多 -> 扫射单位（rifleman 便宜量大）
    if ((counts['light'] ?? 0) / total > 0.5) {
      result.push('unit_rifleman');
      if (faction === 'hammer_federation') result.push('unit_assault_worker');
    }

    // 建筑多 -> grenadier (alchemy +50% vs structure)
    if ((counts['structure'] ?? 0) / total > 0.25) {
      result.push('unit_grenadier');
    }

    // 去重 + 合并 directive.preferredUnits 中已有的（不重复）
    const preferredSet = new Set(directive.preferredUnits);
    return [...new Set(result)].filter(cu => !preferredSet.has(cu));
  }

  /** P4+P5: 建筑选址。根据CC位置、矿点分布和敌方方向，为每种建筑类型返回推荐位置。
   *   - refinery: 最近活跃水晶矿方向
   *   - defense: CC朝向敌方建筑方向（炮塔/城墙放在前线侧）
   *   - rear: CC远离矿点/敌方方向（电厂等后方建筑）
   *   - production / tech: CC周边（原有逻辑）
   */
  private _computeStrategicPositions(
    cc: Building,
    allBuildings: Building[],
    fields: ResourceField[],
  ): { refinery?: { x: number; y: number }; defense?: { x: number; y: number }; rear?: { x: number; y: number }; production?: { x: number; y: number }; tech?: { x: number; y: number } } {
    const cx = Math.round(cc.tileX);
    const cy = Math.round(cc.tileY);
    const result: any = {};

    // 精炼厂位置：最近活跃水晶矿方向 4 格
    const activeFields = fields.filter(f => f.isActive && !f.isDepleted);
    if (activeFields.length > 0) {
      let closest = activeFields[0];
      let closestDist = Infinity;
      for (const f of activeFields) {
        const d = Math.abs(cx - f.tileX) + Math.abs(cy - f.tileY);
        if (d < closestDist) { closestDist = d; closest = f; }
      }
      // 在 CC 朝向矿点的 4 格处放置（如果距离足够远）
      const dx = closest.tileX - cx;
      const dy = closest.tileY - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      result.refinery = { x: Math.round(cx + (dx / len) * 4), y: Math.round(cy + (dy / len) * 4) };
    }

    // 防御位置：CC朝向敌方建筑方向 4 格（炮塔/城墙守前线）
    const enemyBuildings = allBuildings.filter(b => b.owner !== this.playerIndex && b.isAlive);
    if (enemyBuildings.length > 0) {
      let avgEx = 0, avgEy = 0;
      for (const b of enemyBuildings) {
        avgEx += b.tileX; avgEy += b.tileY;
      }
      avgEx /= enemyBuildings.length;
      avgEy /= enemyBuildings.length;
      const dx = avgEx - cx;
      const dy = avgEy - cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      result.defense = { x: Math.round(cx + (dx / len) * 4), y: Math.round(cy + (dy / len) * 4) };
    }

    // 后方位置：远离矿点和敌方的方向
    const rearDx = result.refinery ? -(result.refinery.x - cx) : (result.defense ? -(result.defense.x - cx) : 0);
    const rearDy = result.refinery ? -(result.refinery.y - cy) : (result.defense ? -(result.defense.y - cy) : 4);
    const rearLen = Math.sqrt(rearDx * rearDx + rearDy * rearDy) || 1;
    result.rear = { x: Math.round(cx + (rearDx / rearLen) * 3), y: Math.round(cy + (rearDy / rearLen) * 3) };

    // 生产/科技建筑：CC周边随机偏移（避免重叠）
    const offsets = [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3]];
    const pick = (idx: number) => ({ x: cx + offsets[idx][0], y: cy + offsets[idx][1] });
    result.production = pick(Math.floor(Math.random() * offsets.length));
    result.tech = pick(Math.floor(Math.random() * offsets.length));

    return result;
  }
}
