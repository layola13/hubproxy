from __future__ import annotations

# @origin sa/src/request_context.sai:3
def body_collaboration_mode(body: ptr, body_len: u64) -> u8:
    ...

# @origin sa/src/request_context.sai:4
def collaboration_mode_known_code(mode_ptr: ptr, mode_len: u64) -> u8:
    ...

# @origin sa/src/request_context.sai:5
def state_turn_set_normalized_mode_text(state_ptr: ptr, thread_id: u64, turn_id: u64, mode_ptr: ptr, mode_len: u64) -> u8:
    ...

# @origin sa/src/request_context.sai:6
def rpc_turn_start_collaboration_mode(body: ptr, body_len: u64) -> u8:
    ...

# @origin sa/src/request_context.sai:7
def rpc_turn_start_set_collaboration_mode(state_ptr: ptr, thread_id: u64, turn_id: u64, body: ptr, body_len: u64) -> u8:
    ...

# @origin sa/src/request_context.sai:8
def body_collaboration_mode_fallback(body: ptr, body_len: u64) -> u8:
    ...

# @origin sa/src/request_context.sai:9
def body_allows_progress_continuation(body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/request_context.sai:10
def build_request_context_body(body: ptr, body_len: u64, mode: u8, out_len: ptr) -> ptr:
    ...

# @origin sa/src/request_context.sai:11
def response_request_context_mode_from_ids(state_ptr: ptr, thread_ptr: ptr, thread_len: u64, turn_ptr: ptr, turn_len: u64, body: ptr, body_len: u64) -> u8:
    ...

# @origin sa/src/request_context.sai:12
def response_request_context_mode(req: ptr, state_ptr: ptr, body: ptr, body_len: u64) -> u8:
    ...

# @origin sa/src/request_context.sai:13
def build_response_request_context_body(req: ptr, state_ptr: ptr, body: ptr, body_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/request_context.sai:14
def responses_sse_is_progress_message(body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/request_context.sai:15
def build_native_progress_continuation(out_len: ptr) -> ptr:
    ...

# @origin sa/src/request_context.sai:16
def rpc_canonicalize_body(body: ptr, body_len: u64, out_ptr: ptr, out_len: ptr, out_buffer: ptr) -> u32:
    ...

# @origin sa/src/request_context.sai:17
def append_with_replacement(buf: ptr, src: ptr, src_len: u64, needle: ptr, needle_len: u64, replacement: ptr, replacement_len: u64) -> u32:
    ...

# @origin sa/src/request_context.sai:18
def chat_fallback_sse_to_responses_body(body: ptr, body_len: u64, req_body: ptr, req_body_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/request_context.sai:19
def body_has_responses_tool_history(body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/request_context.sai:20
def body_is_unsafe_gemini_chat_fallback(body: ptr, body_len: u64) -> u32:
    ...
