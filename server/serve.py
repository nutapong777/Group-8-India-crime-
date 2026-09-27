"""
serve.py — เว็บเซิร์ฟเวอร์ฝั่ง Python (ไม่ต้องติดตั้งแพ็กเกจเพิ่ม)

- เสิร์ฟเว็บทีละเว็บ: web/d3/ หรือ web/echarts/ (สองเว็บแยกกัน ไม่ใช้ไฟล์ร่วมกัน)
  หน้าเว็บต้องเปิดผ่าน http เพราะมีการ fetch ไฟล์ JSON
- มี API เล็ก ๆ สำหรับดึงสรุปตามตัวกรอง:
    GET /api/summary?state=Kerala&crime=Murder
    GET /api/clusters

รัน:  python server/serve.py --site d3                 แล้วเปิด http://localhost:8000
      python server/serve.py --site echarts --port 8001
"""
from __future__ import annotations

import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

WEB = Path(__file__).resolve().parents[1] / "web"
DATA: dict = {}


def summary(state: str | None, crime: str | None) -> dict:
    si = DATA["states"].index(state) if state in DATA["states"] else None
    ci = DATA["crimes"].index(crime) if crime in DATA["crimes"] else None
    rows = [r for r in DATA["cube"] if (si is None or r[0] == si) and (ci is None or r[1] == ci)]
    cases = sum(r[3] for r in rows)
    chg = sum(r[4] for r in rows)
    conv = sum(r[5] for r in rows)
    pop = sum(r[6] for r in rows)
    n_crimes = 1 if ci is not None else len(DATA["crimes"])
    by_year = {}
    for r in rows:
        by_year[r[2]] = by_year.get(r[2], 0) + r[3]
    return {
        "filter": {"state": state if si is not None else None, "crime": crime if ci is not None else None},
        "cases_reported": cases,
        "chargesheet_rate": round(chg / cases, 4) if cases else None,
        "conviction_rate": round(conv / cases, 4) if cases else None,
        "crime_rate_per_100k_per_year": round(cases / (pop / n_crimes) * 1e5, 2) if pop else None,
        "cases_by_year": dict(sorted(by_year.items())),
        "cluster_counts": {c["id"]: sum(r[7 + k] for r in rows) for k, c in enumerate(DATA["clusters"])},
    }


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        url = urlparse(self.path)
        if url.path.startswith("/api/"):
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            if url.path == "/api/summary":
                return self._json(summary(q.get("state"), q.get("crime")))
            if url.path == "/api/clusters":
                return self._json(DATA["clusters"])
            return self._json({"error": "not found"}, 404)
        return super().do_GET()

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", choices=["d3", "echarts"], default="d3")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    site = WEB / args.site
    DATA.update(json.loads((site / "data" / "dashboard.json").read_text(encoding="utf-8")))
    srv = ThreadingHTTPServer(("0.0.0.0", args.port), partial(Handler, directory=str(site)))
    print(f"เว็บ {args.site}: http://localhost:{args.port}   API: http://localhost:{args.port}/api/summary?state=Kerala")
    srv.serve_forever()
