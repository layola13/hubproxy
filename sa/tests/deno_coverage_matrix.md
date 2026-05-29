# Deno Test Coverage Matrix

Updated: 2026-05-29

This matrix is the working audit plan for porting the Deno implementation to SA without discovering one missing behavior at a time. It is organized by Deno test behavior, not by implementation file.

Current counts:
- Deno source tests audited here: 67 `Deno.test(...)` cases from `src/proxy_test.ts`, `src/handlers_test.ts`, `src/env_test.ts`, `src/state_test.ts`, `src/responses_mock_test.ts`, and `src/real_upstream_test.ts`.
- SA focused tests available: 91 files under `sa/tests/test_*.{sh,sa}` plus focused native `*_test.sa` files.

## Proxy / OpenAI Compatibility

| Deno behavior group | SA coverage | Status |
| --- | --- | --- |
| Auth forwarding, client auth header stripping, base URL routing, model passthrough | `test_upstream_auth_headers.sh`, `test_chat_tools_capture.sh`, `test_responses_tools_capture.sh`, `test_empty_body_reject.sh` | Covered |
| Empty JSON body rejection before upstream call | `test_empty_body_reject.sh` | Covered |
| `/v1/models` passthrough and public models with protected `/rpc` | `test_http_contract.sa`, `test_upstream_auth_headers.sh` | Covered |
| Responses base URL missing or unavailable falls back to chat | `test_responses_missing_base_capture.sh`, `test_responses_fallback_capture.sh`, `test_responses_fallback_stream_events.sh` | Covered |
| Chat fallback strips responses-only fields and preserves user input/model | `test_responses_fallback_strips_responses_only_fields.sh`, `test_responses_missing_base_capture.sh` | Covered |
| Native Responses preserves responses-only fields; Gemini strips incompatible fields | `test_responses_gemini_capture.sh`, `test_responses_gemini_tool_history_no_fallback.sh` | Covered |
| Tool schema normalization for chat and responses, including namespace tools and non-function filtering | `test_chat_tools_capture.sh`, `test_responses_tools_capture.sh`, `test_responses_fallback_capture.sh` | Covered |
| Function-call history fallback and tool message name preservation | `responses_chat_fallback_request_test.sa`, `test_responses_fallback_tool_history.sh`; SCI focused fixture for `sa_deno_responses_chat_fallback_request` | Covered through SCI std request fallback |
| Chat fallback tool-call stream normalization, split chunks, `read` -> `exec_command`, `.env*` redaction, shell quoting | `test_responses_fallback_stream_tool_call_normalize.sh`, `test_responses_fallback_stream_tool_call_split.sh`, `test_responses_fallback_stream_tool_call_read_env_redact.sh`, `test_responses_fallback_stream_tool_call_read_shell_quote.sh` | Covered |
| Chat fallback namespaced tool-call de-flattening | `test_responses_fallback_stream_tool_call_namespace.sh` | Covered |
| Native Responses SSE MCP de-flatten and server denormalize | `test_responses_client_mcp_denormalize.sh`; SCI `std-smoke` native responses SSE fixture | Covered through SA std `sa_deno_responses_sse_normalize` |
| Request-side MCP server alias normalize | `test_responses_mcp_server_normalize.sh`; SCI `std-smoke` responses request fixture | Covered through SA std `sa_deno_responses_request_normalize` for mapped, double-wrapped, and generic aliases |

## Reasoning / Thinking / Progress

| Deno behavior group | SA coverage | Status |
| --- | --- | --- |
| Chat JSON fallback content/usage/tool calls/thought tags/`reasoning_content` -> Responses JSON | `test_responses_fallback_json_tool_call.sh`, `test_responses_fallback_json_tool_only.sh`, `test_responses_fallback_json_thought_tag.sh`, `test_responses_fallback_json_reasoning_content.sh`; SCI focused fixture for `sa_deno_chat_json_to_responses` | Covered through SA std `sa_deno_chat_json_to_responses` |
| Chat stream `thinking`/`reasoning_content` and split `<thought>` tags -> Responses reasoning events | `test_responses_fallback_stream_reasoning_content.sh`, `test_responses_fallback_stream_thought_tag.sh` | Covered through SA std `sa_deno_chat_sse_to_responses` |
| Chat fallback Responses SSE event ordering keeps Codex active message item across multiple text deltas | `responses_chat_fallback_request_test.sa`; SCI focused fixture for `sa_deno_chat_sse_to_responses` | Covered through SA std `sa_deno_chat_sse_to_responses` |
| Native Responses stream/JSON thinking normalization | `test_responses_native_thinking_stream.sh`, `test_responses_native_thinking_json.sh`; SCI focused fixtures for `sa_deno_responses_sse_normalize` and `sa_deno_responses_json_normalize` | Covered through SA std normalizers |
| Progress-only continuation in goal/code/default contexts | `test_responses_fallback_stream_progress_continuation.sh`, `test_responses_fallback_json_progress_continuation.sh`, `test_responses_native_progress_continuation.sh`, `test_responses_turn_context_goal_continuation.sh` | Covered |
| No continuation in ordinary mode, proposed plan output, normal final answer, or when `exec_command` is unavailable | `test_responses_fallback_stream_progress_no_continuation.sh`, `test_responses_fallback_json_progress_no_continuation.sh`, `test_responses_native_progress_no_continuation.sh`, `test_responses_fallback_stream_progress_no_exec_tool.sh` | Covered |

## Handlers / JSON-RPC / State

| Deno behavior group | SA coverage | Status |
| --- | --- | --- |
| Thread start/resume/fork/read/list/turns lifecycle, string thread ids, metadata `gitInfo`, fork inheritance, unarchive empty-turn response, inject before reset, dynamic realtime/attestation ids | `unit_tests.sa` native `@test`, `test_http_contract.sa`, `test_thread_start_fork_param_overrides.sh`, `test_thread_resume_envelope.sh`, `test_thread_rollback_numeric_num_turns.sh`, `test_thread_string_id_lifecycle.sh`, `test_inject_items_lifecycle.sh`, `test_realtime_uuid.sh`, `test_attestation_uuid.sh`, `test_turn_*`, `test_thread_*` | Covered for current Deno behavior |
| Standard JSON-RPC whitespace from normal JSON serializers preserves `id`, string ids, params, goal budget, and thread start envelope fields | `model_list_contract_test.sa` native `@test` `rpc accepts standard JSON whitespace and preserves params` | Covered through `/rpc` canonical JSON parse/stringify before dispatch |
| Escaped JSON-RPC `params` strings preserve quotes and backslashes when echoed in thin responses | `model_list_contract_test.sa`; SCI `std_smoke_core.zig` JSON-RPC params literal fixture | Covered through SCI std `sa_deno_jsonrpc_params_string_literal` |
| Turn context resolution from `thread-id` / `turn-id`, stale turn ignored, body-inferred modes | `test_responses_turn_context_goal_continuation.sh` | Covered |
| Goal lifecycle and current timestamps | `test_state.sa`, `test_goal_timestamp_current.sh`, `test_thread_timestamp_current.sh`, `test_turn_timestamp_current.sh`, `test_item_event_timestamp_current.sh` | Covered |
| `memory/reset` clears runtime state and emits wildcard close event | `test_state.sa`, `test_memory_reset_clears_state.sh` | Covered |
| Events bridge for thread, turn, item, fs, process, realtime, MCP, warnings | `test_events_contract.sh`, `test_mcp_tool_progress_event.sh`, `test_realtime_*`, `test_user_input_event_shape.sh`, `test_mcp_elicitation_event_shape.sh` | Covered |
| Request logging, disabled-by-default logs, auth failure previews | `test_api_request_log.sh`, `test_api_request_log_disabled_by_default.sh`, `test_auth_failure_log.sh` | Covered |
| Anonymous models while `/rpc` remains auth-protected | `test_http_contract.sa`, `test_upstream_auth_headers.sh` | Covered |
| Thin JSON-RPC compatibility responses for experimental features, remote control, login/logout, approvals, command/process control, plugin/install/list/read thin responses, model list, config requirements, app list | `test_rpc_misc_parity.sh`, `model_list_contract_test.sa` native `@test` | Covered |

## Env / Config / Std Facade

| Deno behavior group | SA coverage | Status |
| --- | --- | --- |
| `.env` load, `SA_PORT=28080`, null config semantics, config writes | `test_config.sa`, `test_server_config.sa`, `test_config_read_nulls.sh`, `test_config_write_cwd.sh` | Covered |
| Root restart entrypoint uses SA binary, preserves Deno on `27787`, and makes `--log-dir` effective for SA logging | `test_restart_sa_entry.sh` | Covered |
| Default project tasks use SA build/start, with Deno tasks explicit and namespaced | `test_project_tasks_sa_default.sh` | Covered |
| Deno-like JSON parsing/stringify/fetch/env/fs/process facade used by HubProxy | SCI focused C fixtures plus HubProxy focused tests | Covered enough for current HubProxy; JSON-RPC params string literal is now in SCI std, and remaining old byte-scan logic is cleanup, not current parity blocker |

## Deno Mock Harness

`src/responses_mock_test.ts` mostly tests the Deno-only mock response harness. SA service coverage exists for the externally visible response shapes through the proxy tests above. Do not port the mock harness one-for-one unless SA grows an equivalent mock-server utility.

## Real Upstream Smoke

`src/real_upstream_test.ts` contains three environment-dependent upstream smoke tests for chat, responses, and models. The SA equivalent is not a deterministic unit gate; verify manually or with a focused live smoke when credentials/network are available. Latest live SA check: the current SA binary builds with `compile_tokens=32143` and `instruction_count=15414`; it was started through the project `restart_sa.sh` entrypoint in an independent session, listens on `28080` while Deno remains on `27787`; a chat-completions request to `127.0.0.1:28080` with `.env` auth returned HTTP 200 with a real `chat.completion` body; and `codex exec --config model_provider=sa --config model="mimo-v2.5-pro" "hello"` completed through the SA provider with `Hey! How can I help you today?`. The latest SA binary is built without the old HubProxy import sentinel after the SCI verifier fix for trailing bodyless extern declarations, old fixed-response/fallback `_LEN` leftovers have been removed, and escaped JSON-RPC params now use SCI std `sa_deno_jsonrpc_params_string_literal`.

## Remaining Root Gaps

- Non-stream chat JSON -> Responses JSON fallback has been moved to SCI std via `sa_deno_chat_json_to_responses`; Responses request -> Chat fallback body construction, including top-level string input and tool-output name inheritance, now runs through SCI std `sa_deno_responses_chat_fallback_request`; chat SSE fallback, including stream tool-call normalization, has been moved to SCI std via `sa_deno_chat_sse_to_responses`; native Responses JSON thinking/message normalization has been moved to SCI std via `sa_deno_responses_json_normalize`; native Responses SSE thinking/MCP normalization now runs directly through `sa_deno_responses_sse_normalize`; JSON-RPC params string literal extraction now runs through SCI std `sa_deno_jsonrpc_params_string_literal`. The old unreferenced HubProxy chat JSON fallback, native SSE thinking, stream tool-call normalization, legacy request/tool fallback byte-scan helpers, old chat fallback tool-history builder, old id-fixed JSON-RPC wrappers, stale thread/start wrapper, trailing import sentinel workaround, fixed-response `_LEN` leftovers, and zero-reference fallback/RPC/event constants have been deleted. Remaining cleanup is to continue deleting or replacing older request/RPC helper code after each path is proven covered by SCI std.
- Token-budget auto-interruption remains listed in `todo.md` as a future optimization, but current Deno code does not enforce proxy token budgets either; Deno only stores `tokenBudget` in goal state and emits token usage notifications. Do not treat budget interruption as a Deno parity blocker unless the TypeScript implementation adds that behavior.
- Current SCI `zig build test` can fan out into broad compiler/plugin work. Use focused runtime build/C fixtures or direct `zig test --test-filter ...` for new std helpers; rerun wider smoke only when the compiler/plugin graph is stable enough for the requested change.
- Shell tests that rewrite `.env` and bind `28080` must run serially. Parallel execution creates false failures.
- `sa/tests/test_http_contract.sa` is a broad smoke contract, not a precise Deno snapshot. Keep assertions on stable externally visible shape; avoid pinning dynamic UUIDs, exact upstream text, or fields that Deno itself does not return.
