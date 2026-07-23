/**
 * Phaser scene stub — 最小化 mock，供需要 Phaser.Scene 的模块在 node 测试环境运行
 *
 * 设计：
 *  - 所有 add.text / add.image 返回链式假对象（方法空操作返回自身或 undefined）
 *  - textures.exists 返回 false（走 __DEFAULT 兜底）
 *  - scene.scene.start 空操作
 *  - 不依赖 jsdom / 不引 Phaser 运行时 —— 纯假对象
 *
 * 用法：`const scene = makeStubScene(); new GameOverController(scene, world, entities);`
 */

/** 链式假对象：所有 setter 空操作返回自身，on/destroy 空操作 */
function chainable(): any {
  const obj: any = {
    setOrigin() { return obj; },
    setDepth() { return obj; },
    setScrollFactor() { return obj; },
    setStyle() { return obj; },
    setText() { return obj; },
    setInteractive() { return obj; },
    setPosition() { return obj; },
    setRotation() { return obj; },
    setAlpha() { return obj; },
    setTint() { return obj; },
    clearTint() { return obj; },
    setVisible() { return obj; },
    setActive() { return obj; },
    setScale() { return obj; },
    on() { return obj; },
    off() { return obj; },
    once() { return obj; },
    destroy() {},
    get() { return obj; },
    getData() { return undefined; },
    setData() { return obj; },
  };
  return obj;
}

/** 造一个最小 Phaser.Scene stub */
export function makeStubScene(): any {
  return {
    add: {
      text: () => chainable(),
      image: () => chainable(),
      rectangle: () => chainable(),
      graphics: () => chainable(),
      circle: () => chainable(),
      zone: () => chainable(),
    },
    textures: {
      exists: () => false,
      get: () => undefined,
      addBase64: () => {},
    },
    scene: {
      start: () => {},
      stop: () => {},
      pause: () => {},
      resume: () => {},
      get: () => makeStubScene(),
      isActive: () => false,
      isSleeping: () => false,
      isPaused: () => false,
    },
    cameras: {
      main: {
        worldView: { x: 0, y: 0, width: 1280, height: 720 },
        scrollX: 0,
        scrollY: 0,
        zoom: 1,
        setScroll: () => {},
        centerOn: () => {},
      },
    },
    input: {
      activePointer: { x: 0, y: 0, worldX: 0, worldY: 0, isDown: false, justDown: false },
      keyboard: { addKey: () => ({ isDown: false }), createCursorKeys: () => ({}) },
    },
    game: { loop: { delta: 16.67 } },
    scale: { width: 1280, height: 720 },
    cache: { json: { get: () => null } },
    load: { json: () => {}, start: () => {} },
    events: { on: () => {}, off: () => {}, emit: () => {} },
    sys: { events: { on: () => {}, off: () => {}, once: () => {} } },
  };
}
