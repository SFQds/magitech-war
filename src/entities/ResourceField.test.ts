/**
 * ResourceField 实体单元测试 - 资源采集点
 *
 * 覆盖构造默认值、gather() 边界、isDepleted 判定、isActive 联动、currentGatherers。
 */
import { describe, it, expect } from 'vitest';
import { ResourceField } from './ResourceField';
import { makeResourceField, bindToField, makeWorker } from '../__fixtures__/factories';

describe('ResourceField - 构造', () => {
  it('默认参数：crystal 类型、owner=-1 中立、hp=9999、isActive=true', () => {
    const f = new ResourceField(3, 4, 'crystal', 1000);
    expect(f.owner).toBe(-1);
    expect(f.resourceType).toBe('crystal');
    expect(f.tileX).toBe(3);
    expect(f.tileY).toBe(4);
    expect(f.amount).toBe(1000);
    expect(f.maxGatherers).toBe(3); // 默认
    expect(f.currentGatherers).toBe(0);
    expect(f.hp).toBe(9999);
    expect(f.maxHp).toBe(9999);
    expect(f.isActive).toBe(true);
    expect(f.spriteKey).toBe('resource_field');
    expect(f.armorType).toBe('structure');
  });

  it('自定义 maxGatherers 生效', () => {
    const f = new ResourceField(0, 0, 'crystal', 500, 5);
    expect(f.maxGatherers).toBe(5);
  });

  it('factory makeResourceField 默认参数', () => {
    const f = makeResourceField();
    expect(f.tileX).toBe(5);
    expect(f.tileY).toBe(0);
    expect(f.resourceType).toBe('crystal');
    expect(f.amount).toBe(1000);
    expect(f.maxGatherers).toBe(3);
  });

  it('factory 支持自定义坐标/储量/采集上限', () => {
    const f = makeResourceField(2, 8, 200, 6);
    expect(f.tileX).toBe(2);
    expect(f.tileY).toBe(8);
    expect(f.amount).toBe(200);
    expect(f.maxGatherers).toBe(6);
  });

  it('resourceType 可为 industry/supply', () => {
    const f = new ResourceField(0, 0, 'industry', 100);
    expect(f.resourceType).toBe('industry');
  });
});

describe('ResourceField.gather', () => {
  it('默认采集量 10，储量充足时返回 10 并扣减', () => {
    const f = makeResourceField(0, 0, 100);
    expect(f.gather()).toBe(10);
    expect(f.amount).toBe(90);
  });

  it('自定义采集量生效', () => {
    const f = makeResourceField(0, 0, 100);
    expect(f.gather(30)).toBe(30);
    expect(f.amount).toBe(70);
  });

  it('储量不足时返回剩余量并清零', () => {
    const f = makeResourceField(0, 0, 7);
    expect(f.gather(10)).toBe(7);
    expect(f.amount).toBe(0);
  });

  it('枯竭后 gather 返回 0', () => {
    const f = makeResourceField(0, 0, 0);
    expect(f.gather()).toBe(0);
    expect(f.amount).toBe(0);
  });

  it('枯竭后 isActive 置为 false', () => {
    const f = makeResourceField(0, 0, 5);
    f.gather(10);
    expect(f.isActive).toBe(false);
  });

  it('未枯竭时 isActive 保持 true', () => {
    const f = makeResourceField(0, 0, 100);
    f.gather(10);
    expect(f.isActive).toBe(true);
  });

  it('恰好采完边界：amount=10 采 10 后 amount=0 且 isActive=false', () => {
    const f = makeResourceField(0, 0, 10);
    expect(f.gather(10)).toBe(10);
    expect(f.amount).toBe(0);
    expect(f.isActive).toBe(false);
  });

  it('多次采集累计扣减直到枯竭', () => {
    const f = makeResourceField(0, 0, 25);
    expect(f.gather()).toBe(10);
    expect(f.gather()).toBe(10);
    expect(f.gather()).toBe(5);
    expect(f.gather()).toBe(0);
    expect(f.amount).toBe(0);
  });

  it('gather(0) 返回 0 且不改变储量', () => {
    const f = makeResourceField(0, 0, 100);
    expect(f.gather(0)).toBe(0);
    expect(f.amount).toBe(100);
  });

  it('负数 gather 不被显式拦截（按 Math.min 行为，amount 不变）', () => {
    const f = makeResourceField(0, 0, 100);
    // gather(-5): Math.min(-5, 100) = -5; amount -= -5 = 105
    // 这是当前实现行为，此处 pin 住以备将来加 guard
    const result = f.gather(-5);
    expect(result).toBe(-5);
    expect(f.amount).toBe(105);
  });
});

describe('ResourceField.isDepleted', () => {
  it('初始 amount>0 未枯竭', () => {
    const f = makeResourceField(0, 0, 100);
    expect(f.isDepleted).toBe(false);
  });

  it('amount=0 枯竭', () => {
    const f = makeResourceField(0, 0, 0);
    expect(f.isDepleted).toBe(true);
  });

  it('负 amount 也判定为枯竭（<=0）', () => {
    const f = makeResourceField(0, 0, -1);
    expect(f.isDepleted).toBe(true);
  });

  it('采集后枯竭状态变化', () => {
    const f = makeResourceField(0, 0, 10);
    expect(f.isDepleted).toBe(false);
    f.gather(10);
    expect(f.isDepleted).toBe(true);
  });
});

describe('ResourceField.currentGatherers', () => {
  it('默认 0', () => {
    const f = makeResourceField();
    expect(f.currentGatherers).toBe(0);
  });

  it('可手动增减（外部管理，无内置 cap 校验）', () => {
    const f = makeResourceField(0, 0, 100, 3);
    f.currentGatherers = 1;
    expect(f.currentGatherers).toBe(1);
    f.currentGatherers++;
    expect(f.currentGatherers).toBe(2);
  });

  it('bindToField 工厂设置 currentGatherers', () => {
    const f = makeResourceField();
    const worker = makeWorker();
    bindToField(worker, f, 1);
    expect(f.currentGatherers).toBe(1);
    expect(worker.targetResourceId).toBe(f.id);
    expect(worker.state).toBe('gathering');
  });
});

describe('ResourceField.takeDamage（继承自 Entity）', () => {
  it('可受击但不影响采集逻辑（hp 与 amount 解耦）', () => {
    const f = makeResourceField(0, 0, 100);
    const died = f.takeDamage(50);
    expect(died).toBe(false);
    expect(f.amount).toBe(100); // amount 不变
    expect(f.hp).toBe(9949); // 9999 - 50
  });

  it('可被毁灭（hp 归 0）但 amount 仍可能 >0', () => {
    const f = makeResourceField(0, 0, 100);
    f.takeDamage(99999, 'physical');
    expect(f.isAlive).toBe(false);
    expect(f.amount).toBe(100); // amount 不受 hp 影响
  });
});
