/**
 * 科技树系统 — 解锁条件检查
 *
 * 纯逻辑：判断某个科技/单位/建筑是否满足前置条件
 */

import type { TechDef } from '../types/data';

export class TechTreeSystem {
  /** 已研究完成的科技 ID 集合 */
  private researched: Set<string> = new Set();

  /** 研究完成 */
  completeTech(techId: string): void {
    this.researched.add(techId);
  }

  /** 是否已完成 */
  isResearched(techId: string): boolean {
    return this.researched.has(techId);
  }

  /** 检查是否可以研究某个科技 */
  canResearch(tech: TechDef): boolean {
    for (const prereq of tech.prerequisites) {
      if (!this.researched.has(prereq)) return false;
    }
    return !this.researched.has(tech.id);
  }

  /** 检查是否可以制造某个单位/建筑（基于已研究科技） */
  canProduce(requiredTechs: string[]): boolean {
    for (const techId of requiredTechs) {
      if (!this.researched.has(techId)) return false;
    }
    return true;
  }

  /** 获取所有已研究科技 */
  getResearched(): string[] {
    return Array.from(this.researched);
  }
}