/**
 * 补漏测试 - GameOverController 缺失分支 + HeadlessGameRunner runUntil/faction 选项
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// 皮肤化后 GameOverController 间接 import UIWidget → import Phaser；
// node 测试环境无 window，需 mock phaser 避免模块加载期 ReferenceError。
vi.mock('phaser', () => ({ default: class PhaserStub {} }));
import { GameOverController } from '../controllers/GameOverController';
import { makeStubScene } from '../__fixtures__/phaserStub';
import { makeWorld, makeCommandCenter, makeUnit } from '../__fixtures__/factories';
import { EntityRegistry } from '../core/EntityRegistry';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { HeadlessGameRunner } from '../__fixtures__/HeadlessGameRunner';

describe('GameOverController - supplementary cases', () => {
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

  function seedBothCC() {
    entities.addBuilding(makeCommandCenter(0, 6, 6));
    entities.addBuilding(makeCommandCenter(1, 26, 26));
  }
  function killAllBuildings(owner: number) {
    for (const b of entities.buildings) if (b.owner === owner) b.isActive = false;
  }

  it('checkGameOver is a no-op once already over (no re-emit)', () => {
    seedBothCC();
    killAllBuildings(1);
    ctrl.advanceGraceTimers(60);
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(true);
    const callsBefore = (gameOverSpy as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    ctrl.checkGameOver(); // second call
    expect((gameOverSpy as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it('advanceGraceTimers does not accumulate for a player who still has a building', () => {
    seedBothCC();
    ctrl.advanceGraceTimers(70); // both have CCs
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(false);
  });

  it('calcScore returns 0 for an out-of-range player index', () => {
    expect(ctrl.calcScore(99)).toBe(0);
  });

  it('calcScore excludes dead units and dead buildings (only crystal counts)', () => {
    const u = makeUnit({ owner: 0, hp: 100, attackDamage: 10 });
    u.hp = 0; // dead
    const b = makeCommandCenter(0, 6, 6);
    b.hp = 0; // dead
    entities.addUnit(u);
    entities.addBuilding(b);
    // score should be only the player's crystal (2000), dead unit/building excluded
    const score = ctrl.calcScore(0);
    const crystal = world.getPlayer(0)!.resources.crystal;
    expect(score).toBe(crystal);
    // if they were alive, score would be much higher
    expect(score).toBeLessThan(crystal + (u.maxHp + u.attackDamage * 10) * 0.5 + b.maxHp * 0.3);
  });

  it('timeout with equal scores emits GAME_OVER winnerIndex=-1 (draw)', () => {
    seedBothCC();
    // equal crystal, no units -> equal scores
    ctrl.stepTimer(1800);
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(true);
    expect(gameOverSpy).toHaveBeenCalledWith(expect.objectContaining({ winnerIndex: -1, reason: 'timeout' }));
  });

  it('only a non-worker unit (no worker) with no buildings still triggers annihilation after grace', () => {
    seedBothCC();
    killAllBuildings(1);
    const rifleman = makeUnit({ owner: 1, spriteKey: 'unit_rifleman', hp: 100 });
    entities.addUnit(rifleman);
    ctrl.advanceGraceTimers(60);
    ctrl.checkGameOver();
    expect(ctrl.isOver).toBe(true);
  });

  it('destroy() does not throw when stepTimer was never called', () => {
    const freshCtrl = new GameOverController(makeStubScene(), makeWorld(32, 32, true), new EntityRegistry());
    expect(() => freshCtrl.destroy()).not.toThrow();
  });
});

describe('HeadlessGameRunner - supplementary cases', () => {
  afterEach(() => EventBus.clear());

  it('runUntil returns frame count < maxFrames when predicate becomes true', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    // kill all P1 buildings+units to force game over
    for (const b of r.entities.buildings) if (b.owner === 1) b.hp = 0;
    for (const u of r.entities.units) if (u.owner === 1) u.hp = 0;
    const frames = r.runUntil(rr => rr.gameOverCtrl.isOver, 5000, 1.0);
    expect(frames).toBeLessThan(5000);
    expect(r.gameOverCtrl.isOver).toBe(true);
    r.dispose();
  });

  it('runUntil returns maxFrames when predicate never satisfied', () => {
    const r = new HeadlessGameRunner({ difficulty: 'normal' });
    const frames = r.runUntil(() => false, 50, 0.05);
    expect(frames).toBe(50);
    r.dispose();
  });

  it('placeStartingUnits:false constructs a runner with no units and no buildings', () => {
    const r = new HeadlessGameRunner({ placeStartingUnits: false });
    expect(r.entities.units.length).toBe(0);
    expect(r.entities.buildings.length).toBe(0);
    r.dispose();
  });

  it('playerFaction hammer_federation makes AI arcane_empire (asymmetric start)', () => {
    const r = new HeadlessGameRunner({ playerFaction: 'hammer_federation' });
    expect(r.world.players[0].faction).toBe('hammer_federation');
    expect(r.world.players[1].faction).toBe('arcane_empire');
    r.dispose();
  });

  it('easy difficulty runs 500 frames without crash', () => {
    const r = new HeadlessGameRunner({ difficulty: 'easy' });
    expect(() => r.runFrames(500, 0.1)).not.toThrow();
    r.dispose();
  });
});
