/**
 * 超级武器系统 — 4行会终局能力
 *
 *  法师公会    | 元素风暴     | 12s  | 300s | AOE 持续伤害，范围内敌方每秒受魔法伤害
 *  机械行会    | 轨道魔导炮   | 单发 | 240s | 对目标区域造成单次高额物理伤害
 *  炼金协会    | 万能溶剂炸弹 | 20s  | 270s | 范围降护甲+腐蚀伤害
 *  虚空研究院  | 虚空裂隙     | 15s  | 360s | 范围持续伤害+随机传送敌方单位
 *
 * 解锁条件：行会科技研究完成 + 水晶消耗。
 * 冷却计时按玩家独立追踪。
 */

import type { GameWorld } from '../core/GameWorld';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { TECH_DEFS } from '../config/unitData';

/** 超级武器定义 */
interface SuperWeaponDef {
  guild: 'mages_guild' | 'mechanists_guild' | 'alchemists_society' | 'void_institute';
  name: string;
  cooldown: number;     // 秒
  crystalCost: number;
  duration: number;     // 持续型>0，单发型=0
  description: string;
}

export const SUPER_WEAPONS: Record<string, SuperWeaponDef> = {
  elemental_storm: {
    guild: 'mages_guild', name: '元素风暴', cooldown: 300,
    crystalCost: 600, duration: 12,
    description: '12秒内范围内敌方每秒受40魔法伤害',
  },
  orbital_cannon: {
    guild: 'mechanists_guild', name: '轨道魔导炮', cooldown: 240,
    crystalCost: 500, duration: 0,
    description: '对目标区域造成300物理伤害',
  },
  solvent_bomb: {
    guild: 'alchemists_society', name: '万能溶剂炸弹', cooldown: 270,
    crystalCost: 550, duration: 20,
    description: '20秒内范围内敌方护甲-50%，持续腐蚀伤害',
  },
  void_rift: {
    guild: 'void_institute', name: '虚空裂隙', cooldown: 360,
    crystalCost: 700, duration: 15,
    description: '15秒内范围持续虚空伤害，间歇随机传送敌方单位',
  },
};

export const GUILD_SUPER_WEAPON: Record<string, string> = {
  mages_guild: 'elemental_storm',
  mechanists_guild: 'orbital_cannon',
  alchemists_society: 'solvent_bomb',
  void_institute: 'void_rift',
};

export interface SuperWeaponState {
  playerIndex: number;
  weaponId: string;
  active: boolean;
  cooldownTimer: number;     // 剩余冷却秒数（<=0 可用）
  activeTimer: number;        // 剩余持续时间（>0 时激活中）
  targetX: number;
  targetY: number;
}

export class SuperWeaponSystem {
  /** playerIndex -> SuperWeaponState[] */
  private static states = new Map<number, SuperWeaponState[]>();

  /** 初始化玩家超武状态（游戏开始时调用） */
  static initPlayer(playerIndex: number, guilds: string[]): void {
    const weapons: SuperWeaponState[] = [];
    for (const guild of guilds) {
      const weaponId = GUILD_SUPER_WEAPON[guild];
      if (!weaponId) continue;
      weapons.push({
        playerIndex, weaponId, active: false,
        cooldownTimer: 0, activeTimer: 0, targetX: 0, targetY: 0,
      });
    }
    SuperWeaponSystem.states.set(playerIndex, weapons);
  }

  /** 审4: 重置全部超武状态（重开/换关时调用，防止 static Map 泄漏） */
  static reset(): void {
    SuperWeaponSystem.states.clear();
  }

  /** 每帧更新：冷却计时 + 持续时间推进 */
  static update(deltaSec: number): void {
    for (const [, weapons] of SuperWeaponSystem.states) {
      for (const w of weapons) {
        if (w.cooldownTimer > 0) {
          w.cooldownTimer -= deltaSec;
        }
        if (w.active) {
          if (w.activeTimer > 0) {
            w.activeTimer -= deltaSec;
          }
          // P0 修复: 单发型(activeTimer=0)或持续型到期(activeTimer<=0)都应翻转 active,
          // 否则单发型超武激活后 active 永驻, 下次 activate 被第 129 行 "已在激活中" 永久拦截。
          if (w.activeTimer <= 0) {
            w.active = false;
            w.activeTimer = 0;
          }
        }
      }
    }
  }

  /** 激活超级武器。返回 null=成功，字符串=失败原因 */
  static activate(
    playerIndex: number,
    weaponId: string,
    targetX: number,
    targetY: number,
    world: GameWorld,
    units: Unit[],
    buildings: Building[],
  ): string | null {
    const weapons = SuperWeaponSystem.states.get(playerIndex);
    const state = weapons?.find(w => w.weaponId === weaponId);
    if (!state) return '该行会未解锁超级武器';

    const def = SUPER_WEAPONS[weaponId];
    if (!def) return '超级武器数据不存在';

    if (state.cooldownTimer > 0) return `冷却中 (${Math.ceil(state.cooldownTimer)}s)`;
    if (state.active) return '超级武器已在激活中';

    const player = world.players[playerIndex];
    if (!player) return '玩家不存在';

    // 批4: 启用超武科技门槛 — 必须先研究对应行会的超武解锁科技（tech:{weaponId}）
    // 此前此处被注释掉（"第一期直接可用"），现正式启用，与公会科技树（批2/批3）打通。
    const unlockTechId = `tech:${weaponId}`;
    const tt = world.techTrees.get(playerIndex);
    const unlocked = tt?.isResearched(unlockTechId) ?? false;
    if (!unlocked) {
      const techName = TECH_DEFS[unlockTechId]?.name ?? unlockTechId;
      return `需先研究「${techName}」`;
    }

    if (!world.canAfford(playerIndex, { crystal: def.crystalCost, industry: 0 })) return '水晶不足';

    world.spend(playerIndex, { crystal: def.crystalCost, industry: 0 });

    state.active = true;
    state.activeTimer = def.duration;
    state.cooldownTimer = def.cooldown;
    state.targetX = targetX;
    state.targetY = targetY;

    // 执行初始效果
    SuperWeaponSystem._applyEffect(weaponId, playerIndex, targetX, targetY, units, buildings);

    EventBus.emit(GameEvent.ABILITY_USED, {
      unitId: '', abilityId: weaponId, playerIndex,
    });

    return null; // 成功
  }

  /** 应用持续效果（每帧由调用方显式调用，用于持续型超武） */
  static applyActiveEffects(
    playerIndex: number,
    units: Unit[],
    buildings: Building[],
    deltaSec: number,
  ): void {
    const weapons = SuperWeaponSystem.states.get(playerIndex);
    if (!weapons) return;

    for (const w of weapons) {
      if (!w.active || w.activeTimer <= 0) continue;
      SuperWeaponSystem._applyActiveEffect(w.weaponId, w.playerIndex, w.targetX, w.targetY, units, buildings, deltaSec);
    }
  }

  /** 获取玩家超武状态列表（供 UI 显示） */
  static getStates(playerIndex: number): SuperWeaponState[] {
    return SuperWeaponSystem.states.get(playerIndex) ?? [];
  }

  /** 获取所有玩家的超武状态快照（存档用：playerIndex → SuperWeaponState[]） */
  static snapshotAll(): Record<number, SuperWeaponState[]> {
    const out: Record<number, SuperWeaponState[]> = {};
    for (const [pi, weapons] of SuperWeaponSystem.states) {
      // 深拷贝避免外部修改污染 static Map
      out[pi] = weapons.map(w => ({ ...w }));
    }
    return out;
  }

  /** 从存档恢复所有玩家的超武状态（读档用：清空再按快照写入） */
  static restoreAll(snapshot: Record<number, SuperWeaponState[]>): void {
    SuperWeaponSystem.states.clear();
    for (const [piStr, weapons] of Object.entries(snapshot)) {
      const pi = Number(piStr);
      if (!Number.isFinite(pi)) continue;
      SuperWeaponSystem.states.set(pi, (weapons ?? []).map(w => ({ ...w })));
    }
  }

  /** 获取指定超武的定义 */
  static getDef(weaponId: string): SuperWeaponDef | undefined {
    return SUPER_WEAPONS[weaponId];
  }

  // ============ 效果实现 ============

  /**
   * 范围伤害工具：对 (tx,ty) 周边 radius 格内的"敌方存活动/建筑"施加伤害。
   * P1 重构: 抽出原 6 处复制 AOE 循环; tile 坐标统一 Math.round 归一避免移动插值浮点漂移。
   */
  private static applyAoe(
    playerIndex: number,
    tx: number, ty: number,
    radius: number,
    units: Unit[],
    buildings: Building[],
    apply: (target: Unit | Building) => void,
  ): void {
    const cx = Math.round(tx);
    const cy = Math.round(ty);
    for (const u of units) {
      if (u.owner === playerIndex || !u.isAlive) continue;
      if (Math.abs(Math.round(u.tileX) - cx) <= radius && Math.abs(Math.round(u.tileY) - cy) <= radius) {
        apply(u);
      }
    }
    for (const b of buildings) {
      if (b.owner === playerIndex || !b.isAlive) continue;
      if (Math.abs(Math.round(b.tileX) - cx) <= radius && Math.abs(Math.round(b.tileY) - cy) <= radius) {
        apply(b);
      }
    }
  }

  private static _applyEffect(
    weaponId: string,
    playerIndex: number,
    tx: number, ty: number,
    units: Unit[],
    buildings: Building[],
  ): void {
    switch (weaponId) {
      case 'elemental_storm':
        // 无初始瞬发伤害，持续伤害在 applyActiveEffects
        break;
      case 'orbital_cannon':
        // 单发高额物理伤害 (半径 5, 同时命中单位+建筑)
        SuperWeaponSystem.applyAoe(playerIndex, tx, ty, 5, units, buildings, (t) => t.takeDamage(300, 'physical'));
        break;
      case 'solvent_bomb':
        // 初始腐蚀命中：范围内敌方护甲 -50% 持续 + 50 炼金伤害 (仅单位, 半径 5)
        SuperWeaponSystem.applyAoe(playerIndex, tx, ty, 5, units, [], (t) => {
          const u = t as Unit;
          u.armor = Math.max(0, Math.round(u.armor * 0.5));
          u.takeDamage(50, 'alchemy');
        });
        break;
      case 'void_rift':
        // 初始虚空爆发 (半径 6, 仅单位)
        SuperWeaponSystem.applyAoe(playerIndex, tx, ty, 6, units, [], (t) => t.takeDamage(80, 'void'));
        break;
      default:
        // P1 防御: 未知 weaponId 不应静默吞掉, 留 console.warn 便于排查漏写 case
        console.warn(`[SuperWeaponSystem] 未知 weaponId: ${weaponId} (_applyEffect)`);
    }
  }

  private static _applyActiveEffect(
    weaponId: string,
    playerIndex: number,
    tx: number, ty: number,
    units: Unit[],
    buildings: Building[],
    deltaSec: number,
  ): void {
    // 审5: 持续伤害统一走 Unit.takeDamage，由 Entity 内部结算护盾/护甲/死亡，
    // 确保触发 UNIT_KILLED/HERO_DIED/护盾吸收/XP 奖励等事件，不再手动改 hp/isActive。
    switch (weaponId) {
      case 'elemental_storm':
        // 持续魔法 AOE: 每秒 40 伤害 (半径 6)
        SuperWeaponSystem.applyAoe(playerIndex, tx, ty, 6, units, [], (t) => t.takeDamage(40 * deltaSec, 'magic'));
        break;
      case 'solvent_bomb':
        // 持续腐蚀: 每秒 25 伤害 (半径 5)
        SuperWeaponSystem.applyAoe(playerIndex, tx, ty, 5, units, [], (t) => t.takeDamage(25 * deltaSec, 'alchemy'));
        break;
      case 'void_rift':
        // 持续虚空伤害 (半径 6); 间歇传送由调用方另行处理
        SuperWeaponSystem.applyAoe(playerIndex, tx, ty, 6, units, [], (t) => t.takeDamage(30 * deltaSec, 'void'));
        break;
      case 'orbital_cannon':
        // 单发型无持续效果
        break;
      default:
        console.warn(`[SuperWeaponSystem] 未知 weaponId: ${weaponId} (_applyActiveEffect)`);
    }
  }
}