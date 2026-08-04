# -*- coding: utf-8 -*-
"""MCP stdio 协议层测试：模拟客户端完整握手并调用工具。

用法：python tests/test_stdio.py
"""
import json
import os
import queue
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = os.path.join(ROOT, "vision_bridge.py")
SAMPLE = os.path.join(ROOT, "samples", "test.jpg")
TIMEOUT = 120  # tools/call 需要等视觉 API 返回


def main():
    proc = subprocess.Popen(
        [sys.executable, SERVER],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        cwd=ROOT,
    )
    q = queue.Queue()

    def reader():
        for line in proc.stdout:
            q.put(line.decode("utf-8").strip())
    threading.Thread(target=reader, daemon=True).start()

    seq = [0]

    def send(method, params=None, notify=False):
        seq[0] += 1
        msg = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        if not notify:
            msg["id"] = seq[0]
        proc.stdin.write((json.dumps(msg, ensure_ascii=False) + "\n").encode("utf-8"))
        proc.stdin.flush()
        return seq[0]

    def recv(expected_id, timeout=TIMEOUT):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                line = q.get(timeout=2)
            except queue.Empty:
                continue
            msg = json.loads(line)
            if msg.get("id") == expected_id:
                return msg
        raise TimeoutError(f"等待响应 {expected_id} 超时")

    passed = 0

    # 1. initialize 握手
    r = recv(send("initialize", {"protocolVersion": "2025-03-26",
                                 "capabilities": {}, "clientInfo": {"name": "test"}}))
    info = r["result"]["serverInfo"]
    assert info["name"] == "vision-bridge", info
    print(f"[1] initialize  OK  server={info['name']} v{info['version']}")
    passed += 1

    # 2. initialized 通知（无响应）
    send("notifications/initialized", notify=True)

    # 3. tools/list
    r = recv(send("tools/list"))
    tools = {t["name"] for t in r["result"]["tools"]}
    assert {"analyze_image", "analyze_image_url", "ocr_image", "analyze_video"} <= tools, tools
    print(f"[2] tools/list  OK  {len(tools)} 个工具: {sorted(tools)}")
    passed += 1

    # 4. tools/call analyze_image（本地图片）
    r = recv(send("tools/call", {"name": "analyze_image",
                                 "arguments": {"image_path": SAMPLE}}))
    text = r["result"]["content"][0]["text"]
    assert not r["result"].get("isError"), text
    assert any(k in text for k in ("女士", "沙滩", "狗", "海滩")), text[:100]
    print(f"[3] analyze_image  OK  {len(text)} 字: {text[:60]}...")
    passed += 1

    # 5. tools/call 错误路径：不存在的图片 → isError
    r = recv(send("tools/call", {"name": "analyze_image",
                                 "arguments": {"image_path": "Z:/no_such.png"}}))
    assert r["result"].get("isError") is True, r
    print(f"[4] 错误路径       OK  isError=true: {r['result']['content'][0]['text'][:50]}")
    passed += 1

    # 6. ping
    r = recv(send("ping"))
    assert r["result"] == {}, r
    print("[5] ping           OK")
    passed += 1

    # 7. 未知方法 → -32601
    r = recv(send("unknown/method"))
    assert r["error"]["code"] == -32601, r
    print("[6] 未知方法       OK  -32601")
    passed += 1

    proc.terminate()
    print(f"\n全部通过: {passed}/6 项测试 ✅")


if __name__ == "__main__":
    main()
