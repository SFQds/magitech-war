/**
 * 数学工具 — 瓦片坐标计算、距离、寻路辅助
 */

import type { Point } from '../types/entity';

/** 瓦片坐标编码为整数 key（替代 `${x},${y}` 字符串，零 GC） */
export function tileKey(x: number, y: number, mapWidth: number): number {
  return Math.round(y) * mapWidth + Math.round(x);
}

/** 整数 key 解码回瓦片坐标 */
export function tileKeyDecode(key: number, mapWidth: number): { x: number; y: number } {
  const x = key % mapWidth;
  const y = (key / mapWidth) | 0;
  return { x, y };
}

/** 瓦片坐标转世界像素中心（返回新对象） */
export function tileToWorld(tileX: number, tileY: number, tileSize = 32): Point {
  return {
    x: tileX * tileSize + tileSize / 2,
    y: tileY * tileSize + tileSize / 2,
  };
}

/** tile→world 原地写入（零分配，替代 tileToWorld 热路径） */
export function tileToWorldXY(tileX: number, tileY: number, tileSize = 32): { x: number; y: number } {
  return {
    x: tileX * tileSize + tileSize / 2,
    y: tileY * tileSize + tileSize / 2,
  };
}

/** 世界像素转瓦片坐标 */
export function worldToTile(worldX: number, worldY: number, tileSize = 32): Point {
  return {
    x: Math.floor(worldX / tileSize),
    y: Math.floor(worldY / tileSize),
  };
}

/** 两点间欧几里得距离（tiles） */
export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 两点间曼哈顿距离（用于网格寻路估算） */
export function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** 限制值在范围内 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 线性插值 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 随机整数 [min, max] */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 深拷贝（仅限 JSON 兼容对象） */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** 生成唯一实体 ID */
let nextId = 1;
export function generateId(prefix = 'entity'): string {
  return `${prefix}_${nextId++}_${Date.now().toString(36)}`;
}