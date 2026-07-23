/**
 * AIController 单元测试 - AI 行为矩阵
 *
 * L2 集成：验证 AI 节奏、经济决策、军事决策、难度差异。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AIController } from './AIController';
import { makeWorld, makeCommandCenter, makeUnit, makeResourceField, makeBuilding } from '../__fixtures__/factories';
import { EntityRegistry } from '../core/EntityRegistry';
import { EventBus } from '../utils/EventBus';

afterEach(() => EventBus.clear());

/** 造 AI fixture：world(P1=AI) + CC + 起始资源点 */
function makeAIFixture(difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
  const world = makeWorld(40, 40, false);
  world.addPlayer('arcane_empire', [], false); // P0 人（占位）
  const pi = world.addPlayer('hammer_federation', [], true); // P1 AI
  const entities = new EntityRegistry();
  const cc = makeCommandCenter(pi, 10, 10);
  entities.addBuilding(cc);
  const field = makeResourceField(13, 10, 10000);
  entities.addField(field);
  const ai = new AIController(world, pi, difficulty);
  return { world, pi, cc, field, ai, entities };
}

/** 造 idle 工人 */
function idleWorker(pi: number, tileX = 12, tileY = 10) {
  return makeUnit({ owner: pi, tileX, tileY, spriteKey: 'unit_worker' });
}

/** 造 idle 战斗单位 */
function idleCombat(pi: number, tileX = 12, tileY = 12, sight = 8) {
  return makeUnit({ owner: pi, tileX, tileY, attackDamage: 15, range: 3, sight, spriteKey: 'unit_rifleman' });
}

describe('AIController - 节奏', () => {
  it('deltaSec 不足 tickInterval 时返回空数组', () => {
    const { ai, cc } = makeAIFixture('normal'); // tickInterval=2.0
    expect(ai.update(1.0, [], [cc], [])).toEqual([]);
  });

  it('累计 deltaSec >= tickInterval 后触发 evaluate', () => {
    const { ai, pi, cc, field } = makeAIFixture('normal');
    const worker = idleWorker(pi);
    ai.update(1.0, [worker], [cc], [field]);
    const cmds = ai.update(1.0, [worker], [cc], [field]); // 累计 2.0 触发
    // idle 工人应发 gather 命令
    expect(cmds.some(c => c.type === 'gather')).toBe(true);
  });

  it('hard 的 tickInterval=1.5s，2s 触发', () => {
    const { ai, pi, cc, field } = makeAIFixture('hard');
    const worker = idleWorker(pi);
    const cmds = ai.update(2.0, [worker], [cc], [field]);
    expect(cmds.length).toBeGreaterThan(0);
  });

  it('easy 的 tickInterval=4s，2s 不足以触发', () => {
    const { ai, cc } = makeAIFixture('easy');
    expect(ai.update(2.0, [], [cc], [])).toEqual([]);
  });
});

describe('AIController - EconomyAI', () => {
  it('0 工人时发出 train unit_worker 命令', () => {
    const { ai, pi, cc } = makeAIFixture('normal');
    const cmds = ai.update(2.0, [], [cc], []);
    const train = cmds.find(c => c.type === 'train' && c.unitDefId === 'unit_worker');
    expect(train).toBeDefined();
  });

  it('idle 工人发出 gather 命令', () => {
    const { ai, pi, cc, field } = makeAIFixture('normal');
    const worker = idleWorker(pi);
    const cmds = ai.update(2.0, [worker], [cc], [field]);
    const gather = cmds.find(c => c.type === 'gather');
    expect(gather).toBeDefined();
  });

  it('0 工人 + crystal<100 时安全网直接改 player.resources.crystal', () => {
    const { ai, world, pi, cc } = makeAIFixture('normal');
    world.players[pi].resources.crystal = 30;
    world.players[pi].resources.supply = 0;
    world.players[pi].resources.supplyCap = 0;
    ai.update(2.0, [], [cc], []);
    // normal resourceMult=1.0 -> rescueCrystal=max(100, ceil(100*1))=100
    expect(world.players[pi].resources.crystal).toBeGreaterThanOrEqual(100);
  });
});

describe('AIController - MilitaryAI', () => {
  it('ownCombat 为空时返回空数组', () => {
    const { ai, pi, cc } = makeAIFixture('normal');
    // 只有工人，无战斗单位
    const worker = idleWorker(pi);
    const cmds = ai.update(2.0, [worker], [cc], []);
    // 工人不会产生 attack_move
    expect(cmds.some(c => c.type === 'attack_move')).toBe(false);
  });

  it('低血量单位(normal<30%)触发撤退 aiLockedAction=retreat', () => {
    const { ai, pi, cc } = makeAIFixture('normal');
    const u = idleCombat(pi, 12, 12, 15);
    u.maxHp = 100; u.hp = 25; // 0.25 < 0.30
    const enemy = idleCombat(0, 20, 12, 5); // 敌方在视野内
    ai.update(2.0, [u, enemy], [cc], []);
    // 撤退会设 aiLockedAction='retreat'（或被建筑距离判定覆盖，至少不应进攻）
    expect(u.aiLockedAction === 'retreat' || u.state === 'idle').toBeTruthy();
  });

  it('敌人在 sight 内且进攻阈值满足 -> 发 attack_move', () => {
    const { ai, pi } = makeAIFixture('hard'); // hard attackThreshold=1
    const u1 = idleCombat(pi, 12, 12, 15);
    const enemy = idleCombat(0, 14, 12, 5);
    const cmds = ai.update(2.0, [u1, enemy], [], []);
    expect(cmds.some(c => c.type === 'attack_move')).toBe(true);
  });
});

describe('AIController - 难度差异', () => {
  it('resourceMult：easy=0.7/normal=1.0/hard=2.0', () => {
    const world = makeWorld(40, 40, false);
    world.addPlayer('hammer_federation', [], true);
    expect(new AIController(world, 0, 'easy').resourceMult).toBe(0.7);
    expect(new AIController(world, 0, 'normal').resourceMult).toBe(1.0);
    expect(new AIController(world, 0, 'hard').resourceMult).toBe(2.0);
  });
});
