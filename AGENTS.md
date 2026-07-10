# 魔导工业革命 · 项目规则

## 精灵/美术资源生成

**🚨 硬性规则：新增任何建筑、单位、弹道特效时，必须用豆包桌面端生成 PNG 精灵。禁止使用 AssetGenerator 占位图替代。**

规则：
1. 新增 `BUILDING_DEFS` / `UNIT_DEFS` 条目后，检查 `public/assets/sprites/` 下是否已有对应的 `{id}.png`
2. 若缺失，立即撰写 CSV（`output/prompts_xxx.csv`，格式：`name,prompt`），用 `doubao-image-desktop` skill 的批处理生成
3. 生成完成后依次运行去水印 → 去背景，输出到 `public/assets/sprites/`
4. 将新 key 加入 `src/config/sprites.ts` 的 `PNG_SPRITE_KEYS`（如已有 PNG 文件）
5. 豆包桌面 skill 路径：`.agents/skills/doubao-image-desktop/scripts/desktop_generate.py`

**不要用 seedream skill（那是火山方舟 API），用 doubao-image-desktop（桌面端生成）。**

## 技术栈

- TypeScript + Vite + Phaser 3.80
- 构建：`npx tsc --noEmit`，开发服务器：`npx vite --port 5173`
- 代码规范：见 `src/README.md`

## 设计文档

- 游戏数据：`docs/GAME_DATA.md`
- 世界观：`docs/CODEX.md`
- 美术需求：`docs/ART_ASSETS.md`