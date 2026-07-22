/**
 * 输入控制器 — 框选、右键命令、快捷键
 *
 * 处理鼠标/键盘输入，转换为 Command 对象
 */

import Phaser from 'phaser';
import type { Point } from '../types/entity';
import type { AnyCommand } from '../types/commands';
import { worldToTile } from '../utils/MathUtils';

export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class InputController {
  private scene: Phaser.Scene;
  private selectionGraphics: Phaser.GameObjects.Graphics;
  private isDragging = false;
  private dragStart: Point = { x: 0, y: 0 };
  private dragEnd: Point = { x: 0, y: 0 };
  private selectedUnitIds: string[] = [];
  private commandQueue: AnyCommand[] = [];
  private playerIndex: number;
  private frameCount = 0;

  constructor(scene: Phaser.Scene, playerIndex = 0) {
    this.scene = scene;
    this.playerIndex = playerIndex;
    this.selectionGraphics = scene.add.graphics();
    this.selectionGraphics.setDepth(100); // UI层
    this.setupInput();
  }

  private setupInput(): void {
    // 左键按下 - 开始框选
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return;
      // P1-质疑1 修复：HUD 区域点击不启动框选（顶部资源栏 y<50, 底部命令卡 y>640）
      const sy = pointer.y;
      if (sy < 50 || sy > 640) return;
      // 右下角小地图区域不框选
      if (sy > 720 - 160 - 80 && pointer.x > 1280 - 160) return;
      this.isDragging = true;
      this.dragStart = { x: pointer.worldX, y: pointer.worldY };
      this.dragEnd = { ...this.dragStart };
    });

    // 左键移动 — 更新框选区域
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      this.dragEnd = { x: pointer.worldX, y: pointer.worldY };
      this.drawSelectionBox();
    });

    // 左键释放 — 完成框选并检测选中单位
    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.selectionGraphics.clear();

      // 判断是单击还是框选（拖拽距离 < 5px 视为单击）
      const dx = Math.abs(this.dragEnd.x - this.dragStart.x);
      const dy = Math.abs(this.dragEnd.y - this.dragStart.y);
      if (dx < 5 && dy < 5) {
        // 单击：发出选中事件（由 GameScene 处理单位检测）
        const tile = worldToTile(pointer.worldX, pointer.worldY);
        this.emitClick(tile);
      } else {
        // 框选：发出框选事件
        this.emitSelection(this.getSelectionBounds());
      }
    });

    // 右键 — 发出命令
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.rightButtonDown() || this.selectedUnitIds.length === 0) return;
      const target = worldToTile(pointer.worldX, pointer.worldY);
      this.emitRightClick(target);
    });

    // 滚轮缩放（通过 CameraController 处理，这里只做事件转发）
    // 由 GameScene 协调
  }

  /** 绘制框选矩形 */
  private drawSelectionBox(): void {
    const { dragStart, dragEnd } = this;
    const x = Math.min(dragStart.x, dragEnd.x);
    const y = Math.min(dragStart.y, dragEnd.y);
    const w = Math.abs(dragEnd.x - dragStart.x);
    const h = Math.abs(dragEnd.y - dragStart.y);

    this.selectionGraphics.clear();
    this.selectionGraphics.lineStyle(1, 0x00ff00, 0.8);
    this.selectionGraphics.strokeRect(x, y, w, h);
    this.selectionGraphics.fillStyle(0x00ff00, 0.1);
    this.selectionGraphics.fillRect(x, y, w, h);
  }

  /** 获取框选的世界坐标范围 */
  private getSelectionBounds(): SelectionBox {
    return {
      x: Math.min(this.dragStart.x, this.dragEnd.x),
      y: Math.min(this.dragStart.y, this.dragEnd.y),
      width: Math.abs(this.dragEnd.x - this.dragStart.x),
      height: Math.abs(this.dragEnd.y - this.dragStart.y),
    };
  }

  // ============ 事件钩子（由 GameScene 注入） ============

  private onClickCallback?: (tile: Point) => void;
  private onSelectionCallback?: (box: SelectionBox) => void;
  private onRightClickCallback?: (tile: Point) => void;

  onSingleClick(cb: (tile: Point) => void): void { this.onClickCallback = cb; }
  onSelection(cb: (box: SelectionBox) => void): void { this.onSelectionCallback = cb; }
  onRightClick(cb: (tile: Point) => void): void { this.onRightClickCallback = cb; }

  private emitClick(tile: Point): void { this.onClickCallback?.(tile); }
  private emitSelection(box: SelectionBox): void { this.onSelectionCallback?.(box); }
  private emitRightClick(tile: Point): void { this.onRightClickCallback?.(tile); }

  // ============ 选中管理 ============

  setSelection(unitIds: string[]): void {
    this.selectedUnitIds = unitIds;
  }

  addToSelection(unitIds: string[]): void {
    for (const id of unitIds) {
      if (!this.selectedUnitIds.includes(id)) {
        this.selectedUnitIds.push(id);
      }
    }
  }

  getSelection(): string[] {
    return this.selectedUnitIds;
  }

  clearSelection(): void {
    this.selectedUnitIds = [];
  }

  // ============ 命令队列 ============

  pushCommand(cmd: AnyCommand): void {
    cmd.frame = this.frameCount++;
    this.commandQueue.push(cmd);
  }

  popCommands(): AnyCommand[] {
    const cmds = [...this.commandQueue];
    this.commandQueue = [];
    return cmds;
  }

  getPlayerIndex(): number {
    return this.playerIndex;
  }
}