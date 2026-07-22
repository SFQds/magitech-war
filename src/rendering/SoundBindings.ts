/**
 * 音效绑定 — 监听游戏事件触发音效播放
 *
 * 从 GameScene.setupSoundListeners() 抽离。
 * 纯事件注册，无 Phaser 依赖。
 * 返回 dispose() 函数用于清理。
 */

import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { SoundManager } from '../utils/SoundManager';

/** 注册所有音效事件监听，返回清理函数 */
export function registerSoundBindings(): () => void {
  const onAttack = () => SoundManager.play('attack', 0.15);
  const onBuild = () => SoundManager.play('build', 0.25);
  const onDeath = (data: unknown) => {
    const d = data as { isBuilding?: boolean };
    // P2-A7: buildings emit UNIT_KILLED but should not play unit death sound
    if (d.isBuilding) return;
    SoundManager.play('death', 0.2);
  };
  const onHeroDied = () => SoundManager.play('heroDeath', 0.35);
  const onProduce = () => SoundManager.play('produce', 0.25);
  const onGameOver = (data: unknown) => {
    const d = data as { winnerIndex: number };
    // winnerIndex: 0=玩家胜, 1=AI胜, -1=平局
    const sfx = d.winnerIndex === -1 ? 'defeat' : d.winnerIndex === 0 ? 'victory' : 'defeat';
    SoundManager.play(sfx, 0.4);
  };
  const onSelect = (data: unknown) => {
    const d = data as { unitIds: string[] };
    if (d.unitIds.length > 0) SoundManager.play('select', 0.12);
  };

  EventBus.on(GameEvent.UNIT_ATTACK_START, onAttack);
  EventBus.on(GameEvent.BUILDING_COMPLETE, onBuild);
  EventBus.on(GameEvent.UNIT_KILLED, onDeath);
  EventBus.on(GameEvent.HERO_DIED, onHeroDied);
  EventBus.on(GameEvent.PRODUCTION_COMPLETE, onProduce);
  EventBus.on(GameEvent.GAME_OVER, onGameOver);
  EventBus.on(GameEvent.SELECTION_CHANGED, onSelect);

  return () => {
    EventBus.off(GameEvent.UNIT_ATTACK_START, onAttack);
    EventBus.off(GameEvent.BUILDING_COMPLETE, onBuild);
    EventBus.off(GameEvent.UNIT_KILLED, onDeath);
    EventBus.off(GameEvent.HERO_DIED, onHeroDied);
    EventBus.off(GameEvent.PRODUCTION_COMPLETE, onProduce);
    EventBus.off(GameEvent.GAME_OVER, onGameOver);
    EventBus.off(GameEvent.SELECTION_CHANGED, onSelect);
  };
}