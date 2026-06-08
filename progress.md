# SA JSON Macro Migration Progress

- Current progress: 100%
- Updated: 2026-06-08 Asia/Shanghai

## Completed
- Converted many simple RPC response builders in `sa/main.sa` from low-level `sa_json_writer_*` sequences to `sa std` `JSON_WRITER_*` macros.
- Converted multiple notify/event builders and remote/realtime helpers.
- Converted `build_request_context_body` writer scaffolding and mode field writes.
- Converted `build_native_progress_continuation` JSON writer scaffolding.
- Converted normalized tool temporary array writers.
- Converted `send_jsonrpc_envelope_with_id` writer scaffolding and null-field branches.
- Converted `build_chat_proxy_body` and `build_responses_proxy_body` writer scaffolding and object end paths.
- Converted `send_rpc_external_detect` object/array writer scaffolding.
- Converted `send_rpc_experimental_enablement_set` raw object writer branch.
- Converted thread/turn object helper internals to `JSON_WRITER_*` macros where applicable.
- Converted response/chat tool helper internals to `JSON_WRITER_*` macros where applicable.
- Converted final niche helper-level direct field/null writer calls.

## Remaining
- None for the targeted manual JSON writer patterns in `sa/main.sa`.
