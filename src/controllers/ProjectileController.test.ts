/**
 * ProjectileController 单元测试 - 投射物生成/移动/命中/AOE
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProjectileController } from './ProjectileController';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { makeStubScene } from '../__fixtures__/phaserStub';
import { makeUnit, makeBuilding } from '../__fixtures__/factories';

describe('ProjectileController.spawn', () => {
  it('pushes a Projectile with attacker owner/faction/position and targetId', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 5, tileY: 5, hp: 100 });
    pc.spawn(attacker, 't1', 20, 'proj_bullet');
    expect(pc.list).toHaveLength(1);
    expect(pc.list[0].sourceId).toBe(attacker.id);
    expect(pc.list[0].targetId).toBe('t1');
    expect(pc.list[0].damage).toBe(20);
    expect(pc.list[0].owner).toBe(1);
  });

  it('stores corrosionPenalty and rawDamage on the projectile', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 5, tileY: 5, hp: 100 });
    pc.spawn(attacker, 't1', 20, 'e', 5, 40);
    expect(pc.list[0].corrosionPenalty).toBe(5);
    expect(pc.list[0].rawDamage).toBe(40);
  });

  it('defaults rawDamage to damage when omitted', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 5, tileY: 5, hp: 100 });
    pc.spawn(attacker, 't1', 20, 'e');
    expect(pc.list[0].rawDamage).toBe(20);
  });
});

describe('ProjectileController.update removal', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('removes projectile when target is missing from both maps', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 5, tileY: 5, hp: 100 });
    pc.spawn(attacker, 'ghost', 20, 'proj_bullet');
    pc.update(0.05, new Map(), new Map(), [], [], new Map());
    expect(pc.list).toHaveLength(0);
  });

  it('removes projectile when target is dead (isAlive=false)', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 5, tileY: 5, hp: 100 });
    const target = makeUnit({ owner: 0, tileX: 5, tileY: 6, hp: 100 });
    target.hp = 0;
    pc.spawn(attacker, target.id, 20, 'proj_bullet');
    const unitMap = new Map([[target.id, target]]);
    pc.update(0.05, unitMap, new Map(), [target], [], new Map());
    expect(pc.list).toHaveLength(0);
  });

  it('skips inactive projectiles (isActive=false) without processing (stays in list)', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 5, tileY: 5, hp: 100 });
    pc.spawn(attacker, 't1', 20, 'proj_bullet');
    pc.list[0].isActive = false;
    pc.update(0.05, new Map(), new Map(), [], [], new Map());
    // inactive projectiles are skipped (continue) and NOT added to toRemove -> stay in list
    expect(pc.list).toHaveLength(1);
  });
});

describe('ProjectileController.update movement', () => {
  it('moves projectile toward target by speed*deltaSec', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 0, tileY: 0, hp: 100 });
    const target = makeUnit({ owner: 0, tileX: 10, tileY: 0, hp: 100 });
    pc.spawn(attacker, target.id, 20, 'proj_bullet');
    const unitMap = new Map([[target.id, target]]);
    pc.update(0.05, unitMap, new Map(), [target], [], new Map());
    // speed=15, deltaSec=0.05 -> move=0.75; dist=10; ratio=0.075; tileX = 0 + 10*0.075 = 0.75
    expect(pc.list[0].tileX).toBeCloseTo(0.75, 1);
  });

  it('caps movement to dist*0.95 to avoid overshoot', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 0, tileY: 0, hp: 100 });
    const target = makeUnit({ owner: 0, tileX: 0.5, tileY: 0, hp: 100 });
    pc.spawn(attacker, target.id, 20, 'proj_bullet');
    const unitMap = new Map([[target.id, target]]);
    pc.update(10, unitMap, new Map(), [target], [], new Map()); // huge deltaSec
    // dist=0.5, move=min(15*10, 0.5*0.95)=0.475; ratio=0.95; tileX = 0 + 0.5*0.95 = 0.475
    expect(pc.list[0].tileX).toBeCloseTo(0.475, 1);
  });
});

describe('ProjectileController.update hit detection', () => {
  beforeEach(() => EventBus.clear());
  afterEach(() => EventBus.clear());

  it('applies damage when dist<0.3 and removes projectile', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 5, tileY: 5, hp: 100 });
    const target = makeUnit({ owner: 0, tileX: 5.2, tileY: 5, hp: 100 });
    target.maxHp = 100;
    pc.spawn(attacker, target.id, 20, 'proj_bullet');
    const unitMap = new Map([[target.id, target], [attacker.id, attacker]]);
    const flashTimers = new Map<string, number>();
    pc.update(0.05, unitMap, new Map(), [target], [], flashTimers);
    expect(target.hp).toBeLessThan(100);
    expect(pc.list).toHaveLength(0);
    expect(flashTimers.get(target.id)).toBe(0.12);
  });

  it('on lethal hit emits UNIT_KILLED with killerId=sourceId', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 5, tileY: 5, hp: 100 });
    const target = makeUnit({ owner: 0, tileX: 5.2, tileY: 5, hp: 1 });
    target.maxHp = 1;
    pc.spawn(attacker, target.id, 100, 'proj_bullet');
    const unitMap = new Map([[target.id, target], [attacker.id, attacker]]);
    const spy = vi.fn();
    EventBus.on(GameEvent.UNIT_KILLED, spy);
    pc.update(0.05, unitMap, new Map(), [target], [], new Map());
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      unitId: target.id, killerId: attacker.id, playerIndex: 0,
    }));
  });

  it('on lethal hit clears targetEntityId from units targeting the victim', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 5, tileY: 5, hp: 100 });
    const target = makeUnit({ owner: 0, tileX: 5.2, tileY: 5, hp: 1 });
    target.maxHp = 1;
    const observer = makeUnit({ owner: 0, tileX: 10, tileY: 10, hp: 100 });
    observer.targetEntityId = target.id;
    pc.spawn(attacker, target.id, 100, 'proj_bullet');
    const unitMap = new Map([[target.id, target], [attacker.id, attacker], [observer.id, observer]]);
    pc.update(0.05, unitMap, new Map(), [target, observer], [], new Map());
    expect(observer.targetEntityId).toBeNull();
  });

  it('on lethal hit the source attacker itself clears targetEntityId (P1-N1 fix)', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 5, tileY: 5, hp: 100 });
    const target = makeUnit({ owner: 0, tileX: 5.2, tileY: 5, hp: 1 });
    target.maxHp = 1;
    attacker.targetEntityId = target.id;
    pc.spawn(attacker, target.id, 100, 'proj_bullet');
    const unitMap = new Map([[target.id, target], [attacker.id, attacker]]);
    pc.update(0.05, unitMap, new Map(), [target, attacker], [], new Map());
    expect(attacker.targetEntityId).toBeNull();
  });
});

describe('ProjectileController.destroy', () => {
  it('clears all projectiles', () => {
    const pc = new ProjectileController(makeStubScene());
    const attacker = makeUnit({ owner: 1, tileX: 5, tileY: 5, hp: 100 });
    pc.spawn(attacker, 't1', 20, 'proj_bullet');
    pc.spawn(attacker, 't2', 20, 'proj_bullet');
    pc.destroy();
    expect(pc.list).toHaveLength(0);
  });
});
