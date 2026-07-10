from __future__ import annotations

# @origin sa/src/proxy.sai:3
def plugin_buffer_to_owned_and_free(buf_ptr: ptr, buf_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/proxy.sai:4
def plugin_free_buffer(buf_ptr: ptr, buf_len: u64) -> u32:
    ...

# @origin sa/src/proxy.sai:5
def plugin_random_uuid(out_ptr: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/src/proxy.sai:6
def plugin_date_now_iso(out_ptr: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/src/proxy.sai:7
def http_response_read_all(resp: ptr, out_ptr: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/src/proxy.sai:8
def normalize_responses_client_json_body(body: ptr, body_len: u64, req_body: ptr, req_body_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/proxy.sai:9
def normalize_chat_fallback_json_body(body: ptr, body_len: u64, req_body: ptr, req_body_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/proxy.sai:10
def normalize_responses_client_sse_body(body: ptr, body_len: u64, source_req_body: ptr, source_req_body_len: u64, context_req_body: ptr, context_req_body_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/proxy.sai:11
def chat_proxy_is_tools_key(key: ptr, key_len: u64) -> u32:
    ...

# @origin sa/src/proxy.sai:12
def chat_proxy_is_drop_key(key: ptr, key_len: u64) -> u32:
    ...

# @origin sa/src/proxy.sai:13
def body_is_gemini_responses_request(body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/proxy.sai:14
def build_chat_fallback_body(body: ptr, body_len: u64, model_ptr: ptr, model_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/proxy.sai:15
def json_writer_write_responses_tool_source(writer: ptr, tool_node: ptr, source_node: ptr, prefix: ptr, prefix_len: u64) -> u32:
    ...

# @origin sa/src/proxy.sai:16
def json_writer_write_responses_tool(writer: ptr, tool_node: ptr, prefix: ptr, prefix_len: u64) -> u32:
    ...

# @origin sa/src/proxy.sai:17
def json_writer_write_responses_namespace_tools(writer: ptr, ns_node: ptr) -> u32:
    ...

# @origin sa/src/proxy.sai:18
def json_writer_field_normalized_responses_tools(writer: ptr, tools_node: ptr) -> u32:
    ...

# @origin sa/src/proxy.sai:19
def json_writer_write_chat_tool_source(writer: ptr, tool_node: ptr, source_node: ptr, prefix: ptr, prefix_len: u64) -> u32:
    ...

# @origin sa/src/proxy.sai:20
def json_writer_write_chat_tool(writer: ptr, tool_node: ptr, prefix: ptr, prefix_len: u64) -> u32:
    ...

# @origin sa/src/proxy.sai:21
def json_writer_write_chat_namespace_tools(writer: ptr, ns_node: ptr) -> u32:
    ...

# @origin sa/src/proxy.sai:22
def json_writer_field_normalized_chat_tools(writer: ptr, tools_node: ptr) -> u32:
    ...

# @origin sa/src/proxy.sai:23
def responses_gemini_is_drop_key(key: ptr, key_len: u64) -> u32:
    ...

# @origin sa/src/proxy.sai:24
def build_responses_proxy_body(body: ptr, body_len: u64, is_gemini: u32, out_len: ptr) -> ptr:
    ...

# @origin sa/src/proxy.sai:25
def build_chat_proxy_body(body: ptr, body_len: u64, out_len: ptr) -> ptr:
    ...
