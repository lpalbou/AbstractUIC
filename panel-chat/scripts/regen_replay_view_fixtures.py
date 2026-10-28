"""Regenerate panel-chat's replay-view fixtures from a real AbstractGateway.

Every conformance case of AbstractRuntime (`abstractruntime.replay.conformance`, 15 cases in
0.15.0) is put in a fresh gateway's own stores one ledger record at a time. After each record
the gateway folds it (`poll`, what its stream loop runs) and the frames it would send a
subscribed `GET /runs/{id}/view/stream` are captured byte for byte, then `GET /runs/{id}/view`
is read through the real route. The fixture is therefore what a client receives:

- `<case>/stream.sse`  the stream as sent: the first `view` frame, then one `delta` frame
                        per fold (`id:` = cursor token);
- `<case>/steps.json`  per step: the record appended, the GET's ETag, the SHA-256 and length
                        of the GET body, and (every 4th step and the last) the reconnect
                        frame a stream sends for `Last-Event-ID` = the previous step's token;
- `<case>/final_view.json`  the last GET body, verbatim (it is the case's expected view).

The check (`check_replay_view.mjs`) folds `stream.sse` with panel-chat's `applyDelta` and
asserts the folded view serializes to the GET body's exact bytes at EVERY step.

Run with the gateway the fixtures pin (0.17.0, AbstractRuntime 0.15.0):

    python -m venv /tmp/gw017 && /tmp/gw017/bin/pip install abstractgateway==0.17.0
    /tmp/gw017/bin/python panel-chat/scripts/regen_replay_view_fixtures.py
"""

from __future__ import annotations

import hashlib
import importlib.metadata as md
import json
import os
import sys
import tempfile
from pathlib import Path

OUT = Path(__file__).resolve().parent / "fixtures" / "replay_view"
TOKEN = "f" * 40
H = {"Authorization": f"Bearer {TOKEN}"}


def _append_kept_seq(sq, rid: str, rec: dict) -> None:  # noqa: ANN001
    """Append ONE record keeping its `seq` (the per-record form of `import_records`, which only
    imports a whole ledger): the same row and head as the store's own import."""
    from abstractruntime.storage.sqlite import dumps_compact

    seq = int(rec["seq"])
    body = {k: v for k, v in rec.items() if k != "seq"}
    idem, status = body.get("idempotency_key"), body.get("status")
    conn = sq._db.connection()
    with conn:
        conn.execute(
            "INSERT INTO ledger (run_id, seq, record_json, idempotency_key, step_status) VALUES (?, ?, ?, ?, ?);",
            (rid, seq, dumps_compact(body), idem if isinstance(idem, str) and idem else None,
             str(status) if status is not None else None))
        conn.execute(
            "INSERT INTO ledger_heads (run_id, last_seq) VALUES (?, ?) "
            "ON CONFLICT(run_id) DO UPDATE SET last_seq = excluded.last_seq;", (rid, seq))


class _ImmediateLoop:
    """A subscriber loop that delivers a frame at once (the generator has no event loop)."""

    def call_soon_threadsafe(self, fn, *args):  # noqa: ANN001
        fn(*args)


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="replay-fixtures-"))
    os.environ.update({
        "ABSTRACTGATEWAY_DATA_DIR": str(tmp / "runtime"),
        "ABSTRACTGATEWAY_FLOWS_DIR": str(tmp / "flows"),
        "ABSTRACTGATEWAY_WORKFLOW_SOURCE": "bundle",
        "ABSTRACTGATEWAY_AUTH_TOKEN": TOKEN,
        "ABSTRACTGATEWAY_ALLOWED_ORIGINS": "*",
        "ABSTRACTGATEWAY_STORE_BACKEND": "sqlite",
        "ABSTRACTGATEWAY_RUNNER": "0",
        "HOME": str(tmp / "home"),
    })
    (tmp / "flows").mkdir(parents=True)
    (tmp / "home").mkdir(parents=True)

    from fastapi.testclient import TestClient

    from abstractgateway.app import app
    from abstractgateway.ledger_tail import _unwrap_chain
    from abstractgateway.replay_view import _Subscriber, get_view_hub, poll, subscribe, unsubscribe
    from abstractgateway.service import get_gateway_service
    from abstractruntime.replay.conformance import case_names, load_case
    from abstractruntime.storage.sqlite import SqliteLedgerStore, _runstate_from_dict

    versions = {p: md.version(p) for p in ("abstractgateway", "abstractruntime")}
    OUT.mkdir(parents=True, exist_ok=True)
    index = {"generator": "panel-chat/scripts/regen_replay_view_fixtures.py", "versions": versions, "cases": []}
    with TestClient(app) as client:
        svc = get_gateway_service()
        rs, ls = svc.host.run_store, svc.host.ledger_store
        sq = next(x for x in _unwrap_chain(ls) if isinstance(x, SqliteLedgerStore))
        for name in case_names():
            case = load_case(name)
            root = case["manifest"]["root_run_id"]
            # Cases share run ids (a and a2 are one conversation at two moments): each starts
            # from empty ledgers and a fresh view entry.
            get_view_hub().clear()
            conn = sq._db.connection()
            with conn:
                for rid in case["records"]:
                    conn.execute("DELETE FROM ledger WHERE run_id = ?;", (rid,))
                    conn.execute("DELETE FROM ledger_heads WHERE run_id = ?;", (rid,))
            for snap in case["runs"].values():
                rs.save(_runstate_from_dict(dict(snap)))
            # Arrival order: by the record's time, then the run's place in the case, then seq.
            order = {rid: i for i, rid in enumerate(case["records"])}
            arrivals = sorted(
                ((str(r.get("ended_at") or r.get("started_at") or ""), order[rid], int(r["seq"]), rid, r)
                 for rid, recs in case["records"].items() for r in recs),
                key=lambda t: t[:3],
            )
            entry = get_view_hub().entry(ledger_store=ls, run_store=rs, root_run_id=root)
            sub = _Subscriber(loop=_ImmediateLoop())  # type: ignore[arg-type]
            frames, _terminal = subscribe(entry, sub, None)
            stream = list(frames)
            first = client.get(f"/api/gateway/runs/{root}/view", headers=H)
            assert first.status_code == 200, first.text
            steps = [{"record": None, "etag": first.headers["etag"], "frames": 1,
                      "sha256": hashlib.sha256(first.content).hexdigest(), "bytes": len(first.content)}]
            for n, (_ts, _o, seq, rid, rec) in enumerate(arrivals, start=1):
                _append_kept_seq(sq, rid, rec)
                poll(entry)
                got = []
                while not sub.queue.empty():
                    got.append(sub.queue.get_nowait())
                stream.extend(got)
                body = client.get(f"/api/gateway/runs/{root}/view", headers=H)
                assert body.status_code == 200, body.text
                step = {"record": f"{rid}:{seq}", "etag": body.headers["etag"], "frames": len(got),
                        "sha256": hashlib.sha256(body.content).hexdigest(), "bytes": len(body.content)}
                # A reconnect holding the previous step's token gets one frame bringing it here
                # (every 4th step and the last: a reconnect frame carries every run and message).
                if n % 4 == 0 or n == len(arrivals):
                    prev = steps[-1]["etag"].strip('"')
                    re_sub = _Subscriber(loop=_ImmediateLoop())  # type: ignore[arg-type]
                    re_frames, _t = subscribe(entry, re_sub, prev)
                    unsubscribe(entry, re_sub)
                    step["reconnect"] = [f.decode("utf-8") for f in re_frames]
                steps.append(step)
                # A 304 for the held ETag: the route's conditional read.
                assert client.get(f"/api/gateway/runs/{root}/view", headers={**H, "If-None-Match": body.headers["etag"]}).status_code == 304
            unsubscribe(entry, sub)
            final = client.get(f"/api/gateway/runs/{root}/view", headers=H)
            assert final.json() == case["expected_view"], f"{name}: the gateway's view is not the case's expected view"
            d = OUT / name
            d.mkdir(exist_ok=True)
            (d / "stream.sse").write_bytes(b"".join(stream))
            (d / "steps.json").write_text(json.dumps(steps, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
            (d / "final_view.json").write_bytes(final.content)
            index["cases"].append({"name": name, "root_run_id": root, "records": len(arrivals),
                                   "delta_frames": len(stream) - 1, "manifest": case["manifest"].get("pins") or case["manifest"].get("title")})
            print(f"{name}: {len(arrivals)} records, {len(stream) - 1} deltas, final {len(final.content)} bytes")
    (OUT / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
