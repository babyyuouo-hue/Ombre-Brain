from pathlib import Path

import pytest
from starlette.requests import Request

from web import _shared as sh
from web import dashboard


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "frontend" / "xiaoyu.html").read_text(encoding="utf-8")
CSS = (ROOT / "frontend" / "xiaoyu.css").read_text(encoding="utf-8")
JS = (ROOT / "frontend" / "xiaoyu.js").read_text(encoding="utf-8")
LEGACY_CSS = (ROOT / "frontend" / "universe.css").read_text(encoding="utf-8")
ROUTES = (ROOT / "src" / "web" / "dashboard.py").read_text(encoding="utf-8")


def test_focused_frontend_has_only_the_four_primary_destinations():
    assert HTML.count('class="nav-item') == 4
    for name in ("now", "memories", "letters", "settings"):
        assert f'data-view="{name}"' in HTML
        assert f'data-view-panel="{name}"' in HTML
    assert 'data-view="network"' not in HTML
    assert 'data-view="plan"' not in HTML


def test_diaries_and_plans_are_integrated_into_memory_filters():
    assert 'data-filter="diary"' in HTML
    assert 'data-filter="plan"' in HTML
    assert "function isDiary(bucket)" in JS
    assert "function isPlan(bucket)" in JS


def test_constellation_expands_related_memories_without_the_legacy_pet():
    assert "function relatedBuckets(center, excluded)" in JS
    assert "relationScore(center, candidate)" in JS
    assert "RELATED_ANGLES" in JS
    assert "jellyfish" in HTML
    assert "小鸡" not in HTML + CSS + JS
    assert "#ob-chick canvas" in LEGACY_CSS
    assert "display: none !important" in LEGACY_CSS
    assert "小水母正在替小宇看着星海" in LEGACY_CSS


def test_focused_frontend_keeps_live_ombre_api_contracts():
    for endpoint in (
        "/api/buckets?sort=created_desc",
        "/api/letters",
        "/api/plans",
        "/api/config",
        "/api/status",
        "/api/github/status",
        "/api/settings/human",
        "/api/letter",
        "/api/github/sync",
    ):
        assert endpoint in JS


def test_root_and_legacy_dashboards_are_separate_surfaces():
    assert '"xiaoyu.html"' in ROUTES
    assert '@mcp.custom_route("/legacy", methods=["GET"])' in ROUTES
    assert '"dashboard.html"' in ROUTES
    assert '"xiaoyu.css": "text/css"' in ROUTES
    assert '"xiaoyu.js": "text/javascript"' in ROUTES


class _FakeMCP:
    def __init__(self):
        self.routes = {}

    def custom_route(self, path, methods):
        def decorator(function):
            self.routes[(path, tuple(methods))] = function
            return function
        return decorator


def _request(path: str) -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": [],
        "query_string": b"",
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 1234),
    })


@pytest.mark.asyncio
async def test_root_serves_new_ui_while_legacy_keeps_full_dashboard(monkeypatch):
    monkeypatch.setattr(sh, "repo_root", str(ROOT))
    monkeypatch.setattr(sh, "version", "test-version")
    mcp = _FakeMCP()
    dashboard.register(mcp)

    root = await mcp.routes[("/", ("GET",))](_request("/"))
    legacy = await mcp.routes[("/legacy", ("GET",))](_request("/legacy"))
    static = await mcp.routes[("/static/{name}", ("GET",))](
        Request({
            "type": "http", "method": "GET", "path": "/static/xiaoyu.js",
            "path_params": {"name": "xiaoyu.js"}, "headers": [],
            "query_string": b"", "scheme": "http",
            "server": ("testserver", 80), "client": ("127.0.0.1", 1234),
        })
    )

    assert b"/static/xiaoyu.css?v=test-version" in root.body
    assert b"/static/universe.css?v=test-version" in legacy.body
    assert static.status_code == 200
    assert static.media_type == "text/javascript"
