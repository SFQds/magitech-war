/**
 * GameOverController 单元测试 — 胜负/宽限期/限时/分数
 *
 * L2 集成：用 phaserStub 提供 scene，验证歼灭判定、宽限翻盘、限时分数计算。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameOverController } from './GameOverController';
import { makeStubScene } from '../__fixtures__/phaserStub';
import { makeWorld, makeCommandCenter, makeUnit } from '../__fixtures__/factories';
import { EntityRegistry } from '../core/EntityRegistry';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';

let world: ReturnType<typeof makeWorld>;
let entities: EntityRegistry;
let ctrl: GameOverController;
let scene: any;
let gameOverSpy: (data: unknown) => void;

beforeEach(() => {
  EventBus.clear();
  world = makeWorld(32, 32, true);
  entities = new EntityRegistry();
  scene = makeStubScene();
  ctrl = new GameOverController(scene, world, entities);
  gameOverSpy = vi.fn() as unknown as (data: unknown) => void;
  EventBus.on(GameEvent.GAME_OVER, gameOverSpy);
});

afterEach(() => { EventBus.clear(); ctrl.destroy(); });

/** 给玩家 0 和 1 各放一个 CC */
function seedBothCC(): void {
  const cc0 = makeCommandCenter(0, 6, 6);
  const cc1 = makeCommandCenter(1, 26, 26);
  entities.addBuilding(cc0);
  entities.addBuilding(cc1);
}

/** 杀光某玩家所有建筑 */
function killAllBuildings(owner: number): void {
  for (const b of entities.buildings) {
    if (b.owner === owner) b.isActive = false;
  }
}

describe('GameOverController — 歼灭判定', () => {
  it('一方建筑全失+无工人+宽限满 60s → 判歼灭，winnerIndex 正确', () => {
    seedBothCC();
    killAllBuildings(1); // P1( AI ) 建筑全失
    // P1 无 worker
    ctrl.advanceGraceTimers(60.0);
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(true);
    expect(gameOverSpy).toHaveBeenCalledWith(expect.objectContaining({ winnerIndex: 0, reason: 'annihilated' }));
  });

  it('双方同帧宽限满 → 平局 winnerIndex=-1', () => {
    seedBothCC();
    killAllBuildings(0);
    killAllBuildings(1);
    ctrl.advanceGraceTimers(60.0);
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(true);
    expect(gameOverSpy).toHaveBeenCalledWith(expect.objectContaining({ winnerIndex: -1 }));
  });

  it('无建筑但有 worker → 不判歼灭（worker 兜底）', () => {
    seedBothCC();
    killAllBuildings(1);
    const worker = makeUnit({ owner: 1, tileX: 26, tileY: 27, spriteKey: 'unit_worker' });
    entities.addUnit(worker);
    ctrl.advanceGraceTimers(120.0); // 远超 60
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(false);
  });
});

describe('GameOverController — 宽限期', () => {
  it('宽限期内重建（补一个建筑）则不判负', () => {
    seedBothCC();
    killAllBuildings(1);
    ctrl.advanceGraceTimers(59.0); // 接近但未满
    expect(ctrl.isOver).toBe(false);
    // P1 重建建筑
    const rebuilt = makeCommandCenter(1, 26, 26);
    entities.addBuilding(rebuilt);
    ctrl.advanceGraceTimers(10.0); // 远超 60，但有建筑 → 清零
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(false);
  });

  it('宽限精确边界：graceTimers==59 不判负，==60 判负', () => {
    seedBothCC();
    killAllBuildings(1);
    ctrl.advanceGraceTimers(59.0);
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(false);
    ctrl.advanceGraceTimers(1.0);
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(true);
  });
});

describe('GameOverController — 限时判定', () => {
  it('跑满 1800s → 按 calcScore 判胜负，reason=timeout', () => {
    seedBothCC();
    // P0 分数高于 P1
    world.players[0].resources.crystal = 1000;
    world.players[1].resources.crystal = 100;
    entities.addUnit(makeUnit({ owner: 0, hp: 120, attackDamage: 18 }));
    ctrl.stepTimer(1800.0);
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(true);
    expect(gameOverSpy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'timeout' }));
    expect(ctrl.calcScore(0)).toBeGreaterThan(ctrl.calcScore(1));
  });

  it('calcScore 公式：crystal + Σ(maxHp+attackDamage*10)*0.5 + Σ maxHp*0.3', () => {
    world.players[0].resources.crystal = 100;
    const u = makeUnit({ owner: 0, hp: 100, attackDamage: 10 }); // (100+100)*0.5=100
    const b = makeCommandCenter(0, 6, 6); // maxHp 2000*0.3=600
    entities.addUnit(u);
    entities.addBuilding(b);
    expect(ctrl.calcScore(0)).toBe(Math.round(100 + 100 + 600)); // 800
  });

  it('stepTimer 在 isOver=true 后不再推进', () => {
    seedBothCC();
    killAllBuildings(1);
    ctrl.advanceGraceTimers(60.0);
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(true);
    // 再次调用不应改变状态或崩溃
    expect(() => ctrl.stepTimer(100)).not.toThrow();
    expect(ctrl.isOver).toBe(true);
  });
});
