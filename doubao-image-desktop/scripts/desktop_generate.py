from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pywinauto import Desktop, keyboard


DOUBAO_EXE = Path(os.environ.get("LOCALAPPDATA", "")) / r"Doubao\Application\Doubao.exe"
DOWNLOADS_DIR = Path.home() / "Downloads"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
GENERATION_TIMEOUT_SECONDS = 90
GENERATION_MIN_WAIT_SECONDS = 5
NO_RESPONSE_TIMEOUT_SECONDS = 45
DOWNLOAD_TIMEOUT_SECONDS = 90
DEFAULT_BATCH_RETRIES = 1
DEFAULT_RETRY_DELAY_SECONDS = 8
DOUBAO_RELAUNCH_WAIT_SECONDS = 25
WINDOW_LEFT_RATIO = 0.0
WINDOW_TOP_RATIO = 0.0
WINDOW_WIDTH_RATIO = 0.82
WINDOW_HEIGHT_RATIO = 0.92
MIN_WINDOW_WIDTH = 1200
MIN_WINDOW_HEIGHT = 850
SINGLE_IMAGE_DIRECTIVE = (
    "请严格只生成一张（1张）图片。"
    "不要生成多张、4张、四宫格、组图、拼图、对比图或多个版本。"
)
BATCH_CONTINUITY_DIRECTIVE = (
    "请与本对话中已经确立的统一视觉风格保持一致，"
    "包括色彩、光影、构图语言、材质处理、镜头感和细节质量。"
)
FAILURE_KEYWORDS = [
    "服务过载",
    "服务繁忙",
    "请求过载",
    "当前人数较多",
    "系统繁忙",
    "稍后再试",
    "请稍后",
    "生成失败",
    "图片生成失败",
    "创作失败",
    "出错了",
    "网络错误",
    "请求失败",
    "无法生成",
    "内容不符合",
    "不支持生成",
    "安全规范",
    "违规",
    "敏感",
    "已达上限",
    "额度不足",
    "操作频繁",
    "too many requests",
    "overloaded",
    "busy",
    "try again",
    "failed",
    "error",
]


def _switch_back_to_console() -> None:
    """Bring focus back to a terminal window after automation completes."""
    try:
        import ctypes
        import win32con
        import win32gui

        proc = ctypes.WINFUNCTYPE(
            ctypes.c_bool, ctypes.c_int, ctypes.c_int
        )
        handles: list[int] = []

        def enum_fn(hwnd: int, _: object) -> bool:
            handles.append(hwnd)
            return True

        enum_cb = proc(enum_fn)
        ctypes.windll.user32.EnumWindows(enum_cb, 0)

        candidates = []
        for handle in handles:
            if not win32gui.IsWindowVisible(handle):
                continue
            title = (win32gui.GetWindowText(handle) or "").strip()
            rect = win32gui.GetWindowRect(handle)
            visible = rect[2] > 0 and rect[3] > 0
            if not visible:
                continue
            is_zcode = "zcode" in title.lower()
            is_term = any(
                kw in title
                for kw in ("终端", "Terminal", "cmd", "PowerShell", "命令提示符", "Windows PowerShell")
            )
            if not is_zcode and not is_term:
                continue
            score = (100 if is_zcode else 0) + (50 if is_term else 0) + (10 if visible else 0)
            candidates.append((score, handle))

        if not candidates:
            return
        best = sorted(candidates, key=lambda item: item[0], reverse=True)[0][1]
        try:
            win32gui.ShowWindow(best, win32con.SW_RESTORE)
            win32gui.SetForegroundWindow(best)
        except Exception:
            pass
    except Exception:
        pass


def _prompt_user(message: str, result: dict | None = None) -> None:
    """Print a user-facing completion message to stderr (JSON goes to stdout)."""
    if result:
        status = "✅ 成功" if result.get("success") else "❌ 失败"
        mode = result.get("mode", "")
        path = result.get("download_path", "")
        if path:
            desc = f"  状态：{status}  |  模式：{mode}  |  路径：{path}"
        else:
            desc = f"  状态：{status}  |  模式：{mode}"
        if not result.get("success") and result.get("error"):
            desc += f"\n  错误：{result.get('error')}"
    else:
        desc = message
    print(f"\n{'='*60}\n  📷 豆包桌面生图 — {message}\n{desc}\n{'='*60}\n", file=sys.stderr)


@dataclass(frozen=True)
class ImageCandidate:
    center: tuple[int, int]
    rect: tuple[int, int, int, int]
    signature: tuple[int, ...]
    area: int


class DoubaoAutomationError(RuntimeError):
    def __init__(self, message: str, kind: str) -> None:
        super().__init__(message)
        self.kind = kind


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Paste an image prompt into Doubao desktop")
    parser.add_argument(
        "prompt",
        nargs="?",
        help="Prompt to paste into Doubao; the script will explicitly request one image",
    )
    parser.add_argument("--send", action="store_true", help="Press Enter after filling the prompt")
    parser.add_argument("--send-only", action="store_true", help="Only press Enter in the prompt box")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Download the generated image and save it to this path; implies --send",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite --output if it already exists",
    )
    parser.add_argument(
        "--batch",
        type=Path,
        help="CSV file with name,prompt columns; generates each row in the current chat",
    )
    parser.add_argument(
        "--dir",
        type=Path,
        default=Path("output"),
        help="Output directory for --batch files",
    )
    parser.add_argument(
        "--style",
        help="Extra style anchor prepended to each --batch prompt",
    )
    parser.add_argument(
        "--start-new-chat",
        action="store_true",
        help="For --batch, start a new chat before the first row",
    )
    parser.add_argument(
        "--reuse-current",
        action="store_true",
        help="Do not switch to the left sidebar New Chat before filling",
    )
    parser.add_argument(
        "--generation-timeout",
        type=int,
        default=GENERATION_TIMEOUT_SECONDS,
        help="Seconds to wait for a generated image before marking the row failed",
    )
    parser.add_argument(
        "--no-response-timeout",
        type=int,
        default=NO_RESPONSE_TIMEOUT_SECONDS,
        help="Seconds to wait for any visible Doubao response before marking no_response",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=DEFAULT_BATCH_RETRIES,
        help="Retries per row in --batch mode after a generation/no-response/download failure",
    )
    parser.add_argument(
        "--retry-delay",
        type=int,
        default=DEFAULT_RETRY_DELAY_SECONDS,
        help="Seconds to wait between retries in --batch mode",
    )
    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop --batch at the first failed row instead of recording and continuing",
    )
    parser.add_argument(
        "--keep-running-app",
        action="store_true",
        help="Attach to the current Doubao process instead of closing and relaunching it first",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.batch is not None:
        if args.prompt:
            print(json.dumps({"success": False, "error": "Do not provide a positional prompt with --batch."}, ensure_ascii=False))
            _switch_back_to_console()
            _prompt_user("参数错误：同时提供了 prompt 和 --batch")
            return 1
        return run_batch(args)

    if not args.send_only and not args.prompt:
        print(json.dumps({"success": False, "error": "Provide a prompt, or use --send-only."}, ensure_ascii=False))
        _switch_back_to_console()
        _prompt_user("参数错误：未提供 prompt")
        return 1

    hwnd, window = prepare_doubao_window(reopen_app=not args.keep_running_app)
    result = run_prompt(
        window,
        prompt=args.prompt or "",
        output=args.output,
        overwrite=args.overwrite,
        start_new_chat=not args.send_only and not args.reuse_current,
        send=args.send or args.send_only or args.output is not None,
        send_only=args.send_only,
        close_after_download=False,
        generation_timeout=args.generation_timeout,
        no_response_timeout=args.no_response_timeout,
    )
    result["hwnd"] = hwnd
    result["reopened_app"] = not args.keep_running_app
    print(json.dumps(result, ensure_ascii=False, indent=2))
    _switch_back_to_console()
    _prompt_user("单张生图任务完成", result)
    return 0 if result.get("success") else 1


def prepare_doubao_window(reopen_app: bool = True) -> tuple[int, Any]:
    import subprocess
    import win32con
    import win32gui
    import win32process

    if reopen_app:
        hwnd = relaunch_doubao_app(subprocess, win32gui, win32con, win32process)
    else:
        hwnd = find_doubao_window(win32gui, win32process)
    if hwnd is None:
        subprocess.Popen([str(DOUBAO_EXE)])
        hwnd = wait_for_doubao_window(
            win32gui,
            win32process,
            timeout_seconds=DOUBAO_RELAUNCH_WAIT_SECONDS,
        )
    if hwnd is None:
        raise RuntimeError("Doubao desktop window was not found.")

    restore_window(win32gui, win32con, hwnd)
    window = Desktop(backend="uia").window(handle=hwnd)
    time.sleep(2)
    return hwnd, window


def relaunch_doubao_app(
    subprocess_module: Any,
    win32gui: Any,
    win32con: Any,
    win32process: Any,
) -> int | None:
    close_existing_doubao_windows(win32gui, win32con, win32process)
    time.sleep(1.5)
    terminate_existing_doubao_processes()
    if not DOUBAO_EXE.exists():
        raise RuntimeError(f"Doubao executable was not found: {DOUBAO_EXE}")
    subprocess_module.Popen([str(DOUBAO_EXE)])
    return wait_for_doubao_window(
        win32gui,
        win32process,
        timeout_seconds=DOUBAO_RELAUNCH_WAIT_SECONDS,
    )


def close_existing_doubao_windows(win32gui: Any, win32con: Any, win32process: Any) -> int:
    closed = 0

    def enum(hwnd: int, _: Any) -> None:
        nonlocal closed
        if not win32gui.IsWindow(hwnd):
            return
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        if not process_id_is_doubao(pid):
            return
        try:
            win32gui.PostMessage(hwnd, win32con.WM_CLOSE, 0, 0)
            closed += 1
        except Exception:
            pass

    win32gui.EnumWindows(enum, None)
    return closed


def terminate_existing_doubao_processes() -> None:
    try:
        import psutil
    except ImportError:
        return

    current_pid = os.getpid()
    processes = []
    for proc in psutil.process_iter(["pid", "name", "exe"]):
        try:
            if proc.pid == current_pid:
                continue
            if not process_info_is_doubao(proc.info.get("name") or "", proc.info.get("exe") or ""):
                continue
            proc.terminate()
            processes.append(proc)
        except Exception:
            continue

    if not processes:
        return

    _, alive = psutil.wait_procs(processes, timeout=5)
    for proc in alive:
        try:
            proc.kill()
        except Exception:
            pass


def process_id_is_doubao(pid: int) -> bool:
    try:
        import psutil

        proc = psutil.Process(pid)
        return process_info_is_doubao(proc.name(), proc.exe())
    except Exception:
        return False


def process_info_is_doubao(name: str, path: str) -> bool:
    name_lower = name.lower()
    path_lower = path.lower()
    return (
        name_lower == "doubao.exe"
        or path_lower.endswith(r"\doubao\doubao.exe")
        or path_lower.endswith(r"\doubao\app\doubao.exe")
    )


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
        path_lower = path.lower()
        name_lower = name.lower()
        if name_lower != "doubao.exe" and "doubao\\app\\doubao.exe" not in path_lower:
            return
        if "edge" in path_lower or name_lower == "msedge.exe":
            return
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


def run_prompt(
    window: Any,
    prompt: str,
    output: Path | None,
    overwrite: bool,
    start_new_chat: bool,
    send: bool,
    send_only: bool = False,
    close_after_download: bool = False,
    generation_timeout: int = GENERATION_TIMEOUT_SECONDS,
    no_response_timeout: int = NO_RESPONSE_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    clicked_new_chat = False
    if start_new_chat:
        dismiss_preview_or_dialog(window)
        clicked_new_chat = switch_to_sidebar_new_chat(window)
        time.sleep(3)

    edit = find_prompt_edit(window)
    final_prompt = build_single_image_prompt(prompt) if not send_only else ""

    if not send_only:
        if edit is not None:
            paste_text(edit, final_prompt)
        else:
            paste_text_by_coordinates(window, final_prompt)
            edit = find_prompt_edit(window)

    baseline_images = find_visible_generated_image_candidates(window)
    baseline_failure_counts = collect_failure_text_counts(window)
    baseline_text_counts = collect_visible_text_counts(window)
    baseline_activity_signature = capture_activity_signature(window)
    if send:
        press_enter_to_send(window, edit)
        mode = "sent"
    else:
        mode = "filled_only"

    output_path = None
    if output is not None and not send_only:
        try:
            time.sleep(GENERATION_MIN_WAIT_SECONDS)
            image_center = wait_for_generated_image_center(
                window,
                timeout_seconds=generation_timeout,
                previous_candidates=baseline_images,
                baseline_failure_counts=baseline_failure_counts,
                baseline_text_counts=baseline_text_counts,
                baseline_activity_signature=baseline_activity_signature,
                no_response_timeout=no_response_timeout,
            )
            open_image_preview(window, image_center)
            output_path = save_preview_image_to(window, output, overwrite=overwrite)
            if close_after_download:
                close_preview(window)
            mode = "downloaded"
        except DoubaoAutomationError as exc:
            return {
                "success": False,
                "mode": exc.kind,
                "error_type": exc.kind,
                "error": str(exc),
                "original_prompt_length": len(prompt),
                "final_prompt_length": len(final_prompt),
                "single_image_enforced": not send_only,
                "clicked_new_chat": clicked_new_chat,
                "download_path": "",
            }
        except Exception as exc:
            return {
                "success": False,
                "mode": "download_failed",
                "error_type": "download_failed",
                "error": str(exc),
                "original_prompt_length": len(prompt),
                "final_prompt_length": len(final_prompt),
                "single_image_enforced": not send_only,
                "clicked_new_chat": clicked_new_chat,
                "download_path": "",
            }

    return {
                "success": True,
                "mode": mode,
                "original_prompt_length": len(prompt),
                "final_prompt_length": len(final_prompt),
                "single_image_enforced": not send_only,
                "clicked_new_chat": clicked_new_chat,
                "error_type": "",
                "error": "",
                "download_path": str(output_path) if output_path else "",
    }


def run_batch(args: argparse.Namespace) -> int:
    try:
        rows = load_batch_rows(args.batch)
        output_dir = normalize_directory(args.dir)
        output_dir.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        _switch_back_to_console()
        _prompt_user("批量生图失败：CSV 加载错误", {"success": False, "error": str(exc), "mode": "csv_error"})
        return 1

    try:
        hwnd, window = prepare_doubao_window(reopen_app=not args.keep_running_app)
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        _switch_back_to_console()
        _prompt_user("批量生图失败：窗口准备错误", {"success": False, "error": str(exc), "mode": "window_error"})
        return 1

    started_new_chat = False
    if args.start_new_chat:
        dismiss_preview_or_dialog(window)
        started_new_chat = switch_to_sidebar_new_chat(window)
        time.sleep(3)
    else:
        dismiss_preview_or_dialog(window)

    results = []
    for index, row in enumerate(rows, start=1):
        is_first = (index == 1)
        prompt = build_batch_prompt(row["prompt"], style=args.style, is_first=is_first)
        output_path = output_dir / row["name"]
        result = run_prompt_with_retries(
            window,
            prompt=prompt,
            output=output_path,
            overwrite=args.overwrite,
            retries=max(0, args.retries),
            retry_delay=max(0, args.retry_delay),
            generation_timeout=args.generation_timeout,
            no_response_timeout=args.no_response_timeout,
        )
        result.update(
            {
                "index": index,
                "name": row["name"],
                "prompt": row["prompt"],
                "started_new_chat": started_new_chat,
            }
        )
        results.append(result)
        if not result.get("success") and args.stop_on_error:
            break
        time.sleep(1.5)

    result_csv = output_dir / "batch_result.csv"
    write_batch_results(result_csv, results)
    success = all(item.get("success") for item in results) and len(results) == len(rows)
    print(
        json.dumps(
            {
                "success": success,
                "hwnd": hwnd,
                "total": len(rows),
                "completed": sum(1 for item in results if item.get("success")),
                "started_new_chat": started_new_chat,
                "reopened_app": not args.keep_running_app,
                "result_csv": str(result_csv),
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    _switch_back_to_console()
    summary = {"success": success}
    if not success:
        success_count = sum(1 for r in results if r.get("success"))
        summary["error"] = f"成功 {success_count}/{len(rows)} 行"
    _prompt_user(f"批量生图任务完成 ({sum(1 for r in results if r.get('success'))}/{len(rows)})", summary)
    return 0 if success else 1


def run_prompt_with_retries(
    window: Any,
    prompt: str,
    output: Path,
    overwrite: bool,
    retries: int,
    retry_delay: int,
    generation_timeout: int,
    no_response_timeout: int,
) -> dict[str, Any]:
    attempt_errors: list[dict[str, Any]] = []
    max_attempts = retries + 1
    last_result: dict[str, Any] | None = None

    for attempt in range(1, max_attempts + 1):
        result = run_prompt(
            window,
            prompt=prompt,
            output=output,
            overwrite=overwrite,
            start_new_chat=False,
            send=True,
            send_only=False,
            close_after_download=True,
            generation_timeout=generation_timeout,
            no_response_timeout=no_response_timeout,
        )
        result["attempt"] = attempt
        result["attempts"] = attempt
        if result.get("success"):
            if attempt_errors:
                result["attempt_errors"] = json.dumps(attempt_errors, ensure_ascii=False)
            return result

        last_result = result
        attempt_errors.append(
            {
                "attempt": attempt,
                "mode": result.get("mode", ""),
                "error_type": result.get("error_type", ""),
                "error": result.get("error", ""),
            }
        )
        dismiss_preview_or_dialog(window)

        if attempt < max_attempts and retry_delay > 0:
            time.sleep(retry_delay)

    if last_result is None:
        last_result = {
            "success": False,
            "mode": "not_attempted",
            "error_type": "not_attempted",
            "error": "No generation attempt was made.",
            "download_path": "",
        }
    last_result["attempts"] = max_attempts
    last_result["attempt_errors"] = json.dumps(attempt_errors, ensure_ascii=False)
    return last_result


def load_batch_rows(path: Path) -> list[dict[str, str]]:
    path = normalize_input_path(path)
    if not path.exists():
        raise FileNotFoundError(f"Batch CSV was not found: {path}")

    rows: list[dict[str, str]] = []
    with path.open("r", newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        fieldnames = set(reader.fieldnames or [])
        missing = {"name", "prompt"} - fieldnames
        if missing:
            missing_list = ", ".join(sorted(missing))
            raise ValueError(f"Batch CSV is missing required column(s): {missing_list}")

        for row_number, row in enumerate(reader, start=2):
            raw_name = (row.get("name") or "").strip()
            prompt = (row.get("prompt") or "").strip()
            if not raw_name and not prompt:
                continue
            if not prompt:
                raise ValueError(f"Batch CSV row {row_number} has an empty prompt.")
            name = sanitize_batch_name(raw_name or f"image_{len(rows) + 1:03d}.png")
            rows.append({"name": name, "prompt": prompt})

    if not rows:
        raise ValueError(f"Batch CSV has no usable rows: {path}")
    return rows


def normalize_input_path(path: Path) -> Path:
    path = path.expanduser()
    if not path.is_absolute():
        path = ROOT / path
    return path


def normalize_directory(path: Path) -> Path:
    path = path.expanduser()
    if not path.is_absolute():
        path = ROOT / path
    return path


def sanitize_batch_name(name: str) -> str:
    path = Path(name.strip())
    if path.is_absolute() or any(part == ".." for part in path.parts):
        raise ValueError(f"Batch output name must be relative and stay inside --dir: {name}")

    parts = [sanitize_filename_part(part) for part in path.parts if part not in {"", "."}]
    if not parts:
        raise ValueError("Batch output name cannot be empty.")
    return str(Path(*parts))


def sanitize_filename_part(part: str) -> str:
    cleaned = "".join("_" if char in '<>:"|?*' else char for char in part).strip()
    cleaned = cleaned.rstrip(". ")
    if not cleaned:
        raise ValueError("Batch output name contains an empty path segment.")
    return cleaned


def build_batch_prompt(prompt: str, style: str | None = None, is_first: bool = True) -> str:
    parts = []
    style = (style or "").strip()
    if style:
        parts.append(f"本批次统一风格：{style}")
    if is_first:
        parts.append(f"本张画面：{prompt.strip()}")
    else:
        parts.extend(
            [
                "请把这张图作为同一系列中的一张来生成。",
                BATCH_CONTINUITY_DIRECTIVE,
                f"本张画面：{prompt.strip()}",
            ]
        )
    return "\n".join(parts)


def write_batch_results(path: Path, results: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "index",
        "name",
        "success",
        "mode",
        "download_path",
        "error_type",
        "error",
        "attempt",
        "attempts",
        "attempt_errors",
        "clicked_new_chat",
        "started_new_chat",
        "single_image_enforced",
        "original_prompt_length",
        "final_prompt_length",
        "prompt",
    ]
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for result in results:
            writer.writerow({field: result.get(field, "") for field in fieldnames})


def dismiss_preview_or_dialog(window: Any) -> None:
    window.set_focus()
    keyboard.send_keys("{ESC}")
    time.sleep(0.4)


def close_preview(window: Any) -> None:
    window.set_focus()
    keyboard.send_keys("{ESC}")
    time.sleep(0.8)


def build_single_image_prompt(prompt: str) -> str:
    prompt = prompt.strip()
    if not prompt:
        return SINGLE_IMAGE_DIRECTIVE
    return f"{SINGLE_IMAGE_DIRECTIVE}\n\n作图提示词：{prompt}"


def wait_for_generated_image_center(
    window: Any,
    timeout_seconds: int,
    previous_candidates: list[ImageCandidate] | None = None,
    previous_centers: list[tuple[int, int]] | None = None,
    baseline_failure_counts: dict[str, int] | None = None,
    baseline_text_counts: dict[str, int] | None = None,
    baseline_activity_signature: tuple[int, ...] = (),
    no_response_timeout: int = NO_RESPONSE_TIMEOUT_SECONDS,
) -> tuple[int, int]:
    previous_candidates = previous_candidates or []
    baseline_failure_counts = baseline_failure_counts or {}
    baseline_text_counts = baseline_text_counts or {}
    if previous_centers:
        previous_candidates = [
            *previous_candidates,
            *[
                ImageCandidate(center=center, rect=(0, 0, 0, 0), signature=(), area=0)
                for center in previous_centers
            ],
        ]

    started_at = time.monotonic()
    deadline = started_at + timeout_seconds
    activity_seen = False
    stable_candidate: ImageCandidate | None = None
    stable_count = 0
    while time.monotonic() < deadline:
        failure_text = find_new_failure_text(window, baseline_failure_counts)
        if failure_text:
            raise DoubaoAutomationError(
                f"Doubao reported generation failure: {failure_text}",
                "generation_failed",
            )

        candidates = find_visible_generated_image_candidates(window)
        new_candidates = [
            candidate
            for candidate in candidates
            if not candidate_matches_any(candidate, previous_candidates)
        ]
        if not previous_candidates:
            new_candidates = candidates

        if new_candidates:
            activity_seen = True
        elif not activity_seen and visible_activity_changed(
            window,
            baseline_text_counts,
            baseline_activity_signature,
        ):
            activity_seen = True

        candidate = select_newest_visible_candidate(new_candidates)
        if candidate is not None:
            if stable_candidate and candidates_are_same_visible_image(stable_candidate, candidate):
                stable_count += 1
            else:
                stable_candidate = candidate
                stable_count = 1
            if stable_count >= 2:
                return candidate.center
        else:
            stable_candidate = None
            stable_count = 0
        if (
            no_response_timeout > 0
            and not activity_seen
            and time.monotonic() - started_at >= no_response_timeout
        ):
            raise DoubaoAutomationError(
                f"No visible Doubao response after {no_response_timeout} seconds.",
                "no_response",
            )
        time.sleep(1)
    raise DoubaoAutomationError("Timed out waiting for a generated image.", "generation_timeout")


def select_newest_visible_candidate(candidates: list[ImageCandidate]) -> ImageCandidate | None:
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: (item.center[1], item.area), reverse=True)[0]


def find_new_failure_text(window: Any, baseline_counts: dict[str, int]) -> str:
    current_counts = collect_failure_text_counts(window)
    for text, count in current_counts.items():
        if count > baseline_counts.get(text, 0):
            return summarize_text(text)
    return ""


def collect_failure_text_counts(window: Any) -> dict[str, int]:
    counts: dict[str, int] = {}
    for text, count in collect_visible_text_counts(window).items():
        if text_has_failure_keyword(text):
            counts[text] = count
    return counts


def text_has_failure_keyword(text: str) -> bool:
    lowered = text.lower()
    return any(keyword.lower() in lowered for keyword in FAILURE_KEYWORDS)


def collect_visible_text_counts(window: Any) -> dict[str, int]:
    counts: dict[str, int] = {}
    for text in collect_visible_texts(window):
        counts[text] = counts.get(text, 0) + 1
    return counts


def collect_visible_texts(window: Any) -> list[str]:
    texts: list[str] = []
    try:
        controls = window.descendants()
    except Exception:
        return texts

    for control in controls:
        try:
            rect = control.rectangle()
            text = normalize_text(control.window_text())
        except Exception:
            continue
        if not text or not rect_is_visible(rect):
            continue
        texts.append(text)
    return texts


def normalize_text(text: str) -> str:
    return " ".join(text.split())


def summarize_text(text: str, max_length: int = 180) -> str:
    text = normalize_text(text)
    if len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."


def visible_activity_changed(
    window: Any,
    baseline_text_counts: dict[str, int],
    baseline_activity_signature: tuple[int, ...],
) -> bool:
    current_text_counts = collect_visible_text_counts(window)
    for text, count in current_text_counts.items():
        if count > baseline_text_counts.get(text, 0):
            return True

    current_signature = capture_activity_signature(window)
    return visual_signatures_are_different(baseline_activity_signature, current_signature)


def capture_activity_signature(window: Any) -> tuple[int, ...]:
    try:
        import numpy as np
    except ImportError:
        return ()

    try:
        image = window.capture_as_image().convert("L")
    except Exception:
        return ()

    pixels = np.array(image)
    height, width = pixels.shape[:2]
    x0 = min(420, width)
    y0 = min(110, height)
    x1 = max(x0, width - 80)
    y1 = max(y0, height - 190)
    if x1 <= x0 or y1 <= y0:
        return ()

    crop = pixels[y0:y1, x0:x1]
    if crop.size == 0:
        return ()

    grid_size = 12
    y_edges = np.linspace(0, crop.shape[0], grid_size + 1).astype(int)
    x_edges = np.linspace(0, crop.shape[1], grid_size + 1).astype(int)
    values: list[int] = []
    for y_index in range(grid_size):
        for x_index in range(grid_size):
            block = crop[
                y_edges[y_index] : y_edges[y_index + 1],
                x_edges[x_index] : x_edges[x_index + 1],
            ]
            if block.size:
                values.append(int(block.mean() // 8))
    return tuple(values)


def visual_signatures_are_different(first: tuple[int, ...], second: tuple[int, ...]) -> bool:
    if not first or not second or len(first) != len(second):
        return False
    average_distance = sum(abs(a - b) for a, b in zip(first, second)) / len(first)
    return average_distance >= 1.2


def candidates_are_same_visible_image(first: ImageCandidate, second: ImageCandidate) -> bool:
    return points_are_close(first.center, second.center) and image_signatures_are_similar(
        first.signature,
        second.signature,
    )


def candidate_matches_any(candidate: ImageCandidate, previous: list[ImageCandidate]) -> bool:
    for old_candidate in previous:
        if old_candidate.signature and image_signatures_are_similar(
            candidate.signature,
            old_candidate.signature,
        ):
            x_distance = abs(candidate.center[0] - old_candidate.center[0])
            area_ratio = area_ratio_between(candidate.area, old_candidate.area)
            if x_distance <= 180 and 0.45 <= area_ratio <= 2.25:
                return True
        if not old_candidate.signature and points_are_close(
            candidate.center,
            old_candidate.center,
            tolerance=48,
        ):
            return True
    return False


def area_ratio_between(first: int, second: int) -> float:
    if first <= 0 or second <= 0:
        return 0
    return first / second


def center_matches_any(
    center: tuple[int, int],
    previous_centers: list[tuple[int, int]],
    tolerance: int = 48,
) -> bool:
    return any(points_are_close(center, previous, tolerance=tolerance) for previous in previous_centers)


def points_are_close(
    first: tuple[int, int],
    second: tuple[int, int],
    tolerance: int = 24,
) -> bool:
    return abs(first[0] - second[0]) <= tolerance and abs(first[1] - second[1]) <= tolerance


def image_signatures_are_similar(first: tuple[int, ...], second: tuple[int, ...]) -> bool:
    if not first or not second or len(first) != len(second):
        return False
    average_distance = sum(abs(a - b) for a, b in zip(first, second)) / len(first)
    return average_distance <= 1.0


def find_generated_image_center(window: Any) -> tuple[int, int] | None:
    candidates = find_visible_generated_image_candidates(window)
    if not candidates:
        return None
    return candidates[0].center


def find_visible_generated_image_centers(window: Any) -> list[tuple[int, int]]:
    return [candidate.center for candidate in find_visible_generated_image_candidates(window)]


def find_visible_generated_image_candidates(window: Any) -> list[ImageCandidate]:
    candidates = find_generated_image_candidates_from_controls(window)
    if not candidates:
        candidates = find_generated_image_candidates_by_screenshot(window)
    return dedupe_image_candidates(candidates)


def find_generated_image_candidates_from_controls(window: Any) -> list[ImageCandidate]:
    try:
        import numpy as np
    except ImportError:
        return []

    try:
        screenshot = window.capture_as_image().convert("RGB")
        pixels = np.array(screenshot)
        window_rect = window.rectangle()
    except Exception:
        return []

    candidates: list[ImageCandidate] = []
    for control in window.descendants(control_type="Image"):
        try:
            rect = control.rectangle()
            name = control.window_text()
        except Exception:
            continue
        if name != "image" or not rect_is_visible(rect):
            continue
        if rect.width() < 100 or rect.height() < 100:
            continue
        left = max(0, int(rect.left - window_rect.left))
        top = max(0, int(rect.top - window_rect.top))
        right = min(screenshot.width, int(rect.right - window_rect.left))
        bottom = min(screenshot.height, int(rect.bottom - window_rect.top))
        if right <= left or bottom <= top:
            continue
        region = pixels[top:bottom, left:right]
        if not image_region_is_ready(region):
            continue
        candidates.append(
            ImageCandidate(
                center=(rect.left + rect.width() // 2, rect.top + rect.height() // 2),
                rect=(int(rect.left), int(rect.top), int(rect.right), int(rect.bottom)),
                signature=image_region_signature(region),
                area=rect.width() * rect.height(),
            )
        )
    return sorted(candidates, key=lambda item: (item.area, item.center[1]), reverse=True)


def find_generated_image_control(window: Any) -> Any | None:
    candidates = []
    for control in window.descendants(control_type="Image"):
        try:
            rect = control.rectangle()
            name = control.window_text()
        except Exception:
            continue
        if name != "image" or not rect_is_visible(rect):
            continue
        if rect.width() < 100 or rect.height() < 100:
            continue
        if not image_rect_is_ready(window, rect):
            continue
        score = rect.width() * rect.height()
        candidates.append((score, control))
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: item[0], reverse=True)[0][1]


def find_generated_image_candidates_by_screenshot(window: Any) -> list[ImageCandidate]:
    try:
        import numpy as np
    except ImportError:
        return []

    image = window.capture_as_image().convert("RGB")
    pixels = np.array(image)
    height, width = pixels.shape[:2]
    window_rect = window.rectangle()

    # Avoid the left sidebar, title bar, and bottom input area. The generated
    # image is the largest dense visual block in the remaining chat region.
    x0 = min(450, width)
    y0 = min(300, height)
    x1 = min(width - 220, width)
    y1 = min(height - 260, height)
    if x1 <= x0 or y1 <= y0:
        return []

    crop = pixels[y0:y1, x0:x1]
    mask = np.any(crop < 235, axis=2)
    cell_size = 16
    cells = set()
    for cy in range(0, mask.shape[0] - cell_size, cell_size):
        for cx in range(0, mask.shape[1] - cell_size, cell_size):
            density = mask[cy : cy + cell_size, cx : cx + cell_size].mean()
            if density > 0.15:
                cells.add((cx // cell_size, cy // cell_size))

    candidates: list[ImageCandidate] = []
    while cells:
        start = cells.pop()
        stack = [start]
        component = [start]
        while stack:
            cx, cy = stack.pop()
            for dx, dy in [
                (1, 0),
                (-1, 0),
                (0, 1),
                (0, -1),
                (1, 1),
                (1, -1),
                (-1, 1),
                (-1, -1),
            ]:
                neighbor = (cx + dx, cy + dy)
                if neighbor in cells:
                    cells.remove(neighbor)
                    stack.append(neighbor)
                    component.append(neighbor)

        xs = [item[0] for item in component]
        ys = [item[1] for item in component]
        left = x0 + min(xs) * cell_size
        top = y0 + min(ys) * cell_size
        right = x0 + (max(xs) + 1) * cell_size
        bottom = y0 + (max(ys) + 1) * cell_size
        rect_width = right - left
        rect_height = bottom - top
        if rect_width < 120 or rect_height < 120:
            continue
        aspect = rect_width / rect_height
        if aspect < 0.35 or aspect > 3:
            continue
        region = pixels[top:bottom, left:right]
        if not image_region_is_ready(region):
            continue
        candidates.append(
            ImageCandidate(
                center=(
                    window_rect.left + (left + right) // 2,
                    window_rect.top + (top + bottom) // 2,
                ),
                rect=(
                    int(window_rect.left + left),
                    int(window_rect.top + top),
                    int(window_rect.left + right),
                    int(window_rect.top + bottom),
                ),
                signature=image_region_signature(region),
                area=rect_width * rect_height,
            )
        )

    return sorted(candidates, key=lambda item: (item.area, item.center[1]), reverse=True)


def dedupe_image_candidates(candidates: list[ImageCandidate]) -> list[ImageCandidate]:
    deduped: list[ImageCandidate] = []
    for candidate in sorted(candidates, key=lambda item: (item.area, item.center[1]), reverse=True):
        if any(points_are_close(candidate.center, seen.center, tolerance=32) for seen in deduped):
            continue
        deduped.append(candidate)
    return deduped


def image_region_signature(region: Any) -> tuple[int, ...]:
    import numpy as np

    if region.size == 0:
        return ()
    height, width = region.shape[:2]
    y_indexes = np.linspace(0, height - 1, 16).astype(int)
    x_indexes = np.linspace(0, width - 1, 16).astype(int)
    sample = region[y_indexes[:, None], x_indexes[None, :], :]
    quantized = (sample // 16).astype("uint8")
    return tuple(int(value) for value in quantized.reshape(-1))


def image_rect_is_ready(window: Any, rect: Any) -> bool:
    try:
        import numpy as np
    except ImportError:
        return False

    screenshot = window.capture_as_image().convert("RGB")
    window_rect = window.rectangle()
    left = max(0, int(rect.left - window_rect.left))
    top = max(0, int(rect.top - window_rect.top))
    right = min(screenshot.width, int(rect.right - window_rect.left))
    bottom = min(screenshot.height, int(rect.bottom - window_rect.top))
    if right <= left or bottom <= top:
        return False
    return image_region_is_ready(np.array(screenshot.crop((left, top, right, bottom))))


def image_region_is_ready(region: Any) -> bool:
    import numpy as np

    if region.size == 0:
        return False
    flat = region.reshape(-1, 3)
    channel_std = float(np.mean(np.std(flat, axis=0)))
    non_background_density = float(np.any(region < 235, axis=2).mean())
    gray = region.mean(axis=2).astype("float32")
    detail = float(
        np.mean(np.abs(np.diff(gray, axis=0)))
        + np.mean(np.abs(np.diff(gray, axis=1)))
    )

    return (
        channel_std >= 15
        and non_background_density >= 0.05
        and detail >= 1.5
    )


def open_image_preview(window: Any, center: tuple[int, int]) -> None:
    import pyautogui

    window.set_focus()
    time.sleep(0.2)
    pyautogui.click(center[0], center[1])
    time.sleep(1.2)


def save_preview_image_to(window: Any, output: Path, overwrite: bool) -> Path:
    output = normalize_output_path(output)
    before = download_snapshot()
    click_preview_save(window)
    downloaded = wait_for_new_download(before, timeout_seconds=DOWNLOAD_TIMEOUT_SECONDS)
    target = resolve_target_path(output, downloaded.suffix, overwrite=overwrite)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(downloaded), str(target))
    return target


def normalize_output_path(output: Path) -> Path:
    if not output.is_absolute():
        output = ROOT / output
    return output


def click_preview_save(window: Any) -> None:
    # Doubao's preview toolbar currently exposes the blue Save button visually,
    # but not as a named UIA control. The app window is maximized before this.
    click_relative(window, 0.931, 0.069)
    time.sleep(0.5)


def download_snapshot() -> dict[Path, tuple[int, float]]:
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    snapshot = {}
    for path in DOWNLOADS_DIR.iterdir():
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        stat = path.stat()
        snapshot[path.resolve()] = (stat.st_size, stat.st_mtime)
    return snapshot


def wait_for_new_download(
    before: dict[Path, tuple[int, float]],
    timeout_seconds: int,
) -> Path:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        after = download_snapshot()
        candidates = [
            path
            for path, state in after.items()
            if path not in before or before[path] != state
        ]
        if candidates:
            candidates.sort(key=lambda path: path.stat().st_mtime, reverse=True)
            return wait_for_stable_file(candidates[0])
        time.sleep(0.5)
    raise RuntimeError("Timed out waiting for the downloaded image file.")


def wait_for_stable_file(path: Path) -> Path:
    last_size = -1
    stable_checks = 0
    while stable_checks < 3:
        size = path.stat().st_size
        if size == last_size and size > 0:
            stable_checks += 1
        else:
            stable_checks = 0
            last_size = size
        time.sleep(0.5)
    return path


def resolve_target_path(output: Path, downloaded_suffix: str, overwrite: bool) -> Path:
    if not output.suffix:
        output = output.with_suffix(downloaded_suffix)
    if overwrite or not output.exists():
        return output

    stem = output.stem
    suffix = output.suffix
    parent = output.parent
    counter = 2
    while True:
        candidate = parent / f"{stem}_{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def switch_to_sidebar_new_chat(window: Any) -> bool:
    control = find_sidebar_new_chat(window)
    if control is not None:
        click_control_center(control)
        return True

    click_sidebar_new_chat_by_coordinates(window)
    return True


def find_sidebar_new_chat(window: Any) -> Any | None:
    candidates = []
    for control in window.descendants():
        try:
            rect = control.rectangle()
            name = control.window_text()
            control_type = control.element_info.control_type
        except Exception:
            continue
        if name != "新对话" or not rect_is_visible(rect):
            continue
        if rect.left > 440:
            continue
        if rect.top < 180 or rect.top > 430:
            continue
        score = 0
        if control_type in {"Button", "Hyperlink"}:
            score += 1000
        score -= rect.top
        candidates.append((score, control))
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: item[0], reverse=True)[0][1]


def click_control_center(control: Any) -> None:
    import pyautogui

    rect = control.rectangle()
    pyautogui.click(rect.left + rect.width() // 2, rect.top + rect.height() // 2)


def click_sidebar_new_chat_by_coordinates(window: Any) -> None:
    click_relative(window, 0.043, 0.160)


def find_named_button(window: Any, name: str) -> Any | None:
    for control in window.descendants(control_type="Button"):
        try:
            if control.window_text() == name and rect_is_visible(control.rectangle()):
                return control
        except Exception:
            continue
    return None


def find_prompt_edit(window: Any) -> Any | None:
    candidates = []
    for control in window.descendants(control_type="Edit"):
        try:
            rect = control.rectangle()
            name = control.window_text()
        except Exception:
            continue
        if not rect_is_visible(rect):
            continue
        score = rect.width() * rect.height()
        if "发消息" in name:
            score += 1_000_000
        candidates.append((score, control))
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: item[0], reverse=True)[0][1]


def paste_text(edit: Any, text: str) -> None:
    import pyperclip

    edit.click_input()
    time.sleep(0.1)
    pyperclip.copy(text)
    keyboard.send_keys("^a")
    time.sleep(0.05)
    keyboard.send_keys("^v")


def paste_text_by_coordinates(window: Any, text: str) -> None:
    import pyautogui
    import pyperclip

    window.set_focus()
    time.sleep(0.2)
    click_relative(window, 0.30, 0.86)
    time.sleep(0.2)
    pyperclip.copy(text)
    pyautogui.hotkey("ctrl", "a")
    time.sleep(0.1)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.2)


def press_enter_to_send(window: Any, edit: Any | None = None) -> None:
    window.set_focus()
    time.sleep(0.1)
    if edit is None:
        edit = find_prompt_edit(window)
    if edit is not None:
        edit.click_input()
        time.sleep(0.1)
    keyboard.send_keys("{ENTER}")
    time.sleep(0.3)


def click_relative(window: Any, x_ratio: float, y_ratio: float) -> None:
    import pyautogui

    rect = window.rectangle()
    x = rect.left + int(rect.width() * x_ratio)
    y = rect.top + int(rect.height() * y_ratio)
    pyautogui.click(x, y)


def rect_is_visible(rect: Any) -> bool:
    return rect.width() > 0 and rect.height() > 0 and rect.right > 0 and rect.bottom > 0


if __name__ == "__main__":
    raise SystemExit(main())
