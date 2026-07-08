"""Remove Doubao AI watermarks from downloaded images.

Usage:
    python desktop_remove_watermark.py <image_or_dir>
    python desktop_remove_watermark.py image.png
    python desktop_remove_watermark.py output/series/
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import easyocr
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}

_READER = None


def _get_reader():
    global _READER
    if _READER is None:
        _READER = easyocr.Reader(["ch_sim"], gpu=False, verbose=False)
    return _READER


def remove_watermark(image_path: Path) -> bool:
    """Scan image for Doubao watermark text and inpaint it.
    Returns True if watermark was detected and removed."""
    img = cv2.imread(str(image_path))
    if img is None:
        print(f"  ⚠ 无法读取: {image_path.name}", file=sys.stderr)
        return False
    h, w = img.shape[:2]

    reader = _get_reader()
    roi = img[int(h * 0.60):, :]
    results = reader.readtext(roi, detail=1, paragraph=False)

    mask = np.zeros((h, w), dtype=np.uint8)
    offset_y = int(h * 0.60)
    pad = 10

    for bbox, text, _conf in results:
        if not any(kw in text for kw in ("豆", "包", "AI", "生成", "Doubao")):
            continue
        xs = [int(p[0]) for p in bbox]
        ys = [int(p[1]) + offset_y for p in bbox]
        x1, x2 = max(0, min(xs) - pad), min(w - 1, max(xs) + pad)
        y1, y2 = max(0, min(ys) - pad), min(h - 1, max(ys) + pad)
        mask[y1:y2, x1:x2] = 255

    if cv2.countNonZero(mask) == 0:
        return False

    inpainted = cv2.inpaint(img, mask, inpaintRadius=15, flags=cv2.INPAINT_TELEA)
    cv2.imwrite(str(image_path), inpainted)
    return True


def main() -> int:
    if len(sys.argv) < 2:
        print("用法: python desktop_remove_watermark.py <图片文件或文件夹>", file=sys.stderr)
        print("示例: python desktop_remove_watermark.py output/cup.png", file=sys.stderr)
        print("示例: python desktop_remove_watermark.py output/batch_v2/", file=sys.stderr)
        return 1

    target = Path(sys.argv[1])
    if not target.exists():
        print(f"路径不存在: {target}", file=sys.stderr)
        return 1

    if target.is_file():
        files = [target]
    else:
        files = sorted(
            p for p in target.rglob("*")
            if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES
        )

    if not files:
        print("未找到图片文件。", file=sys.stderr)
        return 1

    removed = 0
    for path in files:
        print(f"检测: {path.name}", file=sys.stderr)
        if remove_watermark(path):
            print(f"  ✅ 水印已移除: {path.name}", file=sys.stderr)
            removed += 1
        else:
            print(f"  ⏭ 未检测到水印: {path.name}", file=sys.stderr)

    print(f"\n处理完成: {removed}/{len(files)} 张图片去除了水印", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())