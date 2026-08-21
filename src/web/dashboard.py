"""
========================================
web/dashboard.py — 仪表板页面 + 静态资源 + 健康检查
========================================

承载根路径仪表板、前端静态资源（icon/favicon/manifest/字体）、/favicon.ico 跳转、
以及 /health 健康检查。

对外暴露：register(mcp)。
========================================
"""

import os

from starlette.requests import Request
from starlette.responses import Response

from . import _shared as sh


def register(mcp) -> None:

    def _serve_frontend(name: str, *, cache_bust: tuple[str, ...] = ()) -> Response:
        """Read a bundled frontend document with consistent no-cache headers."""
        from starlette.responses import HTMLResponse

        page_path = os.path.join(sh.repo_root, "frontend", name)
        try:
            with open(page_path, "r", encoding="utf-8") as f:
                html = f.read()
            for asset in cache_bust:
                html = html.replace(asset, f"{asset}?v={sh.version}")
            return HTMLResponse(
                html,
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
            )
        except FileNotFoundError:
            return HTMLResponse(
                f"<h1>{name} not found</h1>"
                "<p>The packaged frontend asset is missing. Update the deployment "
                "and restart Ombre Brain.</p>",
                status_code=404,
            )

    @mcp.custom_route("/", methods=["GET"])
    async def root_dashboard(request: Request) -> Response:
        """Serve the focused Xiaoyu UI directly at root.

        历史上 / 会 307 → /dashboard，但叠加 Cloudflare Tunnel 的 Always Use HTTPS /
        Page Rule 时容易触发 ERR_TOO_MANY_REDIRECTS。直接返回 HTML，少一次跳转，
        既能修复回环，也省一个 RTT。
        """
        return _serve_frontend(
            "xiaoyu.html",
            cache_bust=(
                "/static/favicon.svg",
                "/static/xiaoyu.css",
                "/static/xiaoyu.js",
            ),
        )

    @mcp.custom_route("/legacy", methods=["GET"])
    async def legacy_dashboard(request: Request) -> Response:
        """Keep the complete technical dashboard behind Settings → Advanced."""
        return _serve_frontend(
            "dashboard.html",
            cache_bust=(
                "/static/icon.svg",
                "/static/favicon.svg",
                "/static/universe.css",
                "/static/universe.js",
            ),
        )

    # iter 1.7 §C/§H: serve frontend static assets (icon.svg, favicon.svg, manifest.json)
    # 安全要点：必须白名单过滤文件名，绝不能让 request 直接拼路径，
    # 否则会被 ?name=../../etc/passwd 这种「目录穿越」攻击拿走任意文件。
    @mcp.custom_route("/static/{name}", methods=["GET"])
    async def static_asset(request: Request) -> Response:
        from starlette.responses import Response as _Resp, JSONResponse
        name = request.path_params.get("name", "")
        allowed = {
            "icon.svg": "image/svg+xml",
            "favicon.svg": "image/svg+xml",
            "manifest.json": "application/manifest+json",
            "RRPL.ttf": "font/truetype",
            "universe.css": "text/css",
            "universe.js": "text/javascript",
            "xiaoyu.css": "text/css",
            "xiaoyu.js": "text/javascript",
        }
        if name not in allowed:
            return JSONResponse({"error": "not found"}, status_code=404)
        path = os.path.join(sh.repo_root, "frontend", name)
        try:
            with open(path, "rb") as f:
                return _Resp(f.read(), media_type=allowed[name])
        except FileNotFoundError:
            return JSONResponse({"error": "not found"}, status_code=404)

    # 浏览器打开任意页都会自动请求 /favicon.ico，301 永久重定向到 SVG 版本。
    @mcp.custom_route("/favicon.ico", methods=["GET"])
    async def favicon_redirect(request: Request) -> Response:
        from starlette.responses import RedirectResponse
        return RedirectResponse(url="/static/favicon.svg", status_code=301)

    @mcp.custom_route("/health", methods=["GET"])
    async def health_check(request: Request) -> Response:
        from starlette.responses import JSONResponse
        # Public infrastructure probes must be O(1) and reveal no vault size,
        # engine state, filesystem path, or raw exception.  Authenticated
        # /api/status and /api/system/diagnostics own detailed health checks.
        return JSONResponse(
            {"status": "ok"},
            headers={"Cache-Control": "no-store"},
        )
