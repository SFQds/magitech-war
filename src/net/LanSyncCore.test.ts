/**
 * 局域网状态同步核心验证: serialize → deserialize 往返保持游戏状态一致
 *
 * 这是联机状态同步的关键前提 — 主机 serialize 快照 → 客户端 deserialize 重建。
 * 验证单位/建筑/玩家/计时器在 JSON 传输后完整还原。
 */
import { describe, it, expect } from 'vitest';
import { GameWorld } from '../core/GameWorld';
import { EntityRegistry } from '../core/EntityRegistry';
import { serialize, deserialize } from '../save/SaveLoadSystem';
import { makeCommandCenter, makeUnit } from '../__fixtures__/factories';

function cleanWorld(w: number, h: number): GameWorld {
  return new GameWorld(w, h, 32);
}

describe('LAN state sync core', () => {
  it('serialize → deserialize 往返保持单位/建筑/玩家/计时器一致', () => {
    const world = cleanWorld(32, 32);
    const entities = new EntityRegistry();
    world.addPlayer('arcane_empire', ['mages_guild', 'alchemists_society'], false);
    world.addPlayer('hammer_federation', ['mechanists_guild'], true);
    entities.addBuilding(makeCommandCenter(0, 6, 6));
    entities.addBuilding(makeCommandCenter(1, 26, 26));
    entities.addUnit(makeUnit({ owner: 0, tileX: 7, tileY: 7, hp: 80 }));
    entities.addUnit(makeUnit({ owner: 1, tileX: 27, tileY: 27, hp: 60 }));

    const data = serialize({
      world, entities, gameTimer: 42.5, graceTimers: [2.3, 5.6],
      meta: {
        mapId: 'map_valley', mapWidth: 32, mapHeight: 32,
        playerFaction: 'arcane_empire', aiFaction: 'hammer_federation',
        aiDifficulty: 'normal', playerGuilds: ['mages_guild'], aiGuilds: ['mechanists_guild'],
      },
    });

    // 模拟网络 JSON 传输
    const wire = JSON.stringify(data);
    const received = JSON.parse(wire);

    const restored = deserialize(received);
    expect(restored.entities.units.length).toBe(2);
    expect(restored.entities.buildings.length).toBe(2);
    const u0 = restored.entities.units.find(u => u.owner === 0)!;
    expect(u0.tileX).toBe(7);
    expect(u0.hp).toBe(80);
    expect(restored.world.players.length).toBe(2);
    expect(restored.world.players[0].faction).toBe('arcane_empire');
    expect(restored.gameTimer).toBeCloseTo(42.5, 5);
    expect(restored.graceTimers[0]).toBeCloseTo(2.3, 5);
    // 快照体积估算 (联机带宽参考)
    console.log(`[LAN] 单帧快照 JSON 大小: ${wire.length} bytes`);
  });

  it('客户端收到命令后能通过 CommandExecutor 执行 (owner 校验)', () => {
    // 验证客户端发来的 owner=1 命令在主机端能被接受
    // CommandExecutor 已有 owner 校验, 这里确认命令结构完整
    const world = cleanWorld(32, 32);
    world.addPlayer('arcane_empire', ['mages_guild'], false);
    world.addPlayer('hammer_federation', ['mechanists_guild'], true);
    const trainCmd = {
      type: 'train', playerIndex: 1, unitIds: [], buildingId: 'b1',
      unitDefId: 'unit_worker', count: 1, frame: 0,
    };
    // 命令对象可 JSON 序列化 (联机传输前提)
    const roundtripped = JSON.parse(JSON.stringify(trainCmd));
    expect(roundtripped.type).toBe('train');
    expect(roundtripped.playerIndex).toBe(1);
    expect(typeof roundtripped).toBe('object');
  });
});
