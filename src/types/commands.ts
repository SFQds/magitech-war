/**
 * 命令系统类型定义
 * 命令模式解耦输入和系统执行，为后续网络同步预留序列化接口
 */

import type { Point } from './entity';

// ============ 命令枚举 ============

/** 命令类型 */
export type CommandType =
  | 'move'
  | 'attack_move'
  | 'attack_target'
  | 'stop'
  | 'hold_position'
  | 'build'
  | 'train'
  | 'research'
  | 'gather'
  | 'deploy'
  | 'use_ability'
  | 'spawn';

// ============ 命令接口 ============

/** 基础命令 */
export interface Command {
  type: CommandType;
  /** 发起命令的玩家索引 */
  playerIndex: number;
  /** 执行命令的单位 ID 列表 */
  unitIds: string[];
  /** 命令发出的游戏帧号（网络同步用） */
  frame: number;
}

/** 移动命令 */
export interface MoveCommand extends Command {
  type: 'move' | 'attack_move';
  target: Point;
}

/** 攻击命令 */
export interface AttackCommand extends Command {
  type: 'attack_target';
  targetEntityId: string;
}

/** 建造命令 */
export interface BuildCommand extends Command {
  type: 'build';
  buildingDefId: string;
  position: Point;
}

/** 训练命令 */
export interface TrainCommand extends Command {
  type: 'train';
  buildingId: string;
  unitDefId: string;
  count: number;
}

/** 研究命令 */
export interface ResearchCommand extends Command {
  type: 'research';
  buildingId: string;
  techDefId: string;
}

/** 采集命令 */
export interface GatherCommand extends Command {
  type: 'gather';
  resourceFieldId: string;
}

/** 部署命令（将建筑放置在地图上） */
export interface DeployCommand extends Command {
  type: 'deploy';
  buildingDefId: string;
  position: Point;
}

/** 使用技能命令 */
export interface AbilityCommand extends Command {
  type: 'use_ability';
  abilityId: string;
  targetEntityId?: string;
  targetPosition?: Point;
}

/** 停止命令 */
export interface StopCommand extends Command {
  type: 'stop';
}

/** 固守命令 */
export interface HoldPositionCommand extends Command {
  type: 'hold_position';
}

/** 生成单位命令（马库斯空投等） */
export interface SpawnCommand extends Command {
  type: 'spawn';
  unitDefId: string;
  count: number;
  position: Point;
}

/** 联合命令类型 */
export type AnyCommand =
  | MoveCommand
  | AttackCommand
  | BuildCommand
  | TrainCommand
  | ResearchCommand
  | GatherCommand
  | DeployCommand
  | AbilityCommand
  | StopCommand
  | HoldPositionCommand
  | SpawnCommand;

// ============ 命令队列 ============

/** 命令队列接口 */
export interface ICommandQueue {
  /** 添加命令 */
  push(command: AnyCommand): void;
  /** 取出下一个命令 */
  pop(): AnyCommand | null;
  /** 查看但不取出 */
  peek(): AnyCommand | null;
  /** 清空队列 */
  clear(): void;
  /** 队列长度 */
  readonly length: number;
  /** 是否为空 */
  readonly isEmpty: boolean;
}