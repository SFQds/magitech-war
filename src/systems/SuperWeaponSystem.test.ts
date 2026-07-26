/**
 * SuperWeaponSystem 单元测试 - 批4: 超武科技门槛
 *
 * 验证 activate 必须先研究对应行会的超武解锁科技（tech:{weaponId}）。
 * 未研究 -> fail；研究后 + 水晶 + 行会齐备 -> 成功激活。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SuperWeaponSystem } from './SuperWeaponSystem';
import { makeWorld } from '../__fixtures__/factories';
import { EventBus } from '../utils/EventBus';

beforeEach(() => {
  EventBus.clear();
  SuperWeaponSystem.reset();
});

afterEach(() => {
  EventBus.clear();
  SuperWeaponSystem.reset();
});

/** 构造一个带指定行会、水晶充足的玩家世界，返回 world + playerIndex */
function setupPlayer(guilds: string[]): ReturnType<typeof makeWorld> {
  const world = makeWorld(32, 32, false);
  world.addPlayer('arcane_empire', guilds, false);
  return world;
}

describe('SuperWeaponSystem - 批4 超武科技门槛', () => {
  it('未研究解锁科技 -> activate 返回失败（含科技名）', () => {
    const world = setupPlayer(['mages_guild']);
    SuperWeaponSystem.initPlayer(0, ['mages_guild']);
    // 玩家有 mages_guild -> 元素风暴在状态列表里；但未研究 tech:elemental_storm
    const res = SuperWeaponSystem.activate(0, 'elemental_storm', 10, 10, world, [], []);
    expect(res).not.toBeNull();
    expect(res).toContain('元素风暴');
  });

  it('研究解锁科技后 -> activate 成功（返回 null）', () => {
    const world = setupPlayer(['mages_guild']);
    SuperWeaponSystem.initPlayer(0, ['mages_guild']);
    world.techTrees.get(0)!.completeTech('tech:elemental_storm');
    const res = SuperWeaponSystem.activate(0, 'elemental_storm', 10, 10, world, [], []);
    expect(res).toBeNull();
    // 扣水晶 600
    expect(world.players[0].resources.crystal).toBe(2000 - 600);
  });

  it('水晶不足时即使科技已研究仍 fail', () => {
    const world = setupPlayer(['mages_guild']);
    world.players[0].resources.crystal = 100; // 不足 600
    SuperWeaponSystem.initPlayer(0, ['mages_guild']);
    world.techTrees.get(0)!.completeTech('tech:elemental_storm');
    const res = SuperWeaponSystem.activate(0, 'elemental_storm', 10, 10, world, [], []);
    expect(res).toContain('水晶不足');
  });

  it('4 行会各自有对应的超武解锁科技路径', () => {
    // 逐行验证：每个行会的超武在研究对应 tech:{weaponId} 后可激活
    const cases: Array<{ guild: string; weaponId: string; tech: string }> = [
      { guild: 'mages_guild', weaponId: 'elemental_storm', tech: 'tech:elemental_storm' },
      { guild: 'mechanists_guild', weaponId: 'orbital_cannon', tech: 'tech:orbital_cannon' },
      { guild: 'alchemists_society', weaponId: 'solvent_bomb', tech: 'tech:solvent_bomb' },
      { guild: 'void_institute', weaponId: 'void_rift', tech: 'tech:void_rift' },
    ];
    for (const c of cases) {
      SuperWeaponSystem.reset();
      const world = setupPlayer([c.guild]);
      SuperWeaponSystem.initPlayer(0, [c.guild]);
      // 未研究 -> fail
      expect(SuperWeaponSystem.activate(0, c.weaponId, 5, 5, world, [], [])).not.toBeNull();
      // 研究后 -> 成功
      world.techTrees.get(0)!.completeTech(c.tech);
      expect(SuperWeaponSystem.activate(0, c.weaponId, 5, 5, world, [], [])).toBeNull();
    }
  });

  it('玩家无该行会时 initPlayer 不会注册该超武 -> activate fail「未解锁」', () => {
    // 玩家只有 alchemists_society，尝试激活 mages_guild 的元素风暴
    const world = setupPlayer(['alchemists_society']);
    SuperWeaponSystem.initPlayer(0, ['alchemists_society']);
    world.techTrees.get(0)!.completeTech('tech:elemental_storm');
    const res = SuperWeaponSystem.activate(0, 'elemental_storm', 10, 10, world, [], []);
    // 状态列表里没有 elemental_storm -> "该行会未解锁超级武器"
    expect(res).toContain('未解锁');
  });
});
