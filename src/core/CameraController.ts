/**
 * 摄影机控制器 — 边缘滚动、缩放、边界限制
 */

import Phaser from 'phaser';

export class CameraController {
  private camera: Phaser.Cameras.Scene2D.Camera;
  private mapWidth: number;   // px
  private mapHeight: number;  // px
  private scrollSpeed = 8;    // px/frame
  private scrollMargin = 30;  // 边缘触发区 px
  private minZoom = 0.5;
  private maxZoom = 2.0;
  private currentZoom = 1.0;

  constructor(camera: Phaser.Cameras.Scene2D.Camera, mapTileW: number, mapTileH: number, tileSize = 32) {
    this.camera = camera;
    this.mapWidth = mapTileW * tileSize;
    this.mapHeight = mapTileH * tileSize;
    this.camera.setBounds(0, 0, this.mapWidth, this.mapHeight);
  }

  /** 每帧调用 */
  update(pointer: Phaser.Input.Pointer): void {
    const { x, y } = pointer;

    // 边缘滚动
    if (x < this.scrollMargin) {
      this.camera.scrollX -= this.scrollSpeed;
    } else if (x > this.camera.width - this.scrollMargin) {
      this.camera.scrollX += this.scrollSpeed;
    }

    if (y < this.scrollMargin) {
      this.camera.scrollY -= this.scrollSpeed;
    } else if (y > this.camera.height - this.scrollMargin) {
      this.camera.scrollY += this.scrollSpeed;
    }
  }

  /** 滚轮缩放 */
  zoomAt(delta: number): void {
    const zoomDelta = delta > 0 ? -0.1 : 0.1;
    this.currentZoom = Phaser.Math.Clamp(
      this.currentZoom + zoomDelta,
      this.minZoom,
      this.maxZoom
    );
    this.camera.setZoom(this.currentZoom);
  }

  /** 居中于指定世界坐标 */
  centerOn(worldX: number, worldY: number): void {
    this.camera.centerOn(worldX, worldY);
  }
}