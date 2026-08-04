# vision-bridge：无视觉模型的"看图" MCP Server

给没有原生多模态能力的文本模型（DeepSeek、Qwen 文本版、GLM 文本版等）提供视觉能力。

```
文本模型(客户端) --MCP(stdio)--> vision_bridge --OpenAI兼容API--> GLM-4.6V-Flash(视觉模型)
        ↑ 文字决策                       ↑ 桥接                          ↑ 真正"看图"
```

## 快速开始

```bash
# 1. 配置 API Key（config.json）
# 2. 自测视觉 API（不经 MCP 协议，快速排障）
python vision_bridge.py --selftest

# 3. 以 stdio 模式运行 MCP Server（被 MCP 客户端拉起，一般不需要手动运行）
python vision_bridge.py
```

## 工具

| 工具 | 参数 | 用途 |
|---|---|---|
| `analyze_image` | `image_path`, `question?`, `task_type?` | 分析本地图片（读取→base64→视觉模型） |
| `analyze_image_url` | `image_url`, `question?`, `task_type?` | 分析远程图片 URL（图片不落地） |
| `ocr_image` | `image_path` | 提取图片中的全部文字，按阅读顺序输出 |
| `analyze_video` | `video_path_or_url`, `question?`, `task_type?` | 分析视频（本地文件或 URL），仅视频模型参与，约 10-40s |

**工具描述设计**（模仿 luma-mcp / Visual-Enhancement-mcp / ai-vision-mcp）：
- 描述写明"**何时调用**"，触发条件基于**图片内容是否在模型上下文中**（"仅当你无法直接查看图片内容时"），
  而非模型能力——**有视觉的模型看到图片时不触发，只给路径/URL/媒体被省略时才触发**，避免误调用；
  无视觉模型则始终触发
- `question` 引导调用方**根据用户当前关注点聚焦提问**（如报错截图→"请阅读报错信息说明原因"），不要笼统"描述这张图"
- `task_type`（auto/general/ocr/ui/debug/describe）服务端自动附加分析指引（如 OCR 规范：不解释不补全、不确定字符标注）
- `ocr_image` 例外：即使有视觉的模型，需要精确完整提取文字时也建议调用（防遗漏、防编造）

## config.json 配置项

| 字段 | 默认 | 说明 |
|---|---|---|
| `api_key` | 必填 | 智谱 API Key |
| `model` | `glm-4.6v-flash` | 主视觉模型（免费） |
| `fallback_models` | `["glm-4v-flash", "glm-4.1v-thinking-flash"]` | 同供应商降级（免费档高峰期频繁过载，务必保留） |
| `fallbacks` | `[]` | **跨供应商降级**（详见下文） |
| `thinking` | `false` | 关闭思考模式：更快、更省 token |
| `max_tokens` | `1024` | 单次回答上限 |
| `timeout` / `retries` | `90` / `3` | HTTP 超时 / 过载重试次数（退避 2s×n） |
| `downscale_max_side` | `1568` | 图片最大边长，超过先压缩再上传（需 Pillow，可选安装） |
| `no_video_models` | `["glm-4v-flash", "mimo-v2.5-free"]` | 视频任务跳过这些模型（不支持视频，实测） |

### 跨供应商降级（`fallbacks`）

**① 中科大平台（已启用）**——`api.llm.ustc.edu.cn`（LiteLLM 网关，OpenAI 兼容）：

```jsonc
{
  "fallbacks": [
    {
      "name": "ustc-qwen3.6-chat",
      "base_url": "https://api.llm.ustc.edu.cn/v1/chat/completions",
      "api_key": "sk-xxx",          // 科大平台 Key
      "model": "qwen3.6-chat"       // 多模态实测通过，5.9s
    }
  ]
}
```

科大平台该 Key 可调 14 个模型，视觉能力实测：`qwen3.6-chat` ✅ / `qwen-chat` ✅(3.8s) /
`smart/default` ✅ / `k3` ✅(慢) / `qwen3.6-reasoner` ✅(16s) / `unlimited-ocr` ✅(仅OCR)；
`deepseek-v4-pro` ❌ 纯文本；`glm-chat`/`glm-reasoner` 上游 500 暂不可用。

**② OpenCode Zen 免费模型（已启用，排最后）**——`opencode.ai/zen/v1`，匿名可调：

```jsonc
{
  "name": "opencode-zen-mimo-v2.5-free",
  "base_url": "https://opencode.ai/zen/v1/chat/completions",
  "api_key": "",                  // 留空 = 匿名调用（需浏览器 UA，代码已内置）
  "model": "mimo-v2.5-free"
}
```

⚠️ **注意事项（实测）**：
- mimo-v2.5-free 排链**最后**（用户决定）：Zen 免费档"限时免费"且**可能采集数据用于训练**，隐私敏感的图片不建议走它
- 注册表标称支持音频，但**实测 Zen 免费端点不真正处理音频**（模型自述听不了）；需要音频理解请走智谱 GLM-ASR-2512（同 Key，输入16元/百万token）
- 同一端点注册表还列出 `mimo-v2-omni-free` / `qwen3.6-plus-free` 等，但实测均返回 "Model not supported"，**不要加入配置**

> 换其他 OpenAI 兼容视觉端点只需改 `base_url` + `model`，代码不用动。

## 在 ZCode 中注册（已完成）

已写入工作区配置 `.zcode/config.json`（`mcp.servers.vision-bridge`）。
**重启 ZCode 或 设置 → MCP 重新连接后**，工具将以 `mcp__vision-bridge__*` 形式出现，
对话中直接说"看一下这张图"即可触发，无需任何触发词。

换机器/换项目时，也可注册到用户级配置 `~/.zcode/cli/config.json` 的 `mcp.servers`：

```json
{
  "mcp": {
    "servers": {
      "vision-bridge": {
        "command": "python",
        "args": ["<本目录绝对路径>/vision_bridge.py"]
      }
    }
  }
}
```

## 迁移到另一台电脑

```bash
# 1. 拷贝整个文件夹（不含 samples/），或直接用根目录打包好的 vision-bridge.zip

# 2. 新电脑安装 Python 3.10+（命令行能运行 python 即可）

# 3. 验证 API Key 和网络（新电脑需能访问 open.bigmodel.cn）
python vision_bridge.py --selftest

# 4. 自动注册（关键！自动写入新机器的 Python 绝对路径）
python vision_bridge.py --register          # 工作区级：写入 .zcode/config.json
python vision_bridge.py --register user     # 用户级：写入 ~/.zcode/cli/config.json，所有项目可用

# 5. 重启 ZCode，测试
```

> `--register` 会覆盖本项目 `.zcode/config.json` 或合并进用户配置的
> `mcp.servers.vision-bridge`，路径完全由新机器自动生成，无需手改 JSON。

## 测试

```bash
python vision_bridge.py --selftest   # 视觉 API 层
python tests/test_stdio.py           # MCP 协议层（initialize/tools/list/tools/call/ping/错误路径）
```

## 安全提醒

- `config.json` 含 API Key，**不要提交到版本控制**（建议加 .gitignore）
- Key 泄漏后可在智谱控制台轮换
