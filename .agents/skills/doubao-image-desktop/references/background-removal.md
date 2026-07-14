# Background Removal Reference

Use this reference when understanding or debugging the rembg-based background removal workflow.

## How It Works

```
Input image (PNG/JPG)
    │
    ├── 1. Load as RGBA (Pillow)
    │
    ├── 2. rembg.remove()
    │      U²-Net deep learning model segments foreground from background
    │      Produces an RGBA image with transparent background
    │
    └── 3. Optional: composite onto solid color
           If --bg-color is specified, composite the RGBA result
           onto a solid-color background
```

## Model

| Property | Value |
|----------|-------|
| Model | U²-Net (u2net.onnx) |
| Size | ~168 MB |
| Location | `~/.u2net/u2net.onnx` |
| Framework | ONNX Runtime |
| First-run | Downloads from GitHub Releases |

## Performance

| Metric | Typical Value |
|--------|---------------|
| Model load time | ~3s (one-time per session) |
| Per-image processing | 2-8s (depending on resolution) |
| Memory usage | ~500MB during processing |
| Output format | PNG with alpha channel (RGBA) |

## Optional: Solid Color Background

Use `--bg-color` to replace transparency with a solid color:

```powershell
# White background
python desktop_remove_background.py character.png --bg-color FFFFFF

# Green screen
python desktop_remove_background.py character.png --bg-color 00FF00
```

## Known Limitations

1. **Complex backgrounds**: U²-Net works best when the subject is clearly separated from the background. Very similar foreground/background colors may cause edge artifacts.
2. **Hair/fur details**: Fine details like individual hair strands may be partially lost or include background artifacts.
3. **Transparent objects**: Glass, water, or other transparent objects may not be correctly segmented.
4. **File size**: Output PNG files may be larger than input due to alpha channel and re-encoding.

## Example

```powershell
# Process entire folder
python desktop_remove_background.py output/龙女素材/ --out output/抠图结果/

# Output:
#   抠图: dragon_girl_01.png
#     ✅ 已保存: dragon_girl_01.png (2510 KB)
#   抠图: dragon_girl_02.png
#     ✅ 已保存: dragon_girl_02.png (4584 KB)
#   ...

#   处理完成: 4/4 张图片已抠图
```

## Combining with Other Scripts

Typical workflow — generate → remove watermark → remove background:

```powershell
# 1. Generate
python desktop_generate.py --batch prompts.csv --dir output/batch --start-new-chat --overwrite

# 2. Remove watermarks
python desktop_remove_watermark.py output/batch/

# 3. Remove backgrounds
python desktop_remove_background.py output/batch/ --out output/抠图结果/
```