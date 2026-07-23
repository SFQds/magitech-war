/**
 * 研究系统 — 推进建筑科技研究进度，完成时回溯应用到现有实体
 *
 * 纯逻辑：从 GameWorld.techTrees 与 EntityRegistry 读取，依赖 TechSystem
 * 刷新缓存与回溯应用。从 GameScene.updateResearch 抽离，无 Phaser 依赖。
 */

import type { GameWorld } from '../core/GameWorld';
import type { EntityRegistry } from '../core/EntityRegistry';
import { TechSystem } from './TechSystem';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';

export class ResearchSystem {
  constructor(
    private readonly world: GameWorld,
    private readonly entities: EntityRegistry,
    private readonly techSystem: TechSystem,
  ) {}

  /** 每帧推进所有正在研究中的建筑 */
  update(deltaSec: number): void {
    for (const bld of this.entities.buildings) {
      if (!bld.isAlive || bld.state !== 'researching' || !bld.researchingTechId) continue;
      bld.researchProgress += deltaSec / bld.researchTotalTime;
      if (bld.researchProgress >= 1) {
        const playerTT = this.techSystem.getTree(bld.owner);
        playerTT.completeTech(bld.researchingTechId);
        const techId = bld.researchingTechId;
        bld.researchingTechId = null;
        bld.researchProgress = 0;
        bld.state = 'idle';

        // 刷新该玩家科技效果缓存
        const owner = bld.owner;
        this.techSystem.refresh(owner);

        // 回溯应用科技效果到该玩家的现有实体
        const te = this.techSystem.getEffects(owner);
        if (techId === 'tech:infantry_armor') {
          for (const u of this.entities.units) {
            if (u.owner === owner && u.category === 'infantry' && u.isAlive) {
              u.armor = u.baseArmor + te.infantryArmor;
            }
          }
        }
        if (techId === 'tech:structure_reinforce') {
          for (const b of this.entities.buildings) {
            if (b.owner === owner && b.isAlive) {
              b.maxHp = Math.round(b.maxHp * te.buildingHpMult);
              b.hp = Math.min(b.hp, b.maxHp);
            }
          }
        }

        EventBus.emit(GameEvent.RESEARCH_COMPLETE, {
          buildingId: bld.id, playerIndex: bld.owner, techDefId: techId,
        });
      }
    }
  }
}
