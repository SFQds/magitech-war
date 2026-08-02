# 魔导工业革命 · 项目规则

## 精灵/美术资源生成

**🚨 硬性规则：新增任何建筑、单位、弹道特效、UI 皮肤/图标时，必须用豆包桌面端生成 PNG 精灵。禁止使用 AssetGenerator 占位图替代。**

规则：
1. 新增 `BUILDING_DEFS` / `UNIT_DEFS` 条目，或新增 UI 皮肤/图标后，检查 `public/assets/sprites/` 下是否已有对应的 `{id}.png`
2. 若缺失，立即撰写 CSV（`output/prompts_xxx.csv`，格式：`name,prompt`），用 `doubao-image-desktop` skill 的批处理生成
3. 生成完成后依次运行去水印 → 去背景（图标/装饰类需要去背景，NineSlice 皮肤纹理不需要），输出到 `public/assets/sprites/`
4. 将新 key 加入 `src/config/sprites.ts` 的 `PNG_SPRITE_KEYS`
5. **若是 UI 皮肤/图标**（`skin_*` / `ui_icon_*` / `ui_deco_*` / `ui_frame_*` / `ui_minimap_*` / `ui_menu_bg` / `ui_logo`），还需加入 `UI_SKIN_KEYS` 集合 —— `BootScene` 会对该集合调用 `setFilter(LINEAR)`，避免 `pixelArt: true` 的 nearest 采样让皮肤纹理模糊
6. 豆包桌面 skill 路径：`.agents/skills/doubao-image-desktop/scripts/desktop_generate.py`

**不要用 seedream skill（那是火山方舟 API），用 doubao-image-desktop（桌面端生成）。**

### UI 皮肤化架构（新增 UI 组件时遵守）

- UI 面板/按钮底**必须**走 `src/ui/theme/UIWidget.ts` 的 `drawPanelSkin` / `drawButtonSkin` 双路径：纹理存在用 NineSlice，缺失回退纯色 Graphics。**不要直接用 `drawPanel` / `drawButton` 纯色绘制**（会回退到塑料感）。
- 测试 stub 需提供 `textures: { exists: () => false }`（触发回退路径）和 graphics 的 `setAlpha` 方法。
- 现已接入的组件：HUDScene / MenuScene / CodexScene / CommandCard / SelectionPanel / HeroPanel / Tooltip / PauseMenu / ProductionQueue / Minimap / SuperWeaponBar / ResourceDisplay。

## 技术栈

- TypeScript + Vite + Phaser 3.80
- 构建：`npx tsc --noEmit`，开发服务器：`npx vite --port 5173`
- 代码规范：见 `src/README.md`

## 设计文档

- 游戏数据：`docs/GAME_DATA.md`
- 世界观：`docs/CODEX.md`
- 美术需求：`docs/ART_ASSETS.md`