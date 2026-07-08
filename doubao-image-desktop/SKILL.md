---
name: doubao-image-desktop
description: Automate Doubao desktop image generation and downloads on Windows. Use when Codex needs to generate one or many images with 豆包/Doubao desktop, enforce single-image output, run style-consistent CSV batches in one chat, download generated images, retry or classify failures such as 服务过载/no response, or debug Doubao desktop GUI automation.
---

# Doubao Image Desktop

## Core Rules

- Use the desktop app, not Doubao web, unless the user explicitly asks otherwise.
- **Restart Doubao before every image task**, unless the user explicitly passes `--keep-running-app` or asks to reuse the current session. The default is to close any existing Doubao process and relaunch it, ensuring a predictable clean state.
- Do not click bottom mode buttons such as `图像生成`, `PPT 生成`, or `AI 表格`; paste the prompt in the normal chat box and let Doubao infer image generation.
- Never bypass captcha, login checks, or human verification. Stop and ask the user to complete them.
- For style-consistent batches, keep images in one conversation. Start a new chat only once at batch start when requested or when the current chat is overloaded.
- Always make prompts request exactly one image. The generator script prepends the single-image directive automatically.

## Script Selection

Run the skill scripts from the project root:

```powershell
python .agents\skills\doubao-image-desktop\scripts\desktop_generate.py --help
```

## Dependencies

Install once for all scripts in this skill:

```powershell
# Core (generate + probe)
python -m pip install pywinauto pyautogui pyperclip numpy psutil pywin32 pillow

# Watermark removal (desktop_remove_watermark.py)
python -m pip install easyocr opencv-python-headless

# Background removal (desktop_remove_background.py)
python -m pip install "rembg[cpu]"
```

## Single Image

Generate and save one image:

```powershell
python .agents\skills\doubao-image-desktop\scripts\desktop_generate.py "一只白色陶瓷马克杯放在浅灰桌面中央，背景干净" --output output\cup.png --overwrite
```

Use `--reuse-current` if the user wants to stay in the current conversation:

```powershell
python .agents\skills\doubao-image-desktop\scripts\desktop_generate.py "继续同一风格：一本浅蓝封面的书" --output output\book.png --reuse-current --overwrite
```

## Batch Images

Use a CSV with `name,prompt` columns:

```csv
name,prompt
scene_01.png,一只白色陶瓷碗放在浅灰桌面中央
scene_02.png,一只透明玻璃杯放在浅灰桌面中央
```

Run a style-consistent batch, starting a clean chat once:

```powershell
python .agents\skills\doubao-image-desktop\scripts\desktop_generate.py --batch prompts.csv --dir output\series --start-new-chat --overwrite --style "统一为清爽写实产品摄影、柔和自然光、浅灰桌面、干净白色背景、中心构图、细节真实"
```

Default batch behavior:

- Retry each row once.
- Continue after a failed row.
- Write `batch_result.csv` with `success`, `mode`, `error_type`, `attempts`, `attempt_errors`, and `download_path`.

Useful controls:

```powershell
python .agents\skills\doubao-image-desktop\scripts\desktop_generate.py --batch prompts.csv --dir output\series --retries 2 --retry-delay 12 --generation-timeout 120 --no-response-timeout 45
python .agents\skills\doubao-image-desktop\scripts\desktop_generate.py --batch prompts.csv --dir output\series --stop-on-error
```

## Failure Handling

Interpret result modes like this:

- `downloaded`: image was generated and moved to the requested output path.
- `generation_failed`: Doubao visibly reported failure, including service overload or policy/limit errors.
- `no_response`: no visible response or window change appeared after sending.
- `generation_timeout`: Doubao responded or changed, but no new ready image was detected in time.
- `download_failed`: a preview/save/download step failed after image detection.

When a failure looks chat-state related, retry with `--start-new-chat`. When failures are service overload, wait before retrying. When human verification appears, stop and ask the user to complete it.

## Diagnostics

Use the probe script to maximize Doubao and capture UIA controls/screenshot for debugging:

```powershell
python .agents\skills\doubao-image-desktop\scripts\desktop_probe.py --launch --full
```

Read `.agents\skills\doubao-image-desktop\references\desktop-workflow.md` before modifying the scripts, changing click coordinates, or diagnosing repeated GUI failures.

## Watermark Removal

Remove the "豆包AI生成" watermark from generated images with the standalone script. Run it **after** generation is complete.

### Quick Usage

```powershell
# Single image
python .agents\skills\doubao-image-desktop\scripts\desktop_remove_watermark.py output\cup.png

# Entire folder (processes all PNG, JPG, WEBP files)
python .agents\skills\doubao-image-desktop\scripts\desktop_remove_watermark.py output\series\
```

### How It Works

1. **EasyOCR** scans the bottom 40% of the image for Chinese text matching "豆包AI生成"
2. Detected text regions are expanded with 10px padding into an inpaint mask
3. **OpenCV Telea inpainting** fills the masked region using surrounding texture

Only images that actually contain the watermark are modified — clean images are skipped with a `⏭` notice.

### Common Workflow

```powershell
# 1. Generate batch
python .agents\skills\doubao-image-desktop\scripts\desktop_generate.py --batch prompts.csv --dir output\batch --start-new-chat --overwrite

# 2. Strip watermarks
python .agents\skills\doubao-image-desktop\scripts\desktop_remove_watermark.py output\batch\
```

### Reference

See `.agents\skills\doubao-image-desktop\references\watermark-removal.md` for detailed detection parameters, inpainting configuration, performance characteristics, and known limitations.

## Background Removal

Remove backgrounds from images using U²-Net deep learning. Outputs transparent PNGs suitable for compositing.

### Quick Usage

```powershell
# Single image → transparent PNG in same folder
python .agents\skills\doubao-image-desktop\scripts\desktop_remove_background.py character.png

# Entire folder → transparent PNGs in output/抠图结果/
python .agents\skills\doubao-image-desktop\scripts\desktop_remove_background.py output\龙女素材\ --out output\抠图结果\

# Replace background with solid white instead of transparency
python .agents\skills\doubao-image-desktop\scripts\desktop_remove_background.py character.png --bg-color FFFFFF
```

### How It Works

1. **U²-Net** deep learning model segments foreground from background
2. Output is an **RGBA PNG** with transparent background
3. Optional `--bg-color` composites the result onto a solid color

### Full Pipeline (Generate → Watermark → Background)

```powershell
# 1. Generate images
python .agents\skills\doubao-image-desktop\scripts\desktop_generate.py --batch prompts.csv --dir output\batch --start-new-chat --overwrite

# 2. Remove watermarks
python .agents\skills\doubao-image-desktop\scripts\desktop_remove_watermark.py output\batch\

# 3. Remove backgrounds
python .agents\skills\doubao-image-desktop\scripts\desktop_remove_background.py output\batch\ --out output\抠图结果\
```

First run downloads the U²-Net model (~168 MB) to `~/.u2net/u2net.onnx`.

### Reference

See `.agents\skills\doubao-image-desktop\references\background-removal.md` for model details, performance, known limitations, and integration patterns.
