# Watermark Removal Reference

Use this reference when understanding or debugging the Doubao watermark removal workflow.

## Problem

Doubao appends a semi-transparent "豆包AI生成" watermark to the bottom-right area of every generated image. This script detects and erases it.

## How It Works

```
Input image
    │
    ├── 1. EasyOCR scan (bottom 40% only)
    │      Detect Chinese text regions containing "豆包AI生成"
    │      Returns pixel-precise bounding boxes
    │
    ├── 2. Build inpaint mask
    │      For each matching text region:
    │      - Offset to global coordinates (scan was on bottom 40% ROI)
    │      - Add 10px padding around each detection
    │      - Fill mask rectangle with white (255)
    │
    └── 3. OpenCV Telea inpainting
           cv2.inpaint(img, mask, inpaintRadius=15, INPAINT_TELEA)
           Replaces masked pixels with surrounding texture
```

## Detection Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Scan region | Bottom 40% of image | Watermarks always appear in the lower portion |
| OCR engine | EasyOCR `ch_sim` | Chinese simplified model |
| Keyword filter | `豆`, `包`, `AI`, `生成`, `Doubao` | Any match triggers removal |
| Padding | 10px | Margin added around each detection to ensure complete coverage |

## Inpainting Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Algorithm | `cv2.INPAINT_TELEA` | Alexandru Telea's fast marching method |
| Inpaint radius | 15px | Larger = more blending, smaller = sharper edges |
| Image format | Any OpenCV-supported | PNG, JPG, WEBP all supported |

## Performance

- **First run**: ~30s (EasyOCR model loading + first image detection)
- **Subsequent runs**: ~5-10s per image (reader is cached in memory)
- **Memory**: ~500MB for EasyOCR model in RAM
- **GPU**: CPU-only by default; GPU mode available but requires CUDA

## Known Limitations

1. **False negatives**: If the watermark text is extremely transparent or severely cropped, OCR may miss it
2. **False positives**: If the image contains natural text with keywords "豆", "包", etc. in the bottom 40%, it will be erased
3. **Image quality**: Inpainting may leave slight artifacts on complex textures directly behind the watermark area
4. **File size**: Inpainted images are re-encoded, which may result in slightly different file sizes than the original

## Example

```powershell
# Generate images first
python desktop_generate.py --batch prompts.csv --dir output/batch --start-new-chat --overwrite

# Then remove watermarks from the entire batch folder
python desktop_remove_watermark.py output/batch/

# Output:
#   检测: scene_01.png
#     ✅ 水印已移除: scene_01.png
#   检测: scene_02.png
#     ⏭ 未检测到水印: scene_02.png    (already clean)
#
#   处理完成: 1/2 张图片去除了水印
```

## Single Image Removal

```powershell
python desktop_remove_watermark.py output/single_cup.png
```

## Integration Tip

After batch generation, chaining the removal is a common pattern:

```powershell
# Generate batch
python desktop_generate.py --batch prompts.csv --dir output/batch --start-new-chat --overwrite

# Strip watermarks
python desktop_remove_watermark.py output/batch/
```

Both scripts print results to stderr, so piping stdout to a file for programmatic use continues to work.