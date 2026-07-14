"""Remove backgrounds from images and output transparent PNGs.

Usage:
    python desktop_remove_background.py <image_or_dir> [--out <dir>] [--bg-color <hex>]

Examples:
    # Single image → outputs transparent PNG in same folder
    python desktop_remove_background.py character.png

    # Entire folder → transparent PNGs in output/bg_removed/
    python desktop_remove_background.py output/龙女素材/ --out output/抠图结果/

    # Replace background with solid white instead of transparency
    python desktop_remove_background.py character.png --bg-color FFFFFF
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def remove_background(input_path: Path, output_path: Path, bg_color: str | None = None) -> bool:
    """Remove background from an image using rembg.

    Args:
        input_path: Source image file.
        output_path: Destination (will be saved as PNG).
        bg_color: Optional hex color string (e.g. "FFFFFF") to replace
                  background with a solid color instead of transparency.

    Returns:
        True on success.
    """
    from rembg import remove
    from PIL import Image
    import numpy as np

    input_image = Image.open(input_path).convert("RGBA")
    output_data = remove(input_image)

    if bg_color:
        # Composite onto a solid-color background
        r, g, b = int(bg_color[0:2], 16), int(bg_color[2:4], 16), int(bg_color[4:6], 16)
        background = Image.new("RGBA", output_data.size, (r, g, b, 255))
        output_data = Image.alpha_composite(background, output_data)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_data.save(output_path, "PNG")
    return True


def main() -> int:
    if len(sys.argv) < 2:
        print("用法: python desktop_remove_background.py <图片文件或文件夹> [--out <输出目录>] [--bg-color <hex>]", file=sys.stderr)
        print("示例: python desktop_remove_background.py character.png", file=sys.stderr)
        print("示例: python desktop_remove_background.py output/龙女素材/ --out output/抠图结果/", file=sys.stderr)
        print("示例: python desktop_remove_background.py character.png --bg-color FFFFFF", file=sys.stderr)
        return 1

    target = Path(sys.argv[1])
    if not target.exists():
        print(f"路径不存在: {target}", file=sys.stderr)
        return 1

    # Parse optional args
    out_dir = None
    bg_color = None
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == "--out" and i + 1 < len(sys.argv):
            out_dir = Path(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == "--bg-color" and i + 1 < len(sys.argv):
            bg_color = sys.argv[i + 1].strip()
            i += 2
        else:
            i += 1

    if target.is_file():
        files = [target]
    else:
        files = sorted(
            p for p in target.rglob("*")
            if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES
        )
        # Exclude files that look like batch result CSVs
        files = [f for f in files if f.suffix.lower() != ".csv"]

    if not files:
        print("未找到图片文件。", file=sys.stderr)
        return 1

    processed = 0
    for path in files:
        if out_dir:
            output_path = out_dir / path.name
        else:
            output_path = path.with_suffix(".png")

        print(f"抠图: {path.name}", file=sys.stderr)
        try:
            remove_background(path, output_path, bg_color=bg_color)
            size_kb = output_path.stat().st_size / 1024
            print(f"  ✅ 已保存: {output_path.name} ({size_kb:.0f} KB)", file=sys.stderr)
            processed += 1
        except Exception as exc:
            print(f"  ❌ 失败: {exc}", file=sys.stderr)

    print(f"\n处理完成: {processed}/{len(files)} 张图片已抠图", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())