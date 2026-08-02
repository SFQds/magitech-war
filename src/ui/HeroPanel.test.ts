/**
 * HeroPanel 单元测试 - 英雄详情面板
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: class PhaserStub {},
}));

import { HeroPanel } from './HeroPanel';
import { makeHero } from '../__fixtures__/factories';

function makeScene() {
  const makeRect = () => {
    const r: any = {
      width: 0, fillColor: 0,
      setOrigin: () => r, setDepth: () => r, setScrollFactor: () => r,
      setVisible: () => r, setSize: () => r, destroy: () => {},
    };
    return r;
  };
  const makeText = () => {
    const t: any = {
      setOrigin: () => t, setDepth: () => t, setScrollFactor: () => t,
      setText: () => t, setStyle: () => t, setColor: () => t, destroy: () => {},
    };
    return t;
  };
  const graphics = {
    clear: () => graphics, fillStyle: () => graphics, fillRoundedRect: () => graphics,
    lineStyle: () => graphics, strokeRoundedRect: () => graphics, fillRect: () => graphics,
    beginPath: () => graphics, moveTo: () => graphics, lineTo: () => graphics, strokePath: () => graphics,
    setAlpha: () => graphics,
    destroy: () => {},
  };
  const container: any = {
    setDepth: () => container, setScrollFactor: () => container,
    setVisible: () => container, add: () => container, destroy: () => {},
  };
  const scene: any = {
    add: {
      rectangle: () => makeRect(),
      text: () => makeText(),
      graphics: () => ({ ...graphics }),
      container: () => ({ ...container }),
      image: () => ({ setDisplaySize: function () { return this; }, setOrigin: function () { return this; }, destroy: () => {} }),
    },
    textures: { exists: () => false },
  };
  return { scene };
}

describe('HeroPanel - 构造与隐藏', () => {
  it('构造不抛错', () => {
    const { scene } = makeScene();
    expect(() => new HeroPanel(scene, 0, 0)).not.toThrow();
  });

  it('hide 不抛错', () => {
    const { scene } = makeScene();
    const panel = new HeroPanel(scene, 0, 0);
    expect(() => panel.hide()).not.toThrow();
  });

  it('destroy 不抛错', () => {
    const { scene } = makeScene();
    const panel = new HeroPanel(scene, 0, 0);
    expect(() => panel.destroy()).not.toThrow();
  });
});

describe('HeroPanel - show', () => {
  it('显示伊莎贝尔(Lv1)不抛错', () => {
    const { scene } = makeScene();
    const panel = new HeroPanel(scene, 0, 0);
    const hero = makeHero({ heroId: 'hero_isabelle' });
    expect(() => panel.show(hero)).not.toThrow();
  });

  it('显示马库斯(Lv1)不抛错', () => {
    const { scene } = makeScene();
    const panel = new HeroPanel(scene, 0, 0);
    const hero = makeHero({ heroId: 'hero_marcus' });
    expect(() => panel.show(hero)).not.toThrow();
  });

  it('显示塞巴斯蒂安(Lv1)不抛错', () => {
    const { scene } = makeScene();
    const panel = new HeroPanel(scene, 0, 0);
    const hero = makeHero({ heroId: 'hero_sebastian' });
    expect(() => panel.show(hero)).not.toThrow();
  });

  it('显示艾琳(Lv1)不抛错', () => {
    const { scene } = makeScene();
    const panel = new HeroPanel(scene, 0, 0);
    const hero = makeHero({ heroId: 'hero_eileen' });
    expect(() => panel.show(hero)).not.toThrow();
  });

  it('显示 Lv5 满级英雄不抛错', () => {
    const { scene } = makeScene();
    const panel = new HeroPanel(scene, 0, 0);
    const hero = makeHero({ heroId: 'hero_isabelle', level: 5 });
    expect(() => panel.show(hero)).not.toThrow();
  });

  it('显示 Lv3 英雄不抛错(部分技能解锁)', () => {
    const { scene } = makeScene();
    const panel = new HeroPanel(scene, 0, 0);
    const hero = makeHero({ heroId: 'hero_marcus', level: 3 });
    expect(() => panel.show(hero)).not.toThrow();
  });

  it('受伤英雄显示不抛错', () => {
    const { scene } = makeScene();
    const panel = new HeroPanel(scene, 0, 0);
    const hero = makeHero({ heroId: 'hero_isabelle' });
    hero.hp = 50;
    expect(() => panel.show(hero)).not.toThrow();
  });

  it('show 后 hide 再 show 不抛错(切换)', () => {
    const { scene } = makeScene();
    const panel = new HeroPanel(scene, 0, 0);
    const h1 = makeHero({ heroId: 'hero_isabelle' });
    const h2 = makeHero({ heroId: 'hero_marcus' });
    panel.show(h1);
    panel.hide();
    expect(() => panel.show(h2)).not.toThrow();
  });

  it('多次 show 同一英雄不抛错(刷新)', () => {
    const { scene } = makeScene();
    const panel = new HeroPanel(scene, 0, 0);
    const hero = makeHero({ heroId: 'hero_isabelle' });
    panel.show(hero);
    hero.hp = 100;
    expect(() => panel.show(hero)).not.toThrow();
  });
});
