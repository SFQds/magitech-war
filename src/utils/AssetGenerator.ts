/**
 * 运行时资源生成器 — 用 Phaser Graphics API 直接绘制占位精灵
 *
 * 生成简单但有辨识度的矢量风几何图形，通过 generateTexture() 转为可用纹理
 * 零外部文件依赖，支撑 P0 Demo 完整运行
 */

import Phaser from 'phaser';
import { PNG_SPRITE_KEYS } from '../config/sprites';

/** 已有 PNG 精灵的 key（不生成占位纹理） */
const PNG_KEYS = new Set<string>(PNG_SPRITE_KEYS);

export class AssetGenerator {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 生成所有占位资源（自动跳过已有 PNG 的 key） */
  generateAll(): void {
    this.terrainTiles();
    this.units();
    this.buildings();
    this.uiIcons();
  }

  // ============ 地形瓦片 (32×32) ============

  private terrainTiles(): void {
    const T = 32;

    // 草地
    this.draw('tile_grass', T, T, (g) => {
      g.fillStyle(0x2d5a27);
      g.fillRect(0, 0, T, T);
      g.fillStyle(0x3a6b32);
      for (let i = 0; i < 8; i++) {
        g.fillRect(Phaser.Math.Between(0, 28), Phaser.Math.Between(0, 28), 4, 2);
      }
    });

    // 沙地
    this.draw('tile_sand', T, T, (g) => {
      g.fillStyle(0xc2b280);
      g.fillRect(0, 0, T, T);
      g.fillStyle(0xd4c490);
      for (let i = 0; i < 5; i++) {
        g.fillCircle(Phaser.Math.Between(6, 26), Phaser.Math.Between(6, 26), 2);
      }
    });

    // 水域
    this.draw('tile_water', T, T, (g) => {
      g.fillStyle(0x2244aa);
      g.fillRect(0, 0, T, T);
      g.lineStyle(1, 0x3366cc, 0.5);
      g.lineBetween(0, 10, T, 10);
      g.lineBetween(0, 22, T, 22);
    });

    // 山脉
    this.draw('tile_mountain', T, T, (g) => {
      g.fillStyle(0x555555);
      g.fillRect(0, 0, T, T);
      g.fillStyle(0x777777);
      g.fillTriangle(16, 4, 4, 28, 28, 28);
      g.fillStyle(0x666666);
      g.fillTriangle(8, 20, 16, 10, 24, 20);
    });

    // 树林
    this.draw('tile_forest', T, T, (g) => {
      g.fillStyle(0x1a3a1a);
      g.fillRect(0, 0, T, T);
      g.fillStyle(0x1a5a1a);
      g.fillCircle(16, 14, 12);
      g.fillStyle(0x0d2d0d);
      g.fillCircle(10, 22, 8);
      g.fillCircle(22, 22, 8);
    });
  }

  // ============ 单位精灵 (64×64) ============

  private units(): void {
    const S = 64;

    // 工兵
    this.draw('unit_worker', S, S, (g) => {
      // 身体
      g.fillStyle(0x888888);
      g.fillRect(20, 24, 24, 28);
      // 头
      g.fillStyle(0xddaa88);
      g.fillCircle(32, 18, 10);
      // 安全帽
      g.fillStyle(0xcc8800);
      g.fillRect(22, 8, 20, 8);
      // 扳手
      g.fillStyle(0xaaaaaa);
      g.fillRect(44, 30, 12, 4);
      g.fillCircle(56, 32, 4);
    });

    // 水晶步枪兵
    this.draw('unit_rifleman', S, S, (g) => {
      g.fillStyle(0x667788);
      g.fillRect(20, 24, 24, 28);
      g.fillStyle(0xddaa88);
      g.fillCircle(32, 18, 10);
      // 步枪管
      g.fillStyle(0x555555);
      g.fillRect(44, 26, 16, 4);
      // 水晶弹匣
      g.fillStyle(0x9b59b6);
      g.fillRect(36, 30, 6, 10);
      // 枪口闪光
      g.fillStyle(0xcc88ff, 0.6);
      g.fillCircle(62, 28, 3);
    });

    // 侦察摩托
    this.draw('unit_scout_bike', 96, 96, (g) => {
      const W = 96, H = 96;
      g.fillStyle(0x886644);
      g.fillRect(20, 44, 56, 28); // 车身
      g.fillStyle(0x333333);
      g.fillCircle(32, 76, 12);   // 后轮
      g.fillCircle(68, 76, 12);   // 前轮
      g.fillStyle(0xddccaa);
      g.fillCircle(48, 38, 8);    // 驾驶员头
    });

    // 运输卡车
    this.draw('unit_transport', 96, 96, (g) => {
      g.fillStyle(0x446644);
      g.fillRect(12, 36, 72, 40);  // 车厢
      g.fillStyle(0x335533);
      g.fillRect(12, 20, 40, 20);  // 驾驶室
      g.fillStyle(0x222222);
      g.fillCircle(28, 80, 14);
      g.fillCircle(72, 80, 14);
    });

    // 基础炮塔
    this.draw('unit_basic_turret', S, S, (g) => {
      g.fillStyle(0x444444);
      g.fillRect(20, 28, 24, 24);  // 基座
      g.fillStyle(0x555555);
      g.fillRect(26, 16, 12, 16);  // 炮塔
      g.fillStyle(0x666666);
      g.fillRect(44, 20, 16, 6);   // 炮管
    });

    // === 以下P1单位 ===

    // 战斗法师
    this.draw('unit_battle_mage', S, S, (g) => {
      g.fillStyle(0x3a2a6a);
      g.fillRect(22, 28, 20, 28);   // 长袍
      g.fillStyle(0xddaa88);
      g.fillCircle(32, 18, 10);      // 头
      g.fillStyle(0x9b59b6);
      g.fillRect(28, 10, 8, 28);     // 法杖
      g.fillStyle(0xcc88ff, 0.4);
      g.fillCircle(32, 6, 6);        // 法杖顶水晶
    });

    // 魔导机甲
    this.draw('unit_magitech_mech', 96, 96, (g) => {
      g.fillStyle(0x665544);
      g.fillRect(24, 16, 48, 64);    // 机身
      g.fillStyle(0x776655);
      g.fillRect(18, 74, 16, 18);    // 左腿
      g.fillRect(62, 74, 16, 18);    // 右腿
      g.fillStyle(0x9b59b6, 0.6);    // 胸甲水晶
      g.fillRect(40, 28, 16, 14);
    });

    // 掷弹兵
    this.draw('unit_grenadier', S, S, (g) => {
      g.fillStyle(0x557744);
      g.fillRect(20, 24, 24, 28);
      g.fillStyle(0xddaa88);
      g.fillCircle(32, 18, 10);
      // 腰间瓶子
      g.fillStyle(0x88cc44, 0.7);
      g.fillCircle(20, 40, 5);
      g.fillCircle(44, 40, 5);
    });

    // 奥术重步
    this.draw('unit_arcane_heavy', S, S, (g) => {
      g.fillStyle(0x4a4a6a);          // 重甲
      g.fillRect(16, 20, 32, 36);
      g.fillStyle(0xc8a2c8);          // 符文纹
      g.fillRect(18, 24, 28, 4);
      g.fillRect(18, 36, 28, 4);
      g.fillStyle(0x2a2a4a);
      g.fillRect(26, 4, 12, 18);      // 头盔
    });

    // 突击工兵
    this.draw('unit_assault_worker', S, S, (g) => {
      g.fillStyle(0x887744);
      g.fillRect(20, 24, 24, 28);
      g.fillStyle(0xcc8800);
      g.fillRect(22, 12, 20, 8);       // 头盔
      g.fillStyle(0x555555);
      g.fillRect(44, 28, 16, 4);       // 焊枪/步枪
      g.fillStyle(0xff8844, 0.6);
      g.fillCircle(62, 30, 2);         // 枪口焰
    });
  }

  // ============ 建筑 (96×96) ============

  private buildings(): void {
    const B = 96;

    // 帝国指挥中心
    this.draw('bld_cc_empire', B, B, (g) => {
      g.fillStyle(0x2a2a4a);
      g.fillRect(12, 30, 72, 56);     // 主体
      g.fillStyle(0x3a3a6a);
      g.fillRect(8, 14, 80, 20);      // 浮空层
      g.fillStyle(0xc8a2c8);
      g.fillTriangle(48, 0, 20, 22, 76, 22); // 尖顶
      // 符文辉光
      g.fillStyle(0x9b59b6, 0.3);
      g.fillRect(16, 34, 64, 2);
    });

    // 联邦指挥中心
    this.draw('bld_cc_federation', B, B, (g) => {
      g.fillStyle(0x663322);
      g.fillRect(8, 16, 80, 72);      // 红砖厂房
      g.fillStyle(0x885533);
      g.fillRect(0, 8, 96, 12);       // 屋顶
      // 烟囱
      g.fillStyle(0x444444);
      g.fillRect(74, 0, 10, 24);
      // 紫烟
      g.fillStyle(0x9b59b6, 0.2);
      g.fillCircle(79, 4, 6);
      // 窗户
      g.fillStyle(0xffcc66, 0.4);
      g.fillRect(16, 32, 16, 16);
      g.fillRect(40, 32, 16, 16);
      g.fillRect(64, 32, 16, 16);
    });

    // 兵营
    this.draw('bld_barracks', B, B, (g) => {
      g.fillStyle(0x554444);
      g.fillRect(10, 28, 76, 60);
      g.fillStyle(0x664444);
      g.fillRect(4, 16, 88, 16);
      g.fillStyle(0xffcc66, 0.3);
      g.fillRect(22, 40, 20, 20);    // 门
      g.fillRect(54, 40, 20, 20);
    });

    // 工厂
    this.draw('bld_factory', B, B, (g) => {
      g.fillStyle(0x444444);
      g.fillRect(8, 20, 80, 68);
      g.fillStyle(0x555555);
      g.fillRect(2, 8, 92, 16);
      // 烟囱+紫烟
      g.fillStyle(0x333333);
      g.fillRect(70, 0, 10, 24);
      g.fillStyle(0x9b59b6, 0.15);
      g.fillCircle(75, 4, 8);
    });

    // 采矿场
    this.draw('bld_refinery', B, B, (g) => {
      g.fillStyle(0x555544);
      g.fillRect(16, 36, 64, 52);
      g.fillStyle(0x666655);
      g.fillRect(40, 16, 16, 24);      // 竖井塔
      // 传送带
      g.fillStyle(0x444444);
      g.fillRect(0, 70, 96, 6);
      // 水晶图标
      g.fillStyle(0x9b59b6);
      g.fillRect(44, 78, 8, 8);
    });

    // 工业车间
    this.draw('bld_power_plant', B, B, (g) => {
      g.fillStyle(0x554433);
      g.fillRect(12, 32, 72, 56);
      // 锅炉
      g.fillStyle(0x664422);
      g.fillCircle(48, 24, 20);
      g.fillStyle(0xff6622, 0.4);
      g.fillCircle(48, 24, 10);
    });

    // 城墙段
    this.draw('bld_wall', 32, 32, (g) => {
      g.fillStyle(0x777766);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0x888877);
      g.fillRect(4, 4, 24, 24);
    });
  }

  // ============ UI 图标 (24×24) ============

  private uiIcons(): void {
    const I = 24;

    this.draw('ui_crystal', I, I, (g) => {
      g.fillStyle(0x9b59b6);
      g.fillRect(8, 4, 8, 16);
      g.fillRect(4, 8, 16, 8);
      g.fillStyle(0xcc88ff, 0.5);
      g.fillRect(10, 6, 4, 12);
    });

    this.draw('ui_industry', I, I, (g) => {
      g.fillStyle(0xe67e22);
      g.fillCircle(12, 12, 10);
      g.fillStyle(0x1a1a2e);
      g.fillCircle(12, 12, 5);
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        g.fillRect(11, 5, 2, 4);
        // 简化为齿
      }
      g.fillStyle(0xe67e22);
      g.fillCircle(12, 12, 3);
    });

    this.draw('ui_supply', I, I, (g) => {
      g.fillStyle(0xffffff);
      g.fillCircle(12, 9, 4);   // 头
      g.fillRect(9, 14, 6, 8);  // 身体
    });
  }

  // ============ 辅助方法 ============

  /**
   * 用 Graphics 绘制纹理并注册到 Phaser 纹理管理器
   * @param key 纹理键名（直接用作精灵key）
   * @param w 宽度
   * @param h 高度
   * @param draw 绘制回调
   */
  private draw(key: string, w: number, h: number, drawFn: (g: Phaser.GameObjects.Graphics) => void): void {
    if (PNG_KEYS.has(key)) return; // PNG 已覆盖，不生成占位纹理
    if (this.scene.textures.exists(key)) {
      this.scene.textures.remove(key); // 删除旧 SVG/占位纹理，让 PNG 重新注册
    }

    const g = this.scene.add.graphics();
    drawFn(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}