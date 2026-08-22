"""Build a redacted Agent performance trace from the durable local ledger."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from pathlib import Path


def payload(value: str | None) -> dict:
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def main() -> None:
    default_db = Path(os.environ.get("LOCALAPPDATA", "")) / "Fielora" / "data" / "fielora.db"
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=default_db)
    parser.add_argument("--run-id")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    connection = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    run = connection.execute(
        "SELECT id,task,status,created_at,updated_at,finished_at,current_step,max_steps "
        "FROM agent_runs WHERE id=COALESCE(?,id) ORDER BY created_at DESC LIMIT 1",
        (args.run_id,),
    ).fetchone()
    if run is None:
        raise SystemExit("No Agent Run found")
    events = connection.execute(
        "SELECT sequence,kind,payload_json,created_at FROM agent_events WHERE run_id=? ORDER BY sequence",
        (run["id"],),
    ).fetchall()
    event_values = [(event, payload(event["payload_json"])) for event in events]
    tools = connection.execute(
        "SELECT name,effect,status,arguments_json,created_at,updated_at FROM agent_tool_calls WHERE run_id=? ORDER BY created_at",
        (run["id"],),
    ).fetchall()

    models = [value for event, value in event_values if event["kind"] == "MODEL_COMPLETED"]
    contexts = [value for event, value in event_values if event["kind"] == "CONTEXT_COMPILED"]
    completed_tools = [value for event, value in event_values if event["kind"] == "TOOL_COMPLETED"]
    model_fallback_ms = 0
    model_started_at: int | None = None
    context_fallback_ms = 0
    context_started_at: int | None = None
    tool_started_at: dict[str, int] = {}
    tool_fallback_ms = 0
    for event, value in event_values:
        if event["kind"] == "MODEL_STARTED":
            model_started_at = event["created_at"]
        elif event["kind"] in {"MODEL_COMPLETED", "MODEL_FAILED"} and model_started_at is not None:
            model_fallback_ms += max(0, event["created_at"] - model_started_at)
            model_started_at = None
        if event["kind"] in {"RUN_STARTED", "APPROVAL_RESOLVED", "RUN_RESUMED"}:
            context_started_at = event["created_at"]
        elif event["kind"] == "CONTEXT_COMPILED" and context_started_at is not None:
            context_fallback_ms += max(0, event["created_at"] - context_started_at)
            context_started_at = None
        tool_id = value.get("tool_call_id")
        if event["kind"] == "TOOL_STARTED" and isinstance(tool_id, str):
            tool_started_at[tool_id] = event["created_at"]
        elif event["kind"] in {"TOOL_COMPLETED", "TOOL_FAILED", "TOOL_CANCELLED"} and isinstance(tool_id, str):
            started_at = tool_started_at.pop(tool_id, None)
            if started_at is not None:
                tool_fallback_ms += max(0, event["created_at"] - started_at)
    approval_started: list[int] = []
    approval_wait_ms = 0
    for event in events:
        if event["kind"] == "APPROVAL_REQUESTED":
            approval_started.append(event["created_at"])
        elif event["kind"] == "APPROVAL_RESOLVED" and approval_started:
            approval_wait_ms += max(0, event["created_at"] - approval_started.pop(0))

    seen_observe: set[str] = set()
    duplicate_observe = 0
    for tool in tools:
        if tool["effect"] != "OBSERVE":
            continue
        key = f'{tool["name"]}:{tool["arguments_json"]}'
        duplicate_observe += int(key in seen_observe)
        seen_observe.add(key)

    finished_at = run["finished_at"] or run["updated_at"]
    trace = {
        "schema": "fielora.agent.performance-trace.v1",
        "run_id": run["id"],
        "task": run["task"],
        "status": run["status"],
        "total_ms": max(0, finished_at - run["created_at"]),
        "steps": {"current": run["current_step"], "maximum": run["max_steps"]},
        "context": {
            "compiles": len(contexts),
            "duration_ms": sum(int(item.get("duration_ms", 0)) for item in contexts) or context_fallback_ms,
            "cache_hits": sum(bool(item.get("cache_hit")) for item in contexts),
            "selected_files": [item.get("selected_files") for item in contexts],
            "estimated_tokens": [item.get("estimated_tokens") for item in contexts],
            "task_class": next((item.get("task_class") for item in contexts if item.get("task_class")), None),
        },
        "model": {
            "calls": len(models),
            "duration_ms": sum(int(item.get("duration_ms", 0)) for item in models) or model_fallback_ms,
            "first_token_ms": [item.get("first_token_ms") for item in models],
            "input_tokens": sum(int((item.get("usage") or {}).get("input_tokens") or 0) for item in models),
            "output_tokens": sum(int((item.get("usage") or {}).get("output_tokens") or 0) for item in models),
            "prompt_shapes": [item.get("prompt") for item in models],
        },
        "tools": {
            "calls": len(tools),
            "completed": sum(tool["status"] == "COMPLETED" for tool in tools),
            "duration_ms": sum(int(item.get("duration_ms", 0)) for item in completed_tools) or tool_fallback_ms,
            "duplicate_observe_calls": duplicate_observe,
        },
        "approval_wait_ms": approval_wait_ms,
        "durable_events": len(events),
        "runtime_metrics": {
            "fipc": "Set FIELORA_AGENT_PERFORMANCE_TRACE=1; emitted by Desktop Main as [agent-performance].",
            "ui_projection": "Inspect performance.getEntriesByName('fielora.agent.projection') in Desktop DevTools.",
        },
    }
    rendered = json.dumps(trace, ensure_ascii=False, indent=2)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
