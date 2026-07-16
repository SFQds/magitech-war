/**
 * 游戏世界 — 唯一状态聚合点
 *
 * 所有实体、玩家状态、地图均存储于此。
 * Systems 读取 GameWorld、修改 GameWorld，不持有状态。
 */

import type { PlayerState } from '../types/entity';
import type { FactionId } from '../types/data';
import { GameMap } from './GameMap';
import { FogOfWar } from './FogOfWar';
import { TechTreeSystem } from '../systems/TechTreeSystem';
import { FACTION_DEFS } from '../config/unitData';

export class GameWorld {
  readonly map: GameMap;
  readonly fogOfWar: FogOfWar;
  readonly players: PlayerState[] = [];
  /** 每玩家独立科技树 */
  readonly techTrees = new Map<number, TechTreeSystem>();
  /** 行会机制状态：法师公会充能计时器（每玩家，秒） */
  readonly arcaneChargeTimers = new Map<number, number>();

  // 实体注册表（后续由实体的工厂方法填充）
  // unitRegisty / buildingRegistry / resourceFields / projectiles 在 entities 模块完成后挂载

  constructor(mapWidth: number, mapHeight: number, tileSize = 32) {
    this.map = new GameMap({
      name: 'Default',
      width: mapWidth,
      height: mapHeight,
      tileSize,
    });
    this.fogOfWar = new FogOfWar(mapWidth, mapHeight, this.map);
  }

  /** 初始化玩家 */
  addPlayer(faction: FactionId, guilds: string[], isAI = false): number {
    const index = this.players.length;
    const fd = FACTION_DEFS[faction];
    this.players.push({
      index,
      faction,
      guilds,
      resources: {
        crystal: fd?.startingCrystal ?? 2000,
        industry: fd?.startingIndustry ?? 50,
        supply: 0,
        supplyCap: 20,
        industryCap: fd?.startingIndustry ?? 50,
      },
      isAI,
    });
    // 每个玩家独立科技树
    this.techTrees.set(index, new TechTreeSystem());
    return index;
  }

  /** 获取玩家状态 */
  getPlayer(index: number): PlayerState | undefined {
    return this.players[index];
  }

  /** 检查玩家是否有足够资源 */
  canAfford(playerIndex: number, cost: { crystal?: number; industry?: number; supply?: number }): boolean {
    const p = this.players[playerIndex];
    if (!p) return false;
    if (cost.crystal && p.resources.crystal < cost.crystal) return false;
    if (cost.industry && p.resources.industry < cost.industry) return false;
    if (cost.supply && (p.resources.supplyCap - p.resources.supply) < cost.supply) return false;
    return true;
  }

  /** 扣除资源 — P1-9 修复：加下限守卫防止负数 */
  spend(playerIndex: number, cost: { crystal?: number; industry?: number; supply?: number }): void {
    const p = this.players[playerIndex];
    if (!p) return;
    if (cost.crystal) p.resources.crystal = Math.max(0, p.resources.crystal - cost.crystal);
    if (cost.industry) p.resources.industry = Math.max(0, p.resources.industry - cost.industry);
    if (cost.supply) p.resources.supply += cost.supply; // supply 是占用，不是消耗
  }

  /** P1-N4 修复：退还资源（含 MAX_CRYSTAL 上限保护） */
  refund(playerIndex: number, cost: { crystal?: number; industry?: number; supply?: number }): void {
    const p = this.players[playerIndex];
    if (!p) return;
    if (cost.crystal) {
      const MAX_CRYSTAL = 20000;
      p.resources.crystal = Math.min(MAX_CRYSTAL, p.resources.crystal + cost.crystal);
    }
    if (cost.industry) {
      p.resources.industry = Math.min(p.resources.industryCap, p.resources.industry + cost.industry);
    }
    if (cost.supply) {
      p.resources.supply = Math.max(0, p.resources.supply - cost.supply);
    }
  }
}