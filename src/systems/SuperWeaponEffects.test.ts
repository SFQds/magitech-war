/**
 * SuperWeaponSystem 效果逻辑测试 — 闭合最危险的功能盲区
 *
 * 现有 SuperWeaponSystem.test.ts 只测 activate 门控（科技/水晶/行会/冷却），
 * 传入空 units/buildings 数组。本文件验证核心战斗效果：
 *  - _applyEffect 初始伤害（轨道炮 300 / 溶剂弹护甲-50%+50 / 虚空裂隙 80 / 元素风暴无瞬发）
 *  - 范围判定（命中范围内敌方、不命中范围外、不命中友方、跳过死亡）
 *  - _applyActiveEffect 持续伤害（按 deltaSec 缩放）
 *  - update 冷却/持续时间推进、到期停止
 *  - applyActiveEffects 只对 active 生效
 *  - snapshotAll/restoreAll 存档往返
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SuperWeaponSystem, SuperWeaponState } from './SuperWeaponSystem';
import { makeWorld, makeUnit, makeBuilding, makeDeadUnit } from '../__fixtures__/factories';
import { EventBus } from '../utils/EventBus';

beforeEach(() => {
  EventBus.clear();
  SuperWeaponSystem.reset();
});

afterEach(() => {
  EventBus.clear();
  SuperWeaponSystem.reset();
});

/** 构造带指定行会的玩家世界（水晶充足 2000） */
function setupPlayer(guilds: string[]) {
  const world = makeWorld(32, 32, false);
  world.addPlayer('arcane_empire', guilds, false);
  return world;
}

/**
 * 完整激活指定超武（完成科技 + initPlayer + activate），返回 world 与该超武状态。
 * 假定水晶充足（默认 2000）、玩家 0、目标 (tx,ty)。
 */
function activateWeapon(
  weaponId: string,
  guild: string,
  units: any[],
  buildings: any[] = [],
  tx = 10,
  ty = 10,
) {
  const world = setupPlayer([guild]);
  SuperWeaponSystem.initPlayer(0, [guild]);
  world.techTrees.get(0)!.completeTech(`tech:${weaponId}`);
  const res = SuperWeaponSystem.activate(0, weaponId, tx, ty, world, units, buildings);
  expect(res).toBeNull(); // 确保激活成功，排除门控干扰
  const state = SuperWeaponSystem.getStates(0).find(s => s.weaponId === weaponId)!;
  return { world, state };
}

// ============ _applyEffect 初始伤害 ============

describe('SuperWeaponSystem - _applyEffect 初始伤害', () => {
  it('orbital_cannon: 范围内敌方单位受 300 物理伤害', () => {
    const enemy = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 500 });
    const hpBefore = enemy.hp;
    activateWeapon('orbital_cannon', 'mechanists_guild', [enemy], [], 10, 10);
    expect(enemy.hp).toBe(hpBefore - 300);
  });

  it('orbital_cannon: 范围内敌方建筑受 300 物理伤害', () => {
    const enemyBld = makeBuilding({ owner: 1, tileX: 10, tileY: 10, hp: 800 });
    const hpBefore = enemyBld.hp;
    activateWeapon('orbital_cannon', 'mechanists_guild', [], [enemyBld], 10, 10);
    expect(enemyBld.hp).toBe(hpBefore - 300);
  });

  it('orbital_cannon: 致命伤害杀死单位 (hp<=0 -> isAlive=false)', () => {
    const enemy = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 100 });
    activateWeapon('orbital_cannon', 'mechanists_guild', [enemy], [], 10, 10);
    expect(enemy.isAlive).toBe(false);
  });

  it('solvent_bomb: 范围内敌方护甲 -50% (向下取整) + 50 炼金伤害(被减后护甲减免)', () => {
    // 注意 takeDamage 会按 effectiveArmor 减伤: final = max(1, 50 - armor)
    const enemy = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 200 });
    enemy.armor = 10;
    const hpBefore = enemy.hp;
    activateWeapon('solvent_bomb', 'alchemists_society', [enemy], [], 10, 10);
    expect(enemy.armor).toBe(5);                          // round(10 * 0.5)
    expect(enemy.hp).toBe(hpBefore - Math.max(1, 50 - 5)); // 50 - 5(减后护甲) = 45
  });

  it('solvent_bomb: 护甲归零下限保护 (armor=3 -> max(0, round(1.5))=2)', () => {
    const enemy = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 200 });
    enemy.armor = 3;
    activateWeapon('solvent_bomb', 'alchemists_society', [enemy], [], 10, 10);
    expect(enemy.armor).toBe(Math.max(0, Math.round(3 * 0.5)));
  });

  it('void_rift: 范围内敌方受 80 虚空伤害', () => {
    const enemy = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 200 });
    const hpBefore = enemy.hp;
    activateWeapon('void_rift', 'void_institute', [enemy], [], 10, 10);
    expect(enemy.hp).toBe(hpBefore - 80);
  });

  it('elemental_storm: 无初始瞬发伤害（持续伤害在 applyActiveEffects）', () => {
    const enemy = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 200 });
    const hpBefore = enemy.hp;
    activateWeapon('elemental_storm', 'mages_guild', [enemy], [], 10, 10);
    expect(enemy.hp).toBe(hpBefore); // 瞬发 0 伤害
  });
});

// ============ 范围判定与目标过滤 ============

describe('SuperWeaponSystem - 范围与目标过滤', () => {
  it('范围内敌方命中，范围外敌方不命中', () => {
    const inRange = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 500 });   // 距离 0
    const edge = makeUnit({ owner: 1, tileX: 15, tileY: 10, hp: 500 });      // 距离 5 (<=5 命中)
    const outOfRange = makeUnit({ owner: 1, tileX: 16, tileY: 10, hp: 500 }); // 距离 6 (>5 不命中)
    const hpIn = inRange.hp, hpEdge = edge.hp, hpOut = outOfRange.hp;
    activateWeapon('orbital_cannon', 'mechanists_guild', [inRange, edge, outOfRange], [], 10, 10);
    expect(inRange.hp).toBe(hpIn - 300);
    expect(edge.hp).toBe(hpEdge - 300);
    expect(outOfRange.hp).toBe(hpOut); // 未受伤
  });

  it('友方单位（owner===playerIndex）不受伤害', () => {
    const friendly = makeUnit({ owner: 0, tileX: 10, tileY: 10, hp: 500 });
    const hpBefore = friendly.hp;
    activateWeapon('orbital_cannon', 'mechanists_guild', [friendly], [], 10, 10);
    expect(friendly.hp).toBe(hpBefore);
  });

  it('死亡单位（isAlive=false）被跳过', () => {
    const dead = makeDeadUnit({ owner: 1, tileX: 10, tileY: 10 });
    const hpDead = dead.hp;
    activateWeapon('orbital_cannon', 'mechanists_guild', [dead], [], 10, 10);
    expect(dead.hp).toBe(hpDead); // 死亡单位不再受伤害
  });

  it('void_rift 半径 6（比 orbital_cannon 的 5 大一格）', () => {
    const at6 = makeUnit({ owner: 1, tileX: 16, tileY: 10, hp: 500 }); // 距离 6
    const hpBefore = at6.hp;
    activateWeapon('void_rift', 'void_institute', [at6], [], 10, 10);
    expect(at6.hp).toBe(hpBefore - 80); // void_rift 半径 6 命中
  });

  it('elemental_storm 持续半径 6（在 applyActiveEffects 中）', () => {
    const at6 = makeUnit({ owner: 1, tileX: 16, tileY: 10, hp: 500 });
    const at7 = makeUnit({ owner: 1, tileX: 17, tileY: 10, hp: 500 });
    const { world } = activateWeapon('elemental_storm', 'mages_guild', [at6, at7], [], 10, 10);
    const hp6 = at6.hp, hp7 = at7.hp;
    SuperWeaponSystem.applyActiveEffects(0, [at6, at7], [], 1.0); // 1 秒
    expect(at6.hp).toBe(hp6 - 40); // 半径 6 命中
    expect(at7.hp).toBe(hp7);       // 距离 7 不命中
    void world;
  });
});

// ============ _applyActiveEffect 持续伤害 ============

describe('SuperWeaponSystem - _applyActiveEffect 持续伤害', () => {
  it('elemental_storm: 每秒 40 魔法伤害，按 deltaSec 缩放', () => {
    const enemy = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 500 });
    activateWeapon('elemental_storm', 'mages_guild', [enemy], [], 10, 10);
    const hpBefore = enemy.hp;
    SuperWeaponSystem.applyActiveEffects(0, [enemy], [], 0.5); // 半秒
    expect(enemy.hp).toBeCloseTo(hpBefore - 40 * 0.5, 5);
  });

  it('solvent_bomb: 每秒 25 炼金伤害', () => {
    const enemy = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 500 });
    activateWeapon('solvent_bomb', 'alchemists_society', [enemy], [], 10, 10);
    const hpBefore = enemy.hp;
    SuperWeaponSystem.applyActiveEffects(0, [enemy], [], 2.0); // 2 秒
    expect(enemy.hp).toBeCloseTo(hpBefore - 25 * 2.0, 5);
  });

  it('void_rift: 每秒 30 虚空伤害', () => {
    const enemy = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 500 });
    activateWeapon('void_rift', 'void_institute', [enemy], [], 10, 10);
    const hpBefore = enemy.hp;
    SuperWeaponSystem.applyActiveEffects(0, [enemy], [], 1.0);
    expect(enemy.hp).toBeCloseTo(hpBefore - 30 * 1.0, 5);
  });

  it('orbital_cannon: 单发型无持续效果（applyActiveEffects 不造成伤害）', () => {
    const enemy = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 500 });
    activateWeapon('orbital_cannon', 'mechanists_guild', [enemy], [], 10, 10);
    const hpBefore = enemy.hp;
    SuperWeaponSystem.applyActiveEffects(0, [enemy], [], 1.0);
    expect(enemy.hp).toBe(hpBefore); // 单发型无持续伤害
  });

  it('applyActiveEffects 对未激活玩家无效果', () => {
    const enemy = makeUnit({ owner: 1, tileX: 10, tileY: 10, hp: 500 });
    // 玩家 1 未 initPlayer，applyActiveEffects 应直接 return
    const hpBefore = enemy.hp;
    SuperWeaponSystem.applyActiveEffects(1, [enemy], [], 1.0);
    expect(enemy.hp).toBe(hpBefore);
  });
});

// ============ update 冷却/持续计时 ============

describe('SuperWeaponSystem - update 计时推进', () => {
  it('激活后 cooldownTimer 设为定义值, active=true (单发型 duration=0 但 activate 仍置 active)', () => {
    const { state } = activateWeapon('orbital_cannon', 'mechanists_guild', [], [], 10, 10);
    expect(state.cooldownTimer).toBe(240); // orbital_cannon cooldown 240s
    expect(state.active).toBe(true);        // activate 无条件置 true
    expect(state.activeTimer).toBe(0);      // 单发型 duration=0
    // 下一帧 update 会因 activeTimer<=0 翻转 active
    SuperWeaponSystem.update(0.01);
    expect(state.active).toBe(false);
    SuperWeaponSystem.update(40);
    // 浮点累积: 240 - 40.01 ≈ 199.99, 用范围断言避免精度问题
    expect(state.cooldownTimer).toBeLessThan(200);
    expect(state.cooldownTimer).toBeGreaterThan(199);
  });

  it('持续型超武 active=true, activeTimer 随 update 减少，到期后 active=false', () => {
    const { state } = activateWeapon('elemental_storm', 'mages_guild', [], [], 10, 10);
    expect(state.active).toBe(true);
    expect(state.activeTimer).toBe(12); // elemental_storm duration 12s
    SuperWeaponSystem.update(5);
    expect(state.activeTimer).toBe(7);
    expect(state.active).toBe(true);
    SuperWeaponSystem.update(7); // 累计 12s，到期
    expect(state.activeTimer).toBe(0);
    expect(state.active).toBe(false);
  });

  it('cooldownTimer 不降到负值（update 后保持 <=0 即可）', () => {
    const { state } = activateWeapon('orbital_cannon', 'mechanists_guild', [], [], 10, 10);
    SuperWeaponSystem.update(999); // 远超 240s
    expect(state.cooldownTimer).toBeLessThanOrEqual(0);
  });

  it('P0 回归: 单发型超武激活后, 下一帧 update 必须翻转 active=false (否则永久无法再激活)', () => {
    // 历史 bug: update 用 `active && activeTimer>0` 守卫, 单发型 activeTimer=0 永不进入翻转分支,
    // 导致 active 永驻, 下次 activate 被第 129 行 "已在激活中" 拦截。
    const { world } = activateWeapon('orbital_cannon', 'mechanists_guild', [], [], 10, 10);
    const state = SuperWeaponSystem.getStates(0)[0];
    expect(state.active).toBe(true); // activate 刚完成仍 true
    SuperWeaponSystem.update(0.016);  // 一帧
    expect(state.active).toBe(false); // 必须翻转
    // 冷却结束后可再次激活(不被 active 拦截)
    SuperWeaponSystem.update(240);
    expect(state.cooldownTimer).toBeLessThanOrEqual(0);
    const res = SuperWeaponSystem.activate(0, 'orbital_cannon', 12, 12, world, [], []);
    expect(res).toBeNull(); // 再次激活成功
  });
});

// ============ snapshotAll / restoreAll 存档往返 ============

describe('SuperWeaponSystem - 存档快照往返', () => {
  it('snapshotAll 返回深拷贝，修改快照不影响 static Map', () => {
    activateWeapon('orbital_cannon', 'mechanists_guild', [], [], 10, 10);
    const snap = SuperWeaponSystem.snapshotAll();
    expect(snap[0]).toBeDefined();
    expect(snap[0].length).toBeGreaterThan(0);
    const original = snap[0][0].cooldownTimer;
    snap[0][0].cooldownTimer = 999; // 篡改快照
    const live = SuperWeaponSystem.getStates(0)[0];
    expect(live.cooldownTimer).toBe(original); // 原 state 未被污染
  });

  it('restoreAll 清空再按快照写入，状态完全恢复', () => {
    activateWeapon('elemental_storm', 'mages_guild', [], [], 7, 8);
    const snap = SuperWeaponSystem.snapshotAll();
    const origState: SuperWeaponState = { ...snap[0][0] };

    SuperWeaponSystem.reset(); // 模拟读档前清空
    expect(SuperWeaponSystem.getStates(0)).toEqual([]);

    SuperWeaponSystem.restoreAll(snap);
    const restored = SuperWeaponSystem.getStates(0)[0];
    expect(restored.weaponId).toBe(origState.weaponId);
    expect(restored.active).toBe(origState.active);
    expect(restored.activeTimer).toBe(origState.activeTimer);
    expect(restored.cooldownTimer).toBe(origState.cooldownTimer);
    expect(restored.targetX).toBe(7);
    expect(restored.targetY).toBe(8);
  });

  it('restoreAll 跳过非法 playerIndex（NaN）', () => {
    const snap: Record<number, SuperWeaponState[]> = {
      0: [{ playerIndex: 0, weaponId: 'orbital_cannon', active: false, cooldownTimer: 100, activeTimer: 0, targetX: 0, targetY: 0 }],
      [Number.NaN]: [{ playerIndex: NaN, weaponId: 'x', active: false, cooldownTimer: 0, activeTimer: 0, targetX: 0, targetY: 0 } as any],
    };
    SuperWeaponSystem.restoreAll(snap);
    expect(SuperWeaponSystem.getStates(0).length).toBe(1);
    // NaN key 被 Number.isFinite 过滤
  });

  it('restoreAll 深拷贝：修改恢复后的 state 不污染传入快照', () => {
    const snap: Record<number, SuperWeaponState[]> = {
      0: [{ playerIndex: 0, weaponId: 'orbital_cannon', active: false, cooldownTimer: 50, activeTimer: 0, targetX: 1, targetY: 2 }],
    };
    SuperWeaponSystem.restoreAll(snap);
    SuperWeaponSystem.getStates(0)[0].cooldownTimer = 777;
    expect(snap[0][0].cooldownTimer).toBe(50); // 快照未被污染
  });
});

// ============ getDef / getStates 边界 ============

describe('SuperWeaponSystem - 查询接口', () => {
  it('getDef 返回超武定义，未知 id 返回 undefined', () => {
    expect(SuperWeaponSystem.getDef('orbital_cannon')?.name).toBe('轨道魔导炮');
    expect(SuperWeaponSystem.getDef('nonexistent')).toBeUndefined();
  });

  it('getStates 未 init 的玩家返回空数组', () => {
    expect(SuperWeaponSystem.getStates(99)).toEqual([]);
  });

  it('initPlayer 跳过无对应超武的行会', () => {
    SuperWeaponSystem.initPlayer(0, ['mages_guild', 'unknown_guild']);
    const states = SuperWeaponSystem.getStates(0);
    expect(states.length).toBe(1);
    expect(states[0].weaponId).toBe('elemental_storm');
  });
});
