# Doubao Desktop Workflow Reference

Use this reference when changing or debugging the bundled desktop automation scripts.

## Operating Assumptions

- The working Doubao launcher is `D:\Programs\Doubao\Doubao.exe`.
- The running process commonly appears as `D:\Programs\Doubao\app\Doubao.exe`.
- The app must be maximized before coordinate fallback clicks.
- The save button in image preview is clicked by relative coordinate near the top right of the preview window.
- The scripts monitor the current Windows user's `Downloads` folder for new image files, then move the newest stable download to the requested output path.

## Prompt Contract

Every generation prompt is wrapped with:

```text
请严格只生成一张（1张）图片。不要生成多张、4张、四宫格、组图、拼图、对比图或多个版本。

作图提示词：<user prompt>
```

Batch prompts add continuity text before the row prompt:

```text
请把这张图作为同一系列中的一张来生成。
请与本对话中已经确立的统一视觉风格保持一致，包括色彩、光影、构图语言、材质处理、镜头感和细节质量。
```

If `--style` is supplied, it is included as a shared style anchor for every row.

## Batch Semantics

- `--batch prompts.csv` reads rows with `name,prompt`.
- `--dir output\series` controls target directory.
- `--start-new-chat` clicks left sidebar `新对话` once before the first row.
- Without `--start-new-chat`, the current conversation is reused.
- Each row sends a prompt, waits for a new ready image, opens preview, clicks save, moves the downloaded file, presses Esc, and continues.
- Default retries are `--retries 1 --retry-delay 8`.
- Default behavior is continue after failed rows. `--stop-on-error` switches to fail-fast.

## Image Detection

The generator records visible generated image candidates before sending a prompt. While waiting, it ignores previous visible images by comparing:

- Visual center
- Approximate area
- Quantized image signature

It checks both UIA `Image` controls and a screenshot fallback. A candidate must pass readiness checks:

- Channel variance
- Non-background density
- Local detail

This avoids clicking placeholders before image generation is complete.

## Failure Detection

During the wait loop, the script checks:

- New visible failure text: `服务过载`, `服务繁忙`, `生成失败`, `稍后再试`, `内容不符合`, `额度不足`, `操作频繁`, and related English errors
- No visible activity within `--no-response-timeout`
- No new ready image before `--generation-timeout`
- No download after clicking preview save

Result modes:

- `generation_failed`
- `no_response`
- `generation_timeout`
- `download_failed`
- `downloaded`

## Recommended Test Commands

Syntax:

```powershell
python scripts\desktop_generate.py --help
python -m py_compile scripts\desktop_generate.py
```

Single image:

```powershell
python scripts\desktop_generate.py "测试：一盏小台灯照亮蓝色书本，纯净背景" --output output\single_test.png --overwrite
```

Batch:

```powershell
python scripts\desktop_generate.py --batch prompts.csv --dir output\series --start-new-chat --overwrite --retries 1
```

Probe:

```powershell
python scripts\desktop_probe.py --launch --full
```

Check for leftover automation processes:

```powershell
Get-Process python -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,Path,StartTime
```

## Safety Notes

- Do not automate around captcha or human verification.
- Do not close or reset unrelated user windows.
- Do not kill Python processes unless they are confirmed to be leftover automation from this workflow.
- If the user reports the script clicked the wrong UI, stop, probe the window, inspect the latest screenshot, then adjust selectors or coordinates.
