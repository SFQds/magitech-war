/**
 * 全局平衡常量 - 单一事实来源
 *
 * 新增魔法数字前请先在此登记，避免散落在各系统中的硬编码。
 */

/** 水晶存储上限（所有玩家共享） */
export const MAX_CRYSTAL = 20000;

/** 工人基础单次采集量 */
export const GATHER_BASE_AMOUNT = 10;

/** 无采矿场时工人单次采集上限 */
export const GATHER_NO_REFINERY_CAP = 3;

/** 采集 tick 间隔（秒） */
export const GATHER_TICK_INTERVAL = 1.0;

/** 工业值再生基础速率 */
export const INDUSTRY_REGEN_BASE = 0.5;

/** 工业值再生每点工业产出的加成 */
export const INDUSTRY_REGEN_PER_OUTPUT = 0.03;

/** AI 安全网：0 工人且水晶不足时的被动保底水晶 */
export const AI_RESCUE_CRYSTAL_MIN = 100;
