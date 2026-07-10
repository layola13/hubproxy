from __future__ import annotations

# import request_context.sai
# import sa_std/encoding/json.sa
# import sa_std/encoding/json.sai
# import deno.sal
# import sa_http_server.sai
# import events.sai
# import json_support.sai
# import proxy.sai
# import rpc_parse.sai
# import state.sai
# import strings.sai

# @origin sa/src/request_context.sa:175
def body_collaboration_mode(body: ptr, body_len: u64) -> u8:
    sa_deno_plugin_infer_collaboration_mode(...)
    return body_collaboration_mode_fallback(...)

# @origin sa/src/request_context.sa:215
def min_u64(a: u64, b: u64) -> u64:
    ...

# @origin sa/src/request_context.sa:230
def ascii_is_trim_ws(byte: u8) -> u8:
    ...

# @origin sa/src/request_context.sa:252
def ascii_lower_byte(byte: u8) -> u8:
    ...

# @origin sa/src/request_context.sa:273
def collaboration_mode_known_code(mode_ptr: ptr, mode_len: u64) -> u8:
    ascii_is_trim_ws(...)
    return ascii_lower_byte(...)

# @origin sa/src/request_context.sa:554
def state_turn_set_normalized_mode_text(state_ptr: ptr, thread_id: u64, turn_id: u64, mode_ptr: ptr, mode_len: u64) -> u8:
    ascii_is_trim_ws(...)
    state_turn_set_mode_text(...)
    min_u64(...)
    ascii_lower_byte(...)
    return collaboration_mode_known_code(...)

# @origin sa/src/request_context.sa:712
def rpc_turn_start_collaboration_mode(body: ptr, body_len: u64) -> u8:
    sa_json_parse(...)
    sa_json_object_get(...)
    sa_json_object_get_string(...)
    collaboration_mode_known_code(...)
    return sa_json_free(...)

# @origin sa/src/request_context.sa:852
def rpc_turn_start_set_collaboration_mode(state_ptr: ptr, thread_id: u64, turn_id: u64, body: ptr, body_len: u64) -> u8:
    sa_json_parse(...)
    sa_json_object_get(...)
    sa_json_object_get_string(...)
    state_turn_set_normalized_mode_text(...)
    return sa_json_free(...)

# @origin sa/src/request_context.sa:952
def body_collaboration_mode_fallback(body: ptr, body_len: u64) -> u8:
    rpc_turn_start_collaboration_mode(...)
    return bytes_has(...)

# @origin sa/src/request_context.sa:1082
def body_allows_progress_continuation(body: ptr, body_len: u64) -> u32:
    bytes_has(...)
    return body_collaboration_mode(...)

# @origin sa/src/request_context.sa:1125
def build_request_context_body(body: ptr, body_len: u64, mode: u8, out_len: ptr) -> ptr:
    sa_json_parse(...)
    sa_json_kind(...)
    sa_json_value_count(...)
    sa_json_object_key_at(...)
    sa_bytes_eq(...)
    sa_json_object_get(...)
    sa_json_writer_field_node(...)
    sa_json_free(...)
    json_writer_finish_view(...)
    json_buffer_to_owned_and_free(...)
    json_writer_dispose(...)
    return copy_bytes_owned(...)

# @origin sa/src/request_context.sa:1370
def response_request_context_mode_from_ids(state_ptr: ptr, thread_ptr: ptr, thread_len: u64, turn_ptr: ptr, turn_len: u64, body: ptr, body_len: u64) -> u8:
    body_collaboration_mode(...)
    sa_bytes_to_u64(...)
    state_thread_find_by_key(...)
    return state_turn_find(...)

# @origin sa/src/request_context.sa:1525
def response_request_context_mode(req: ptr, state_ptr: ptr, body: ptr, body_len: u64) -> u8:
    sa_http_server_req_get_header(...)
    return response_request_context_mode_from_ids(...)

# @origin sa/src/request_context.sa:1554
def build_response_request_context_body(req: ptr, state_ptr: ptr, body: ptr, body_len: u64, out_len: ptr) -> ptr:
    response_request_context_mode(...)
    return build_request_context_body(...)

# @origin sa/src/request_context.sa:1566
def responses_sse_is_progress_message(body: ptr, body_len: u64) -> u32:
    return bytes_has(...)

# @origin sa/src/request_context.sa:1774
def build_native_progress_continuation(out_len: ptr) -> ptr:
    json_writer_finish_view(...)
    json_writer_begin_field_object(...)
    rpc_builder_new_capacity(...)
    rpc_builder_append_sse_frame(...)
    rpc_builder_append(...)
    rpc_builder_to_owned(...)
    return json_writer_dispose_finished(...)

# @origin sa/src/request_context.sa:1880
def rpc_canonicalize_body(body: ptr, body_len: u64, out_ptr: ptr, out_len: ptr, out_buffer: ptr) -> u32:
    sa_json_parse(...)
    json_stringify_view(...)
    return sa_json_free(...)

# @origin sa/src/request_context.sa:1943
def append_with_replacement(buf: ptr, src: ptr, src_len: u64, needle: ptr, needle_len: u64, replacement: ptr, replacement_len: u64) -> u32:
    sa_bytes_eq(...)
    rpc_builder_append(...)
    return rpc_builder_append_byte(...)

# @origin sa/src/request_context.sa:2014
def chat_fallback_sse_to_responses_body(body: ptr, body_len: u64, req_body: ptr, req_body_len: u64, out_len: ptr) -> ptr:
    sa_deno_plugin_chat_sse_to_responses(...)
    plugin_buffer_to_owned_and_free(...)
    return copy_bytes_owned(...)

# @origin sa/src/request_context.sa:2048
def body_has_responses_tool_history(body: ptr, body_len: u64) -> u32:
    return sa_bytes_find(...)

# @origin sa/src/request_context.sa:2158
def body_is_unsafe_gemini_chat_fallback(body: ptr, body_len: u64) -> u32:
    body_is_gemini_responses_request(...)
    return body_has_responses_tool_history(...)
