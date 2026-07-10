from __future__ import annotations

# import proxy.sai
# import deno.sal
# import sa_http_client.sai
# import sa_std/encoding/json.sai
# import json_support.sai
# import rpc_emit.sai
# import request_context.sai
# import strings.sai

# @origin sa/src/proxy.sa:55
def plugin_buffer_to_owned_and_free(buf_ptr: ptr, buf_len: u64, out_len: ptr) -> ptr:
    bytes_to_owned(...)
    return sa_deno_plugin_free_buffer(...)

# @origin sa/src/proxy.sa:66
def plugin_free_buffer(buf_ptr: ptr, buf_len: u64) -> u32:
    return sa_deno_plugin_free_buffer(...)

# @origin sa/src/proxy.sa:73
def plugin_random_uuid(out_ptr: ptr, out_len: ptr) -> u32:
    return sa_deno_plugin_random_uuid(...)

# @origin sa/src/proxy.sa:80
def plugin_date_now_iso(out_ptr: ptr, out_len: ptr) -> u32:
    return sa_deno_plugin_date_now_iso(...)

# @origin sa/src/proxy.sa:87
def http_response_read_all(resp: ptr, out_ptr: ptr, out_len: ptr) -> u32:
    sa_http_client_resp_body_reader(...)
    sa_http_client_resp_read_chunk(...)
    copy_bytes_into(...)
    return sa_http_client_body_reader_free(...)

# @origin sa/src/proxy.sa:137
def normalize_responses_client_json_body(body: ptr, body_len: u64, req_body: ptr, req_body_len: u64, out_len: ptr) -> ptr:
    sa_deno_plugin_responses_json_normalize_with_request(...)
    plugin_buffer_to_owned_and_free(...)
    plugin_free_buffer(...)
    return copy_bytes_owned(...)

# @origin sa/src/proxy.sa:191
def normalize_chat_fallback_json_body(body: ptr, body_len: u64, req_body: ptr, req_body_len: u64, out_len: ptr) -> ptr:
    sa_deno_plugin_chat_json_to_responses(...)
    plugin_buffer_to_owned_and_free(...)
    return copy_bytes_owned(...)

# @origin sa/src/proxy.sa:225
def normalize_responses_client_sse_body(body: ptr, body_len: u64, source_req_body: ptr, source_req_body_len: u64, context_req_body: ptr, context_req_body_len: u64, out_len: ptr) -> ptr:
    sa_deno_plugin_responses_sse_normalize_with_request(...)
    plugin_buffer_to_owned_and_free(...)
    body_allows_progress_continuation(...)
    responses_sse_is_progress_message(...)
    bytes_has(...)
    build_native_progress_continuation(...)
    rpc_builder_new_capacity(...)
    append_with_replacement(...)
    rpc_builder_to_owned(...)
    return copy_bytes_owned(...)

# @origin sa/src/proxy.sa:323
def chat_proxy_is_tools_key(key: ptr, key_len: u64) -> u32:
    return sa_bytes_eq(...)

# @origin sa/src/proxy.sa:343
def chat_proxy_is_drop_key(key: ptr, key_len: u64) -> u32:
    return sa_bytes_eq(...)

# @origin sa/src/proxy.sa:405
def proxy_json_string_is_gemini_model(model_ptr: ptr, model_len: u64) -> u32:
    return sa_bytes_eq(...)

# @origin sa/src/proxy.sa:477
def body_is_gemini_responses_request(body: ptr, body_len: u64) -> u32:
    sa_json_parse(...)
    sa_json_object_get(...)
    sa_json_kind(...)
    sa_json_string_ptr(...)
    sa_json_string_len(...)
    proxy_json_string_is_gemini_model(...)
    return sa_json_free(...)

# @origin sa/src/proxy.sa:536
def build_chat_fallback_body(body: ptr, body_len: u64, model_ptr: ptr, model_len: u64, out_len: ptr) -> ptr:
    sa_deno_plugin_responses_chat_fallback_request(...)
    return plugin_buffer_to_owned_and_free(...)

# @origin sa/src/proxy.sa:571
def responses_gemini_is_drop_key(key: ptr, key_len: u64) -> u32:
    return sa_bytes_eq(...)

# @origin sa/src/proxy.sa:604
def json_writer_write_responses_tool_source(writer: ptr, tool_node: ptr, source_node: ptr, prefix: ptr, prefix_len: u64) -> u32:
    sa_json_object_get(...)
    sa_json_kind(...)
    sa_json_string_ptr(...)
    sa_json_string_len(...)
    namespace_tool_name_owned(...)
    sa_json_free(...)
    sa_json_writer_field_node(...)
    return sa_json_object_get_bool(...)

# @origin sa/src/proxy.sa:767
def json_writer_write_responses_tool(writer: ptr, tool_node: ptr, prefix: ptr, prefix_len: u64) -> u32:
    sa_json_object_get(...)
    sa_json_kind(...)
    sa_json_string_ptr(...)
    sa_json_string_len(...)
    sa_bytes_eq(...)
    sa_json_free(...)
    json_writer_write_responses_namespace_tools(...)
    return json_writer_write_responses_tool_source(...)

# @origin sa/src/proxy.sa:879
def json_writer_write_responses_namespace_tools(writer: ptr, ns_node: ptr) -> u32:
    sa_json_object_get(...)
    sa_json_kind(...)
    sa_json_string_ptr(...)
    sa_json_string_len(...)
    sa_json_value_count(...)
    sa_json_array_get(...)
    json_writer_write_responses_tool(...)
    return sa_json_free(...)

# @origin sa/src/proxy.sa:1028
def json_writer_field_normalized_responses_tools(writer: ptr, tools_node: ptr) -> u32:
    sa_json_value_count(...)
    sa_json_array_get(...)
    json_writer_write_responses_tool(...)
    sa_json_free(...)
    json_writer_finish_view(...)
    sa_json_parse(...)
    sa_json_writer_field_node(...)
    return json_writer_dispose_finished(...)

# @origin sa/src/proxy.sa:1167
def json_writer_write_chat_tool_source(writer: ptr, tool_node: ptr, source_node: ptr, prefix: ptr, prefix_len: u64) -> u32:
    sa_json_object_get(...)
    sa_json_kind(...)
    sa_json_string_ptr(...)
    sa_json_string_len(...)
    namespace_tool_name_owned(...)
    json_writer_begin_field_object(...)
    sa_json_free(...)
    sa_json_writer_field_node(...)
    return sa_json_object_get_bool(...)

# @origin sa/src/proxy.sa:1334
def json_writer_write_chat_tool(writer: ptr, tool_node: ptr, prefix: ptr, prefix_len: u64) -> u32:
    sa_json_object_get(...)
    sa_json_kind(...)
    sa_json_string_ptr(...)
    sa_json_string_len(...)
    sa_bytes_eq(...)
    sa_json_free(...)
    json_writer_write_chat_namespace_tools(...)
    return json_writer_write_chat_tool_source(...)

# @origin sa/src/proxy.sa:1446
def json_writer_write_chat_namespace_tools(writer: ptr, ns_node: ptr) -> u32:
    sa_json_object_get(...)
    sa_json_kind(...)
    sa_json_string_ptr(...)
    sa_json_string_len(...)
    sa_json_value_count(...)
    sa_json_array_get(...)
    json_writer_write_chat_tool(...)
    return sa_json_free(...)

# @origin sa/src/proxy.sa:1595
def json_writer_field_normalized_chat_tools(writer: ptr, tools_node: ptr) -> u32:
    sa_json_value_count(...)
    sa_json_array_get(...)
    json_writer_write_chat_tool(...)
    sa_json_free(...)
    json_writer_finish_view(...)
    sa_json_parse(...)
    sa_json_writer_field_node(...)
    return json_writer_dispose_finished(...)

# @origin sa/src/proxy.sa:1734
def build_responses_proxy_body(body: ptr, body_len: u64, is_gemini: u32, out_len: ptr) -> ptr:
    sa_json_parse(...)
    sa_json_kind(...)
    sa_json_value_count(...)
    json_writer_finish_view(...)
    json_buffer_to_owned_and_free(...)
    json_writer_dispose(...)
    sa_json_free(...)
    sa_json_object_key_at(...)
    responses_gemini_is_drop_key(...)
    chat_proxy_is_tools_key(...)
    sa_json_object_get(...)
    json_writer_field_normalized_responses_tools(...)
    sa_json_writer_field_node(...)
    return copy_bytes_owned(...)

# @origin sa/src/proxy.sa:1946
def build_chat_proxy_body(body: ptr, body_len: u64, out_len: ptr) -> ptr:
    sa_json_parse(...)
    sa_json_kind(...)
    sa_json_value_count(...)
    sa_json_object_key_at(...)
    chat_proxy_is_drop_key(...)
    chat_proxy_is_tools_key(...)
    sa_json_object_get(...)
    json_writer_field_normalized_chat_tools(...)
    sa_json_free(...)
    sa_json_writer_field_node(...)
    json_writer_finish_view(...)
    json_buffer_to_owned_and_free(...)
    json_writer_dispose(...)
    return copy_bytes_owned(...)
