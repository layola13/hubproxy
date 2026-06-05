# HubProxy SA Version

This directory contains the SA port of HubProxy. The goal of this port is to match the externally visible behavior of the Deno implementation while using the SA compiler, SA std facade, and native SA plugins.

## Current Status

As of 2026-06-05, the audited Deno behavior surface is covered by the SA implementation.

- Deno tests audited: 67 `Deno.test(...)` cases from `src/proxy_test.ts`, `src/handlers_test.ts`, `src/env_test.ts`, `src/state_test.ts`, `src/responses_mock_test.ts`, and `src/real_upstream_test.ts`.
- SA focused tests: 93 files under `sa/tests`.
- Latest full SA verification: 9/9 SA source/native tests passed, 84/84 shell contract tests available; latest focused run covered long request, large SSE, native/fallback stream, and large non-SSE paths.
- Runtime port: `SA_PORT=28080` from the project root `.env`.
- Deno runtime port remains separate: `PORT=27787`.

## Run

Build the SA binary from this directory:

```bash
SA_PLUGINS_HOME=/home/vscode/.local/share/sa_plugins \
  /home/vscode/projects/sci/zig-out/bin/sa build main.sa -o hubproxy --json
```

Start SA from the project root with the SA-specific entrypoint:

```bash
cd /home/vscode/projects/hubproxy
./restart_sa.sh
```

Do not use the Deno restart entrypoint for SA runtime checks.

## Plugin Requirements

SA HubProxy uses the split plugin model:

- `deno`: Deno-compatible facade helpers, JSON/request normalizers, process/env/fs helpers.
- `http-client`: outbound HTTP client ABI.
- `http-server`: inbound HTTP server ABI.
- `node`: Node-compatible helper surface used by the Deno facade stack.

Install local plugin development builds when plugin code changes:

```bash
SA_PLUGINS_HOME=/home/vscode/.local/share/sa_plugins \
  /home/vscode/projects/sci/zig-out/bin/sa plugin install --dev \
  /home/vscode/projects/sa_plugins/sa_plugin_deno
```

Repeat for the split HTTP plugins when their ABI or implementation changes.

## Verification

Compiler/std/plugin gates:

```bash
bash /home/vscode/projects/sa_plugins/tests/deno-symbol-interface-smoke.sh \
  /home/vscode/projects/sa_plugins

cd /home/vscode/projects/sci
SA_PLUGINS_HOME=/home/vscode/.local/share/sa_plugins zig build std-smoke --summary none
```

SA build:

```bash
cd /home/vscode/projects/hubproxy/sa
SA_PLUGINS_HOME=/home/vscode/.local/share/sa_plugins \
  /home/vscode/projects/sci/zig-out/bin/sa build main.sa -o hubproxy --json
```

SA source/native tests:

```bash
cd /home/vscode/projects/hubproxy/sa
SA_PLUGINS_HOME=/home/vscode/.local/share/sa_plugins \
  /home/vscode/projects/sci/zig-out/bin/sa test tests/unit_tests.sa --trace-panic
SA_PLUGINS_HOME=/home/vscode/.local/share/sa_plugins \
  /home/vscode/projects/sci/zig-out/bin/sa test tests/responses_chat_fallback_request_test.sa --trace-panic
SA_PLUGINS_HOME=/home/vscode/.local/share/sa_plugins \
  /home/vscode/projects/sci/zig-out/bin/sa test tests/model_list_contract_test.sa --trace-panic
```

Shell contract tests must run serially because many of them rewrite `.env` and bind `28080`:

```bash
cd /home/vscode/projects/hubproxy/sa
for t in tests/test_*.sh; do
  SA_PLUGINS_HOME=/home/vscode/.local/share/sa_plugins SA_PORT=28080 bash "$t"
done
```

## Deno Feature Parity

Status legend:

- Complete: SA behavior is covered by focused tests and matches the audited Deno behavior.
- Conditional: behavior depends on live upstream availability or upstream request contract.
- Not ported by design: Deno-only internal harness behavior, with external service behavior covered elsewhere.

| Deno feature / behavior group | SA status | SA coverage |
| --- | --- | --- |
| Auth forwarding, stripping client auth headers, base URL routing, model passthrough | Complete | `test_upstream_auth_headers.sh`, `test_chat_tools_capture.sh`, `test_responses_tools_capture.sh`, `test_empty_body_reject.sh` |
| Empty JSON body rejected before upstream call | Complete | `test_empty_body_reject.sh` |
| `/v1/models` passthrough while `/rpc` remains auth-protected | Complete | `test_http_contract.sa`, `test_upstream_auth_headers.sh` |
| Responses base URL missing or unavailable falls back to chat | Complete | `test_responses_missing_base_capture.sh`, `test_responses_fallback_capture.sh`, `test_responses_fallback_stream_events.sh` |
| Chat fallback strips responses-only fields and preserves input/model | Complete | `test_responses_fallback_strips_responses_only_fields.sh`, `test_responses_missing_base_capture.sh` |
| Native Responses preserves responses-only fields; Gemini strips incompatible fields | Complete | `test_responses_gemini_capture.sh`, `test_responses_gemini_tool_history_no_fallback.sh` |
| Tool schema normalization for chat and responses, including namespace tools and non-function filtering | Complete | `test_chat_tools_capture.sh`, `test_responses_tools_capture.sh`, `test_responses_fallback_capture.sh` |
| Function-call history fallback and tool message name preservation | Complete | `responses_chat_fallback_request_test.sa`, `test_responses_fallback_tool_history.sh` |
| Chat fallback tool-call stream normalization, split chunks, `read` to `exec_command`, `.env*` redaction, shell quoting | Complete | `test_responses_fallback_stream_tool_call_*.sh` |
| Chat fallback namespaced tool-call de-flattening | Complete | `test_responses_fallback_stream_tool_call_namespace.sh` |
| Native Responses SSE MCP de-flatten and server denormalize | Complete | `test_responses_client_mcp_denormalize.sh`, SCI `std-smoke` |
| Request-side MCP server alias normalization | Complete | `test_responses_mcp_server_normalize.sh`, SCI `std-smoke` |
| Long Responses request bodies and large normalized SSE bodies stay connected without heap corruption | Complete | `test_responses_long_input_request_no_crash.sh`, `test_responses_native_large_sse_no_crash.sh`, live long-prompt `codex exec` smoke |
| Chat JSON fallback content, usage, tool calls, thought tags, `reasoning_content` to Responses JSON | Complete | `test_responses_fallback_json_*.sh`, SCI Deno facade helpers |
| Chat stream `thinking` / `reasoning_content` and split `<thought>` tags to Responses reasoning events | Complete | `test_responses_fallback_stream_reasoning_content.sh`, `test_responses_fallback_stream_thought_tag.sh` |
| Chat fallback Responses SSE event ordering keeps Codex message item active across deltas | Complete | `responses_chat_fallback_request_test.sa`, SCI `sa_deno_chat_sse_to_responses` |
| Native Responses stream/JSON thinking normalization | Complete | `test_responses_native_thinking_stream.sh`, `test_responses_native_thinking_json.sh` |
| Progress-only continuation in goal/code/default contexts | Complete | `test_responses_fallback_stream_progress_continuation.sh`, `test_responses_fallback_json_progress_continuation.sh`, `test_responses_native_progress_continuation.sh`, `test_responses_turn_context_goal_continuation.sh` |
| No continuation in ordinary mode, proposed plan output, normal final answer, or without `exec_command` | Complete | `test_responses_fallback_stream_progress_no_*.sh`, `test_responses_fallback_json_progress_no_continuation.sh`, `test_responses_native_progress_no_continuation.sh` |
| Thread start/resume/fork/read/list/turns lifecycle, string IDs, metadata, fork inheritance, unarchive response, inject before reset, dynamic realtime/attestation IDs | Complete | `unit_tests.sa`, `model_list_contract_test.sa`, `test_http_contract.sa`, `test_thread_*.sh`, `test_turn_*.sh`, `test_realtime_uuid.sh`, `test_attestation_uuid.sh` |
| Standard JSON-RPC whitespace and normal serializer output preserve `id`, params, goals, and thread envelopes | Complete | `model_list_contract_test.sa` |
| Escaped JSON-RPC params preserve quotes and backslashes | Complete | `model_list_contract_test.sa`, SCI `sa_deno_jsonrpc_params_string_literal` fixture |
| Turn context resolution from `thread-id` / `turn-id`, stale turn ignored, body-inferred modes | Complete | `test_responses_turn_context_goal_continuation.sh` |
| Goal lifecycle and current timestamps | Complete | `test_state.sa`, timestamp shell tests |
| `memory/reset` clears runtime state and emits wildcard close event | Complete | `test_state.sa`, `test_memory_reset_clears_state.sh` |
| Events bridge for thread, turn, item, fs, process, realtime, MCP, warnings | Complete | `test_events_contract.sh`, `test_mcp_tool_progress_event.sh`, realtime/user-input/elicitation tests |
| Request logging, disabled-by-default logs, auth failure previews | Complete | `test_api_request_log.sh`, `test_api_request_log_disabled_by_default.sh`, `test_auth_failure_log.sh` |
| Thin JSON-RPC compatibility responses for experimental features, remote control, login/logout, approvals, command/process control, plugin install/list/read, model list, config requirements, app list | Complete | `test_rpc_misc_parity.sh`, `model_list_contract_test.sa` |
| `.env` load, `SA_PORT=28080`, null config semantics, config writes | Complete | `test_config.sa`, `test_server_config.sa`, `test_config_read_nulls.sh`, `test_config_write_cwd.sh` |
| SA restart entrypoint preserves Deno on `27787` and makes `--log-dir` effective | Complete | `test_restart_sa_entry.sh` |
| Default project tasks use SA build/start, with Deno tasks explicit and namespaced | Complete | `test_project_tasks_sa_default.sh` |
| Deno-like JSON parsing/stringify/fetch/env/fs/process facade used by HubProxy | Complete | SCI focused fixtures plus HubProxy focused tests |
| Deno mock response harness internals from `responses_mock_test.ts` | Not ported by design | External response shapes are covered by proxy and fallback tests; the Deno-only harness is not duplicated |
| Real upstream chat/responses/models smoke | Conditional | Current `.env`: `/models` and Deno-shaped `/responses` return 200 through direct upstream and SA. Minimal `/chat/completions` returns 400 from both direct upstream and SA, so it is not an SA-only forwarding delta |

## Known Non-Blocking Items

- Token-budget auto-interruption is not a Deno parity blocker. Current Deno stores `tokenBudget` and emits token usage state, but does not enforce proxy interruption either.
- Some older request/RPC helper code can still be deleted after each path is proven covered by SCI std helpers. This is cleanup, not a current behavior gap.
- `test_http_contract.sa` is a broad smoke contract. Keep exact assertions in focused tests to avoid pinning dynamic IDs or live upstream text.

## Maintenance Rules

- Do not modify Deno tests to make SA pass. Port behavior into SA, SCI, or SA plugins.
- Keep HTTP extern declarations in the split HTTP plugins, not in the Deno plugin interface.
- Reinstall plugins with `--dev` after plugin ABI or implementation changes.
- Run shell tests serially.
- Keep `sa/tests/deno_coverage_matrix.md` as the detailed audit source and update this README when parity status changes.
