# SA HubProxy Work Report

Date: 2026-05-29

## Scope

This report summarizes the current SA HubProxy refactor status after pausing implementation. It covers work completed in HubProxy and SCI, remaining gaps, defects found, improvements already made, and the next plan.

The target remains: HubProxy should run as an SA project, read runtime configuration from the repository root `.env`, use `SA_PORT=28080` for the SA service, and avoid relying on Deno or hand-written Zig link scripts for final runtime.

## Implemented

### SA Runtime Entry And Configuration

- Added and adopted `restart_sa.sh` as the SA startup entrypoint.
- `restart_sa.sh` reads `SA_PORT` from the repository root `.env`, defaulting to `28080`.
- `restart_sa.sh` only clears the configured SA port before starting `sa/hubproxy`; it does not target the Deno port.
- Deno remains expected on its own port, currently `PORT=27787`, and must not be reused by SA.

### HubProxy SA Build

- `sa/main.sa` is the main SA entry point.
- Local HubProxy SA modules are imported as implementation modules, not only interface declarations.
- The SA binary has previously built successfully with:
  - `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`
- The last reported successful build produced roughly:
  - `compile_tokens`: about 32143
  - `instruction_count`: about 15414

### HTTP Plugin Linking

- SCI was improved so installed HTTP plugin shared libraries can be discovered and linked automatically from `.external` FFI references.
- Plugin rpath handling was added so linked plugin `.so` files can be found at runtime.
- Official HTTP demos were previously verified:
  - `301_http_client_saasm`
  - `302_http_server_saasm`
- HubProxy no longer needs a project-local hand-written `zig cc` link script for HTTP plugin use.

### SCI Compiler/Verifier Fixes

- Fixed a verifier false-positive around bodyless `@extern` declarations at end of file.
- This removed the need for a dummy HubProxy import sentinel after `.sai` imports.
- Added a focused SCI regression test for bodyless extern handling.

### SA Std/Deno Compatibility Work

- Added and expanded Deno-like SA std macros for common porting paths:
  - text encode/decode aliases
  - Date/time aliases
  - command output aliases
  - HTTP response body slice helper macro
  - request/header aliases
  - JSON parse/stringify aliases
  - Responses/Chat fallback helpers
- Added SA std runtime helpers for Responses API compatibility:
  - Chat SSE to Responses event normalization
  - Chat JSON to Responses JSON normalization
  - Responses request normalization
  - Responses-to-Chat fallback request construction
- Added `sa_deno_jsonrpc_params_string_literal`, exposed through:
  - `src/runtime/sa_std.zig`
  - `src/runtime/sa_std.h`
  - `sa_std/deno.sai`
  - `sa_std/deno.sa`

### Responses API Fallback

- Fixed a Responses fallback bug where Codex received `OutputTextDelta` without an active item.
- Root cause was in SA std fallback SSE generation, not in HTTP linking.
- Added output item tracking and one-shot reasoning finalization in SA std.
- Fixed tool-history fallback so `function_call_output` can recover tool names from previous tool call items by `call_id`.

### Model List And OpenAI-Compatible Runtime

- `/v1/models` support was implemented and covered by a focused SA contract test.
- `/v1/chat/completions` was previously verified through curl against the SA service on port `28080`.
- `codex exec --config model_provider=sa --config model='"mimo-v2.5-pro"' "hello"` was previously verified to return a normal assistant response.

### Focused Tests Previously Passing

The following focused tests were reported passing during this refactor:

- SCI:
  - `zig test tests/std_smoke_core.zig --test-filter "JSON-RPC params string literal"`
  - Responses fallback focused tests in `tests/std_smoke_core.zig`
  - verifier bodyless extern focused test
- HubProxy SA:
  - `/home/vscode/.sa/bin/sa test tests/model_list_contract_test.sa --jobs 1`
  - `/home/vscode/.sa/bin/sa test tests/unit_tests.sa --jobs 1`
  - `/home/vscode/.sa/bin/sa test tests/responses_chat_fallback_request_test.sa --jobs 1`
  - selected shell parity tests that already existed for runtime HTTP behavior

## Not Completed

### Final End-To-End Completion Is Not Yet Reconfirmed

The final requested state has not been fully reconfirmed after the latest interruptions:

- Build from clean current files.
- Install the latest SCI compiler/std package.
- Restart with `restart_sa.sh`.
- Verify `/healthz`.
- Verify OpenAI-compatible chat curl against `127.0.0.1:28080`.
- Verify `codex exec "hello"` through the SA provider.

These checks were passed earlier, but not repeated after the last partial investigation.

### Remaining JSON-RPC Byte-Scan Paths

HubProxy still has residual `rpc_extract_string_after` and related byte-scan use sites.

The high-risk class is JSON string extraction from JSON-RPC params. Escaped JSON strings such as:

```json
{"params":{"command":"say \"hello\"","path":"/tmp/a\\b"}}
```

can be truncated or interpreted incorrectly if extracted by raw byte scan instead of JSON parsing.

Partially fixed:

- `environment/add`
- `review/start`

Still requiring concentrated review/migration:

- notification/event builders using `threadId`, `turnId`, `itemId`, `message`, `serverName`, `role`, `query`, `sessionId`
- thin RPC response handlers such as:
  - `thread/shellCommand`
  - `thread/memoryMode/set`
  - `item/toolCall`
  - `mcpServer/tool/call`
  - `remoteControl/status/*`
  - `mcpServer/status/list`
  - `mcpServer/resource/read`
  - `fuzzyFileSearch/*`
  - `serverRequest/resolved`
- filesystem/process/state paths that use raw extracted strings for real operations, not only response JSON.

### Std Helper Needs One More Compatibility Pass

`sa_deno_jsonrpc_params_string_literal` currently expects a clean param key such as `threadId`.

HubProxy still has many historical key constants shaped like `"threadId":"`. To migrate all helpers with minimal churn, SCI std should either:

- accept both clean keys and legacy JSON-fragment keys, or
- HubProxy should introduce clean `FB_KEY_*` constants for every migrated param.

The first option is lower churn and was the next planned patch before this pause.

### SA Native Unit Tests Need Additional Coverage

User explicitly required new regression tests to use SA native `@test` where possible, not external shell scripts.

Additional SA tests still needed:

- JSON-RPC escaped string params for thin methods:
  - `thread/shellCommand`
  - `mcpServer/tool/call`
  - `fuzzyFileSearch`
  - `serverRequest/resolved`
- Fallback behavior when `/v1/responses` returns 404 and chat fallback should be used.
- `.env`/`SA_PORT=28080` restart behavior can stay as a shell startup contract, but business behavior should be SA-tested where possible.

## Defects Found

### 1. HTTP Plugin Auto-Linking Was Insufficient

Symptom:

- HTTP client/server plugin symbols such as `sa_http_*` failed at link time unless manually linked.

Root cause:

- SCI did not fully collect `.external` FFI references and map them to installed plugin shared libraries for native linking.

Status:

- Fixed in SCI plugin/linking flow.

### 2. Verifier Mishandled Bodyless `@extern` At File End

Symptom:

- A final imported extern declaration could trigger a false `MemoryLeak` because verifier treated its signature params as live function-body registers.

Root cause:

- The verifier performed normal end-of-function live-register validation for bodyless extern declarations.

Status:

- Fixed in SCI verifier.

### 3. HubProxy Used Byte Scan Instead Of JSON For Params

Symptom:

- Escaped params containing `\"` or `\\` were not preserved correctly.

Root cause:

- HubProxy had helper functions that searched for `"key":"` and stopped at the next quote byte, which is not valid JSON string parsing.

Status:

- Root helper was added to SA std.
- Two HubProxy call sites were migrated.
- More call sites remain.

### 4. Responses Fallback SSE Could Break Codex Active Item State

Symptom:

- Codex warned about `OutputTextDelta without active item`.

Root cause:

- SA std fallback SSE finalized reasoning after message streaming had started, clearing the active item expected by Codex.

Status:

- Fixed in SA std and covered by focused tests.

### 5. Responses Tool Output Name Was Lost

Symptom:

- Chat fallback for Responses `function_call_output` could omit the tool `name`.

Root cause:

- SA std did not retain `call_id -> name` from prior tool call input items.

Status:

- Fixed in SA std.

## Improvements Made

### Compiler/Toolchain

- SCI compiler install flow was updated to install optimized ReleaseFast builds.
- SCI plugin linking was made more automatic.
- SCI verifier was hardened around extern declarations.
- More compiler/std defects are now recorded in `Agents.md`.

### SA Std

- More Deno-compatible macro surface was added.
- JSON and Responses helpers were moved into std/runtime instead of duplicating complex JSON logic inside HubProxy.
- Focused std smoke tests were added for the new helpers.

### HubProxy

- SA project structure now builds through `sa build`.
- SA service configuration reads root `.env`.
- SA runtime uses port `28080`, separate from Deno.
- Model list, chat completions, responses fallback, selected RPC methods, state, config, and HTTP contract paths have focused tests.

## Current Risks

- The worktree is dirty in both HubProxy and SCI; unrelated user/generated changes must not be reverted.
- HubProxy `sa/` is still untracked in Git status, so final commit planning must explicitly decide what to add.
- Some previous verification results may be stale because source changed after they passed.
- Instruction count is still high, around 15K instructions for HubProxy, because much JSON-RPC construction remains expanded in SA instead of moved into std helper abstractions.
- Filesystem/process handlers may still mishandle escaped JSON strings when the unescaped value is needed for real OS semantics.

## Future Plan

### Phase 1: Finish JSON-RPC Param Root Fix

1. Update `sa_deno_jsonrpc_params_string_literal` to normalize legacy key fragments like `"threadId":"` into `threadId`, or add clean key constants in HubProxy.
2. Rewrite existing `rpc_builder_append_param_string_or_default`, `rpc_builder_append_param_string_or_null`, and `rpc_builder_append_param_string_or_alt_default` to call the std JSON helper.
3. Remove or isolate `rpc_builder_append_param_raw_or_default`, replacing event builders with full JSON string literal appends.
4. Add focused SCI test coverage for legacy key normalization.
5. Add focused HubProxy SA `@test` coverage for escaped params in thin RPC methods.

### Phase 2: Rebuild And Runtime Verify

1. Run focused SCI tests only.
2. Install SCI/std with:
   - `tools/install.sh --dir /home/vscode/.sa --no-shell`
3. Build HubProxy:
   - `/home/vscode/.sa/bin/sa build main.sa -o hubproxy --json`
4. Start SA only through:
   - `setsid -f ./restart_sa.sh > /tmp/hubproxy_sa_restart/restart_sa.log 2>&1 < /dev/null`
5. Verify:
   - `ss -ltnp | rg ':28080|:27787'`
   - `curl http://127.0.0.1:28080/healthz`
   - OpenAI chat curl to `/v1/chat/completions`
   - `codex exec --config model_provider=sa --config model='"mimo-v2.5-pro"' "hello"`

### Phase 3: Reduce Instruction Count

1. Move repeated JSON-RPC response builders into std helpers or SA macros.
2. Prefer std JSON DOM/stringify helpers for object construction when output shape is repeated.
3. Keep HubProxy SA focused on routing, config, state, and plugin calls.
4. Measure instruction count after each batch.

### Phase 4: Decide Commit Boundaries

Suggested commits:

1. SCI compiler/plugin/std fixes.
2. HubProxy SA runtime and build structure.
3. HubProxy RPC/Responses compatibility.
4. Documentation and test matrix updates.

## Immediate Status At Pause

- Implementation is paused by user request.
- No new runtime verification was run after this report request.
- `docs/sa_hubproxy_work_report.md` is the current handoff report.
