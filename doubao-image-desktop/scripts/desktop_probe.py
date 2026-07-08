from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


import os

DOUBAO_EXE = Path(os.environ.get("LOCALAPPDATA", "")) / r"Doubao\Application\Doubao.exe"
DEBUG_DIR = ROOT / "debug"
WINDOW_LEFT_RATIO = 0.0
WINDOW_TOP_RATIO = 0.0
WINDOW_WIDTH_RATIO = 0.82
WINDOW_HEIGHT_RATIO = 0.92
MIN_WINDOW_WIDTH = 1200
MIN_WINDOW_HEIGHT = 850


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Probe the Doubao desktop app")
    parser.add_argument("--launch", action="store_true", help="Launch Doubao if no window is found")
    parser.add_argument("--full", action="store_true", help="Print full UIA control list")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    ensure_runtime_dirs()

    try:
        import win32con
        import win32gui
        import win32process
        from pywinauto import Desktop
    except ImportError as exc:
        print(f"Missing desktop automation dependency: {exc}")
        print("Run: python -m pip install -r requirements.txt")
        return 1

    hwnd = find_doubao_window(win32gui, win32process)
    if hwnd is None and args.launch:
        if not DOUBAO_EXE.exists():
            print(f"Doubao executable was not found: {DOUBAO_EXE}")
            return 1
        subprocess.Popen([str(DOUBAO_EXE)])
        hwnd = wait_for_doubao_window(win32gui, win32process, timeout_seconds=20)

    if hwnd is None:
        print("No Doubao desktop window was found.")
        return 2

    restore_window(win32gui, win32con, hwnd)

    app_window = Desktop(backend="uia").window(handle=hwnd)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    debug_dir = DEBUG_DIR / f"{timestamp}-desktop_probe"
    debug_dir.mkdir(parents=True, exist_ok=True)

    controls = collect_controls(app_window)
    screenshot_path = debug_dir / "window.png"
    try:
        app_window.capture_as_image().save(screenshot_path)
    except Exception as exc:
        screenshot_path = None
        screenshot_error = str(exc)
    else:
        screenshot_error = ""

    summary = {
        "hwnd": hwnd,
        "title": app_window.window_text(),
        "rect": rect_to_dict(app_window.rectangle()),
        "debug_dir": str(debug_dir),
        "screenshot": str(screenshot_path) if screenshot_path else "",
        "screenshot_error": screenshot_error,
        "control_count": len(controls),
        "interesting_controls": interesting_controls(controls),
    }
    if args.full:
        summary["controls"] = controls

    (debug_dir / "controls.json").write_text(
        json.dumps(controls, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (debug_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def ensure_runtime_dirs() -> None:
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)


def find_doubao_window(win32gui: Any, win32process: Any) -> int | None:
    matches: list[tuple[int, int]] = []

    def enum(hwnd: int, _: Any) -> None:
        if not win32gui.IsWindow(hwnd):
            return
        title = win32gui.GetWindowText(hwnd) or ""
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        try:
            import psutil

            proc = psutil.Process(pid)
            name = proc.name()
            path = proc.exe()
        except Exception:
            name = ""
            path = ""
        if name.lower() != "doubao.exe" and "doubao\\app\\doubao.exe" not in path.lower():
            return
        if "edge" in path.lower() or name.lower() == "msedge.exe":
            return
        if "doubao" in name.lower() or "doubao\\app\\doubao.exe" in path.lower():
            visible_score = 1 if win32gui.IsWindowVisible(hwnd) else 0
            title_score = 1 if title else 0
            offscreen_penalty = 0
            try:
                left, top, right, bottom = win32gui.GetWindowRect(hwnd)
                if left < -1000 or top < -1000 or right <= 0 or bottom <= 0:
                    offscreen_penalty = -1
            except Exception:
                pass
            matches.append((visible_score + title_score + offscreen_penalty, hwnd))

    win32gui.EnumWindows(enum, None)
    if not matches:
        return None
    return sorted(matches, reverse=True)[0][1]


def wait_for_doubao_window(win32gui: Any, win32process: Any, timeout_seconds: int) -> int | None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        hwnd = find_doubao_window(win32gui, win32process)
        if hwnd is not None:
            return hwnd
        time.sleep(0.5)
    return None


def restore_window(win32gui: Any, win32con: Any, hwnd: int) -> None:
    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    left, top, width, height = target_window_bounds()
    try:
        win32gui.SetWindowPos(
            hwnd,
            win32con.HWND_TOP,
            left,
            top,
            width,
            height,
            win32con.SWP_SHOWWINDOW,
        )
    except Exception:
        pass
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        pass


def target_window_bounds() -> tuple[int, int, int, int]:
    try:
        import win32api

        monitor = win32api.MonitorFromPoint((0, 0))
        work_left, work_top, work_right, work_bottom = win32api.GetMonitorInfo(monitor)["Work"]
    except Exception:
        work_left, work_top, work_right, work_bottom = 0, 0, 1600, 1000

    work_width = max(800, int(work_right - work_left))
    work_height = max(600, int(work_bottom - work_top))
    left = work_left + int(work_width * WINDOW_LEFT_RATIO)
    top = work_top + int(work_height * WINDOW_TOP_RATIO)
    width = min(work_width - (left - work_left), max(MIN_WINDOW_WIDTH, int(work_width * WINDOW_WIDTH_RATIO)))
    height = min(work_height - (top - work_top), max(MIN_WINDOW_HEIGHT, int(work_height * WINDOW_HEIGHT_RATIO)))
    return int(left), int(top), int(width), int(height)


def collect_controls(window: Any) -> list[dict[str, Any]]:
    controls: list[dict[str, Any]] = []
    for index, control in enumerate(window.descendants()):
        try:
            rect = control.rectangle()
        except Exception:
            rect = None
        try:
            name = control.window_text()
        except Exception:
            name = ""
        try:
            control_type = control.element_info.control_type
        except Exception:
            control_type = ""
        try:
            automation_id = control.element_info.automation_id
        except Exception:
            automation_id = ""
        try:
            class_name = control.class_name()
        except Exception:
            class_name = ""

        controls.append(
            {
                "index": index,
                "name": name[:200],
                "control_type": control_type,
                "automation_id": automation_id,
                "class_name": class_name,
                "rect": rect_to_dict(rect) if rect else None,
            }
        )
    return controls


def interesting_controls(controls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    keywords = [
        "图像",
        "图片",
        "创作",
        "生成",
        "发送",
        "下载",
        "保存",
        "登录",
        "输入",
        "描述",
        "提示",
    ]
    interesting = []
    for control in controls:
        blob = " ".join(
            [
                str(control.get("name") or ""),
                str(control.get("control_type") or ""),
                str(control.get("automation_id") or ""),
                str(control.get("class_name") or ""),
            ]
        )
        if any(keyword in blob for keyword in keywords) or control.get("control_type") in {
            "Edit",
            "Document",
            "Button",
        }:
            interesting.append(control)
    return interesting[:80]


def rect_to_dict(rect: Any) -> dict[str, int]:
    return {
        "left": int(rect.left),
        "top": int(rect.top),
        "right": int(rect.right),
        "bottom": int(rect.bottom),
        "width": int(rect.width()),
        "height": int(rect.height()),
    }


if __name__ == "__main__":
    raise SystemExit(main())
