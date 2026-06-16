# SA JSON Macro Migration Progress

- Current progress: 100%
- Updated: 2026-06-11 Asia/Shanghai

## Latest Feature Progress

- SA Deno Parity Scope Correction and Native Test Stabilization: 100%
  - Reconfirmed the SA-vs-Deno scope: Deno remains the reference implementation, no Deno source or Deno runtime tests were changed or executed in this pass.
  - Rechecked the JSON-RPC method surface from source: Deno `src/handlers.ts` exposes 115 handled methods and SA has zero Deno methods missing; SA's two additional `mcpServer/resource/list` and `mcpServer/resource/templates` dispatch constants intentionally return Deno-shaped `unsupported method` errors.
  - Updated `todo.md` so SQLite persistence, token-budget auto-interruption, and multi-threaded reactor work are explicitly classified as non-Deno-parity future optimizations instead of remaining SA parity gaps.
  - Stabilized the native Code Index MCP tool-call contract tests by moving the `build-index` and safe-name `build_index` calls to separate `/tmp` output directories, avoiding shared `.code_index` output contention during full `sa test` runs.
  - Verified with native SA commands only: focused Code Index MCP filters, full `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic`, all `sa/tests/*.sa` via `sa test <file> --trace-panic` with 142 passed and 0 failed, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, and `sa build sa/main.sa -o sa/hubproxy`.

- SA Deno Parity Regression Audit and Validation: 100%
  - Performed a comprehensive regression audit of all Deno parity behavior groups defined in the matrix (including auth, empty body rejection, proxying, fallback normalizations, timestamps, thread/goal lifecycles, and events bridge).
  - Verified all 142 native contract tests in the SA test suite pass cleanly (sa test over all sa/tests/*.sa files) with zero errors.
  - Confirmed the compiled SA HubProxy binary builds and verifies successfully (sa build main.sa -o hubproxy).
  - Audited the remaining items in todo.md and confirmed they represent non-parity future optimizations (SQLite persistence, Token budget auto-interruption, and Multi-threaded reactor) rather than active Deno parity gaps.
  - Verified build and test correctness via git diff --check.

- SA thread lifecycle event native coverage expansion: 100%
  - Fixed `notify_thread_status_idle` in `sa/src/rpc_session.sa` to emit `threadId` through `json_writer_field_thread_id_string`, so `thread/status/changed` now preserves caller-provided string thread keys instead of falling back to numeric ids.
  - Added native `@test` coverage in `sa/tests/thread_rpc_contract_test.sa` for Deno-shaped notification frames covering `thread/status/changed`, `thread/name/updated` with string and null names, `thread/archived`, `thread/closed`, `thread/unarchived`, and `thread/goal/cleared`.
  - Verified all new lifecycle event frames through the native notification queue with external `threadId:"archive-thread"` and Deno payload fields such as idle status and nullable name; no `.sh` unit-test vehicle was used for this increment.
  - Revalidated the focused increment with `sa test sa/tests/thread_rpc_contract_test.sa --filter "thread lifecycle events" --trace-panic`, then full `sa test sa/tests/thread_rpc_contract_test.sa --trace-panic`, all current `sa/tests/*.sa` through native `sa test`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-thread-lifecycle-events-check`, and `git diff --check`.

- SA thread/goal timestamp live runtime isolated coverage: 100%
  - Added `sa/tests/test_thread_goal_timestamp_runtime_isolated.sh`, an isolated runtime contract that builds a temporary SA HubProxy binary, starts HubProxy from generated temporary `.env` files on a random localhost port, opens authenticated `/events`, and cleans up the process/temp tree on exit.
  - Verified live `/rpc` `thread/goal/set` repeated updates preserve the first goal `createdAt`, advance `updatedAt`, preserve external string `threadId`, and round-trip custom status plus numeric `tokenBudget`; verified `thread/goal/get` returns the same goal object.
  - Verified live `turn/start` timestamps stay stable through `thread/read`, and live `turn/interrupt` followed by `thread/read` preserves the turn `createdAt` while setting `completedAt == updatedAt` with interrupted status.
  - Verified live `/events` delivers Deno-shaped `thread/goal/updated` and `turn/completed` SSE frames with external string `threadId`, nested goal/turn objects, timestamp fields matching the live `/rpc` responses, and no Codex-only `turnId` on the goal-updated params.
  - Updated `sa/tests/deno_coverage_matrix.md` to count 13 isolated runtime contracts, mark thread/goal timestamp live `/rpc` and `/events` transport as covered, add the new script to the events evidence row, and remove thread/goal timestamp transport from the thin RPC remaining-evidence summary.
  - Revalidated with `bash sa/tests/test_thread_goal_timestamp_runtime_isolated.sh`, all 13 isolated runtime scripts, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-thread-goal-timestamp-runtime-check`, and `git diff --check`.

- SA command/process live runtime isolated coverage: 100%
  - Aligned `send_rpc_command_exec` in `sa/src/rpc_system.sa` with Deno's missing-command behavior: `command/exec` now defaults to running `true` instead of returning invalid params, matching the existing Deno handler and the SA `process/spawn` fallback.
  - Added `sa/tests/test_command_process_runtime_isolated.sh`, an isolated runtime contract that builds a temporary SA HubProxy binary, starts HubProxy from generated temporary `.env` files on a random localhost port, opens authenticated `/events`, and cleans up the process/temp tree on exit.
  - Verified live `/rpc` `command/exec` actually runs a subprocess in the supplied cwd, returns Deno-shaped `exitCode`/`stdout`/`stderr`, emits stdout/stderr `command/exec/outputDelta` SSE frames, and preserves `capReached:false` with base64 payloads decoded back to the process output.
  - Verified live `/rpc` `command/exec` without a `command` param defaults to `true` and returns `exitCode:0` with empty stdout/stderr.
  - Verified live `/rpc` `process/spawn` actually runs a subprocess, returns the supplied `processHandle`, emits stdout/stderr `process/outputDelta` plus `process/exited` SSE frames with exit code and captured output, and `process/kill` returns true once then false after the handle is removed.
  - Updated `sa/tests/deno_coverage_matrix.md` to count 12 isolated runtime contracts, mark command/process live `/rpc` and `/events` behavior as isolated-covered, and remove actual subprocess/runtime command behavior from the thin RPC remaining evidence list.
  - Revalidated with `bash sa/tests/test_command_process_runtime_isolated.sh`, all 12 isolated runtime scripts, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-command-process-runtime-check`, and `git diff --check`.

- SA RPC model/list live upstream passthrough isolated coverage: 100%
  - Routed `send_rpc_model_list` in `sa/src/rpc_system.sa` through the existing `/v1/models` upstream proxy handler, matching Deno's `model/list` behavior of returning the raw upstream models response instead of a JSON-RPC result wrapper or local config-derived model list.
  - Added `sa/tests/test_model_list_rpc_runtime_isolated.sh`, an isolated runtime contract that builds a temporary SA HubProxy binary, starts a mock upstream and HubProxy on random localhost ports from generated temporary `.env` files, and cleans up all processes/temp dirs on exit.
  - Verified authenticated live `/rpc` `model/list` calls `GET /v1/models` upstream, preserves upstream body/status/content-type, forwards configured `authorization: Bearer <OPENAI_API_KEY>` plus configured `x-api-key`, strips caller `authorization`/`x-api-key`/`api-key`, and does not return a JSON-RPC wrapper or local `DEFAULT_MODEL` data.
  - Updated `sa/tests/deno_coverage_matrix.md` to count 11 isolated runtime contracts and to mark live `/rpc model/list` upstream passthrough as covered; the thin RPC row now leaves actual subprocess/runtime command behavior as the remaining isolated-runtime evidence class.
  - Revalidated with `bash sa/tests/test_model_list_rpc_runtime_isolated.sh`, all 11 isolated runtime scripts, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-model-list-rpc-check`, and `git diff --check`.

- SA events SSE live transport isolated coverage: 100%
  - Added `sa/tests/test_events_runtime_isolated.sh`, an isolated runtime contract that builds a temporary SA HubProxy binary, starts it from a generated temporary `.env` on a random localhost port, opens authenticated `/events`, and cleans up the process/temp tree on exit.
  - Verified live `/events` returns `text/event-stream`, emits SSE keepalives, and delivers queue-backed SSE frames after the subscription cursor is established.
  - Triggered live `thread/start` and `turn/start` over `/rpc` while the SSE stream is open, then parsed received frames for `thread/started`, `thread/status/changed`, and `turn/started` with Deno-shaped `event:` names plus JSON `data` payloads containing `method` and `params`.
  - Covered external string thread key transport in the live SSE payloads: `thread/started` includes thread object `id`/`sessionId:"event-thread"`, `thread/status/changed` carries idle status, and `turn/started` carries `threadId:"event-thread"`, a full turn object, `collaborationModeKind:"plan"`, and input message items.
  - Updated `sa/tests/deno_coverage_matrix.md` to count 10 isolated runtime contracts and to mark live `/events` keepalive plus thread/turn start/status SSE transport as isolated-covered, while leaving additional live snapshots for item/fs/process/realtime/MCP/warning event families as optional runtime evidence over their existing native queue coverage.
  - Revalidated with `bash sa/tests/test_events_runtime_isolated.sh`, all 10 isolated runtime scripts, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-events-runtime-check`, and `git diff --check`.

- SA thread RPC live lifecycle isolated coverage: 100%
  - Added `sa/tests/test_thread_rpc_transport_runtime_isolated.sh`, an isolated runtime contract that builds a temporary SA HubProxy binary, starts it from a generated temporary `.env` on a random localhost port, and cleans up the process/temp tree on exit.
  - Verified authenticated live `/rpc` JSON-RPC envelopes for caller-provided string `threadId:"live-thread"` across `thread/start`, `thread/list`, `thread/read`, `turn/start`, `thread/resume`, `thread/rollback`, `thread/archive`, and `thread/unarchive` without using upstream services, fixed ports, root `.env`, or managed restart scripts.
  - Covered live response semantics for thread envelope prefix fields, external `id`/`sessionId`, active-list archive removal and unarchive restoration, `turn/start` explicit `params.collaborationMode.mode` normalization from `" Goal\t"` to `collaborationModeKind:"goal"`, input item persistence, resume turn serialization, and rollback returning empty `turns` after numeric `numTurns:1`.
  - Updated `sa/tests/deno_coverage_matrix.md` to count 9 isolated runtime contracts and to mark thread start/list/read/resume/rollback/archive/unarchive plus turn/start live `/rpc` transport as isolated-covered, while leaving live `/events`, fork/inject/realtime/attestation snapshots, goal transport, model-list passthrough, and subprocess/runtime command behavior as remaining evidence classes.
  - Revalidated with `bash sa/tests/test_thread_rpc_transport_runtime_isolated.sh`, all 9 isolated runtime scripts, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-thread-rpc-transport-check`, and `git diff --check`.

- SA RPC live envelope transport isolated coverage: 100%
  - Added `sa/tests/test_rpc_transport_runtime_isolated.sh`, an isolated runtime contract that builds a temporary SA HubProxy binary, starts it from a generated temporary `.env` on a random localhost port, and cleans up the process/temp tree on exit.
  - Verified authenticated live `/rpc` HTTP transport for `initialize`, `config/read`, `config/value/write`, `account/login/start`, and an unknown method error, including JSON-RPC `2.0` envelopes, string id preservation, numeric id preservation, success `result` payloads, and a Deno-shaped `method not found` error with code `-32601`.
  - Covered live cwd/config evidence through `initialize.codexHome` from the temporary working directory, `config/read` values from the generated `.env` (host, random port, chat base URL, default model, missing Responses base as `null`, hidden `authToken:null`, empty `layers`, empty `origins`), and `config/value/write` returning the temporary cwd as `filePath` with `status:"ok"` and `version:"1"`.
  - Updated `sa/tests/deno_coverage_matrix.md` to count 8 isolated runtime contracts and to mark deterministic live `/rpc` envelope transport plus live config read/write transport/cwd acquisition as isolated-covered, while keeping thread/turn/goal-specific live snapshots, model-list passthrough, and real command/subprocess behavior as separate remaining runtime evidence.
  - Revalidated with `bash sa/tests/test_rpc_transport_runtime_isolated.sh`, all 8 isolated runtime scripts, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-rpc-transport-check`, and `git diff --check`.

- SA config/env Deno port parsing native coverage expansion: 100%
  - Added Deno-compatible `PORT` parsing alongside legacy `SA_PORT` in `sa/src/config.sa`, while preserving existing `SA_PORT=28080` behavior.
  - Tightened production port parsing to reject non-numeric, zero, and >65535 values instead of truncating them into `u16`; `cfg_load` now fails when a parsed dotenv line reports an invalid port, matching Deno `loadConfig` rejection semantics.
  - Added `sa/tests/config_contract_test.sa` native `@test` coverage for `SA_PORT`, `PORT`, quote trimming, `CODEX_` key skipping, missing `RESPONSES_BASE_URL` as empty/null, and invalid port rejection through both `cfg_parse_line` and `cfg_load`.
  - Updated `sa/tests/deno_coverage_matrix.md` config evidence and focused SA test count to include the new default-gate config contract.
  - Revalidated with `sa test sa/tests/config_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-config-port-check`, and `git diff --check`.

- SA HTTP request/auth log file helper native coverage expansion: 100%
  - Added `write_log_body_to_dir_owned` in `sa/src/http_dispatch.sa(.sai)` and routed both production log writers through it so `mkdir + request-*.json path generation + text-file write` is shared and directly testable.
  - Added native `@test` coverage in `sa/tests/http_dispatch_contract_test.sa` that builds a Deno-shaped request-log body, writes it under `/tmp/hubproxy-native-log`, verifies the generated `request-*.json` path shape, reads the file back through `sa_std_fs_read_file`, and byte-compares the content to the generated body.
  - Updated `sa/tests/deno_coverage_matrix.md` request-logging evidence to record helper-level file persistence as native-covered while keeping live HTTP request-triggered header extraction/log creation as isolated runtime evidence.
  - Revalidated with `sa test sa/tests/http_dispatch_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-log-file-helper-check`, and `git diff --check`.

- SA HTTP upstream sensitive header-plan native coverage expansion: 100%
  - Added `build_upstream_forward_header_plan_owned` in `sa/src/http_dispatch.sa(.sai)` so the upstream header whitelist and Deno-sensitive dropped header names can be validated without live sockets, runtime ports, `.env`, or upstream capture servers.
  - Covered configured upstream `authorization: Bearer <key>`, configured `x-api-key`, JSON `content-type`, the dropped names `authorization`, `x-api-key`, `api-key`, `content-length`, `connection`, and `host`, plus the empty-api-key branch where auth headers are omitted.
  - Added native `@test` coverage in `sa/tests/http_dispatch_contract_test.sa` proving the helper does not include caller/client auth material or a naked `api-key` forwarded field.
  - Updated `sa/tests/deno_coverage_matrix.md` auth/model evidence to record sensitive header stripping as native-plan covered while keeping socket-level header capture, full non-sensitive passthrough, live base dispatch, and model passthrough as isolated runtime evidence.
  - Revalidated with `sa version` (`sa 0.0.3.3`), `sa test sa/tests/http_dispatch_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-header-plan-check`, and `git diff --check`.

- SA HTTP upstream route/base helper native coverage expansion: 100%
  - Extracted production `build_upstream_url_owned` in `sa/src/http_dispatch.sa(.sai)` so models/chat/responses/fallback upstream target suffix selection can be validated without live sockets, runtime ports, `.env`, or upstream capture servers.
  - Routed existing `/v1/models`, `/v1/chat/completions`, native `/v1/responses`, and responses chat-fallback branches through the helper while preserving the existing `path_join_owned(base, suffix)` behavior.
  - Added native `@test` coverage in `sa/tests/http_dispatch_contract_test.sa` proving `CHAT_BASE_URL` targets `/models` and `/chat/completions`, `RESPONSES_BASE_URL` targets `/responses`, and responses chat fallback targets `/chat/completions`.
  - Updated `sa/tests/deno_coverage_matrix.md` auth/base-routing/model/fallback evidence to record upstream route suffix selection as native-covered while keeping socket-level header capture, client-header stripping, live base dispatch, model passthrough, and live fallback transport as isolated runtime evidence.
  - Revalidated with `sa version` (`sa 0.0.3.3`), `sa test sa/tests/http_dispatch_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-upstream-url-helper-check`, and `git diff --check`.

- SA HTTP request-log body native coverage expansion: 100%
  - Extracted production `build_api_request_log_body_owned` in `sa/src/http_dispatch.sa(.sai)` so API request-log JSON bodies can be validated without live HTTP request handles, runtime ports, `.env`, or filesystem writes.
  - Routed `write_api_request_log` through the new helper after reading `authorization`, `x-api-key`, and `content-type`, preserving the existing runtime file-write path while moving request-log body shape into the default native gate.
  - Aligned request-log authorization preview with Deno `redactHeaders`: `Bearer ` is stripped only when it is a true prefix, while embedded `Bearer` text remains part of the preview token.
  - Added native coverage for Deno-shaped `kind:"request-log"`, route `path`, `method`, nested `headers`, dashed `x-api-key`, `content-type`, `bodyBytes`/`body`, `rawBodyBytes`/`rawBody`, and null body/rawBody branches; the test also rejects auth-failure-only camel-case `xApiKey` in request logs.
  - Updated `sa/tests/deno_coverage_matrix.md` request logging evidence to record request-log body semantics as native-covered while leaving actual file creation as isolated runtime evidence.
  - Revalidated with `sa version` (`sa 0.0.3.3`), `sa test sa/tests/http_dispatch_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-request-log-body-check`, and `git diff --check`.

- SA HTTP auth-failure log body native coverage expansion: 100%
  - Extracted production `build_auth_failure_log_body_owned` in `sa/src/http_dispatch.sa(.sai)` so auth-failure log JSON can be validated without live HTTP request handles, runtime ports, `.env`, or filesystem writes.
  - Routed `write_auth_failure_log` through the new helper after reading `authorization` and `x-api-key`, preserving the existing runtime file-write path while moving body shape into the default native gate.
  - Aligned the auth-failure body with Deno `writeAuthFailureLog`: `kind:"auth_failure"`, route `path`, Bearer-stripped `authorization` preview, camel-case `xApiKey` preview, and `expectedAuth` preview. The native test also rejects the request-log-only dashed `"x-api-key"` field in auth-failure logs.
  - Updated `sa/tests/deno_coverage_matrix.md` request logging evidence to record auth-failure route/body field semantics as native-covered while leaving actual file creation as isolated runtime evidence.
  - Revalidated with `sa version` (`sa 0.0.3.3`), `sa test sa/tests/http_dispatch_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-auth-log-body-check`, and `git diff --check`.

- SA HTTP public models route native coverage expansion: 100%
  - Extracted production `route_is_public_models_get` in `sa/src/http_dispatch.sa(.sai)` and routed `handle_http_request` through it for the pre-auth `/v1/models` branch.
  - Added native `@test` coverage in `sa/tests/http_dispatch_contract_test.sa` proving only `GET /v1/models` bypasses auth, while `POST /v1/models` and `GET /rpc` do not use the public-model bypass.
  - Updated `sa/tests/deno_coverage_matrix.md` auth/model rows to record native coverage for public-model route gating alongside the local Bearer/x-api-key auth matcher, while keeping live route/header boundary checks as isolated runtime work.
  - Revalidated with `sa test sa/tests/http_dispatch_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-http-route-auth-helper-check`, and `git diff --check`.

- SA HTTP local auth matcher native coverage expansion: 100%
  - Extracted production `auth_header_matches_token` in `sa/src/http_dispatch.sa(.sai)` and routed `check_auth` through it so local RPC auth now follows Deno's strict `Authorization: Bearer <token>` matcher instead of treating raw or embedded `Bearer` Authorization values as valid.
  - Adjusted `check_auth` to continue to the `x-api-key` check when Authorization is present but invalid, matching Deno's `authorization === Bearer token || x-api-key === token` behavior.
  - Added native `@test` coverage in `sa/tests/http_dispatch_contract_test.sa` for accepted Bearer auth, rejected raw Authorization, rejected embedded Bearer, rejected bad Bearer, and exact raw `x-api-key` token matching without opening a port or using live request handles.
  - Updated `sa/tests/deno_coverage_matrix.md` auth/model rows to record the new local auth matcher evidence while keeping socket-level header capture, client-header stripping, base URL routing, model passthrough, and live route/header boundaries as isolated runtime work.
  - Revalidated with `sa version` (`sa 0.0.3.3`), `sa test sa/tests/http_dispatch_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-http-auth-helper-check`, and `git diff --check`.

- SA item event timestamp envelope native coverage expansion: 100%
  - Added native notification-queue assertions in `sa/tests/item_rpc_contract_test.sa` for Deno-style `item/started` `startedAtMs` and `item/completed` `completedAtMs` fields, covering both the shared single-detail helper path and the reasoning-item path.
  - Kept the evidence pure SA native: no live `/events` stream, HTTP port, `.env`, or runtime transport dependency was needed; the assertions exercise the same production notification queue used by item lifecycle events.
  - Updated `sa/tests/deno_coverage_matrix.md` timestamp/event rows to record item started/completed timestamp fields in the default native gate while keeping live RPC/transport timestamp envelopes as isolated evidence.
  - Revalidated with `sa version` (`sa 0.0.3.3`), `sa test sa/tests/item_rpc_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-item-timestamp-check`, and `git diff --check`.

- SA sandbox/fuzzy/server-resolved thin RPC writer native coverage expansion: 100%
  - Extracted production writer helpers in `sa/src/rpc_system.sa(.sai)` for `windowsSandbox/setupStart`, `fuzzyFileSearch`, `fuzzyFileSearch/sessionStart`/`sessionStop`, and `serverRequest/resolved` payloads so these event-adjacent thin JSON-RPC responses can be tested without live `/rpc`, runtime ports, notification transport, or filesystem state.
  - Routed the existing send paths through the new helpers while preserving Deno payload semantics: sandbox setup echoes explicit modes and now defaults missing mode to Deno's `unelevated`, fuzzy search emits a query hit with `{path, score}` or an empty file list for missing query, fuzzy sessions emit `ok`/`stopped`, and server resolution echoes `threadId`/`requestId` with `resolved:true`.
  - Added native `@test` coverage in `sa/tests/rpc_emit_contract_test.sa` for explicit/default sandbox setup, fuzzy search hit and empty-query branches, fuzzy session ok/stopped branches, and server resolved thread/request echo.
  - Updated `sa/tests/deno_coverage_matrix.md` thin JSON-RPC evidence to include sandbox setup, fuzzy search/session, and server-resolved result payloads in the default native gate while keeping live `/rpc` envelope transport as isolated runtime evidence.
  - Revalidated with `sa version` (`sa 0.0.3.3`), `sa test sa/tests/rpc_emit_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-fuzzy-writer-check`, and `git diff --check`.

- SA runtime thin RPC writer native coverage expansion: 100%
  - Extracted production writer helpers in `sa/src/rpc_system.sa(.sai)` for `initialize`, `account/login/start`, `environment/add`, `review/start`, `mcpServer/oauth/login`, `mock/experimentalMethod`, and `externalAgentConfig/detect` payloads so these Deno-shaped thin JSON-RPC responses can be tested without live `/rpc`, runtime ports, wall-clock state, or direct cwd/plugin dependency in the tests.
  - Routed the existing send paths through the new helpers while preserving Deno behavior: injected `hubproxy/<version>` user agent and platform fields, login type defaulting to `apiKey`, environment path null fallback, review thread id echo, OAuth authorization URL writing with existing required-name validation, mock JSON node/null echo, and external-detect AGENTS/CONFIG item payloads built from cwd.
  - Added native `@test` coverage in `sa/tests/rpc_emit_contract_test.sa` for injected initialize fields, explicit/default login start, environment add with value/null path, review start, OAuth URL, mock node/null echo, and external detect cwd/path payloads.
  - Updated `sa/tests/deno_coverage_matrix.md` thin JSON-RPC evidence to include initialize/login/environment/review/oauth/mock/external-detect in the default native gate while keeping live `/rpc` transport and runtime subprocess behavior as isolated evidence.
  - Revalidated with `sa version` (`sa 0.0.3.3`), `sa test sa/tests/rpc_emit_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-thin-runtime-writer-check`, and `git diff --check`.

- SA plugin read/marketplace thin RPC writer native coverage expansion: 100%
  - Extracted production writer helpers in `sa/src/rpc_system.sa(.sai)` for `plugin/read`, `plugin/uninstall`, `marketplace/add`, `marketplace/remove`, and `marketplace/upgrade` payloads so these thin JSON-RPC shapes can be tested without live `/rpc`, runtime cwd dependency, or marketplace/plugin services.
  - Routed the existing send paths through the new helpers, preserving Deno defaults and echoes: plugin read default `marketplaceName:"local"`, `marketplacePath:null`, empty app/hook/MCP/skill arrays, summary name echo, uninstall plugin-name echo, marketplace add/remove installed root and marketplace name/source echo, upgrade selected-marketplaces array, and empty upgrade fallback.
  - Added native `@test` coverage in `sa/tests/rpc_emit_contract_test.sa` for plugin read/uninstall and marketplace add/remove/upgrade writer shapes, including the no-marketplace upgrade branch.
  - Updated `sa/tests/deno_coverage_matrix.md` thin JSON-RPC evidence to include plugin read/uninstall and marketplace add/remove/upgrade in the default native gate.
  - Revalidated with `sa test sa/tests/rpc_emit_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-marketplace-writer-check`, and `git diff --check`.

- SA plugin share/send-credits thin RPC writer native coverage expansion: 100%
  - Extracted production writer helpers in `sa/src/rpc_system.sa(.sai)` for `externalAgentConfig/import`, `account/chatgptAuthTokens/refresh`, `plugin/share/save`, `plugin/share/checkout`, `plugin/share/delete`, `plugin/share/updateTargets`, and `account/sendAddCreditsNudgeEmail` payloads so these Deno-shaped thin JSON-RPC responses can be tested without live `/rpc`, runtime ports, or wall-clock dependence.
  - Routed existing send paths through the helpers while preserving injected ISO timestamp fields, generated share remote id/URL fields, `discoverability:"UNLISTED"`, checkout marketplace/plugin echo, delete null fallback, updateTargets principals arrays, and send-credits status/email shape.
  - Fixed `sendCredits` email preservation by aligning the branch with the shared parser's `found == 1` result, matching Deno's `email: 'alice@example.com'` contract instead of falling through to `email:null` when the param is present.
  - Added native `@test` coverage in `sa/tests/rpc_emit_contract_test.sa` for timestamp writer injection, plugin share save/checkout/delete/updateTargets variants, and send-credits email/null branches; updated `sa/tests/deno_coverage_matrix.md` thin JSON-RPC evidence accordingly.
  - Revalidated with `sa test sa/tests/rpc_emit_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-plugin-share-writer-check`, and `git diff --check`.

- SA account/model thin RPC writer native coverage expansion: 100%
  - Extracted production writer helpers in `sa/src/rpc_system.sa(.sai)` for `model/capabilities`, `collaborationMode/list`, `hooks/list`, `account/read`, and `account/rateLimits/read` result payloads so these thin JSON-RPC shapes can be tested without live `/rpc`, runtime cwd dependency, or upstream services.
  - Routed the existing send paths through the new helpers, preserving model capability booleans, collaboration default/plan modes, hooks list cwd/errors/hooks/warnings arrays, account email/plan/auth fields, and rate-limit null/default fields.
  - Added native `@test` coverage in `sa/tests/rpc_emit_contract_test.sa` for configured and default account/rate-limit values, model capability flags, collaboration mode list entries, and hooks list payload shape.
  - Fixed two production JSON key length constants caught by the new tests: `requiresOpenaiAuth` is 18 bytes and `rateLimitsByLimitId` is 19 bytes, matching the Deno handler field names exactly.
  - Revalidated with `sa test sa/tests/rpc_emit_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-account-model-writer-check`, and `git diff --check`.

- SA command/process result writer native coverage expansion: 100%
  - Extracted production writer helpers in `sa/src/rpc_system.sa(.sai)` for command/process thin JSON-RPC result payloads so result shapes can be tested without running subprocesses, binding ports, or depending on live `/rpc` transport.
  - Routed `command/exec` through `json_writer_write_command_exec_result`, preserving Deno-shaped `exitCode`, `stdout`, and `stderr` fields after the existing process execution path gathers output.
  - Routed `process/spawn` through `json_writer_write_process_spawn_result`, preserving the Deno-shaped `processHandle` result, and routed generic bool result writes through `json_writer_write_bool_field_result` for `process/kill`-style `ok` payloads.
  - Added native `@test` coverage in `sa/tests/rpc_emit_contract_test.sa` for command exec result fields, process spawn handle fields, and both `ok:true`/`ok:false` bool result shapes.
  - Revalidated with `sa test sa/tests/rpc_emit_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-command-process-writer-check`, and `git diff --check`.

- SA remote-control status native coverage expansion: 100%
  - Added native `@test` coverage in `sa/tests/rpc_emit_contract_test.sa` for the production `json_writer_write_remote_status_params` helper, proving `remoteControl/enable`-style params emit Deno-shaped `status`, `serverName`, `installationId`, and `environmentId` fields.
  - Covered `remoteControl/status/read` defaults without live `/rpc`: missing params now assert `status:"disabled"`, `serverName:"local"`, `installationId:"local-installation"`, and `environmentId:null` through the same production writer.
  - Added notification-queue coverage for `notify_remote_status`, verifying a Deno-shaped `remoteControl/status/changed` SSE frame with the connected status and remote identifiers.
  - Revalidated with `sa test sa/tests/rpc_emit_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-remote-status-check`, and `git diff --check`.

- SA thin RPC result writer native coverage expansion: 100%
  - Extracted production writer helpers in `sa/src/rpc_emit.sa(.sai)` for thin JSON-RPC result payloads so default native tests can validate shapes without a live HTTP request object or fixed runtime port.
  - Added `sa/tests/rpc_emit_contract_test.sa` coverage for empty `data`/`contents` arrays, empty data pages with `nextCursor:null`, config requirements nulls, plugin install unavailable auth policy, marketplace empty arrays, experimental reasoning feature pages, account cancel/logout booleans, approval and MCP elicitation accept results, permissions defaults, and user-input continue answers.
  - Kept live `/rpc` envelope transport, model list passthrough, remote-control state transitions, and command/process-control runtime behavior as remaining isolated-runtime evidence rather than default-gate behavior.
  - Revalidated with `sa test sa/tests/rpc_emit_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-thin-rpc-check`, and `git diff --check`.

- SA upstream auth header native coverage expansion: 100%
  - Extracted `build_upstream_auth_header_owned` in `sa/src/http_dispatch.sa(.sai)` and routed models, chat, and responses proxy paths through it for configured upstream Authorization header construction.
  - Added native `@test` coverage in `sa/tests/http_dispatch_contract_test.sa` proving upstream auth is `Bearer <configured API key>` and does not contain a caller/client token.
  - Kept socket-level header capture, client-header stripping, and base URL passthrough as isolated-runtime evidence because they require a live HTTP client/server boundary.
  - Revalidated with `sa test sa/tests/http_dispatch_contract_test.sa --trace-panic`.

- SA config/log native parity coverage expansion: 100%
  - Extracted production writer helpers in `sa/src/rpc_system.sa(.sai)` for `config/read` and `config/value/write` result payloads so config null/write contracts can be tested without a live HTTP request object or runtime cwd call.
  - Added native `@test` coverage in `sa/tests/rpc_parse_contract_test.sa` proving `config/read` emits Deno-shaped numeric `port`, string `host`/`chatBaseUrl`/`defaultModel`, null `responsesBaseUrl`/`authToken`, and empty `layers`/`origins`.
  - Added native `@test` coverage for the `config/value/write` result object (`filePath`, `status:"ok"`, `version:"1"`) and retained live cwd acquisition as isolated-runtime evidence rather than default-gate behavior.
  - Extended `sa/tests/http_dispatch_contract_test.sa` coverage for request logging beyond token preview: timestamped `request-*.json` path construction and default no-op behavior for API/auth log writers when no log dir/request handle is present are now in the native gate.
  - Revalidated the focused parser contract with `sa test sa/tests/rpc_parse_contract_test.sa --trace-panic`.

- SA realtime/attestation dynamic-id native coverage expansion: 100%
  - Extracted small production writer helpers in `sa/src/rpc_system.sa(.sai)` for realtime start result payloads, realtime started event params, and attestation result payloads so the dynamic-id contracts can be tested without a live HTTP request object or runtime port.
  - Added native `@test` coverage in `sa/tests/mcp_rpc_contract_test.sa` proving realtime start uses plugin-generated UUID v4-shaped turn ids, propagates the supplied timestamp consistently across `createdAt`/`updatedAt`/`startedAt`/`completedAt`, keeps completed/empty-items result fields, and does not regress to the old `sa-realtime` placeholder.
  - Verified realtime started event params use a plugin-generated UUID v4-shaped `realtimeSessionId`, the notification queue path no longer emits the fixed session placeholder, and `attestation/generate` result writing emits unique `attest_<uuid-v4>` tokens instead of `attest_sa`.
  - Revalidated with `sa test sa/tests/mcp_rpc_contract_test.sa --filter "realtime start native" --trace-panic`, `sa test sa/tests/mcp_rpc_contract_test.sa --filter "attestation writer" --trace-panic`, and full `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic`.

- SA thread inject-items native coverage expansion: 100%
  - Added native `@test` coverage in `sa/tests/thread_rpc_contract_test.sa` for the Deno-style `thread/inject_items` core path without starting HubProxy or touching runtime ports.
  - Verified the production parser/resolver path resolves caller-provided string `threadId`, extracts the `items` array JSON, creates a new turn, stores the injected message item, and emits the response-shape core fields `threadId` plus `injectedCount:1`.
  - Verified injected item lifecycle notifications through the shared state notification queue: `item/started`, `rawResponseItem/completed`, and `item/completed`, each preserving external `threadId`, the new turn id, and injected item content.
  - Revalidated with `sa test sa/tests/thread_rpc_contract_test.sa --filter "inject_items" --trace-panic` and full `sa test sa/tests/thread_rpc_contract_test.sa --trace-panic`.

- SA thread resume envelope native coverage expansion: 100%
  - Added native `@test` coverage in `sa/tests/thread_rpc_contract_test.sa` for the Deno-style `thread/resume` response writer path without starting HubProxy or touching runtime ports.
  - Verified the production resume envelope writer emits state-owned `model`, `modelProvider`, `cwd`, `serviceTier:null`, empty `instructionSources`, default `approvalPolicy`, `approvalsReviewer`, and `sandbox`, plus a nested thread object with caller-provided string `id`/`sessionId`.
  - Verified dynamic stored turns are serialized into the nested thread object, preserving turn id, `collaborationModeKind:"goal"`, and message input items through `json_writer_write_thread_object(..., include_turns=2)`.
  - Revalidated with `sa test sa/tests/thread_rpc_contract_test.sa --filter "resume writer" --trace-panic` and full `sa test sa/tests/thread_rpc_contract_test.sa --trace-panic`.

- SA thread/goal notification native coverage expansion: 100%
  - Added native `@test` coverage in `sa/tests/thread_rpc_contract_test.sa` for Deno-shaped `thread/started` notification frames carrying a full thread object with caller-provided string `id`/`sessionId`, model provider, model, cwd, and empty `turns` fields.
  - Added native `@test` coverage in `sa/tests/goal_rpc_contract_test.sa` for Deno-shaped `thread/goal/updated` notification frames carrying the external `threadId` at both params and nested goal levels, objective/status/token budget fields, zero token usage, and no Codex-only `turnId` field.
  - Revalidated with `sa test sa/tests/thread_rpc_contract_test.sa --trace-panic` and `sa test sa/tests/goal_rpc_contract_test.sa --trace-panic`.

- SA thread lifecycle native coverage expansion: 100%
  - Added native `@test` coverage in `sa/tests/thread_rpc_contract_test.sa` for Deno-style archive/unarchive active-list behavior and thread object serialization.
  - Verified archived threads drop out of `state_thread_list_active`, unarchived threads reappear, and serialized thread objects preserve caller-provided string `id`/`sessionId`, `forkedFromId`, `gitInfo`, `name`, `modelProvider`, `ephemeral`, and empty `turns` fields through production session writer helpers.
  - Revalidated with `sa test sa/tests/thread_rpc_contract_test.sa --trace-panic`.

- SA chat fallback reasoning native coverage: 100%
  - Added native `@test` coverage in `sa/tests/responses_chat_fallback_request_test.sa` for the installed deno plugin `sa_deno_plugin_chat_json_to_responses` and `sa_deno_plugin_chat_sse_to_responses` paths matching Deno chat fallback reasoning behavior.
  - Verified chat JSON fallback preserves `reasoning_content`, extracts `<thought>` text into reasoning output, preserves visible assistant text, keeps tool calls, and normalizes usage fields through the default SA native gate.
  - Verified chat SSE fallback emits reasoning deltas for `reasoning_content` and `thinking`, merges split `<thought>` tags into reasoning text before visible answer output, and preserves Deno ordering between reasoning completion and message deltas.
  - Revalidated with `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic`.

- SA JSON-RPC whitespace native coverage: 100%
  - Added pure SA native parser/envelope coverage for standard JSON serializer whitespace that was previously represented only by ignored runtime-client contracts.
  - Verified `rpc_extract_id_token` preserves numeric ids and raw string ids, `rpc_jsonrpc_lookup_key` strips quoted string ids for lookup, and production parser helpers preserve spaced `threadId`, `model`, `modelProvider`, `cwd`, `ephemeral:false`, and numeric `tokenBudget` values.
  - Verified `json_writer_write_thread_envelope_prefix` emits Deno/Codex thread-start envelope fields from the same spaced JSON-RPC body: `model`, `modelProvider`, `cwd`, `approvalPolicy`, `approvalsReviewer`, and `sandbox`.
  - Revalidated with `sa test sa/tests/rpc_parse_contract_test.sa --trace-panic`.
- SA item event family native coverage: 100%
  - Fixed `notify_item_detail_events` ownership cleanup so the SA compiler accepts the Deno-style item detail event dispatch path again.
  - Added native `@test` coverage for Deno item notification order: `item/started` -> item detail event(s) -> `rawResponseItem/completed` -> `item/completed`.
  - Covered item sub-event families through the state notification queue: `item/agentMessage/delta`, `item/reasoning/summaryTextDelta`, `item/reasoning/summaryPartAdded`, `item/reasoning/textDelta`, `item/plan/delta`, `item/fileChange/patchUpdated`, `item/commandExecution/outputDelta`, and `item/mcpToolCall/progress`.
  - Revalidated with `sa test sa/tests/item_rpc_contract_test.sa --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-item-events-check`, `git diff --check`, and a full sweep of all 16 current `sa/tests/*.sa` native test files.
- SA fs/process/realtime event native coverage expansion: 100%
  - Added pure SA native event-frame coverage for Deno-shaped `fs/changed`, `process/outputDelta`, `process/exited`, and realtime started/item/audio/transcript/closed notifications.
  - Verified watch id and changed paths, process stdout base64 delta and cap flags, process exited stdout/stderr fields, realtime `v2` startup session id, audio/text item payloads, transcript delta/done role fields, and realtime close thread id through the shared state notification queue.
  - Revalidated with `sa test sa/tests/mcp_rpc_contract_test.sa --filter "fs process" --trace-panic` and full `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic`.
- SA event helper native coverage expansion: 100%
  - Added pure SA native event-frame coverage for Deno-shaped `item/tool/requestUserInput`, `mcpServer/elicitation/request`, `mcpServer/startupStatus/updated`, `windows/worldWritableWarning`, and `skills/changed` notifications.
  - Verified user-input question defaults, MCP elicitation form/requestedSchema fields including nullable `turnId`, startup `{name,status,error}` fields, world-warning empty scan payload, and skills-changed empty params through the shared state notification queue.
  - Revalidated with `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic`.
- SA turn started/completed event object native coverage: 100%
  - Fixed the native event contract to assert Deno's external thread key semantics for `turn/started` and `turn/completed` notifications instead of SA's internal numeric thread id.
  - Verified both notifications include a full `turn` object with id, status, timestamps, `collaborationModeKind`, `completedAt`, and empty `items` fields matching the Deno state notification shape.
  - Revalidated with `sa test sa/tests/turn_rpc_contract_test.sa --filter "events include" --trace-panic` and full `sa test sa/tests/turn_rpc_contract_test.sa --trace-panic`.
- SA goal/turn timestamp native coverage: 100%
  - Added native `@test` coverage for Deno-compatible goal timestamp semantics: repeated `state_goal_set` keeps the original `createdAt`, advances `updatedAt`, and updates objective/status/tokenBudget on the same thread key.
  - Added native `@test` coverage for interrupted turn timestamp semantics: `state_turn_interrupt` preserves `createdAt`, sets `completedAt`, and keeps `completedAt == updatedAt` with interrupted status.
  - Updated the Deno coverage matrix to record these state-level timestamp contracts while keeping live RPC event-envelope evidence as a separate remaining gap.
  - Revalidated with `sa test sa/tests/goal_rpc_contract_test.sa --trace-panic`, `sa test sa/tests/turn_rpc_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa build sa/main.sa -o /tmp/hubproxy-timestamp-check`, `git diff --check`, and no `.env`/Deno `src`/Codex source diff.
- SA project task default native coverage: 100%
  - Added native `@test` coverage in `sa/tests/project_tasks_contract_test.sa` for the root `deno.json` task contract.
  - Verified default `dev`, `start`, and `check` tasks use the SA build/restart path, while Deno commands remain explicit under `deno:dev`, `deno:start`, and `deno:check`.
  - Kept the check read-only: no service restart, no `.env` modification, and no fixed-port dependency.
  - Updated the Deno coverage matrix from missing to covered for current native project task configuration evidence.
  - Revalidated with `sa test sa/tests/project_tasks_contract_test.sa --trace-panic`, all current `sa/tests/*.sa`, `sa build sa/main.sa -o /tmp/hubproxy-project-tasks-check`, `git diff --check`, and no `.env`/Deno `src`/Codex source diff.
- SA native Responses thinking normalization coverage: 100%
  - Added native `@test` coverage for the installed deno plugin native Responses JSON/SSE normalizers matching Deno's `type:"thinking"` and `reasoning_content` behavior.
  - Verified native Responses SSE `response.output_item.done` with `type:"thinking"` is normalized to `type:"reasoning"` while preserving `native stream think` and removing the raw thinking type.
  - Verified native Responses JSON output items and assistant message `reasoning_content` are emitted as reasoning items preserving `native json think` and `message json think`, while keeping the visible `answer` output text.
  - Updated the Deno coverage matrix from partially covered to covered for current native/plugin normalization fixtures; live proxy capture remains a separate isolated-runtime evidence class.
- SA chat fallback env-read redaction and shell-quote native coverage: 100%
  - Added native `@test` coverage for the installed deno plugin `sa_deno_plugin_chat_sse_to_responses` covering the historical `.env*` read-redaction and single-quote shell-quoting contracts without adding shell tests or touching runtime ports.
  - Verified `.env` read tool calls normalize to `exec_command` with a redacted `sed -E` command and do not regress to `cat '/tmp/demo/.env'`.
  - Verified read paths containing single quotes keep a shell-quoted `cat` command and do not emit the raw unescaped `it'works.txt` path segment.
  - Updated the Deno coverage matrix row from partially missing fixture evidence to covered for native/plugin normalization; live proxy streaming remains a separate isolated-runtime evidence class.
- SA native Responses/Gemini field-scope parity: 100%
  - Added native `@test` coverage for the SA production `build_responses_proxy_body` path matching Deno's native Responses routing behavior.
  - Verified non-Gemini Responses requests preserve Responses-only fields: `store`, `prompt_cache_key`, `include`, `reasoning`, and `input`.
  - Verified Gemini Responses mode strips only Gemini-incompatible `store` and `prompt_cache_key`, while preserving `include`, `reasoning`, and `input`.
  - Updated the Deno coverage matrix row from missing to covered for native request-body construction; live proxy capture remains a separate isolated-runtime evidence gap.
- SA request/auth log redaction native coverage: 100%
  - Extracted `token_preview_value_owned` so request/auth log token redaction is testable without constructing a live HTTP request object or touching runtime ports.
  - Kept production `json_writer_field_token_preview`, `write_api_request_log`, and `write_auth_failure_log` on the same Deno-style preview semantics through the shared helper.
  - Added native `@test` coverage for no token (`none`), long bearer token previews (`abc...789 (len=15)`), and short token previews (`abc...abc (len=3)`).
  - Updated the Deno coverage matrix from missing to partially covered for request logging: redaction semantics are now in the native gate; actual file creation/no-log-by-default/auth route behavior remains separate runtime evidence.
- SA chat fallback stream tool-call normalization native coverage: 100%
  - Added native `@test` coverage for the installed deno plugin `sa_deno_plugin_chat_sse_to_responses` matching Deno's chat-fallback stream tool-call behavior.
  - Verified `read` tool-call deltas are converted to `exec_command` with `cat '/tmp/demo.txt'` and direct `exec_command.command` arguments are converted to `cmd`.
  - Verified split chat tool-call chunks are merged by index before normalization, preserving `call_pwd` and emitting a single `arguments:{"cmd":"pwd"}` payload without falling back to `Tool unknown is unavailable`.
  - Updated the Deno coverage matrix from missing to partially covered for this row; `.env*` read redaction and additional shell-quoting edge cases remain separate evidence gaps.
- SA empty JSON proxy body native coverage: 100%
  - Aligned SA's `body_is_blank` helper with Deno's `body.trim()`-style local empty-body rejection by treating vertical tab and form feed as blank ASCII whitespace in addition to space/tab/LF/CR.
  - Added native `@test` coverage in `http_dispatch_contract_test.sa` for empty, whitespace-only, JSON object, and whitespace-prefixed JSON bodies without requiring a running HubProxy or touching upstream services.
  - Updated the Deno coverage matrix row from missing to covered for the production blank-body detection gate used before chat/responses upstream calls.
- SA Responses turn-context Deno parity native coverage: 100%
  - Extracted the Deno request-context mode resolution core into `response_request_context_mode_from_ids`, so the production HTTP wrapper and native tests use the same thread-id/turn-id resolution logic.
  - Added native `@test` coverage for string `thread-id` state lookup, numeric thread id fallback, stale `turn-id` fallback to body inference, current-turn state mode precedence, and body-inferred goal/code/default collaboration modes.
  - Verified the focused Responses suite now passes with 37 native tests and updated the Deno coverage matrix row from missing to covered for request-context mode resolution.
- SA Responses namespace tool preservation native coverage: 100%
  - Added native `@test` coverage for the SA production `build_responses_proxy_body` path, proving Responses namespace tools are expanded into upstream function tools without dropping Code Index or Mimir entries.
  - The test covers generic namespace expansion for `mcp__code_index__build_index`, `mcp__code_index__search`, and `mcp__mimir__mimir_search`, and asserts no `type:"namespace"` tool survives in the upstream request body.
  - This narrows the current real-log MCP issue: if a logged outbound request lacks Code Index tools, the missing tools were not caused by SA's Responses proxy-body namespace expansion layer.
- SA native regression sweep after MCP stdio fix: 100%
  - Re-ran every currently present `sa/tests/*.sa` file with `sa test <file> --trace-panic`; all default native tests passed, with `model_list_contract_test.sa` correctly reporting 3 ignored runtime-client contracts instead of executing against a live port.
  - Verified the ignored runtime-client contracts still compile with `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic` (compiled 3 selected tests).
  - Revalidated build and plugin layers with `sa build sa/main.sa -o sa/hubproxy` and `zig test src/hubproxy_compat.zig` (28 passed).
  - Confirmed no `.env` or Hub Deno `src/` diff and `git diff --check` remains clean; no restart script or 28080 runtime was touched.
- SA coverage matrix evidence cleanup: 100%
  - Updated `sa/tests/deno_coverage_matrix.md` to reflect the current worktree evidence: 10 `.sa` files and 0 `.sh` files under `sa/tests`, with default coverage coming from native `sa test` rather than deleted shell contracts.
  - Marked `model_list_contract_test.sa` runtime-client cases as ignored/compile-only evidence instead of default native `@test` coverage, preventing the matrix from reporting live-port contracts as unit tests.
  - Updated MCP rows to point at current native/plugin evidence (`mcp_rpc_contract_test.sa`, `responses_chat_fallback_request_test.sa`, `test_http_contract.sa`, and plugin Zig tests), including real Code Index `describe-index`, `build-index`, and safe-name `build_index` execution.
  - Cleaned the Proxy, Responses, Reasoning, Handlers, Env, and Real Upstream rows so deleted shell tests are historical migration references, not current `Covered` default-gate evidence; rows without current native/plugin coverage now say so explicitly.
  - Clarified that previous live upstream checks are historical and were not rerun in the current non-invasive pass; future live checks must avoid `.env` edits and fixed-port ownership assumptions.
  - Verified old misleading phrases no longer appear and `git diff --check` remains clean.

- SA native Responses flat MCP argument parity: 100%
  - Fixed SA deno plugin native Responses JSON output normalization so `function_call.arguments.server` is denormalized like Deno even when request-aware namespace logic preserves a flat `mcp__server__tool` name.
  - Extended the SSE event path to denormalize `arguments.server` for all native tool-call kinds before applying `output_kind`, matching Deno's generic tool-call normalization branch.
  - Reused the existing JSON argument parser/normalizer instead of string patching, preserving invalid/non-object arguments unchanged.
  - Added Zig and SA native `@test` coverage proving flat request tools keep flat names while `arguments.server:"mcp__code_index__"` becomes `code-index`.
  - Verified with `zig test src/hubproxy_compat.zig` (27 passed), `zig build`, installed deno plugin library/interface sync, `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` (27 passed), all current `sa/tests/*.sa`, and `sa build sa/main.sa -o sa/hubproxy`.
- SA native Responses namespace-context parity: 100%
  - Added request-aware native Responses JSON/SSE normalization APIs in the SA deno plugin so HubProxy can match Deno's `extractNamespacesFromBody(rawBody ?? responsesRequestBody)` behavior.
  - Updated SA `/v1/responses` JSON and SSE response normalization to pass the original inbound Responses request for namespace decisions; SSE still uses the existing request-context body for progress-continuation gating.
  - Preserved the older context-free plugin APIs for compatibility while adding `_with_request` externs/macros and installed-plugin interface sync.
  - Tightened native MCP namespace splitting so flat `mcp__server__tool` names are only unflattened when the original request declares a top-level `type:"namespace"` tool, matching Deno; flat function tool declarations stay flat and only receive `output_kind`.
  - Added Zig and SA native `@test` coverage for both JSON and SSE request-aware behavior: flat tool request keeps flat names, namespace request emits `name` plus `namespace`.
  - Verified with `zig test src/hubproxy_compat.zig` (26 passed), `zig build`, installed deno plugin library/interface sync, `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` (26 passed), all current `sa/tests/*.sa`, and `sa build sa/main.sa -o sa/hubproxy`.
- SA Responses request-normalize Deno scope parity: 100%
  - Tightened the SA deno plugin request-normalization path to match Deno's `maybeRewriteRequestBody` scope: only top-level `input` array items are normalized for Responses tool-call/history behavior.
  - Removed the previous whole-tree recursive normalization side effect, so nested metadata objects that happen to contain `type:"reasoning"` or JSON-string `arguments.server` are preserved exactly like Deno.
  - Added SA native `@test` coverage proving nested metadata keeps its reasoning content and raw `Code Index` server argument while top-level input normalization still works.
  - Verified with `zig test src/hubproxy_compat.zig` (25 passed), `zig build`, installed deno plugin library sync, `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` (24 passed), `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` (2 passed), `sa test sa/tests/unit_tests.sa --trace-panic` (7 passed), and `sa build sa/main.sa -o sa/hubproxy`.
- SA native Responses MCP request-history parity: 100%
  - Aligned the SA deno plugin request-normalization path with Deno's `normalizeResponseInputItems`: native `mcp_tool_call` entries are converted to upstream-compatible `function_call` entries with the MCP server prefix applied generically.
  - Added `call_id` based name tracking for Responses input arrays so `function_call_output`, `custom_tool_call_output`, `tool_search_output`, and `mcp_tool_call_output` items can receive the matching tool name when the client omits it.
  - Preserved existing behavior for reasoning content stripping, namespace flattening, and MCP server argument normalization without hardcoding MCP server or tool names.
  - Added SA native `@test` coverage for native MCP request conversion plus output-name backfill through the installed deno plugin API.
  - Verified with `zig test src/hubproxy_compat.zig` (25 passed), `zig build`, installed deno plugin library sync, `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` (23 passed), `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` (2 passed), `sa test sa/tests/unit_tests.sa --trace-panic` (7 passed), and `sa build sa/main.sa -o sa/hubproxy`.
- SA native Responses MCP namespace parity: 100%
  - Aligned SA's native `/v1/responses` JSON and SSE normalization with Deno for flat MCP function-call names: `mcp__server__tool` is now emitted as `name:"tool"`, `namespace:"mcp__server__"`, and `output_kind:"function_call_output"`.
  - Kept the implementation generic by parsing the MCP namespace prefix; no MCP server or tool names are hardcoded.
  - Added native SSE coverage for both `response.output_item.added` and `response.output_item.done` so streaming Responses cannot regress to flat MCP names before or after tool-call completion.
  - Verified through the installed SA deno plugin and real temporary SA HubProxy `/v1/responses` requests against a mock upstream for JSON plus streaming SSE `added`/`done`: flat `mcp__code_index__search` and `mcp__code_index__build_index` no longer appear in the client response, and the Deno-style namespace fields are present on both events.
  - Revalidated with `zig test src/hubproxy_compat.zig` (23 passed), `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` (19 passed), `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` (2 passed), `sa test sa/tests/unit_tests.sa --trace-panic` (7 passed), and `sa build sa/main.sa -o sa/hubproxy`.
- SA request log timestamp parity: 100%
  - Aligned SA request log filenames with Deno's sortable timestamp+UUID pattern by writing `request-<sanitized-iso>-<uuid>.json` instead of `request-<uuid>.json`.
  - Reused existing SA/plugin helpers (`plugin_date_now_iso`, `plugin_random_uuid`, `sanitize_log_stamp_owned`, `build_concat5_owned`, `path_join_owned`) and kept log body JSON on SA std JSON writer helpers.
  - Verified with an isolated temporary-port SA HubProxy process and temporary `HUBPROXY_LOG_DIR`: consecutive `/v1/models` and `/rpc` requests produced distinct timestamped `request-*.json` files with `:` and `.` sanitized out of the timestamp segment.
  - Revalidated with `sa build sa/main.sa -o sa/hubproxy`, `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` (18 passed), `sa test sa/tests/unit_tests.sa --trace-panic` (7 passed), and `sa build sa/tests/test_http_contract.sa`.
- SA request log file persistence: 100%
  - Changed SA request/auth logging from fixed filenames (`request-sa-api.json`, `request-sa-auth.json`) to per-request `request-<uuid>.json` filenames, matching Deno's non-overwriting request log behavior.
  - Reused existing SA helpers and plugin APIs (`plugin_random_uuid`, `build_concat3_owned`, `path_join_owned`) instead of manual path string assembly.
  - Verified with an isolated temporary-port SA HubProxy process and temporary `HUBPROXY_LOG_DIR`: `/v1/models`, authenticated `/rpc`, and failed-auth `/rpc` produced four distinct `request-*.json` files containing request-log/auth_failure entries and redacted auth previews.
  - Revalidated with `sa build sa/main.sa -o sa/hubproxy`, `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` (18 passed), `sa test sa/tests/unit_tests.sa --trace-panic` (7 passed), and `sa build sa/tests/test_http_contract.sa`.
- SA startup/proxy log readability: 100%
  - Replaced non-ASCII proxy route log arrows with ASCII `->` in SA HTTP dispatch logs so terminals no longer render `Proxy â /v1/...` during `/v1/models`, `/v1/chat/completions`, and `/v1/responses` requests.
  - Suppressed misleading config probe noise when bootstrap falls back from `../.env` to `.env`; successful fallback startup now logs `[config] loaded` without a preceding fake `cannot read .env file` error, matching Deno's optional dotenv behavior.
  - Verified with an isolated temporary-port SA HubProxy process: startup and `/v1/models` logs contain `Proxy -> /v1/models` and no `cannot read`, `â`, or Unicode arrow markers.
  - Revalidated with `sa build sa/main.sa -o sa/hubproxy`, `sa test sa/tests/responses_chat_fallback_request_test.sa --filter mcp --trace-panic` (9 passed), and `sa test sa/tests/test_config.sa --trace-panic` compile/run check.
- SA MCP resource/read execution failure propagation: 100%
  - Matched Codex behavior for `mcpServer/resource/read`: when a configured MCP server is found but the actual MCP stdio resource read fails, SA now returns JSON-RPC 500 `mcp operation failed` instead of masking the failure as an empty compatibility resource response.
  - Extended the SA deno plugin status `4` failure path from tool calls to resource reads, and mapped the SA RPC handler to the shared JSON-RPC error sender.
  - Added Zig coverage plus SA native `@test` coverage for matched-server resource-read execution failure, and verified a temporary isolated SA HubProxy process against the real Code Index MCP server with a missing resource URI; the runtime response was HTTP 500 with a JSON-RPC error.
  - Revalidated with `zig test src/hubproxy_compat.zig` (22 passed), `sa build sa/main.sa -o sa/hubproxy`, `sa test sa/tests/responses_chat_fallback_request_test.sa --filter mcp --trace-panic` (9 passed), `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` (18 passed), `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` (2 passed), `sa test sa/tests/unit_tests.sa --trace-panic` (7 passed), and `sa build sa/tests/test_http_contract.sa`.
- SA MCP execution failure propagation: 100%
  - Matched Codex/Deno behavior for `mcpServer/tool/call`: when a configured MCP server is found but the actual MCP stdio `tools/list` or tool call execution fails, SA now returns a JSON-RPC 500 error instead of masking the failure as a compatibility success fallback.
  - Added plugin status `4` for real MCP execution failure and mapped it in `sa/src/rpc_system.sa` to `mcp operation failed` through the shared JSON-RPC error sender.
  - Revalidated with `zig test src/hubproxy_compat.zig` (21 passed), `sa build sa/main.sa -o sa/hubproxy`, `sa test sa/tests/responses_chat_fallback_request_test.sa --filter mcp --trace-panic` (8 passed), `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` (17 passed), `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` (2 passed), and `sa test sa/tests/unit_tests.sa --trace-panic` (7 passed).
- SA MCP installed tool-name parity: 100%
  - Rebuilt the Code Index MCP index through the live MCP plugin path to verify the upstream server and local MCP transport.
  - Updated the SA deno plugin to resolve requested MCP tool names against the server-advertised `tools/list` names, so safe function-name forms such as `build_index` map to real MCP tool names such as `build-index` without hardcoding tool identities.
  - Refreshed the installed deno SA plugin with `sa plugin install --dev` and revalidated SA native MCP tests, including the real Code Index rebuild-index contract.
- SA MCP safe-name runtime contract: 100%
  - Added SA native `@test` coverage that calls the installed Code Index MCP server using `tool:"build_index"` and verifies the plugin resolves it to the advertised `build-index` tool through `tools/list` before executing.
  - Revalidated the MCP-focused SA test subset: 8 passed, 0 failed, including real `build-index` and safe-name `build_index` rebuild paths.
- SA MCP safe-name collision guard: 100%
  - Tightened the SA deno plugin tool-name resolver so safe-name remapping only happens when the advertised MCP `tools/list` names produce a unique normalized match; ambiguous matches keep the requested name and let the MCP server return the explicit error.
  - Added Zig coverage for ambiguous tool names such as `build-index` plus `build_index`, preventing accidental first-match dispatch while preserving exact-name calls.
- SA MCP tool/call Codex parity: 100%
  - Moved required `threadId/server/tool` validation into the SA deno plugin's JSON parser path instead of SA string scanning.
  - Added a distinct plugin status for invalid MCP tool-call params so SA returns `invalid params` while preserving fallback for unavailable real MCP execution.
  - Added plugin coverage for formatted JSON and missing `threadId`, plus SA native `@test` coverage for the invalid-param status.
- SA MCP status pagination Codex parity: 100%
  - Made `mcpServerStatus/list` cursor parsing strict: cursor must be a numeric string and limit must be a non-negative integer, matching Codex protocol handling.
  - Made `detail` strict to the Codex enum values `full` and `toolsAndAuthOnly` instead of treating unknown values as `full`.
  - Added a distinct invalid-param plugin status for bad status-list pagination instead of silently falling back to cursor `0`.
  - Added plugin and SA native `@test` coverage for invalid cursor and detail handling.
- SA MCP resource/read required-param Codex parity: 100%
  - Made `mcpServer/resource/read` require both `server` and `uri`, matching Codex `McpResourceReadParams` where only `threadId` is optional.
  - Added a distinct invalid-param plugin status for missing `server`/`uri` so SA no longer falls back to an empty resource response.
  - Added plugin and SA native `@test` coverage for missing required resource-read params.
- SA MCP oauth/login required-param Codex parity: 100%
  - Made `mcpServer/oauth/login` require nonempty `params.name`, matching Codex `McpServerOauthLoginParams`.
  - Kept the existing authorizationUrl response for valid requests while returning `invalid params` for missing, empty, or non-string names.
  - Added SA native `@test` coverage for the OAuth login parameter validator.
- SA MCP reload response Codex parity: 100%
  - Changed `config/mcpServer/reload` response from the Deno mock-style `{name,reloaded}` payload to Codex `McpServerRefreshResponse {}`.
  - Added a shared writer helper for the empty reload response object.
  - Added SA native `@test` coverage for the exact `{}` response shape.

## Completed
- Extracted first shared module: `sa/src/json_support.sa(.sai)`.
- Moved common JSON/buffer/copy/dispose helpers out of `sa/main.sa` without changing behavior.
- Kept existing SA compile and focused regression flow intact for the first modularization step.
- Extracted shared RPC parsing module: `sa/src/rpc_parse.sa(.sai)`.
- Moved RPC id extraction, JSON-RPC param lookup, string/number/bool/null helpers, thread-id resolution, and `bytes_has` out of `sa/main.sa`.
- Removed the duplicated parse implementations from `sa/main.sa` and switched the build to the new module boundary.
- Extracted shared events/SSE infrastructure module: `sa/src/events.sa(.sai)`.
- Moved RPC builder helpers, SSE frame assembly, notify queue helpers, and detached `/events` stream worker infrastructure out of `sa/main.sa`.
- Switched `main.sa` to consume the new event infrastructure module while preserving existing notification behavior.
- Extracted shared response emission module: `sa/src/rpc_emit.sa(.sai)`.
- Moved common HTTP JSON senders, JSON-RPC envelope writers, generic wrapped writer/raw send helpers, and JSON-RPC error envelope emission out of `sa/main.sa`.
- Switched `main.sa` to consume the new emission module without changing existing RPC handler behavior.
- Folded shared JSON writer helpers into `sa/src/rpc_emit.sa(.sai)`.
- Moved reusable field writers for empty arrays/objects, begin-field helpers, default/null fallback helpers, param passthrough helpers, and realtime voice item writing out of `sa/main.sa`.
- Extracted proxy/plugin helper module: `sa/src/proxy.sa(.sai)`.
- Moved plugin buffer/free helpers, UUID/date plugin facades, HTTP response full-body reader, and client response normalization helpers out of `sa/main.sa`.
- Removed stranded SSE normalization labels from `main.sa` after the module boundary change.
- Extended `sa/src/proxy.sa(.sai)` with shared proxy decision/fallback helpers.
- Moved tools/drop-key checks, Gemini request detection, and chat fallback request builder out of `sa/main.sa`.
- Extended `sa/src/proxy.sa(.sai)` with top-level proxy body builders.
- Moved Gemini responses drop-key filtering plus `build_responses_proxy_body` and `build_chat_proxy_body` out of `sa/main.sa`.
- Revalidated SA build and focused runtime regressions after the proxy-body module extraction.
- Extended `sa/src/proxy.sa(.sai)` with proxy tool normalization writer families.
- Moved responses/chat tool writer helpers, namespace expansion, and normalized tools array emitters out of `sa/main.sa`.
- Revalidated SA build plus focused runtime regressions after the proxy tool-normalization extraction; `sa/main.sa` dropped to `16055` lines.
- Extracted low-coupling RPC/system module: `sa/src/rpc_system.sa(.sai)`.
- Moved low-coupling RPC notifications and handlers out of `sa/main.sa`, including thread elicitation helpers, fs watch/unwatch, external import, experimental enablement, realtime start/thread, sandbox setup, fuzzy search/session, and server request resolved responses.
- Preserved existing external helper names for shared bool/status RPC responses so remaining legacy handlers can keep calling the same surface during the staged split.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the system-handler extraction; `sa/main.sa` dropped to `14914` lines.
- Extracted shared session JSON helper module: `sa/src/rpc_session.sa(.sai)`.
- Moved thread/goal/turn JSON field writers and object writers out of `sa/main.sa`, including thread-id fallback writing, goal status/budget fields, mode fields, thread git info, thread object emission, and turn object/status/completion emitters.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the session-helper extraction; `sa/main.sa` dropped to `14069` lines.
- Extended `sa/src/rpc_session.sa(.sai)` with shared session-domain notifications.
- Moved thread/goal/turn notification emitters out of `sa/main.sa`, including thread started/status/name updates, generic thread-id notifications, goal updated notifications, and turn started/completed/diff/plan notifications.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the session-notification extraction; `sa/main.sa` dropped to `13759` lines.
- Extended `sa/src/rpc_session.sa(.sai)` with shared goal response handlers.
- Moved `send_rpc_goal_null_with_id`, `send_rpc_goal_obj`, and `send_rpc_goal_clear` out of `sa/main.sa` into the session module while preserving the existing response envelope and goal-cleared notification payload shape.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the goal-handler extraction; `sa/main.sa` dropped to `13634` lines.
- Extended `sa/src/rpc_session.sa(.sai)` with low-coupling thread response handlers.
- Moved `send_rpc_thread_archive` and `send_rpc_thread_name_set` out of `sa/main.sa` into the session module while preserving the existing archived/name response payloads and thread notification behavior.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the thread-handler extraction; `sa/main.sa` dropped to `13507` lines.
- Extended `sa/src/rpc_session.sa(.sai)` with thread read/metadata helpers and handlers.
- Moved `send_rpc_thread_read`, `send_rpc_thread_unarchive`, `send_rpc_thread_metadata_update`, and `apply_thread_git_info_from_body` out of `sa/main.sa` into the session module while preserving the existing thread object payloads, unarchive behavior, preview updates, and gitInfo handling.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the thread-read/metadata extraction; `sa/main.sa` dropped to `13222` lines.
- Extended `sa/src/rpc_session.sa(.sai)` with low-coupling turn response handlers.
- Moved `send_rpc_turns_list`, `send_rpc_turn_items_list`, `send_rpc_thread_rollback`, `send_rpc_turn_start`, and `send_rpc_turn_interrupt` out of `sa/main.sa` while preserving cursor fields, turn object payloads, rollback readback, start fallback timestamps, and interrupt notification/response behavior.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the turn-handler extraction; `sa/main.sa` dropped to `12936` lines.
- Extended `sa/src/rpc_parse.sa(.sai)` and `sa/src/rpc_session.sa(.sai)` with steer/item support.
- Moved `rpc_extract_param_array_json` into the parse module, then moved `send_rpc_turn_steer` plus turn input/injected item DOM notification helpers into the session module while preserving JSON DOM parsing, item notification order, and turn steer response shape.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the steer/item extraction; `sa/main.sa` dropped to `12207` lines.
- Extended `sa/src/rpc_session.sa(.sai)` with memory reset handling.
- Moved `send_rpc_memory_reset` out of `sa/main.sa` into the session module while preserving runtime state reset, thread closed notification for `*`, and reset/threadId response payload shape.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the memory-reset extraction; `sa/main.sa` dropped to `12182` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with low-coupling read-only system responses.
- Moved `send_rpc_model_capabilities` and `send_rpc_collaboration_mode_list` out of `sa/main.sa` into the system module while preserving model capability booleans and default/plan collaboration mode payloads.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the read-only system response extraction; `sa/main.sa` dropped to `12119` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with read-only hooks/model/account/config responses.
- Moved `send_rpc_hooks_list`, `send_rpc_model_list`, `send_rpc_account_read`, `send_rpc_rate_limits`, `send_rpc_chatgpt_tokens_refresh`, and `send_rpc_config_read` out of `sa/main.sa` while preserving config-derived fields, default account fallbacks, rate-limit shape, and token refresh timestamp handling.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the hooks/model/account/config extraction; `sa/main.sa` dropped to `11817` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with basic plugin responses.
- Moved `send_rpc_plugin_read` and `send_rpc_plugin_uninstall` out of `sa/main.sa` while preserving marketplace/path defaults, plugin summary fields, and uninstall response payloads.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the basic plugin response extraction; `sa/main.sa` dropped to `11686` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with plugin share checkout/delete responses.
- Moved `send_rpc_plugin_share_checkout` and `send_rpc_plugin_share_delete` out of `sa/main.sa` while preserving marketplace/plugin defaults and optional remotePluginId handling.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the plugin share checkout/delete extraction; `sa/main.sa` dropped to `11603` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with marketplace mutation responses.
- Moved `send_rpc_marketplace_add`, `send_rpc_marketplace_remove`, and `send_rpc_marketplace_upgrade` out of `sa/main.sa` while preserving installedRoot, alreadyAdded, selectedMarketplaces, and upgradedRoots response shapes.
- Revalidated `sa build sa/main.sa` plus focused runtime regressions after the marketplace response extraction; `sa/main.sa` dropped to `11471` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with initialization/login/environment/review/oauth/mock responses.
- Moved `send_rpc_initialize`, `send_rpc_account_login_start`, `send_rpc_environment_add`, `send_rpc_review_start`, `send_rpc_oauth_login`, and `send_rpc_mock_experimental` out of `sa/main.sa` while preserving Deno facade metadata, config-derived OAuth URL, path/null fallback, and JSON DOM echo behavior.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh` after this system-handler extraction; `sa/main.sa` dropped to `11162` lines.
- Extended `sa/src/rpc_emit.sa(.sai)` with common fixed-shape RPC response helpers.
- Moved empty array/data page responses, config requirements, plugin marketplace/install fallbacks, experimental feature listing, account login state, approval/mcp elicitation accepts, permissions defaults, user input continuation, and realtime voice listing out of `sa/main.sa` while keeping all output on SA std JSON writer helpers.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh` after the common response-helper extraction; `sa/main.sa` dropped to `10880` lines.
- Extended `sa/src/events.sa(.sai)` with MCP/user-input/world-warning/startup notification helpers.
- Moved `notify_mcp_tool_progress`, `notify_user_input_request`, `notify_mcp_elicitation_request`, `notify_world_warning_params`, and `notify_mcp_startup_params` out of `sa/main.sa`, with explicit dependencies on RPC parsing, plugin UUID/free helpers, and SA std JSON writer helpers.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh` after the event-notification extraction; `sa/main.sa` dropped to `10596` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with plugin share save/update responses.
- Moved `send_rpc_plugin_share_save`, `send_rpc_plugin_share_update_empty`, `send_rpc_plugin_share_update_node`, and `send_rpc_plugin_share_update_targets` out of `sa/main.sa` while preserving config-derived share URL generation, remote id prefixing, discoverability defaults, and principals array DOM validation.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh` after the plugin share save/update extraction; `sa/main.sa` dropped to `10422` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with low-coupling MCP helper responses.
- Moved `send_rpc_mcp_reload` and `send_rpc_item_tool_call` out of `sa/main.sa` while preserving name/default extraction, reload acknowledgement shape, contentItems text payloads, and success flag output via SA std JSON writer helpers.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh` after this MCP helper extraction; `sa/main.sa` dropped to `10360` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with `mcp/tool/call` response handling.
- Moved `send_rpc_mcp_tool_call` out of `sa/main.sa` while preserving content array output, structuredContent ok/tool/server payload, isError flag, and meta thread/turn/item fields including null turn fallback.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh` after this MCP tool-call extraction; `sa/main.sa` dropped to `10211` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with filesystem RPC handlers.
- Moved `send_rpc_fs_read`, `send_rpc_fs_write`, `send_rpc_fs_mkdir`, `send_rpc_fs_readdir`, `send_rpc_fs_metadata`, `send_rpc_fs_remove`, and `send_rpc_fs_copy` out of `sa/main.sa` while preserving Deno facade file operations, JSON DOM directory entry wrapping, base64 read/write payloads, and existing JSON-RPC error/ok response shapes.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, `sa/tests/test_turn_interrupt_lifecycle.sh`, and `sa build sa/tests/test_http_contract.sa` after the filesystem handler extraction; `sa/main.sa` dropped to `9784` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with command/process RPC handlers.
- Moved `command/exec`, `process/spawn`, `process/kill`, command argv DOM parsing, base64 output delta encoding, and command/process notification helpers out of `sa/main.sa` while preserving Deno command facade usage, cwd/process id/handle defaults, stdout/stderr payloads, process state deletion semantics, and existing event/response shapes.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, `sa/tests/test_turn_interrupt_lifecycle.sh`, and `sa build sa/tests/test_http_contract.sa` after the command/process handler extraction; `sa/main.sa` dropped to `8869` lines.
- Extended `sa/src/rpc_session.sa(.sai)` with remaining low-coupling thread/session response handlers.
- Moved thread start/list/loaded/resume/inject/simple-id/shell-command/memory-mode handlers plus thread envelope, dynamic turns array, and goal status parse helpers out of `sa/main.sa` while preserving thread object payloads, injected item notifications, shell warning emission, approval/sandbox defaults, and camelCase goal status parsing.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, `sa/tests/test_turn_interrupt_lifecycle.sh`, and `sa build sa/tests/test_http_contract.sa` after this session-handler extraction; `sa/main.sa` dropped to `8117` lines.
- Extended `sa/src/rpc_system.sa(.sai)` with remaining low-coupling system and MCP status responses.
- Moved send-credits, attestation generation, external config detection, config write acknowledgement, remote status notification/response, MCP status listing, and MCP resource read fallback handlers out of `sa/main.sa` while preserving config-derived paths, attestation token prefixing, remote status payloads, and MCP resource/status response shapes.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, `sa/tests/test_turn_interrupt_lifecycle.sh`, and `sa build sa/tests/test_http_contract.sa` after this system-tail extraction; `sa/main.sa` dropped to `7755` lines.
- Added request-context/progress fallback module: `sa/src/request_context.sa(.sai)`.
- Moved collaboration-mode request parsing, turn mode normalization, request-context body builders, progress-only SSE continuation, canonicalized body forwarding, chat fallback SSE conversion, and unsafe Gemini fallback detection out of `sa/main.sa` while keeping output on SA std JSON writer helpers.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, `sa/tests/test_turn_interrupt_lifecycle.sh`, and `sa build sa/tests/test_http_contract.sa` after the request-context extraction; `sa/main.sa` dropped to `5871` lines, meeting the planned `<=6000` threshold.
- Added `rpc_extract_param_string` as the public string-param parser wrapper in `sa/src/rpc_parse.sa(.sai)`.
- Replaced business-module direct calls to the lower-level `rpc_extract_string_after(...)` with the wrapper; direct lower-level extractor use is now confined to `sa/src/rpc_parse.sa`.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, `sa/tests/test_turn_interrupt_lifecycle.sh`, and `sa build sa/tests/test_http_contract.sa` after the parser API boundary cleanup.
- Extended `sa/src/rpc_session.sa(.sai)` with goal-domain request handlers.
- Moved `thread/goal/set`, `thread/goal/get`, and `thread/goal/clear` state mutation/readback, notification emission, status parsing, budget null handling, and response emission out of `sa/main.sa`; the main RPC switch now delegates these methods to session handlers.
- Removed goal-only dead constants from `sa/main.sa`; `sa/main.sa` dropped to `5639` lines while staying below the planned `<=6000` threshold.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, `sa/tests/test_turn_interrupt_lifecycle.sh`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_goal_status_budget_null_parity.sh`, `sa/tests/test_goal_timestamp_current.sh`, `sa/tests/test_goal_update_timestamp_parity.sh`, and `sa/tests/test_turn_goal_event_thread_id_parity.sh` after this goal-handler extraction.
- Extended `sa/src/rpc_session.sa(.sai)` with the `turn/start` request handler.
- Moved turn creation, input item DOM extraction/storage, collaboration-mode normalization, turn notifications, and missing-thread error response out of `sa/main.sa`; the main RPC switch now delegates `turn/start` to the session module.
- Removed the now-dead `FB_KEY_INPUT` constants from `sa/main.sa`; `sa/main.sa` dropped to `5586` lines.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, `sa/tests/test_turn_interrupt_lifecycle.sh`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_turn_start_collaboration_mode_rpc_parity.sh`, `sa/tests/test_turn_start_missing_thread.sh`, `sa/tests/test_turn_items_list.sh`, `sa/tests/test_turn_steer_items.sh`, and `sa/tests/test_thread_resume_envelope.sh` after this turn/start extraction.
- Extended `sa/src/rpc_session.sa(.sai)` with the `thread/start` request handler.
- Moved config default model/cwd/provider resolution, optional thread string id parsing, ephemeral parsing, thread creation, provider/ephemeral state updates, start notifications, and start response emission out of `sa/main.sa`; the main RPC switch now delegates `thread/start` to the session module.
- Removed the now-dead `DEFAULT_OPENAI` constants from `sa/main.sa`; `sa/main.sa` dropped to `5520` lines.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, `sa/tests/test_turn_interrupt_lifecycle.sh`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_thread_start_fork_param_overrides.sh`, and `sa/tests/test_thread_string_id_lifecycle.sh` after this thread/start extraction.
- Extended `sa/src/rpc_session.sa(.sai)` with the `thread/fork` request handler.
- Moved source-thread lookup, fork override parsing, fork state creation, preview/name/gitInfo copy, started/status notifications, not-found error response, and fork response emission out of `sa/main.sa`; the main RPC switch now delegates `thread/fork` to the session module.
- Removed the now-dead model/cwd/provider/ephemeral parser constants from `sa/main.sa`; `sa/main.sa` dropped to `5412` lines.
- Revalidated `sa build sa/main.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, `sa/tests/test_turn_interrupt_lifecycle.sh`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_thread_start_fork_param_overrides.sh`, and `sa/tests/test_thread_string_id_lifecycle.sh` after this thread/fork extraction.
- Added HTTP dispatch helper module: `sa/src/http_dispatch.sa(.sai)`.
- Moved `body_is_blank`, `check_auth`, and `scan_chunk_for_tokens` out of `sa/main.sa` while preserving auth logging strings, request body blank detection, and streaming token scan behavior.
- Updated the empty-body JSON-RPC error text to match the existing contract while continuing to emit it through the shared JSON response path.
- Removed the now-dead HTTP dispatch constants/helpers from `sa/main.sa`; `sa/main.sa` dropped to `5114` lines.
- Revalidated `sa build sa/main.sa`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh`; confirmed no diff under `.env`, `deno`, or `codex`.
- Extended `sa/src/http_dispatch.sa(.sai)` with request/auth log writers.
- Moved `json_writer_field_token_preview`, `write_auth_failure_log`, and `write_api_request_log` out of `sa/main.sa` while preserving token preview masking, log file names, request header capture, and JSON emission via SA std JSON writer helpers.
- Removed log-only dead constants from `sa/main.sa`; `sa/main.sa` dropped to `4719` lines.
- Revalidated `sa build sa/main.sa`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh`; confirmed no diff under `.env`, `deno`, or `codex`.
- Extended `sa/src/http_dispatch.sa(.sai)` with builder-response emission.
- Moved `send_builder_response` out of `sa/main.sa` while preserving the existing RPC builder data/length handoff and shared JSON response sender path.
- Revalidated `sa build sa/main.sa`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh`; `sa/main.sa` dropped to `4682` lines and `.env`/`deno`/`codex` remained untouched.
- Extended `sa/src/http_dispatch.sa(.sai)` with `/v1/models` proxy handling.
- Moved models upstream URL construction, auth/header forwarding, response body/header forwarding, bad-gateway handling, missing-config response, and request/API logging out of `sa/main.sa`; top-level routing now delegates `/v1/models` to `handle_models_proxy` and retains request cleanup.
- Removed models-only dead constants from `sa/main.sa`; `sa/main.sa` dropped to `4533` lines.
- Revalidated `sa build sa/main.sa`, `sa test sa/tests/model_list_contract_test.sa --compile-only`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh`; confirmed no diff under `.env`, `deno`, or `codex`.
- Extended `sa/src/http_dispatch.sa(.sai)` with `/v1/chat/completions` proxy handling.
- Moved chat body loading/logging, empty-body response, upstream request construction, auth/header forwarding, JSON/non-SSE forwarding, SSE streaming, token scanning, and stream cleanup out of `sa/main.sa`; top-level routing now delegates `/v1/chat/completions` to `handle_chat_proxy`.
- Removed chat-only dead log/buffer constants from `sa/main.sa`; `sa/main.sa` dropped to `4163` lines.
- Revalidated `sa build sa/main.sa`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh`; confirmed no diff under `.env`, `deno`, or `codex`.
- Extended `sa/src/http_dispatch.sa(.sai)` with `/v1/responses` proxy handling.
- Moved responses body loading, empty-body handling, Gemini/proxy body normalization, responses/chat fallback routing, JSON/SSE normalization, upstream forwarding, and streaming response emission out of `sa/main.sa`; top-level routing now delegates `/v1/responses` to `handle_responses_proxy`.
- Revalidated `sa build sa/main.sa`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh`; `sa/main.sa` dropped to `3335` lines and `.env`/`deno`/`codex` remained untouched.
- Extended `sa/src/http_dispatch.sa` with top-level HTTP accept/request dispatch.
- Moved `accept_and_handle_http_request` and `handle_http_request` out of `sa/main.sa`, including method/path extraction, public health/ready/models checks, auth gate, route dispatch, RPC/events delegation, and 404 handling; `sa/main.sa` now delegates accepted requests like the TypeScript entrypoint delegates to `handleHttpWithState`.
- Revalidated `sa build sa/main.sa`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh`; `sa/main.sa` dropped to `2971` lines and `.env`/`deno`/`codex` remained untouched.
- Added JSON-RPC dispatcher module: `sa/src/rpc_dispatch.sa(.sai)`.
- Moved the full JSON-RPC method constant set and `handle_rpc_request` dispatcher out of `sa/main.sa`, including thread/turn/goal, filesystem/process, plugin/marketplace, MCP, config/account, permissions, and remote/status delegation branches.
- Added `sa/src/hub_modules.sa` as the implementation bundle required by the current SA import/linking model, keeping `sa/main.sa` free of business-module implementation imports.
- Reduced `sa/main.sa` to `92` lines: it now mirrors `src/main.ts` structurally by loading config, initializing state, starting the HTTP server, and delegating each accepted request to `accept_and_handle_http_request`.
- Revalidated `sa build sa/main.sa`, `sa build sa/tests/test_http_contract.sa`, `sa/tests/test_responses_plan_large_tools_no_crash.sh`, and `sa/tests/test_turn_interrupt_lifecycle.sh`; confirmed no diff under `.env`, `deno`, or `codex`.
- Added `sa/tests/lib/runtime_env.sh` with shared non-destructive runtime-test helpers for free port allocation, temporary `.env` generation, HubProxy startup, readiness waiting, and process cleanup.
- Added `sa/tests/run_default_contracts.sh` as the default local runtime-contract gate; it builds SA and runs only the non-destructive shell contract set.
- Migrated `test_responses_plan_large_tools_no_crash.sh` and `test_turn_interrupt_lifecycle.sh` to use the runtime helper and random isolated ports by default.
- Updated `sa/README.md` to separate default non-destructive local contracts from legacy isolated fixed-port contracts.
- Revalidated `bash sa/tests/run_default_contracts.sh`, `sa test sa/tests/unit_tests.sa --trace-panic`, `sa test sa/tests/test_strings.sa --trace-panic`, `sa test sa/tests/test_state.sa --trace-panic`, `sa test sa/tests/test_config.sa --trace-panic`, `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic`, `sa test sa/tests/model_list_contract_test.sa --compile-only`, `sa build sa/tests/test_server_config.sa`, and `sa build sa/tests/test_deno_compat.sa`; confirmed no diff under `.env`, `deno`, or `codex`.
- Migrated `test_account_email.sh`, `test_account_plan_type.sh`, and `test_marketplace_installed_root.sh` from root `.env`/fixed `28080` mutation to the shared non-destructive runtime helper.
- Added the three migrated RPC/account/marketplace contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated `bash sa/tests/test_account_email.sh`, `bash sa/tests/test_account_plan_type.sh`, `bash sa/tests/test_marketplace_installed_root.sh`, and `bash sa/tests/run_default_contracts.sh`; confirmed no diff under `.env`, `deno`, or `codex`.
- Migrated `test_hooks_list_cwd.sh`, `test_config_read_nulls.sh`, `test_chatgpt_tokens_refresh_iso.sh`, and `test_initialize_runtime_info.sh` from root `.env`/fixed `28080` mutation to the shared non-destructive runtime helper.
- Added the four migrated hooks/config/account/initialize contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated `bash sa/tests/test_hooks_list_cwd.sh`, `bash sa/tests/test_config_read_nulls.sh`, `bash sa/tests/test_chatgpt_tokens_refresh_iso.sh`, `bash sa/tests/test_initialize_runtime_info.sh`, and `bash sa/tests/run_default_contracts.sh`; confirmed no diff under `.env`, `deno`, or `codex`.
- Migrated `test_attestation_uuid.sh`, `test_plugin_share_save_uuid.sh`, `test_external_detect_cwd.sh`, and `test_realtime_uuid.sh` from root `.env`/fixed `28080` mutation to the shared non-destructive runtime helper.
- Added the four migrated attestation/plugin/external/realtime contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated `bash sa/tests/test_attestation_uuid.sh`, `bash sa/tests/test_plugin_share_save_uuid.sh`, `bash sa/tests/test_external_detect_cwd.sh`, `bash sa/tests/test_realtime_uuid.sh`, and `bash sa/tests/run_default_contracts.sh`; confirmed no diff under `.env`, `deno`, or `codex`.
- Migrated `test_api_request_log.sh`, `test_api_request_log_disabled_by_default.sh`, and `test_auth_failure_log.sh` from root `.env`/fixed `28080` mutation to the shared non-destructive runtime helper.
- Restored `/v1/responses` request logging in `sa/src/http_dispatch.sa`; the refactor had kept chat/models/rpc/auth request logging but missed the responses route.
- Updated `sa/tests/run_default_contracts.sh` to build `main.sa -o hubproxy`, matching the binary used by runtime shell contracts.
- Revalidated `sa build sa/main.sa -o sa/hubproxy`, `bash sa/tests/test_api_request_log.sh`, `bash sa/tests/test_api_request_log_disabled_by_default.sh`, `bash sa/tests/test_auth_failure_log.sh`, and `bash sa/tests/run_default_contracts.sh`; confirmed no diff under `.env`, `deno`, or `codex`.
- Migrated `test_memory_reset_clears_state.sh`, `test_inject_items_lifecycle.sh`, and `test_item_tool_call_no_progress_event.sh` from fixed/root runtime setup to the shared non-destructive runtime helper.
- Added the three migrated state/item lifecycle contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated `bash sa/tests/test_memory_reset_clears_state.sh`, `bash sa/tests/test_inject_items_lifecycle.sh`, `bash sa/tests/test_item_tool_call_no_progress_event.sh`, and `bash sa/tests/run_default_contracts.sh`; confirmed no diff under `.env`, `deno`, or `codex`.
- Migrated `test_command_exec_cwd.sh`, `test_process_lifecycle.sh`, and `test_config_write_cwd.sh` from fixed/root runtime setup to the shared non-destructive runtime helper.
- Added the three migrated command/process/config-write contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated `bash sa/tests/test_command_exec_cwd.sh`, `bash sa/tests/test_process_lifecycle.sh`, `bash sa/tests/test_config_write_cwd.sh`, and `bash sa/tests/run_default_contracts.sh`; confirmed no diff under `.env`, `deno`, or `codex`.
- Added `sa/src/bootstrap.sa` as the SA startup/bootstrap module.
- Reduced `sa/main.sa` from the already-thin 92-line entrypoint to a 6-line entrypoint that only imports the HubProxy module bundle and calls `hubproxy_main()`, making it structurally thinner than `src/main.ts` while preserving the same startup behavior.
- Revalidated `sa build sa/main.sa -o sa/hubproxy` and `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate passed all 22 contracts after the bootstrap extraction.
- Migrated `test_external_import_iso.sh`, `test_fs_watch_unwatch.sh`, and `test_plugin_share_update_targets.sh` from root `.env`/fixed `28080` runtime setup to the shared non-destructive runtime helper.
- Added the three migrated external/fs-watch/plugin-share contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated `bash sa/tests/test_external_import_iso.sh`, `bash sa/tests/test_fs_watch_unwatch.sh`, `bash sa/tests/test_plugin_share_update_targets.sh`, `bash -n` for the migrated scripts, and `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate now passes 25 contracts, and `.env`/`deno`/`codex` remain untouched.
- Migrated `test_elicitation_lifecycle.sh`, `test_empty_body_reject.sh`, `test_item_event_timestamp_current.sh`, and `test_realtime_start_timestamp_current.sh` from fixed/root runtime setup to the shared non-destructive runtime helper.
- Converted `test_empty_body_reject.sh` to use both a temporary HubProxy port and a temporary upstream port, so it verifies empty-body rejection without touching root `.env`, binding `28080`, or depending on a fixed `28081` upstream.
- Added the four migrated elicitation/HTTP-boundary/timestamp contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated each migrated script individually, `bash -n` for the migrated scripts, and `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate now passes 29 contracts, and `.env`/`deno`/`codex` remain untouched.
- Migrated `test_responses_fallback_capture.sh`, `test_responses_fallback_json_tool_call.sh`, and `test_responses_fallback_stream_tool_call.sh` from fixed/root runtime setup to the shared non-destructive runtime helper.
- Converted those responses fallback contracts to use temporary HubProxy and upstream ports while preserving their request-capture, non-stream tool-call normalization, and stream tool-call normalization assertions.
- Added the three migrated responses fallback contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated each migrated script individually, `bash -n` for the migrated scripts, and `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate now passes 32 contracts, and `.env`/`deno`/`codex` remain untouched.
- Migrated `test_responses_fallback_json_tool_only.sh`, `test_responses_fallback_json_reasoning_content.sh`, `test_responses_fallback_json_thought_tag.sh`, and `test_responses_fallback_strips_responses_only_fields.sh` from fixed/root runtime setup to the shared non-destructive runtime helper.
- Converted those JSON fallback contracts to use temporary HubProxy and upstream ports while preserving tool-only output, reasoning_content mapping, thought-tag extraction, and responses-only field stripping assertions.
- Added the four migrated JSON fallback contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated each migrated script individually, `bash -n` for the migrated scripts, and `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate now passes 36 contracts, and `.env`/`deno`/`codex` remain untouched.
- Migrated `test_responses_fallback_stream_events.sh`, `test_responses_fallback_stream_reasoning_content.sh`, `test_responses_fallback_stream_thought_tag.sh`, and `test_responses_fallback_stream_tool_call_normalize.sh` from fixed/root runtime setup to the shared non-destructive runtime helper.
- Converted those stream fallback contracts to use temporary HubProxy and upstream ports while preserving SSE event conversion, reasoning summary streaming, split thought-tag extraction, and tool-call normalization assertions.
- Added the four migrated stream fallback contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated each migrated script individually, `bash -n` for the migrated scripts, and `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate now passes 40 contracts, and `.env`/`deno`/`codex` remain untouched.
- Migrated `test_responses_fallback_json_progress_continuation.sh`, `test_responses_fallback_json_progress_no_continuation.sh`, `test_responses_fallback_tool_history.sh`, and `test_responses_fallback_stream_tool_call_split.sh` from fixed/root runtime setup to the shared non-destructive runtime helper.
- Converted those fallback contracts to use temporary HubProxy and upstream ports while preserving progress-continuation injection, no-continuation control behavior, tool-history conversion, and split streaming tool-argument merge assertions.
- Added the four migrated fallback contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated each migrated script individually, `bash -n` for the migrated scripts, and `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate now passes 44 contracts, and `.env`/`deno`/`codex` remain untouched.
- Migrated `test_responses_fallback_stream_progress_continuation.sh`, `test_responses_fallback_stream_progress_no_continuation.sh`, `test_responses_fallback_stream_progress_no_exec_tool.sh`, and `test_responses_fallback_stream_tool_call_read_env_redact.sh` from fixed/root runtime setup to the shared non-destructive runtime helper.
- Converted those stream fallback contracts to use temporary HubProxy and upstream ports while preserving stream progress-continuation injection, no-continuation control behavior, no-exec-tool guard behavior, and `.env` read redaction assertions.
- Added the four migrated stream fallback contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated each migrated script individually, `bash -n` for the migrated scripts, and `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate now passes 48 contracts, and `.env`/`deno`/`codex` remain untouched.
- Migrated `test_responses_fallback_stream_tool_call_read_shell_quote.sh`, `test_responses_gemini_capture.sh`, `test_responses_gemini_tool_history_no_fallback.sh`, and `test_responses_missing_base_capture.sh` from fixed/root runtime setup to the shared non-destructive runtime helper.
- Converted those responses proxy/fallback contracts to use temporary HubProxy and upstream ports while preserving shell-quote normalization, Gemini incompatible-field stripping, Gemini tool-history no-fallback routing, and missing responses-base chat fallback assertions.
- Added the four migrated responses proxy/fallback contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated each migrated script individually, `bash -n` for the migrated scripts, and `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate now passes 52 contracts, and `.env`/`deno`/`codex` remain untouched.
- Migrated `test_large_non_sse_body.sh`, `test_responses_long_input_request_no_crash.sh`, `test_responses_native_large_sse_no_crash.sh`, and `test_responses_tools_capture.sh` from fixed/root runtime setup to the shared non-destructive runtime helper.
- Converted those long-body/native-forwarding contracts to use temporary HubProxy and upstream ports while preserving large non-SSE body forwarding, long request forwarding and post-request health checks, large native SSE normalization, and native tool normalization assertions.
- Added the four migrated long-body/native contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated each migrated script individually, `bash -n` for the migrated scripts, and `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate now passes 56 contracts, and `.env`/`deno`/`codex` remain untouched.
- Connected native Responses SSE progress-continuation injection in `sa/src/proxy.sa` to the existing request-context guard and `build_native_progress_continuation` JSON builder, matching Deno's behavior of injecting `exec_command` before completion only when the request allows it and the normalized native SSE contains no tool call.
- Progress: 100% - Fixed SA MCP status enumeration for installed Codex MCP plugins.
- Added dynamic MCP discovery in the deno SA plugin: it reads installed plugin `.mcp.json` files, starts stdio MCP servers, sends newline-delimited JSON-RPC `initialize`/`tools/list`, and returns Codex-compatible `mcpServerStatus/list` data with real tool maps.
- Wired `sa/src/rpc_system.sa` so `mcpServerStatus/list` uses the dynamic plugin result and falls back only when plugin enumeration fails.
- Added SA native `@test` coverage proving the current environment enumerates Code Index and Mimir tools, including `build-index` and `mimir_search`, without shell tests or `.env` changes.
- Progress: 100% - Fixed SA MCP tool execution for installed Codex MCP plugins.
- Added dynamic `mcpServer/tool/call` support in the deno SA plugin: it resolves the requested server from installed plugin `.mcp.json`, starts the matching stdio MCP server, sends newline-delimited JSON-RPC `tools/call`, and returns the real MCP result without hardcoding tool names.
- Wired `sa/src/rpc_system.sa` so `mcpServer/tool/call` uses the real plugin result and falls back to the old compatibility response only if dynamic execution fails.
- Added SA native `@test` coverage proving SA can invoke the installed Code Index MCP server with `describe-index` and receive real `content`/`summaryText` output.
- Progress: 100% - Improved SA MCP discovery to follow Codex's configured MCP server list.
- Updated the deno SA plugin to prefer `codex mcp list --json` for `mcpServerStatus/list` and `mcpServer/tool/call`, then fall back to installed plugin `.mcp.json` scanning if Codex CLI discovery is unavailable.
- This removes the earlier limitation where SA only saw MCP servers located under the plugin cache; configured stdio MCP servers now use the same discovery source that Codex reports, without editing Codex config.
- Progress: 100% - Added real SA MCP `resource/read` execution path.
- Added dynamic `mcpServer/resource/read` support in the deno SA plugin: it resolves configured stdio MCP servers from `codex mcp list --json` first, falls back to plugin `.mcp.json`, sends newline-delimited JSON-RPC `resources/read`, and returns the raw MCP `ReadResourceResult` when a server supports resources.
- Wired `sa/src/rpc_system.sa` so `mcpServer/resource/read` uses the real plugin result and preserves the previous text/plain empty fallback when configured servers do not support `resources/read`.
- Added Zig unit coverage for MCP `resources/read` result extraction with both text and blob contents; current installed Code Index and Mimir servers both return method-not-found for resources, so positive runtime coverage remains parser-level until a resource-capable MCP server is configured.
- Progress: 100% - Extended SA MCP status full-detail inventory for resource-capable servers.
- Updated `mcpServerStatus/list` probing in the deno SA plugin to also send `resources/list` and `resources/templates/list`; successful MCP results now populate `resources` and `resourceTemplates`, while unsupported servers continue to report empty arrays.
- Added Zig unit coverage for status inventory extraction of both `resources` and `resourceTemplates`; current installed Code Index and Mimir servers still report method-not-found for resource inventory, so runtime status remains empty for those servers by design.
- Rebuilt the Code Index cache for the HubProxy repo and used it to trace the MCP/fallback path.
- Improved the SA Deno compatibility plugin's chat fallback MCP namespace detection to parse request `tools` with JSON instead of brittle minified-string matching, including formatted namespace tools and already-flat `mcp__...__tool` declarations without hardcoding specific MCP server names.
- Added SA native coverage for formatted namespace tools and flat MCP request tools in `sa/tests/responses_chat_fallback_request_test.sa`.
- Reinstalled the local `deno` SA plugin in dev mode, then revalidated `zig test src/hubproxy_compat.zig`, `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` with 9/9 passing, `sa test sa/tests/unit_tests.sa --trace-panic` with 7/7 passing, `sa build sa/main.sa -o sa/hubproxy`, and a fresh Code Index rebuild; `.env`, Deno source, and Codex source/config remained untouched.
- Added `test_responses_native_progress_continuation.sh`, `test_responses_native_progress_no_continuation.sh`, `test_responses_native_thinking_json.sh`, and `test_responses_native_thinking_stream.sh` to the default non-destructive runtime gate.
- Revalidated `sa build sa/main.sa -o sa/hubproxy` plus the four native Responses contracts individually; all passed with temporary HubProxy/upstream ports, and the fixed/root scan now finds 4 remaining legacy shell scripts instead of 8.
- Revalidated `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate now passes 60 contracts through `sa_default_contracts_ok`, and `git diff -- .env deno codex --stat` remains empty.
- Migrated `test_rpc_misc_parity.sh`, `test_upstream_auth_headers.sh`, and `test_user_input_event_shape.sh` from root `.env`/fixed `28080` runtime setup to the shared non-destructive runtime helper.
- Converted those RPC/header/events contracts to use temporary HubProxy ports and, where needed, temporary upstream ports while preserving JSON-RPC parity assertions, upstream auth header rewriting checks, and `/events` requestUserInput shape validation.
- Added the three migrated RPC/header/events contracts to `sa/tests/run_default_contracts.sh`.
- Revalidated each migrated script individually, `bash -n` for the migrated scripts, and `bash sa/tests/run_default_contracts.sh`; the default non-destructive runtime gate now passes 63 contracts through `sa_default_contracts_ok`, `git diff -- .env deno codex --stat` remains empty, and the fixed/root scan now only finds `test_restart_sa_entry.sh`, which is intentionally isolated because it verifies 28080 takeover behavior.
- Revalidated the 9 SA source/native or compile contracts: `unit_tests.sa`, `test_strings.sa`, `test_state.sa`, `test_config.sa`, `responses_chat_fallback_request_test.sa`, `model_list_contract_test.sa --compile-only`, `test_http_contract.sa`, `test_server_config.sa`, and `test_deno_compat.sa`; all commands exited 0.
- Updated `sa/README.md` status wording to reflect the current 9 native/compile contracts, 96 shell contract scripts, 63 default non-destructive shell contracts, and isolated fixed-port restart contract split.
- Replayed the 32 shell contracts that were still outside the default local gate but did not require fixed-port/root `.env` behavior; this exposed Deno parity gaps in turn status strings, `collaborationModeKind`, goal budget status spelling, and MCP unsupported-resource JSON-RPC error codes.
- Updated `sa/src/rpc_session.sa` so shared turn JSON emits Deno-compatible `status: "inProgress"`, `collaborationModeKind`, and camelCase goal statuses such as `budgetLimited`/`usageLimited` via the existing JSON writer helpers.
- Fixed `sa/src/rpc_emit.sa` MCP unsupported-resource string lengths so `send_error_with_id` correctly emits JSON-RPC `-32601` for those HTTP 404 unsupported-method responses.
- Added all 32 newly passing non-destructive contracts to `sa/tests/run_default_contracts.sh`; the default local gate now covers 95/95 non-destructive shell contracts, leaving only `test_restart_sa_entry.sh` in the isolated fixed-port layer.
- Revalidated the 32 newly added scripts individually and `bash sa/tests/run_default_contracts.sh`; the full default local gate passed through `sa_default_contracts_ok`.
- Updated `sa/README.md` status wording from 63/63 to 95/95 default non-destructive shell contracts.
- Revalidated the 9 SA source/native or compile contracts again after the turn/goal/MCP parity fixes; all commands exited 0.

## Operational Notes
- Thin-entry refactor objective is complete: `sa/main.sa` is 6 lines and contains no startup internals, HTTP logic, or RPC business logic.
- Keep `test_restart_sa_entry.sh` out of the default local gate and run it only in an isolated environment because it intentionally kills/replaces the listener on `28080` while validating the SA restart entrypoint.
- Optional cleanup after a baseline commit: split still-large implementation modules such as `sa/src/rpc_system.sa`, `sa/src/rpc_session.sa`, and `sa/src/state.sa` by subdomain to reduce future review size without changing behavior.

## MCP/Plugin Parity Follow-up - 100%
- Rechecked Deno `src/handlers.ts` MCP/plugin/skills behavior against SA `sa/src/rpc_dispatch.sa`, `sa/src/rpc_system.sa`, and `sa/src/events.sa`.
- Confirmed Deno's MCP/plugin routes are compatibility facade responses for the covered methods, not real external plugin invocation paths.
- Fixed the remaining `skills/list` parity gap: SA now emits the Deno-compatible `skills/changed` SSE notification before returning `{data:[]}`.
- Extended `sa/tests/test_events_contract.sh` to assert the `skills/changed` event.

## SA Upstream Request Logging Follow-up - 100%
- Rechecked Deno logging behavior: Deno records the actual outbound upstream body after request rewriting, not the raw inbound client body.
- Updated SA `/v1/chat/completions`, native `/v1/responses`, and responses-to-chat fallback logging points to record the outbound body that is sent upstream.
- Updated the API request log contract to use the real `DEFAULT_MODEL` from `.env` while verifying logs are written for the outbound upstream request body.
- Updated `restart_sa.sh` to enable request logging by default in `logs/`, with `--log-dir`/`--logs` overrides and `--no-logs` for explicit opt-out.
- Verified `bash -n restart_sa.sh sa/tests/test_api_request_log.sh sa/tests/test_api_request_log_disabled_by_default.sh`, `bash sa/tests/test_api_request_log.sh`, and `bash sa/tests/test_api_request_log_disabled_by_default.sh`.
- Fixed the deno compatibility plugin request normalizer so `type:"reasoning"` input items no longer forward non-empty `content`, while preserving `encrypted_content`; this matches the upstream schema error from the real SA request log.
- Reinstalled the local deno plugin with `SA_PLUGIN_DEV=1 sa plugin install --dev /home/vscode/projects/sa_plugins/sa_plugin_deno` and rebuilt `sa/hubproxy`.

## SA MCP Native Tool Parity Follow-up - 100%
- Inspected `logs/request-sa-api.json` and found repeated `unsupported call: mcp__code_index__build_index` history after native MCP tool calls.
- Compared Deno namespace handling: Deno only de-flattens MCP tool names when the original request used `type:"namespace"` tools; SA's plugin was de-flattening native `mcp__...` names without that request context.
- Updated the deno compatibility plugin so native Responses JSON/SSE keeps flat MCP tool names, while chat fallback still de-flattens only for explicit namespace tools.
- Updated request normalization so historical `function_call` items with `namespace` are flattened back to `mcp__...` before forwarding upstream.
- Added native SA `@test` coverage in `sa/tests/responses_chat_fallback_request_test.sa` for flat MCP native tool names, namespace-history re-flattening, and reasoning content stripping; no new shell contract is used for this coverage.
- Verified `sa test sa/tests/responses_chat_fallback_request_test.sa` with 7 passed, 0 failed.

## SA MCP Request Visibility Follow-up - 100%
- Compared Deno `src/proxy.ts` request flow against SA `sa/src/http_dispatch.sa`: Deno logs and forwards the rewritten upstream request body, while Codex MCP tools must already be present in the request generated by Codex runtime.
- Confirmed the latest SA upstream request log contains Mimir MCP tools but no `mcp__code_index__` tools, so HubProxy cannot fabricate a Code Index MCP call if it is absent from the inbound Codex request.
- Improved SA request logging without changing proxy behavior: `request-sa-api.json` still records outbound `body/bodyBytes` and now also records raw inbound `rawBody/rawBodyBytes`, allowing the next real MCP run to prove whether Code Index disappeared before HubProxy or during SA rewriting.
- Rebuilt SA successfully with `sa build sa/main.sa -o sa/hubproxy`.
- Revalidated native MCP/Responses coverage with `sa test sa/tests/responses_chat_fallback_request_test.sa`: 7 passed, 0 failed.

## SA MCP Status Detail Parity - 100%
- Rechecked Codex app-server protocol and confirmed `mcpServerStatus/list` supports `detail: "full" | "toolsAndAuthOnly"`, defaulting to `full`.
- Updated the SA deno compatibility plugin status-list FFI to receive the original JSON-RPC body and skip `resources/list` plus `resources/templates/list` when `toolsAndAuthOnly` is requested.
- Updated SA `mcpServerStatus/list` dispatch and native MCP status coverage to pass the request body through the plugin API without changing `.env`, Deno source, or Codex config.

## SA MCP Code Index Rebuild Verification - 100%
- Added SA native `@test` coverage that calls the installed Code Index MCP server through `mcpServer/tool/call` with `build-index`, proving the SA plugin path can rebuild `.code_index` without shell test wrappers.

## SA MCP Tool Call Meta Parity - 100%
- Compared Codex `mcpServer/tool/call` handling and found it injects `threadId` into MCP `_meta` before dispatching `tools/call`.
- Updated the SA deno compatibility plugin to generate `_meta` with Zig JSON DOM/stringify: missing/null metadata creates `{threadId}`, object metadata preserves fields while replacing `threadId`, and non-object metadata remains unchanged like Codex.
- Updated native MCP tool-call coverage to send protocol-shaped `threadId` requests and added Zig unit coverage for the `_meta.threadId` merge semantics.

## SA MCP Status Pagination Parity - 100%
- Compared Codex `mcpServerStatus/list` pagination and confirmed valid `cursor` plus `limit` slices the sorted server list and emits string `nextCursor` when more servers remain.
- Updated the SA deno compatibility plugin to parse `params.cursor`/`params.limit`, apply pagination during real Codex MCP discovery, and return string `nextCursor` for subsequent pages while preserving default all-server behavior.
- Added Zig unit coverage for pagination state handling and SA native coverage for a real `limit:1` MCP status request returning `nextCursor:"1"`.

## SA MCP Auth Status Parity - 100%
- Compared Codex MCP status response fields and confirmed `authStatus` should come from the MCP auth snapshot, with protocol values such as `unsupported`, `notLoggedIn`, `bearerToken`, and `oauth`.
- Updated the SA deno compatibility plugin to read `auth_status`/`authStatus` from `codex mcp list --json`, normalize snake/camel variants to protocol casing, and preserve `unsupported` for `.mcp.json` fallback discovery.
- Added Zig unit coverage for auth status normalization and SA native coverage asserting real MCP status output includes `authStatus:"unsupported"` in the current environment.

## SA MCP ServerInfo Field Parity - 100%
- Compared Codex `McpServerStatus` and confirmed `serverInfo` is a protocol field even when no server metadata is available.
- Updated the SA `mcpServerStatus/list` fallback response to emit `serverInfo:null`, matching the protocol field shape instead of omitting it.
- Added SA native coverage asserting the real MCP status output includes the `serverInfo` field from installed MCP server initialization.

## SA Responses Tool Output Kind Runtime Parity - 100%
- Synced the locally rebuilt SA `deno` plugin binary into the installed plugin path after `sa plugin install --dev` was blocked by an unrelated `sa_plugin_node` build error; `.sai` and `.sal` were already identical.
- Revalidated native coverage: `responses_chat_fallback_request_test.sa` now passes 21/21, including MCP tool discovery/call/build-index coverage and Responses JSON/SSE `output_kind` normalization.
- Revalidated plugin coverage with `zig test src/hubproxy_compat.zig`: 25/25 passed, including all tool-call output-kind cases and MCP namespace normalization cases.
- Revalidated an isolated real SA HubProxy process on temporary ports with a mock upstream: JSON and SSE native `/v1/responses` responses now match Deno semantics for `function_call`, `custom_tool_call`, `tool_search_call`, and `mcp_tool_call` output kinds. The check also confirmed Deno-compatible behavior that only `function_call` flat MCP names are split into `name`/`namespace`, while `mcp_tool_call` keeps its original `name` and receives `mcp_tool_call_output`.

## SA MCP Reload Deno Facade Parity - 100%
- Rechecked current Hub Deno `src/handlers.ts` and found `config/mcpServer/reload` returns `{name,reloaded:true}` while emitting startup status with the same `params.name ?? "local"` default.
- Updated SA `send_rpc_mcp_reload` to use the existing JSON writer and RPC string extractor helpers to emit the Deno facade result shape instead of the earlier empty Codex-protocol object.
- Added native SA coverage for both default `local` and explicit `name` reload responses; `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` passes 2/2.

## SA Native Responses MCP Argument Denormalization - 100%
- Compared Deno `normalizeResponsesEvent` coverage and found native Responses JSON MCP `function_call` output must both split flat `mcp__...__tool` names into `name`/`namespace` and denormalize `arguments.server` from normalized MCP namespace names back to the Codex client server name such as `code-index`.
- Fixed the SA deno compatibility plugin JSON-output rewrite path so `appendNativeFunctionCallWithNamespace` normalizes the `arguments` JSON string the same way as the SSE path before writing the rewritten item.
- Added SA native coverage for the combined case `mcp__code_index__read_mcp_resource` plus `arguments.server:"mcp__code_index__"`; `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` now passes 22/22.

## SA Responses MCP Server Denormalization Coverage - 100%
- Extended the SA native Responses coverage to mirror the remaining Deno `normalizeResponsesEvent` server-name cases: raw `code_index` is restored to `code-index`, and custom namespace `mcp__custom_tool__` is restored to `custom-tool` while preserving the rewritten `namespace` and short tool name.
- Revalidated `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic`; the focused Responses/MCP native suite remains 22/22 passing.

## SA MCP Runtime No-Fake-Success Fix - 100%
- Reproduced the live `/rpc` symptom on the existing 28080 listener: `mcpServer/tool/call` returned the legacy simulated `{ok:true,text:"called"}` shape instead of a real Code Index MCP result.
- Removed the SA runtime fallback that fabricated successful `mcpServer/tool/call` and `mcpServer/resource/read` results when the deno plugin returned no MCP match/result; these paths now return `mcp operation failed` instead of hiding the failure.
- Rebuilt `sa/hubproxy` without touching `.env`, Deno `src/`, Codex source/config, or the existing 28080 process.
- Revalidated native coverage: `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` passes 2/2, and `sa test sa/tests/responses_chat_fallback_request_test.sa --filter "mcp" --trace-panic` passes 9/9.
- Verified the new `sa/hubproxy` in an isolated runtime on a temporary port with a temporary `.env`: `mcpServer/tool/call` against `code-index/describe-index` returned the real Code Index summary and did not contain the legacy `"text":"called"` fake success response.

## SA MCP Runtime Code Index Rebuild - 100%
- Rebuilt the HubProxy code index through the Code Index MCP server itself, then verified the full SA HTTP runtime path in an isolated temporary environment without modifying `.env` or touching port 28080.
- The verified request was `/rpc` `mcpServer/tool/call` with `server:"code-index"` and `tool:"build_index"`; SA returned HTTP 200 with a real `Startup code index ready` MCP result, proving the safe-name resolver maps to the installed `build-index` tool and the SA runtime can rebuild `.code_index` through Codex MCP.

## SA MCP Runtime Failure Observability - 100%
- Removed the remaining misleading `FALLBACK` labels from `mcpServer/tool/call` and `mcpServer/resource/read` failure paths; both now route through explicit failed branches while continuing to return JSON-RPC 500 `mcp operation failed`.
- Added concise SA runtime logs for MCP execution failures, so real runs distinguish plugin/RPC failure from ordinary `/rpc` dispatch without leaking request arguments or secrets.
- Verified with `sa build sa/main.sa -o sa/hubproxy`, full native `sa test sa/tests/*.sa --trace-panic` sweep, and an isolated temporary-port SA HubProxy runtime: a real Code Index MCP `describe-index` call returned HTTP 200, while a missing MCP server returned HTTP 500 and printed `[hubproxy] MCP tool call failed`.

## SA MCP Runtime Contract Cleanup - 100%
- Updated the legacy SA runtime contract client so its MCP checks no longer assert the old simulated success facade: `mcpServer/resource/read` without `server` now expects HTTP 400 `invalid params`, and unavailable `mcpServer/tool/call` now expects HTTP 500 `mcp operation failed`.
- Added a status-aware RPC assertion helper for runtime contract checks while preserving the existing HTTP 200 helper for normal RPC success cases.
- Verified `sa build sa/tests/test_http_contract.sa -o sa/tests/test_http_contract`, `sa test sa/tests/test_http_contract.sa --trace-panic`, `sa build sa/main.sa -o sa/hubproxy`, `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic`, and `sa test sa/tests/responses_chat_fallback_request_test.sa --filter mcp --trace-panic`. The runtime contract binary still hardcodes port 28080, so it was not executed during this non-invasive pass.

## SA MCP Escaped-Contract Cleanup - 100%
- Updated `sa/tests/model_list_contract_test.sa` so the escaped `mcpServer/tool/call` contract no longer expects the removed fake-success echo fields (`text`, `tool`, `server`, `itemId`) for an unavailable MCP server.
- Added a status-aware RPC assertion helper to the escaped model/RPC contract and changed the unavailable MCP request expectation to HTTP 500 `mcp operation failed`, matching the current SA runtime and Codex-style failure propagation.
- Verified `sa test sa/tests/model_list_contract_test.sa --compile-only --trace-panic`, `sa build sa/main.sa -o sa/hubproxy`, `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic`, `sa test sa/tests/responses_chat_fallback_request_test.sa --filter mcp --trace-panic`, and an isolated temporary-port SA runtime request using the same escaped MCP payload. The runtime returned HTTP 500 with `mcp operation failed` and printed `[hubproxy] MCP tool call failed` without touching `.env` or port 28080.

## SA MCP Fake-Success Dead Constant Cleanup - 100%
- Removed the unused `structuredContent` constants from `sa/src/rpc_system.sa` and `sa/src/rpc_dispatch.sa` after eliminating the fake-success MCP fallback paths.
- Verified no remaining `structuredContent` references in SA source/tests outside ignored compiled artifacts and the standalone runtime contract binary path.
- Revalidated with `sa build sa/main.sa -o sa/hubproxy`, focused MCP native tests, `git diff --check`, and `.env`/Deno `src/` unchanged.

## SA MCP Progress Failure-Gating - 100%
- Moved `item/mcpToolCall/progress` emission for `mcpServer/tool/call` out of the dispatcher pre-call path and into the successful real MCP plugin result path.
- Invalid MCP params and real MCP execution failures now return their JSON-RPC errors without also enqueueing a misleading tool-progress event.
- Added SA native plugin-level coverage proving missing `threadId`, `server`, or `tool` returns the plugin invalid-param status used by the failure-gated dispatcher path.
- Removed the stale dispatcher/system MCP progress event constants left behind by the move; the only remaining SA source definition is the live `events.sa` emitter.
- Added SA native success-path event coverage proving `notify_mcp_tool_progress` still emits an SSE frame containing the required `threadId`, `turnId`, `itemId`, and `message` protocol fields.
- Revalidated the changed SA interface with `sa build sa/main.sa -o sa/hubproxy` and `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` (4 passed).

## SA MCP Plugin Install and Generic Namespace Normalization - 100%
- Rebuilt the HubProxy code index with the Code Index MCP plugin and verified the installed SA plugins include `deno`, `http-client`, and `http-server` before testing.
- Revalidated the deno SA plugin with `zig test src/hubproxy_compat.zig` (27 passed) and refreshed the installed plugin with `SA_PLUGIN_DEV=1 sa plugin install --dev /home/vscode/projects/sa_plugins/sa_plugin_deno` so SA builds load the current MCP extern implementation.
- Removed production hardcoding of specific MCP server names from the SA deno compatibility plugin namespace normalizer; server names now use the generic Codex namespace form `mcp__<normalized-server>__`, while existing `Code Index`, `Mimir`, dashed, underscored, and double-wrapped names keep their previous behavior through the generic rule.
- Revalidated the installed plugin and SA MCP path with `sa build sa/main.sa -o sa/hubproxy`, `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` (4 passed), and `sa test sa/tests/responses_chat_fallback_request_test.sa --filter mcp --trace-panic` (9 passed, 18 skipped), without modifying `.env`, Deno `src/`, Codex source/config, or port 28080.

## SA MCP Generic Namespace Regression Coverage - 100%
- Added direct deno plugin coverage for generic MCP namespace normalization: arbitrary spaced names, dashed/dotted names, already-normalized names, and double-wrapped names now assert the same `mcp__<normalized-server>__` rule without relying on Code Index or Mimir fixtures.
- Revalidated the deno SA plugin with `zig test src/hubproxy_compat.zig` (28 passed) and `zig build`, then refreshed the installed plugin with `SA_PLUGIN_DEV=1 sa plugin install --dev /home/vscode/projects/sa_plugins/sa_plugin_deno`.
- Revalidated the SA HubProxy MCP integration with `sa build sa/main.sa -o sa/hubproxy`, `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` (4 passed), and `sa test sa/tests/responses_chat_fallback_request_test.sa --filter mcp --trace-panic` (9 passed, 18 skipped), with no `.env`, Hub Deno `src/`, Codex source/config, or 28080 changes.

## SA MCP Status Failure Propagation - 100%
- Removed the remaining `mcpServerStatus/list` compatibility fallback in `sa/src/rpc_system.sa`; plugin discovery/internal failures now log `[hubproxy] MCP status list failed` and return JSON-RPC 500 `mcp operation failed` instead of fabricating a local unsupported server list.
- Kept invalid status params mapped to JSON-RPC 400 `invalid params`, matching the existing Codex-style parameter validation path.
- Revalidated with `sa build sa/main.sa -o sa/hubproxy`, `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` (4 passed), and `sa test sa/tests/responses_chat_fallback_request_test.sa --filter mcp --trace-panic` (9 passed, 18 skipped), with no `.env`, Hub Deno `src/`, Codex source/config, or 28080 changes.

## SA MCP Stdio Interactive Read Parity - 100%
- Compared the SA deno plugin MCP stdio path against the installed Code Index and Mimir MCP servers and found the real failure was premature stdin close: Code Index accepts newline JSON messages but shuts down when stdin closes before `tools/list` or `tools/call` is processed.
- Updated SA plugin MCP stdio execution to keep stdin open after sending newline-delimited JSON-RPC requests, poll stdout with a bounded 10 second wait, parse responses until the target JSON-RPC ids arrive, and only then close/kill the child process.
- Kept response parsing compatible with both newline JSON and `Content-Length` framed responses, so Mimir-style framed output and Code Index newline output both work without hardcoding tool names.
- Added SA native `@test` coverage that calls the installed deno plugin `mcpServerStatus/list` path against the current Codex MCP configuration and verifies a real configured stdio server response shape is returned.
- Reinstalled the deno plugin with `SA_PLUGIN_DEV=1 sa plugin install --dev /home/vscode/projects/sa_plugins/sa_plugin_deno` and verified `zig test src/hubproxy_compat.zig` (28 passed), `sa test sa/tests/mcp_rpc_contract_test.sa --trace-panic` (5 passed), and `sa test sa/tests/responses_chat_fallback_request_test.sa --filter mcp --trace-panic` (9 passed, including real Code Index `describe-index`, `build-index`, and safe-name `build_index` calls), without modifying `.env`, Hub Deno `src/`, Codex source/config, restart scripts, or port 28080.

## SA Progress-Only Continuation Native Coverage - 100%
- Aligned SA request-context progress detection with the Deno compatibility plugin for additional progress trigger phrases (`I'll`, `I will`, `verify`, `review`, `analyze/analyse`, `我先`, `接下来`, `查看`, `执行`, `评估`, `分析`) and final-output exclusions (`结论`, `总结`, `summary`, `conclusion`, `completed`).
- Added SA native `@test` coverage for goal, code, and default collaboration contexts with `exec_command`, rejection for plan/no-exec contexts, proposed-plan/final/normal text rejection, and the native continuation SSE builder shape.
- Verified `sa build sa/main.sa -o /tmp/hubproxy-check` and `sa test sa/tests/responses_chat_fallback_request_test.sa --trace-panic` (32 passed), without modifying `.env`, Hub Deno `src/`, Codex source/config, restart scripts, or port 28080.

## SA Goal Status and TokenBudget Native Coverage - 100%
- Added `sa/tests/goal_rpc_contract_test.sa` as pure SA native coverage for the Deno `thread/goal/*` status and `tokenBudget` contract, without using HTTP, shell tests, `.env`, or fixed ports.
- Covered the full known status set (`active`, `paused`, `blocked`, `usageLimited`, `budgetLimited`, `complete`), unknown runtime status preservation through state storage, missing-thread string key preservation, null/missing/string `tokenBudget` as JSON null, and signed numeric budgets including negative values.
- Verified `sa test sa/tests/goal_rpc_contract_test.sa --trace-panic` (4 passed).

## SA Turn Start CollaborationMode Native Coverage - 100%
- Added `sa/tests/turn_rpc_contract_test.sa` as pure SA native coverage for Deno `turn/start` collaboration mode parsing, without HTTP, shell tests, `.env`, or fixed ports.
- Covered the exact Deno source boundary: only `params.collaborationMode.mode` is honored for `turn/start`; Responses-only aliases such as `collaboration_mode.kind` and top-level `collaborationModeKind` do not mutate turn mode.
- Covered Deno-style trim/lowercase for known modes, arbitrary custom mode text storage (`Review` -> `review` with no known enum), and empty mode clearing.
- Verified `sa test sa/tests/turn_rpc_contract_test.sa --trace-panic` (3 passed).

## SA Turn Steer Deno Parity Fix - 100%
- Aligned SA `turn/steer` missing-`input` behavior with Deno: missing or non-array input now follows the empty-array steer path, preserving items while advancing `updatedAt` instead of silently skipping the state update.
- Added pure SA native coverage for steer append semantics, empty-turn first steer, empty steer timestamp advancement, and unknown `expectedTurnId` not mutating the first turn.
- Verified `sa test sa/tests/turn_rpc_contract_test.sa --trace-panic` (7 passed), without modifying `.env`, Hub Deno `src/`, Codex source/config, restart scripts, or port 28080.

## SA Thread Rollback Native Coverage - 100%
- Added `sa/tests/thread_rpc_contract_test.sa` as pure SA native coverage for Deno `thread/rollback` behavior, without HTTP, shell tests, `.env`, or fixed ports.
- Covered Deno numeric `numTurns` parsing (`numTurns: 2`), legacy string numeric parsing, missing `numTurns` defaulting to 1, removing the last N turns, `0` preserving all turns, over-large rollback clearing all active turns, and missing-thread not-found behavior.
- Verified `sa test sa/tests/thread_rpc_contract_test.sa --trace-panic` (5 passed). Current SA implementation already matched these Deno state/parser semantics, so no runtime code change was needed for this feature.

## SA Memory Reset Native Event Coverage - 100%
- Extended `sa/tests/thread_rpc_contract_test.sa` with pure SA native coverage for Deno `memory/reset` state effects and wildcard close notification semantics.
- Covered runtime reset clearing thread, turn, goal, process, and watch state, then emitting a `thread/closed` notification containing `"threadId":"*"` through the same event queue used by the SA RPC path.
- Verified `sa test sa/tests/thread_rpc_contract_test.sa --trace-panic` (6 passed). Current SA implementation already matched the Deno state/event semantics, so no runtime code change was needed for this feature.

## SA Request Log Isolated Runtime Coverage - 100%
- Added `sa/tests/test_request_log_runtime_isolated.sh` as a restored isolated runtime contract for HTTP-triggered request/auth logging. The script builds a temporary SA HubProxy binary, starts it from a generated temporary `.env` with a random local `PORT`, temporary `HUBPROXY_LOG_DIR`, and temporary data dir, and avoids the root `.env`, `restart_sa.sh`, and port `28080`.
- The runtime check posts an unauthorized `/rpc` request with real `authorization`, `x-api-key`, `api-key`, and `content-type` headers, verifies the HTTP 401 boundary, then inspects generated `request-*.json` files to prove live request-log and auth-failure writers extract and redact headers/body fields through the production HTTP request handle.
- Updated `sa/tests/deno_coverage_matrix.md` to count the restored isolated shell contract and mark request logging as covered for live unauthorized `/rpc` request-triggered log creation/header extraction, with authenticated proxy success-path logging still left as optional isolated evidence.
- Verified `sa version` (`0.0.3.3`), `bash sa/tests/test_request_log_runtime_isolated.sh`, full `sa test sa/tests/*.sa --trace-panic`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-request-log-runtime-check`, and `git diff --check`.

## SA Models Isolated Runtime Coverage - 100%
- Added `sa/tests/test_models_runtime_isolated.sh` as a restored isolated runtime contract for live `/v1/models` passthrough and route/auth boundaries. The script builds a temporary SA HubProxy binary, starts a temporary mock upstream, writes generated `.env` files under a temporary root/cwd, uses random local ports, and avoids the root `.env`, `restart_sa.sh`, and port `28080`.
- The runtime check requests public `/v1/models` with caller `authorization`, `x-api-key`, and `api-key` headers, verifies the upstream model-list body is passed through, captures the mock upstream socket headers, and proves upstream receives configured `authorization: Bearer <OPENAI_API_KEY>` plus configured `x-api-key` while caller auth material and naked `api-key` are stripped. The same process also verifies unauthenticated `/rpc` remains HTTP 401.
- Updated `sa/tests/deno_coverage_matrix.md` to count two isolated shell runtime contracts and mark `/v1/models` live base dispatch/model passthrough/socket auth stripping plus anonymous-models/protected-RPC route boundary as covered; full arbitrary non-sensitive header passthrough and live chat/responses dispatch remain separate isolated runtime work.
- Fixed `sa/tests/config_contract_test.sa` test isolation by splitting good and bad dotenv temp paths (`/tmp/hubproxy-config-contract-good.env` and `/tmp/hubproxy-config-contract-bad.env`), removing a same-file `@test` race that could make the good config-load test read the invalid-port fixture during parallel/native test execution.
- Verified `bash sa/tests/test_models_runtime_isolated.sh`, `bash sa/tests/test_request_log_runtime_isolated.sh`, `sa test sa/tests/config_contract_test.sa --trace-panic`, full `sa test sa/tests/*.sa --trace-panic`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-models-request-log-runtime-check`, and `git diff --check`.

## SA Responses Missing-Base Fallback Runtime Coverage - 100%
- Added `sa/tests/test_responses_fallback_runtime_isolated.sh` as an isolated runtime contract for the live `/v1/responses` missing-`RESPONSES_BASE_URL` fallback path. The script builds a temporary SA HubProxy binary, starts a temporary mock chat upstream, writes generated `.env` files under a temporary root/cwd without `RESPONSES_BASE_URL`, uses random local ports, and avoids the root `.env`, `restart_sa.sh`, and port `28080`.
- The runtime check posts authenticated `/v1/responses`, captures the mock upstream request at `/v1/chat/completions`, verifies configured upstream `authorization` and `x-api-key` are used while caller auth material and naked `api-key` are stripped, and asserts the fallback body preserves `model`, `stream:false`, instructions/developer/user text, and a flattened MCP namespace tool while dropping Responses-only `store`, `prompt_cache_key`, `include`, `reasoning`, and raw `input`.
- The same check verifies the chat JSON response is normalized back into Responses JSON with `output_text:"fallback ok"` and normalized usage token fields.
- Updated `sa/tests/deno_coverage_matrix.md` to count three isolated shell runtime contracts and mark missing-base live fallback/body capture as covered, while leaving unavailable Responses upstream fallback and full live chat/direct-responses schema capture as remaining isolated runtime work.
- Verified `bash sa/tests/test_responses_fallback_runtime_isolated.sh`, `bash sa/tests/test_models_runtime_isolated.sh`, `bash sa/tests/test_request_log_runtime_isolated.sh`, full `sa test sa/tests/*.sa --trace-panic`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-responses-fallback-runtime-check`, and `git diff --check`.

## SA Responses Unavailable Fallback Runtime Coverage - 100%
- Added `sa/tests/test_responses_unavailable_fallback_runtime_isolated.sh` as an isolated runtime contract for the configured `RESPONSES_BASE_URL` unavailable fallback path. The script builds a temporary SA HubProxy binary, starts one temporary mock upstream for both Responses and chat, writes generated `.env` files with both base URLs under a temporary root/cwd, uses random local ports, and avoids the root `.env`, `restart_sa.sh`, and port `28080`.
- The runtime check posts authenticated `/v1/responses`, captures the first live `/v1/responses` upstream request returning 404, verifies configured upstream auth and no caller-secret leakage, then captures the subsequent `/v1/chat/completions` retry with the same configured upstream auth.
- It asserts the native Responses request preserves Responses-only fields for the direct `/responses` attempt, while the chat fallback request strips `store`, `prompt_cache_key`, `include`, `reasoning`, and raw `input` and preserves `model`, `stream:false`, instructions, and user text. The final client response is normalized back into Responses JSON with `output_text:"fallback after 404"` and normalized usage token fields.
- Updated `sa/tests/deno_coverage_matrix.md` to count four isolated shell runtime contracts and mark configured-Responses 404 live fallback/body capture as covered, while leaving other fallback-trigger status codes and full live chat/direct-responses schema capture as optional future isolated checks.
- Verified `bash sa/tests/test_responses_unavailable_fallback_runtime_isolated.sh`, `bash sa/tests/test_responses_fallback_runtime_isolated.sh`, `bash sa/tests/test_models_runtime_isolated.sh`, `bash sa/tests/test_request_log_runtime_isolated.sh`, full `sa test sa/tests/*.sa --trace-panic`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-responses-unavailable-fallback-runtime-check`, and `git diff --check`.

## SA Responses Large Body Runtime Coverage - 100%
- Added `sa/tests/test_responses_large_runtime_isolated.sh` as an isolated runtime contract for long `/v1/responses` request bodies and large native Responses SSE bodies. The script builds a temporary SA HubProxy binary, starts a temporary mock Responses upstream, writes generated `.env` files with `RESPONSES_BASE_URL` under a temporary root/cwd, uses random local ports, and avoids the root `.env`, `restart_sa.sh`, and port `28080`.
- The runtime check sends a non-stream `/v1/responses` request with a 90KB `input` tail marker, verifies the mock upstream receives the full body without truncation, proves configured upstream `authorization`/`x-api-key` are used while caller auth material and naked `api-key` are stripped, and verifies the JSON client response remains intact.
- The same script sends a stream request, has the mock upstream return a 90KB `text/event-stream` body with a tail marker, and verifies the client receives the large SSE response with `response.output_text.delta` and the tail marker present instead of disconnecting or truncating.
- Updated `sa/tests/deno_coverage_matrix.md` to count five isolated shell runtime contracts, mark direct live `/v1/responses` configured-auth/caller-auth-strip capture as covered, and mark long request / large SSE stability as covered by isolated runtime evidence.
- Verified `bash sa/tests/test_responses_large_runtime_isolated.sh`, `bash sa/tests/test_responses_unavailable_fallback_runtime_isolated.sh`, `bash sa/tests/test_responses_fallback_runtime_isolated.sh`, `bash sa/tests/test_models_runtime_isolated.sh`, `bash sa/tests/test_request_log_runtime_isolated.sh`, full `sa test sa/tests/*.sa --trace-panic`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-responses-large-runtime-check`, and `git diff --check`.

## SA Chat/Responses Schema Runtime Coverage - 100%
- Added `sa/tests/test_chat_responses_schema_runtime_isolated.sh` as an isolated runtime contract for direct live `/v1/chat/completions` and `/v1/responses` schema capture. The script builds a temporary SA HubProxy binary, starts one temporary mock upstream for both routes, writes generated `.env` files with both base URLs under a temporary root/cwd, uses random local ports, and avoids the root `.env`, `restart_sa.sh`, and port `28080`.
- The runtime check posts authenticated direct chat and direct Responses requests with caller `authorization`, `x-api-key`, and `api-key` headers, captures both upstream socket requests, and proves both routes use configured upstream `authorization: Bearer <OPENAI_API_KEY>` plus configured `x-api-key` while stripping caller auth material and naked `api-key`.
- It verifies direct chat strips Deno Responses-only `store`, `prompt_cache_key`, `include`, and `reasoning` fields while preserving `model`, `stream:false`, and messages; chat tools are normalized to nested OpenAI function schemas, namespace tools expand to `mcp__code_index__search`, and top-level plus namespace-child non-function tools are filtered out.
- It verifies direct non-Gemini Responses preserves `store`, `prompt_cache_key`, `include`, `reasoning`, and `input`; Responses tools are normalized to flat function schemas, namespace tools expand to `mcp__code_index__search`, and non-function tools are filtered out.
- Updated `sa/tests/deno_coverage_matrix.md` to count six isolated shell runtime contracts, mark direct live chat dispatch/socket auth stripping as covered, mark non-Gemini direct Responses live field preservation as covered, and mark full live chat/direct-Responses schema capture plus non-function filtering as covered.
- Verified `bash sa/tests/test_chat_responses_schema_runtime_isolated.sh`, all six isolated runtime scripts, full `sa test sa/tests/*.sa --trace-panic`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-chat-responses-schema-runtime-check`, and `git diff --check`.

## SA Empty Body Runtime No-Upstream Coverage - 100%
- Added `sa/tests/test_empty_body_runtime_isolated.sh` as an isolated runtime contract for Deno-style empty JSON proxy body rejection before any upstream call. The script builds a temporary SA HubProxy binary, starts a temporary mock upstream with a POST counter, writes generated `.env` files with both chat and Responses base URLs under a temporary root/cwd, uses random local ports, and avoids the root `.env`, `restart_sa.sh`, and port `28080`.
- The runtime check sends authenticated empty-body and ASCII-whitespace-body requests to both `/v1/chat/completions` and `/v1/responses`, verifies local HTTP 400 rejection, and proves the mock upstream POST count remains zero with no capture file written.
- Updated `sa/tests/deno_coverage_matrix.md` to count seven isolated shell runtime contracts and mark empty/whitespace chat plus Responses live no-upstream-call evidence as covered.
- Verified `bash sa/tests/test_empty_body_runtime_isolated.sh`, all seven isolated runtime scripts, full `sa test sa/tests/*.sa --trace-panic`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-empty-body-runtime-check`, and `git diff --check`.

## SA Common Header Passthrough Runtime Coverage - 100%
- Added production SA forwarding for common Deno non-sensitive upstream headers available through the current request-header facade: `openai-organization`, `openai-project`, `x-request-id`, `user-agent`, and `accept-language`. The forwarding path is shared by live `/v1/models`, direct `/v1/chat/completions`, direct `/v1/responses`, and Responses chat fallback requests while preserving the existing configured upstream `authorization` and `x-api-key` behavior.
- Extended `sa/tests/test_models_runtime_isolated.sh` to capture common passthrough headers on the public live `/v1/models` socket path, and extended `sa/tests/test_chat_responses_schema_runtime_isolated.sh` to assert the same common headers on direct live chat and direct live Responses socket captures.
- Updated `sa/tests/deno_coverage_matrix.md` to mark common non-sensitive header passthrough covered for the live proxy paths that now have isolated socket evidence, while explicitly keeping full arbitrary non-sensitive header enumeration as separate SA HTTP facade work because the current facade exposes lookup-by-name rather than header iteration.
- Verified `sa version` (`0.0.3.3`), `sa build sa/main.sa -o /tmp/hubproxy-header-passthrough-check`, `bash sa/tests/test_models_runtime_isolated.sh`, `bash sa/tests/test_chat_responses_schema_runtime_isolated.sh`, all 13 isolated runtime scripts, full `sa test sa/tests/*.sa --trace-panic`, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-common-header-passthrough-check`, and `git diff --check`.

## SA Authenticated Request Log Runtime Coverage - 100%
- Extended `sa/tests/test_request_log_runtime_isolated.sh` beyond the unauthorized `/rpc` path by starting a temporary mock chat upstream and sending an authenticated live `/v1/chat/completions` request through HubProxy with a temporary `.env`, random localhost ports, temporary `HUBPROXY_LOG_DIR`, and no root `.env`, `restart_sa.sh`, or port `28080` dependency.
- The runtime check now verifies the successful proxy response returns upstream content and that a request-log file is written for the success path with Deno-shaped route/method fields, redacted caller `authorization` and `x-api-key` previews, `content-type`, nonzero normalized `bodyBytes`, nonzero `rawBodyBytes`, the forwarded model, and user message content.
- Updated `sa/tests/deno_coverage_matrix.md` to move authenticated proxy success-path request logging from optional isolated evidence into covered live runtime evidence, while keeping the existing native helper/body/default-disabled coverage intact.
- Verified `bash sa/tests/test_request_log_runtime_isolated.sh`, all 13 isolated runtime scripts, `sa build sa/main.sa -o /tmp/hubproxy-request-log-success-check`, and `git diff --check`.

## SA Responses Fallback History Runtime Coverage - 100%
- Extended `sa/tests/test_responses_fallback_runtime_isolated.sh` so the live missing-base `/v1/responses` fallback request includes Responses history items: a `function_call` with `call_id`, tool name, and arguments, followed by a matching `function_call_output` with name and output content.
- The mock upstream socket capture now verifies the translated chat request contains an assistant `tool_calls` message preserving `call-live-history`, `exec_command`, and `{"cmd":"pwd"}`, followed by a `role:"tool"` message preserving `tool_call_id`, `name`, and `history output ok`, while still asserting configured upstream auth, caller-secret stripping, Responses-only field stripping, instructions/message preservation, namespace tool flattening, and normalized Responses JSON output.
- Updated `sa/tests/deno_coverage_matrix.md` to move function-call history fallback and tool message name preservation from native/plugin-only plus pending live evidence into covered isolated live proxy history capture.
- Verified `bash sa/tests/test_responses_fallback_runtime_isolated.sh`, all 13 isolated runtime scripts, `sa build sa/main.sa -o /tmp/hubproxy-fallback-history-check`, and `git diff --check`.

## SA Responses Fallback Stream Tool-Call Runtime Coverage - 100%
- Extended `sa/tests/test_responses_fallback_runtime_isolated.sh` with a second live missing-base `/v1/responses` request using `stream:true`. The temporary mock chat upstream now emits chat SSE tool-call chunks for `read`, direct `exec_command.command`, `.env` reads, single-quote file paths, and split tool-call arguments.
- The client-visible Responses SSE is asserted for stable Deno parity fragments: preserved `call_id`s (`call_read`, `call_cmd`, `call_read_env`, `call_read_quote`, `call_pwd`), `read` converted to `exec_command` with `cat '/tmp/demo.txt'`, direct command arguments converted to `cmd`, `.env` reads converted to a redacted `sed -E` command without an unredacted `cat`, single-quote paths shell-quoted, and split `{"cmd":"pwd"}` arguments merged.
- Updated `sa/tests/deno_coverage_matrix.md` to move chat fallback stream tool-call normalization from native/plugin-only plus pending live evidence into covered isolated live proxy streaming evidence through the missing-base fallback route.
- Verified `bash sa/tests/test_responses_fallback_runtime_isolated.sh`, all 13 isolated runtime scripts, `sa build sa/main.sa -o /tmp/hubproxy-fallback-stream-check`, and `git diff --check`.

## SA Native Responses Thinking Runtime Coverage - 100%
- Extended `sa/tests/test_chat_responses_schema_runtime_isolated.sh` so the direct live `/v1/responses` mock JSON response includes both an upstream `type:"thinking"` output item and a message-level `reasoning_content`. The client response now asserts those are normalized into `type:"reasoning"`, preserve `native json live think` and `message json live think`, preserve the assistant output text, and do not leak raw `type:"thinking"` or `reasoning_content`.
- Extended `sa/tests/test_responses_large_runtime_isolated.sh` so the direct live `/v1/responses` SSE mock response starts with a `response.output_item.done` `thinking` item before the existing 90KB output-text delta. The client SSE now asserts the thinking item is normalized to `reasoning` while the large SSE tail marker and `response.output_text.delta` delivery still pass.
- Updated `sa/tests/deno_coverage_matrix.md` to move native Responses stream/JSON thinking normalization from native/plugin-only plus pending live capture into covered isolated live JSON and SSE proxy evidence.
- Verified `bash sa/tests/test_chat_responses_schema_runtime_isolated.sh`, `bash sa/tests/test_responses_large_runtime_isolated.sh`, all 13 isolated runtime scripts, `sa build sa/main.sa -o /tmp/hubproxy-native-responses-thinking-check`, and `git diff --check`.

## SA Responses Fallback Namespace Stream Runtime Coverage - 100%
- Extended the live stream branch in `sa/tests/test_responses_fallback_runtime_isolated.sh` so the original Responses request declares the `mcp__demo_server__` namespace and the temporary mock chat upstream emits a `demo-server.rebuild` tool call.
- The client-visible Responses SSE now asserts Deno de-flattening semantics for the live fallback stream: `call_demo` is preserved, `namespace:"mcp__demo_server__"` and short `name:"rebuild"` are emitted, and the raw dotted `demo-server.rebuild` tool name is absent. The same stream still covers read/exec normalization, env redaction, shell quoting, and split argument merging.
- Updated `sa/tests/deno_coverage_matrix.md` to move chat fallback namespaced stream de-flattening from native/plugin-only plus pending live evidence into covered isolated live proxy behavior.
- Verified `bash sa/tests/test_responses_fallback_runtime_isolated.sh`, all 13 isolated runtime scripts, `sa build sa/main.sa -o /tmp/hubproxy-fallback-namespace-stream-check`, and `git diff --check`.

## SA Escaped JSON-RPC Params Runtime Coverage - 100%
- Extended `sa/tests/test_rpc_transport_runtime_isolated.sh` with a file-based live `/rpc` request generated by Python `json.dump`, avoiding hand-written JSON escaping in the test fixture.
- The new request calls `environment/add` with params containing both quotes and backslashes (`name: env "quoted"`, `path: /tmp/a\\b`) and verifies the JSON-RPC response preserves the string id plus decoded `name` and `path` exactly in the thin response payload.
- Updated `sa/tests/deno_coverage_matrix.md` to move escaped quote/backslash JSON-RPC params from parser/std-only plus pending live evidence into covered isolated live `/rpc` transport echo evidence.
- Verified `bash sa/tests/test_rpc_transport_runtime_isolated.sh`, all 13 isolated runtime scripts, `sa build sa/main.sa -o /tmp/hubproxy-rpc-escaped-params-check`, and `git diff --check`.

## SA Memory Reset Live RPC Coverage - 100%
- Fixed `send_rpc_memory_reset` so the `/rpc` response now follows Deno's external `params.threadId ?? ""` behavior instead of echoing the resolved internal numeric thread id after state reset. The writer now extracts the caller-provided `threadId` string before clearing runtime state and returns that value in `{ reset: true, threadId }`.
- Extended `sa/tests/test_thread_rpc_transport_runtime_isolated.sh` to call live `/rpc` `memory/reset` after the thread lifecycle flow and verify the response envelope returns `reset:true` plus external `threadId:"live-thread"`, then verifies a subsequent live `thread/list` returns an empty list from the same isolated process.
- Updated `sa/tests/deno_coverage_matrix.md` to move `memory/reset` live `/rpc` response envelope evidence from pending isolated runtime coverage into covered live transport evidence, while keeping native wildcard `thread/closed` event coverage intact.
- Verified `sa test sa/tests/thread_rpc_contract_test.sa --trace-panic`, `bash sa/tests/test_thread_rpc_transport_runtime_isolated.sh`, full `sa test sa/tests/*.sa --trace-panic`, all 13 isolated runtime scripts, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-memory-reset-live-final-check`, and `git diff --check`.

## SA Events Injected Item Live SSE Coverage - 100%
- Extended `sa/tests/test_events_runtime_isolated.sh` so the existing authenticated live `/events` SSE connection now triggers `thread/inject_items` over live `/rpc` after `thread/start` and `turn/start`.
- The runtime check verifies the `thread/inject_items` response returns external `threadId:"event-thread"` and `injectedCount:1`, then parses live SSE frames for injected item `item/started`, `rawResponseItem/completed`, and `item/completed` events with Deno-shaped `method`/`params`, external thread id, consistent generated turn id, item JSON, and started/completed timestamp fields.
- Updated `sa/tests/deno_coverage_matrix.md` to move item lifecycle live `/events` evidence out of the remaining optional event-family snapshots; remaining optional live event snapshots are now fs/realtime/MCP/warning families, which still have native queue coverage.
- Verified `bash sa/tests/test_events_runtime_isolated.sh`, full `sa test sa/tests/*.sa --trace-panic`, all 13 isolated runtime scripts, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-events-item-live-check`, and `git diff --check`.

## SA Goal Budget Live RPC Coverage - 100%
- Extended `sa/tests/test_thread_goal_timestamp_runtime_isolated.sh` after its existing timestamp/event checks with isolated live `/rpc` `thread/goal/set` calls for Deno budget edge cases.
- The runtime check now verifies `budgetLimited` with `tokenBudget:null` returns a Deno-shaped goal envelope with `tokenBudget:null`, and `usageLimited` with a string `tokenBudget:"789"` also returns `tokenBudget:null`, while preserving the external `threadId` and requested objective/status values.
- Updated `sa/tests/deno_coverage_matrix.md` so the goal status/tokenBudget row now counts live `/rpc` evidence for numeric, null, and string budget cases instead of leaving the HTTP contract as pending runtime evidence.
- Verified `bash sa/tests/test_thread_goal_timestamp_runtime_isolated.sh`, all 13 isolated runtime scripts, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-goal-budget-live-check`, and `git diff --check`.

## SA Realtime Append/Stop Native Writer Coverage - 100%
- Extracted `json_writer_write_realtime_thread_result` in `sa/src/rpc_system.sa(.sai)` so `thread/realtime/appendAudio`, `thread/realtime/appendText`, and `thread/realtime/stop` result shapes can be verified through the native SA gate instead of a shell runtime contract.
- Routed `send_rpc_realtime_thread` through the shared writer helper while preserving the Deno-shaped fields: append responses emit `appended:true`, external `threadId`, and `kind:"audio"`/`kind:"text"`; stop responses emit `stopped:true` plus external `threadId` and do not include append-only `kind` fields.
- Added native `@test` coverage in `sa/tests/mcp_rpc_contract_test.sa` for audio append, text append, and stop result writer output. Existing native coverage in the same file still covers realtime start dynamic UUID/timestamp fields and realtime queue event frames.
- Updated `sa/tests/deno_coverage_matrix.md` so realtime append/stop response shape is counted as native writer evidence, and shell runtime scripts are documented as non-unit transport probes rather than the default SA gate.
- Verified `sa test sa/tests/mcp_rpc_contract_test.sa --filter "realtime append" --trace-panic`, full `sa test <each current sa/tests/*.sa> --trace-panic` native sweep, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-realtime-thread-result-check`, and `git diff --check`. No `.sh` unit-test script was used for this increment.

## SA Realtime SDP/Error Native Event Coverage - 100%
- Added `notify_rt_string_value` in `sa/src/rpc_system.sa(.sai)` so Deno realtime string-value event families can be emitted through the shared notification queue without a shell runtime contract.
- Extended `sa/tests/mcp_rpc_contract_test.sa` native coverage for `thread/realtime/sdp` and `thread/realtime/error`, matching the Deno `HubState` event surface with external `threadId` plus `sdp`/`error` params.
- Updated `sa/tests/deno_coverage_matrix.md` so the realtime event bridge row now includes native queue coverage for started, itemAdded, outputAudio/delta, transcript delta/done, sdp, error, and closed.
- Verified `sa test sa/tests/mcp_rpc_contract_test.sa --filter "fs process" --trace-panic`, full `sa test <each current sa/tests/*.sa> --trace-panic` native sweep, `sa test sa/tests/model_list_contract_test.sa --compile-only --include-ignored --trace-panic`, `sa build sa/main.sa -o /tmp/hubproxy-realtime-sdp-error-check`, and `git diff --check`. No `.sh` unit-test script was used for this increment.
