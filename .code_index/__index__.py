# __index__.py  (auto-generated navigation bus)
# ════════════════════════════════════════════════════════════════
# PROJECT LOGIC INDEX — compact navigation layer
#
# For full data see:
#   index/symbols.jsonl   — all symbols with signatures
#   index/modules.jsonl   — module metadata & classes
#   index/summary.md      — human-readable overview
# ════════════════════════════════════════════════════════════════
from __future__ import annotations
from typing import Dict, List

# ── 1. Entry Points ─────────────────────────────────────────────
# Named entry points: CLI, MCP, query engine, tool/command registries.

ENTRY_POINTS: Dict[str, str] = {
    'CLI_MAIN': 'skeleton/src/main.py',  # Primary CLI entry point
}

# ── 2. Top Directories (by module count) ─────────────────────────
# Quick map of where the bulk of code lives.

TOP_DIRECTORIES: Dict[str, int] = {
    'sa/tests': 32,
    'sa/src': 28,
    '.': 23,
    'src': 15,
    'sa': 4,
    '.claude/context': 3,
    'scripts': 3,
}

# ── 3. High-Priority Symbols (by call frequency) ────────────────
# Project-specific symbols called most frequently — core building blocks.

HIGH_PRIORITY_SYMBOLS: Dict[str, int] = {
    'send_wrapped_writer_with_id': 79,
    'Array.isArray': 49,
    'this.pushNotification': 47,
    'sa_bytes_eq': 43,
    'sa_json_free': 43,
    'notify_writer_params': 35,
    'rpc_extract_string_or_default': 34,
    'sa_json_parse': 33,
    'JSON.stringify': 33,
    'sa_json_object_get': 32,
    'rpc_extract_param_string': 28,
    'state_thread_find': 28,
    'send_error_with_id': 27,
    'sa_bytes_find': 26,
    'crypto.randomUUID': 25,
    'plugin_free_buffer': 24,
    'JSON.parse': 24,
    'json_writer_finish_view': 22,
    'json_writer_begin_field_object': 21,
    'json_writer_field_empty_array': 20,
    'json_writer_field_thread_id_string': 20,
    'sa_json_writer_field_node': 18,
    'sa_json_kind': 17,
    'json_writer_begin_field_array': 16,
    'state_turn_find': 16,
    'assert_contract': 16,
    'json_writer_dispose_finished': 15,
    'sa_json_value_count': 15,
    'this.state.threads.get': 15,
    'now': 15,
}

# ── 4. Navigation Helpers ────────────────────────────────────────
# Convenience functions for AI-assisted code navigation.
# All read from local state; no filesystem access needed.

_ENTRY: Dict[str, str] = ENTRY_POINTS
_TOP_DIRS: Dict[str, int] = TOP_DIRECTORIES
_HOT: Dict[str, int] = HIGH_PRIORITY_SYMBOLS


def entry_point(name: str) -> str:
    """Return the skeleton path for a named entry point."""
    return _ENTRY.get(name, f"Unknown entry point: {name}")


def hot_symbols(n: int = 10) -> List[str]:
    """Return the top-N most-called project symbols."""
    return list(_HOT)[:n]


def module_count(dir_path: str) -> int:
    """Return the number of modules in a source directory."""
    return _TOP_DIRS.get(dir_path, 0)


def directory_overview() -> Dict[str, int]:
    """Return all top directories with their module counts."""
    return dict(_TOP_DIRS)
