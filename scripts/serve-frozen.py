#!/usr/bin/env python3
"""Serve the already-built classroom package with Python's standard library."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket
import sys
import threading
import webbrowser


PROJECT = Path(__file__).resolve().parent.parent
DIST = PROJECT / "dist"
PORT = 4173


def local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("10.255.255.255", 1))
            return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main() -> int:
    if not (DIST / "index.html").exists():
        print("未找到 dist/index.html，请先在源项目运行 npm run build。", file=sys.stderr)
        return 1
    handler = partial(SimpleHTTPRequestHandler, directory=DIST)
    try:
        server = ThreadingHTTPServer(("0.0.0.0", PORT), handler)
    except OSError as error:
        print(f"无法启动课堂服务器：{error}", file=sys.stderr)
        return 1
    url = f"http://{local_ip()}:{PORT}/"
    print(f"课堂入口：{url}")
    print("手机与本机连接同一 Wi-Fi 后，在讲师首页扫码。按 Control-C 结束。")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n课堂服务器已停止。")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
