from __future__ import annotations

# import rpc_parse.sai
# import sa_std/encoding/json.sai
# import strings.sai
# import json_support.sai
# import state.sai

# @origin sa/src/rpc_parse.sa:18
def rpc_parse_min_u64(a: u64, b: u64) -> u64:
    ...

# @origin sa/src/rpc_parse.sa:33
def rpc_extract_id_token(body: ptr, body_len: u64, out_buf: ptr, out_cap: u64, out_ptr: ptr, out_len: ptr) -> u32:
    sa_json_parse(...)
    sa_json_object_get(...)
    json_stringify_view(...)
    rpc_parse_min_u64(...)
    copy_bytes_into(...)
    json_buffer_dispose(...)
    return sa_json_free(...)

# @origin sa/src/rpc_parse.sa:127
def rpc_jsonrpc_lookup_key(key: ptr, key_len: u64, out_ptr: ptr, out_len: ptr) -> u32:
    return sa_bytes_find_byte(...)

# @origin sa/src/rpc_parse.sa:197
def rpc_extract_u64_after(body: ptr, body_len: u64, key: ptr, key_len: u64, fallback: u64) -> u64:
    rpc_extract_string_after(...)
    sa_bytes_to_u64(...)
    sa_json_parse(...)
    sa_json_object_get(...)
    rpc_jsonrpc_lookup_key(...)
    sa_json_object_get_i64(...)
    return sa_json_free(...)

# @origin sa/src/rpc_parse.sa:337
def rpc_extract_bool_after(body: ptr, body_len: u64, key: ptr, key_len: u64, fallback: u8) -> u8:
    sa_json_parse(...)
    sa_json_object_get(...)
    rpc_jsonrpc_lookup_key(...)
    sa_json_object_get_bool(...)
    return sa_json_free(...)

# @origin sa/src/rpc_parse.sa:415
def rpc_param_is_null(body: ptr, body_len: u64, key: ptr, key_len: u64) -> u8:
    sa_json_parse(...)
    sa_json_object_get(...)
    rpc_jsonrpc_lookup_key(...)
    sa_json_kind(...)
    return sa_json_free(...)

# @origin sa/src/rpc_parse.sa:506
def rpc_extract_u64_number_after(body: ptr, body_len: u64, key: ptr, key_len: u64, fallback: u64) -> u64:
    return rpc_extract_u64_after(...)

# @origin sa/src/rpc_parse.sa:511
def rpc_extract_i64_number_after(body: ptr, body_len: u64, key: ptr, key_len: u64, fallback: i64) -> i64:
    sa_json_parse(...)
    sa_json_object_get(...)
    rpc_jsonrpc_lookup_key(...)
    sa_json_object_get_i64(...)
    return sa_json_free(...)

# @origin sa/src/rpc_parse.sa:589
def rpc_extract_string_after(body: ptr, body_len: u64, key: ptr, key_len: u64, out_ptr: ptr, out_len: ptr) -> u32:
    sa_json_parse(...)
    sa_json_object_get(...)
    rpc_jsonrpc_lookup_key(...)
    sa_json_object_get_string(...)
    sa_json_free(...)
    return copy_bytes_owned(...)

# @origin sa/src/rpc_parse.sa:709
def rpc_extract_param_string(body: ptr, body_len: u64, key: ptr, key_len: u64, out_ptr: ptr, out_len: ptr) -> u32:
    return rpc_extract_string_after(...)

# @origin sa/src/rpc_parse.sa:720
def rpc_extract_string_or_default(body: ptr, body_len: u64, key: ptr, key_len: u64, default_ptr: ptr, default_len: u64, out_ptr: ptr, out_len: ptr) -> u32:
    return rpc_extract_string_after(...)

# @origin sa/src/rpc_parse.sa:761
def rpc_extract_param_array_json(body: ptr, body_len: u64, field: ptr, field_len: u64, out_ptr: ptr, out_len: ptr, out_buffer: ptr) -> u32:
    sa_json_parse(...)
    sa_json_object_get(...)
    sa_json_kind(...)
    json_stringify_view(...)
    return sa_json_free(...)

# @origin sa/src/rpc_parse.sa:917
def rpc_resolve_thread_id(state_ptr: ptr, body: ptr, body_len: u64, fallback: u64) -> u64:
    rpc_extract_string_after(...)
    state_thread_find_by_key(...)
    sa_bytes_to_u64(...)
    return rpc_extract_u64_after(...)

# @origin sa/src/rpc_parse.sa:985
def bytes_has(body: ptr, body_len: u64, needle: ptr, needle_len: u64) -> u32:
    return sa_bytes_find(...)
