from __future__ import annotations

# import events.sai
# import sa_std/encoding/json.sa
# import sa_std/encoding/json.sai
# import sa_http_server.sai
# import deno.sal
# import strings.sai
# import json_support.sai
# import proxy.sai
# import rpc_emit.sai
# import rpc_parse.sai
# import state.sai

# @origin sa/src/events.sa:14
def pthread_spawn_detached(entry: ptr, arg: ptr) -> i32:
    ...

# @origin sa/src/events.sa:140
def rpc_builder_new() -> ptr:
    ...

# @origin sa/src/events.sa:146
def rpc_builder_new_capacity(capacity: u64) -> ptr:
    ...

# @origin sa/src/events.sa:155
def rpc_builder_len(buf: ptr) -> u64:
    ...

# @origin sa/src/events.sa:161
def rpc_builder_data(buf: ptr) -> Any:
    ...

# @origin sa/src/events.sa:170
def rpc_builder_append(buf: ptr, src: ptr, src_len: u64) -> u32:
    return sa_bytes_copy(...)

# @origin sa/src/events.sa:188
def rpc_builder_append_sse_frame(buf: ptr, event_ptr: ptr, event_len: u64, data_ptr: ptr, data_len: u64) -> u32:
    return rpc_builder_append(...)

# @origin sa/src/events.sa:207
def rpc_builder_append_byte(buf: ptr, byte_ptr: ptr) -> u32:
    return rpc_builder_append(...)

# @origin sa/src/events.sa:215
def rpc_builder_to_owned(buf: ptr, out_len: ptr) -> ptr:
    rpc_builder_data(...)
    rpc_builder_len(...)
    return bytes_to_owned(...)

# @origin sa/src/events.sa:226
def notify_push_frame(state_ptr: ptr, frame: ptr) -> u32:
    rpc_builder_data(...)
    rpc_builder_len(...)
    return state_notify_push(...)

# @origin sa/src/events.sa:238
def rpc_builder_push_state(state_ptr: ptr, buf: ptr) -> u32:
    rpc_builder_data(...)
    rpc_builder_len(...)
    return state_notify_push(...)

# @origin sa/src/events.sa:250
def notify_const_params(state_ptr: ptr, event_ptr: ptr, event_len: u64, params_ptr: ptr, params_len: u64) -> u32:
    sa_json_parse(...)
    sa_json_writer_field_node(...)
    sa_json_free(...)
    json_writer_field_empty_object(...)
    json_writer_finish_view(...)
    rpc_builder_new(...)
    rpc_builder_append_sse_frame(...)
    notify_push_frame(...)
    return json_writer_dispose_finished(...)

# @origin sa/src/events.sa:303
def notify_writer_params(state_ptr: ptr, event_ptr: ptr, event_len: u64, writer: ptr) -> u32:
    json_writer_finish_view(...)
    notify_const_params(...)
    return json_writer_dispose_finished(...)

# @origin sa/src/events.sa:324
def event_stream_worker(ctx: ptr) -> i32:
    sa_http_server_resp_stream_new(...)
    sa_http_server_resp_stream_write(...)
    sa_http_server_resp_stream_flush(...)
    state_notify_cursor(...)
    state_notify_read(...)
    sa_http_server_resp_stream_end(...)
    sa_http_server_resp_stream_free(...)
    return sa_http_server_req_free(...)

# @origin sa/src/events.sa:435
def spawn_event_stream(ctx: ptr) -> u32:
    return pthread_spawn_detached(...)

# @origin sa/src/events.sa:448
def notify_mcp_tool_progress(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    plugin_random_uuid(...)
    notify_writer_params(...)
    return plugin_free_buffer(...)

# @origin sa/src/events.sa:512
def notify_user_input_request(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    plugin_random_uuid(...)
    json_writer_begin_field_array(...)
    notify_writer_params(...)
    return plugin_free_buffer(...)

# @origin sa/src/events.sa:596
def notify_mcp_elicitation_request(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    rpc_extract_param_string(...)
    plugin_random_uuid(...)
    json_writer_begin_field_object(...)
    json_writer_field_empty_object(...)
    json_writer_field_empty_array(...)
    notify_writer_params(...)
    return plugin_free_buffer(...)

# @origin sa/src/events.sa:685
def notify_world_warning_params(state_ptr: ptr) -> u32:
    json_writer_field_empty_array(...)
    return notify_writer_params(...)

# @origin sa/src/events.sa:703
def notify_mcp_startup_params(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    return notify_writer_params(...)

# @origin sa/src/events.sa:731
def notify_skills_changed(state_ptr: ptr) -> u32:
    return notify_writer_params(...)
