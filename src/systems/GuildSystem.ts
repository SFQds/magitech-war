/**
 * 行会系统 — 行会核心机制（奥术充能 / 流水线协议）
 *
 * 读取 PlayerState.guilds 判断玩家所属行会，每帧应用机制效果。
 */

import type { PlayerState } from '../types/entity';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';

/** 行会充能计时器（全局每玩家） */
const chargeTimers = new Map<number, number>();

/** 奥术充能间隔（秒） */
const CHARGE_INTERVAL = 30;
/** 最大充能层数 */
const MAX_CHARGES = 3;
/** 充能单位 spriteKey 列表 */
const CHARGE_UNITS = new Set(['unit_battle_mage', 'unit_arcane_guard']);
/** 充能激活时临时护盾值 */
const CHARGE_SHIELD = 150;

export class GuildSystem {
  /** 每帧更新行会机制 */
  static update(
    players: PlayerState[],
    units: Unit[],
    buildings: Building[],
    deltaSec: number,
  ): void {
    for (const player of players) {
      const guilds = player.guilds;

      // === 法师公会：奥术充能 ===
      if (guilds.includes('mages_guild')) {
        let timer = chargeTimers.get(player.index) ?? 0;
        timer += deltaSec;
        if (timer >= CHARGE_INTERVAL) {
          timer -= CHARGE_INTERVAL;
          // 为所有符合条件的单位充能
          for (const unit of units) {
            if (unit.owner !== player.index || !unit.isAlive) continue;
            if (!CHARGE_UNITS.has(unit.spriteKey)) continue;
            unit.abilityCharges = Math.min(unit.abilityCharges + 1, MAX_CHARGES);
          }
        }
        chargeTimers.set(player.index, timer);

        // 自动消耗充能：HP<50%时消耗2层激活临时护盾
        for (const unit of units) {
          if (unit.owner !== player.index || !unit.isAlive) continue;
          if (!CHARGE_UNITS.has(unit.spriteKey)) continue;
          if (unit.hpPercent < 0.5 && unit.abilityCharges >= 2 && unit.shieldHp <= 0) {
            unit.abilityCharges -= 2;
            unit.shieldHp = CHARGE_SHIELD;
            unit.maxShieldHp = CHARGE_SHIELD;
          }
        }
      }

      // === 机械行会：流水线协议 ===
      if (guilds.includes('mechanists_guild')) {
        // 已通过 ProductionSystem.startProduction 的 faction bonus 实现加速，
        // 这里不做额外处理。完整并行训练需要 Building 结构变更（P2）。
      }
    }
  }
}