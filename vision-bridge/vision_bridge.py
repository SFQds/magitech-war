# -*- coding: utf-8 -*-
"""
vision_bridge — 给无视觉能力的文本模型提供"看图"能力的 MCP Server（stdio）。

架构：
  文本模型(客户端) --MCP(stdio JSON-RPC)--> 本Server --OpenAI兼容API--> 视觉模型(GLM-4.6V-Flash)
  图片在本机时，主模型传路径，Server 读取并 base64 后发给视觉模型；返回纯文本描述。

零第三方依赖（仅标准库）；PIL 可选，用于降采样大图以节省 token。
用法：
  python vision_bridge.py              # 以 stdio 模式运行 MCP Server
  python vision_bridge.py --selftest   # 直接测试视觉 API（不经过 MCP 协议）
"""

import base64
import io
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")

DEFAULT_CONFIG = {
    "api_key": "",
    "base_url": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    "model": "glm-4.6v-flash",
    "fallback_models": ["glm-4v-flash", "glm-4.1v-thinking-flash"],  # 同供应商降级
    "fallbacks": [],  # 跨供应商降级：[{name, base_url, api_key, model}, ...]
    "thinking": False,            # 关闭思考模式：更快、更省 token
    "max_tokens": 1024,
    "timeout": 90,                # 单次 HTTP 超时（秒）
    "retries": 3,                 # 过载(1305)/5xx 时重试次数
    "downscale_max_side": 1568,   # 图片最大边长，超过先压缩再上传（需 PIL）
}

MIME_BY_EXT = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
}


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg.update(json.load(f))
    return cfg


# ---------------------------------------------------------------------------
# 视觉 API 调用（OpenAI 兼容格式）
# ---------------------------------------------------------------------------

def _mime_for(path):
    ext = os.path.splitext(path)[1].lower()
    return MIME_BY_EXT.get(ext) or mimetypes.guess_type(path)[0] or "image/jpeg"


def _prepare_image(path):
    """读取本地图片 → 可选降采样 → 返回 data URL。"""
    cfg = load_config()
    with open(path, "rb") as f:
        data = f.read()
    mime = _mime_for(path)
    max_side = cfg.get("downscale_max_side")
    if max_side:
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(data))
            w, h = img.size
            if max(w, h) > max_side:
                ratio = max_side / max(w, h)
                img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
                buf = io.BytesIO()
                if mime == "image/png":
                    img.save(buf, "PNG")
                    mime = "image/png"
                else:
                    img.convert("RGB").save(buf, "JPEG", quality=92)
                    mime = "image/jpeg"
                data = buf.getvalue()
        except ImportError:
            pass  # 没有 PIL 就原样发送
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def _chat(messages, skip_models=None):
    """按 [主模型 + 同供应商降级 + 跨供应商降级] 顺序调用，失败自动切换下一个。

    skip_models: 集合，跳过不支持当前输入模态的模型（如视频任务跳过纯图片模型）。
    """
    cfg = load_config()
    skip = skip_models or set()
    chain = [{"model": cfg["model"], "base_url": cfg["base_url"],
              "api_key": cfg["api_key"]}]
    for m in cfg.get("fallback_models", []):
        if m and m != cfg["model"]:
            chain.append({"model": m, "base_url": cfg["base_url"],
                          "api_key": cfg["api_key"]})
    for fb in cfg.get("fallbacks", []):
        chain.append({"model": fb["model"],
                      "base_url": fb.get("base_url", cfg["base_url"]),
                      "api_key": fb.get("api_key", cfg["api_key"])})
    errors = []
    for item in chain:
        if item["model"] in skip:
            errors.append(f"{item['model']}: 跳过（不支持视频）")
            continue
        try:
            return _chat_with_model(item["model"], messages, cfg,
                                    item["base_url"], item["api_key"])
        except Exception as e:
            errors.append(f"{item['model']}: {e}")
    raise RuntimeError(f"降级链 {len(chain)} 个模型均失败: {'; '.join(errors)}")


def _chat_with_model(model, messages, cfg, base_url, api_key):
    """调用单个视觉模型（可指定任意 OpenAI 兼容端点），1305/限流/5xx 自动退避重试。"""
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": cfg.get("max_tokens", 1024),
    }
    if not cfg.get("thinking"):
        payload["thinking"] = {"type": "disabled"}

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    # 部分免费网关（如 OpenCode Zen）用 Cloudflare 拦截非浏览器 UA，统一带浏览器 UA
    headers["User-Agent"] = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                             "AppleWebKit/537.36 (KHTML, like Gecko) "
                             "Chrome/126.0 Safari/537.36")
    retries = max(1, cfg.get("retries", 3))
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                base_url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
            )
            with urllib.request.urlopen(req, timeout=cfg.get("timeout", 90)) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            text = (body["choices"][0]["message"].get("content") or "").strip()
            text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
            text = re.sub(r"<answer>(.*?)</answer>", r"\1", text, flags=re.DOTALL).strip()
            text = text.lstrip("<think>").strip()  # 兜底：未闭合的 <think> 块
            if not text:
                text = "（模型未返回内容）"
            return text
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            last_err = f"HTTP {e.code}: {err_body}"
            try:
                code = json.loads(err_body).get("error", {}).get("code")
            except Exception:
                code = None
            if code == "1305" or e.code in (429, 500, 502, 503):
                time.sleep(2 * (attempt + 1))   # 过载/限流 → 退避重试
                continue
            if attempt == 0 and "thinking" in err_body:
                payload.pop("thinking", None)   # 参数不支持 → 去掉后重试一次
                continue
            raise RuntimeError(last_err)
        except Exception as e:
            last_err = repr(e)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"重试 {retries} 次后仍失败: {last_err}")


# ---------------------------------------------------------------------------
# 工具实现
# ---------------------------------------------------------------------------

# 按任务类型附加的聚焦分析指引（模仿 luma-mcp 的 task_type 设计）
TASK_ADDONS = {
    "auto": None,  # 不加固定指引，完全按 question 来
    "general": "请全面分析图片内容：主体、场景、细节与氛围，尽量具体。",
    "ocr": ("请提取图片中的全部可见文字，按阅读顺序输出；保留原始段落与换行；"
            "不要解释、总结或补全缺失文字；不确定的字符用[不确定]标注。"),
    "ui": "请描述界面结构：窗口/页面类型、主要控件及其位置、菜单、按钮、输入框的文字内容。",
    "debug": ("请重点阅读截图中的报错信息、日志或异常输出，"
              "提取关键错误码与错误描述；如有上下文线索一并说明。"),
    "describe": "请用简洁的语言概括图片的主要内容。",
}


def _build_prompt(question, task_type):
    """组合视觉提示词 = 任务指引 + 用户关注点。"""
    addon = TASK_ADDONS.get(task_type or "auto")
    if addon:
        return f"{addon}\n\n用户关注点：{question}"
    return question


def analyze_image(image_path, question="请详细描述这张图片的内容", task_type="auto"):
    """分析本地图片：读取 → base64 → 视觉模型 → 文字描述。"""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"图片不存在: {image_path}")
    data_url = _prepare_image(image_path)
    messages = [{"role": "user", "content": [
        {"type": "text", "text": _build_prompt(question, task_type)},
        {"type": "image_url", "image_url": {"url": data_url}},
    ]}]
    return _chat(messages)


def analyze_image_url(image_url, question="请详细描述这张图片的内容", task_type="auto"):
    """分析远程图片 URL（图片不落地，直接把 URL 传给视觉模型）。"""
    messages = [{"role": "user", "content": [
        {"type": "text", "text": _build_prompt(question, task_type)},
        {"type": "image_url", "image_url": {"url": image_url}},
    ]}]
    return _chat(messages)


def ocr_image(image_path):
    """提取本地图片中的全部文字（OCR），按阅读顺序输出。"""
    return analyze_image(
        image_path,
        "请提取这张图片中的全部文字内容，按阅读顺序输出，不要添加任何解释。"
        "如果是表格，请用 Markdown 表格保留结构。",
    )


VIDEO_MIME_BY_EXT = {
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".avi": "video/x-msvideo", ".mkv": "video/x-matroska", ".m4v": "video/mp4",
}


def analyze_video(video_path_or_url, question="请详细描述这个视频的内容（画面、场景、动作、字幕等）",
                  task_type="auto"):
    """分析视频（本地文件或 http(s) URL），返回文字描述。

    本地文件会转 base64 data URL 上传；注意：仅链中支持视频的模型会参与
    （config.json 的 no_video_models 会被跳过），如 glm-4v-flash、mimo 等。
    """
    cfg = load_config()
    if video_path_or_url.startswith(("http://", "https://")):
        video_url = video_path_or_url
    else:
        if not os.path.exists(video_path_or_url):
            raise FileNotFoundError(f"视频不存在: {video_path_or_url}")
        ext = os.path.splitext(video_path_or_url)[1].lower()
        mime = VIDEO_MIME_BY_EXT.get(ext, "video/mp4")
        with open(video_path_or_url, "rb") as f:
            video_url = f"data:{mime};base64,{base64.b64encode(f.read()).decode()}"
    messages = [{"role": "user", "content": [
        {"type": "text", "text": _build_prompt(question, task_type)},
        {"type": "video_url", "video_url": {"url": video_url}},
    ]}]
    return _chat(messages, skip_models=set(cfg.get("no_video_models", [])))


# ---------------------------------------------------------------------------
# MCP stdio Server（JSON-RPC 2.0，逐行协议）
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "analyze_image",
        "description": "分析本地图片并返回文字描述。何时调用：仅当你无法直接查看图片内容时——"
                       "例如图片只提供了文件路径或 URL、没有以附件形式出现在你的上下文中、"
                       "媒体内容被省略、或用户要求对图片做精确的 OCR/报错/界面分析。"
                       "如果你已经能在上下文中直接看到图片内容，则不需要调用本工具，直接回答即可。"
                       "调用要求：1. image_path 传图片在本机的绝对或相对路径（文件需真实存在）；"
                       "2. question 根据用户当前关注点编写聚焦问题（越具体越好），"
                       "例如用户问报错原因时可传「请阅读截图中的报错信息，说明错误原因和解决办法」，"
                       "用户问设计评价时可传「请评价这张图片的构图、配色与视觉风格」，"
                       "没有明确关注点时可省略；"
                       "3. task_type 可选，按任务类型附加分析指引。"
                       "返回纯文本描述，请基于返回内容继续回答用户。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "image_path": {
                    "type": "string",
                    "description": "本地图片文件的绝对路径或相对路径（jpg/png/gif/webp/bmp）",
                },
                "question": {
                    "type": "string",
                    "description": "针对图片的聚焦问题，根据用户当前关注点编写；省略则默认详细描述图片内容",
                },
                "task_type": {
                    "type": "string",
                    "enum": ["auto", "general", "ocr", "ui", "debug", "describe"],
                    "description": "可选任务类型：auto=按问题自动/general=全面分析/ocr=提取文字/"
                                   "ui=界面结构/debug=报错日志/describe=简短描述",
                },
            },
            "required": ["image_path"],
        },
    },
    {
        "name": "analyze_image_url",
        "description": "分析远程图片（http/https URL）并返回文字描述。何时调用：仅当你无法直接查看图片内容时"
                       "——图片只有 URL、没有以附件形式出现在你的上下文中。"
                       "如果你已经能在上下文中直接看到图片，则不需要调用本工具。"
                       "question 与 task_type 的用法同 analyze_image：question 根据用户当前关注点聚焦提问。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "image_url": {
                    "type": "string",
                    "description": "图片的 http/https 地址",
                },
                "question": {
                    "type": "string",
                    "description": "针对图片的聚焦问题，根据用户当前关注点编写；省略则默认详细描述图片内容",
                },
                "task_type": {
                    "type": "string",
                    "enum": ["auto", "general", "ocr", "ui", "debug", "describe"],
                    "description": "可选任务类型：auto=按问题自动/general=全面分析/ocr=提取文字/"
                                   "ui=界面结构/debug=报错日志/describe=简短描述",
                },
            },
            "required": ["image_url"],
        },
    },
    {
        "name": "ocr_image",
        "description": "从本地图片中提取全部文字（OCR），按阅读顺序输出。何时调用：需要精确、完整、"
                       "按顺序的文字提取时（截图、扫描件、票据、验证码、文档照片），"
                       "或图片内容不在你的上下文中时。即使你能直接看到图片，"
                       "当用户要求精确提取文字（不得遗漏、不得编造）时也建议使用本工具。"
                       "只返回提取的文字，不做语义理解。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "image_path": {
                    "type": "string",
                    "description": "本地图片文件的绝对路径或相对路径",
                },
            },
            "required": ["image_path"],
        },
    },
    {
        "name": "analyze_video",
        "description": "分析视频并返回文字描述（画面、场景、动作、字幕等）。何时调用：仅当你无法直接查看视频内容时"
                       "——视频通常不会完整出现在你的上下文中（只有文件路径或 URL）。"
                       "如果你已经能在上下文中直接看到视频内容，则不需要调用本工具。"
                       "调用要求：1. video_path_or_url 传本地视频文件路径或 http(s) 视频 URL；"
                       "2. question 根据用户当前关注点聚焦提问（同 analyze_image 的用法）；"
                       "3. 仅支持视频的模型参与分析（自动跳过不支持视频的模型），较长视频约耗时 10-40 秒。"
                       "返回纯文本描述，请基于返回内容继续回答用户。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "video_path_or_url": {
                    "type": "string",
                    "description": "本地视频文件路径，或 http(s) 视频 URL",
                },
                "question": {
                    "type": "string",
                    "description": "针对视频的聚焦问题，根据用户当前关注点编写；省略则默认详细描述视频内容",
                },
                "task_type": {
                    "type": "string",
                    "enum": ["auto", "general", "ocr", "ui", "debug", "describe"],
                    "description": "可选任务类型：auto=按问题自动/general=全面分析/ocr=提取字幕文字/"
                                   "ui=界面结构/debug=报错日志/describe=简短描述",
                },
            },
            "required": ["video_path_or_url"],
        },
    },
]

FUNCTIONS = {
    "analyze_image": analyze_image,
    "analyze_image_url": analyze_image_url,
    "ocr_image": ocr_image,
    "analyze_video": analyze_video,
}


def handle_request(msg):
    method = msg.get("method")
    msg_id = msg.get("id")
    params = msg.get("params") or {}

    if method == "initialize":
        return {
            "jsonrpc": "2.0", "id": msg_id,
            "result": {
                "protocolVersion": params.get("protocolVersion", "2025-03-26"),
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "vision-bridge", "version": "0.1.0"},
            },
        }
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        fn = FUNCTIONS.get(name)
        if not fn:
            return {"jsonrpc": "2.0", "id": msg_id,
                    "error": {"code": -32602, "message": f"未知工具: {name}"}}
        try:
            text = fn(**args)
            return {"jsonrpc": "2.0", "id": msg_id,
                    "result": {"content": [{"type": "text", "text": text}]}}
        except Exception as e:
            return {"jsonrpc": "2.0", "id": msg_id,
                    "result": {"content": [{"type": "text",
                                            "text": f"[vision-bridge 错误] {e}"}],
                               "isError": True}}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {}}
    return {"jsonrpc": "2.0", "id": msg_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"}}


def serve_stdio():
    """逐行读取 stdin 的 JSON-RPC，响应写到 stdout。"""
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        if "id" not in msg:
            continue  # 通知类消息（initialized 等）无需响应
        resp = handle_request(msg)
        sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def selftest():
    """直接测试视觉 API（不经过 MCP 协议）。"""
    cfg = load_config()
    if not cfg.get("api_key"):
        print("config.json 中缺少 api_key")
        return 1
    chain = [cfg["model"]] + list(cfg.get("fallback_models", [])) + \
            [f.get("name", f.get("model")) for f in cfg.get("fallbacks", [])]
    print(f"主模型:   {cfg['model']}")
    print(f"降级链:   {' → '.join(str(x) for x in chain)}")
    print(f"思考模式: {'开' if cfg.get('thinking') else '关'}")
    print(f"图片:     dog_and_girl.jpeg（阿里云公开测试图）")
    t0 = time.time()
    text = analyze_image_url(
        "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg",
        "用一句话描述这张图",
    )
    print(f"耗时:     {time.time() - t0:.1f}s")
    print(f"结果:     {text}")
    return 0


def register(scope="workspace"):
    """生成 MCP 注册配置，自动适应当前机器的 Python 路径。

    scope=workspace: 写入本目录 .zcode/config.json（推荐，随项目走）
    scope=user:      写入 ~/.zcode/cli/config.json（所有项目可用，需注意合并）
    """
    server = {"command": sys.executable or "python",
              "args": [os.path.abspath(__file__)], "env": {}}
    if scope == "user":
        path = os.path.join(os.path.expanduser("~"), ".zcode", "cli", "config.json")
        cfg = {}
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                cfg = json.load(f)
        cfg.setdefault("mcp", {}).setdefault("servers", {})["vision-bridge"] = server
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        print(f"已注册到用户级配置: {path}")
    else:
        path = os.path.join(SCRIPT_DIR, ".zcode", "config.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"mcp": {"servers": {"vision-bridge": server}}},
                      f, ensure_ascii=False, indent=2)
        print(f"已注册到工作区配置: {path}")
    print(f"  command: {server['command']}")
    print(f"  args:    {server['args']}")


def main():
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    if "--register" in sys.argv:
        scope = "user" if "user" in sys.argv else "workspace"
        register(scope)
        return
    serve_stdio()


if __name__ == "__main__":
    main()
