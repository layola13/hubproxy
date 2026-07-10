from __future__ import annotations

# @origin sa/src/events.sai:7
def rpc_builder_new() -> ptr:
    ...

# @origin sa/src/events.sai:8
def rpc_builder_new_capacity(capacity: u64) -> ptr:
    ...

# @origin sa/src/events.sai:9
def rpc_builder_len(buf: ptr) -> u64:
    ...

# @origin sa/src/events.sai:10
def rpc_builder_data(buf: ptr) -> Any:
    ...

# @origin sa/src/events.sai:11
def rpc_builder_append(buf: ptr, src: ptr, src_len: u64) -> u32:
    ...

# @origin sa/src/events.sai:12
def rpc_builder_append_sse_frame(buf: ptr, event_ptr: ptr, event_len: u64, data_ptr: ptr, data_len: u64) -> u32:
    ...

# @origin sa/src/events.sai:13
def rpc_builder_append_byte(buf: ptr, byte_ptr: ptr) -> u32:
    ...

# @origin sa/src/events.sai:14
def rpc_builder_to_owned(buf: ptr, out_len: ptr) -> ptr:
    ...

# @origin sa/src/events.sai:15
def notify_push_frame(state_ptr: ptr, frame: ptr) -> u32:
    ...

# @origin sa/src/events.sai:16
def rpc_builder_push_state(state_ptr: ptr, buf: ptr) -> u32:
    ...

# @origin sa/src/events.sai:17
def notify_const_params(state_ptr: ptr, event_ptr: ptr, event_len: u64, params_ptr: ptr, params_len: u64) -> u32:
    ...

# @origin sa/src/events.sai:18
def notify_writer_params(state_ptr: ptr, event_ptr: ptr, event_len: u64, writer: ptr) -> u32:
    ...

# @origin sa/src/events.sai:19
def spawn_event_stream(ctx: ptr) -> u32:
    ...

# @origin sa/src/events.sai:20
def notify_mcp_tool_progress(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/events.sai:21
def notify_user_input_request(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/events.sai:22
def notify_mcp_elicitation_request(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/events.sai:23
def notify_world_warning_params(state_ptr: ptr) -> u32:
    ...

# @origin sa/src/events.sai:24
def notify_mcp_startup_params(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/events.sai:25
def notify_skills_changed(state_ptr: ptr) -> u32:
    ...
