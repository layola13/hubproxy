from __future__ import annotations

# @origin sa/src/rpc_parse.sai:3
def rpc_extract_id_token(body: ptr, body_len: u64, out_buf: ptr, out_cap: u64, out_ptr: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/src/rpc_parse.sai:4
def rpc_jsonrpc_lookup_key(key: ptr, key_len: u64, out_ptr: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/src/rpc_parse.sai:5
def rpc_extract_u64_after(body: ptr, body_len: u64, key: ptr, key_len: u64, fallback: u64) -> u64:
    ...

# @origin sa/src/rpc_parse.sai:6
def rpc_extract_bool_after(body: ptr, body_len: u64, key: ptr, key_len: u64, fallback: u8) -> u8:
    ...

# @origin sa/src/rpc_parse.sai:7
def rpc_param_is_null(body: ptr, body_len: u64, key: ptr, key_len: u64) -> u8:
    ...

# @origin sa/src/rpc_parse.sai:8
def rpc_extract_u64_number_after(body: ptr, body_len: u64, key: ptr, key_len: u64, fallback: u64) -> u64:
    ...

# @origin sa/src/rpc_parse.sai:9
def rpc_extract_i64_number_after(body: ptr, body_len: u64, key: ptr, key_len: u64, fallback: i64) -> i64:
    ...

# @origin sa/src/rpc_parse.sai:10
def rpc_extract_param_string(body: ptr, body_len: u64, key: ptr, key_len: u64, out_ptr: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/src/rpc_parse.sai:11
def rpc_extract_string_or_default(body: ptr, body_len: u64, key: ptr, key_len: u64, default_ptr: ptr, default_len: u64, out_ptr: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/src/rpc_parse.sai:12
def rpc_extract_param_array_json(body: ptr, body_len: u64, field: ptr, field_len: u64, out_ptr: ptr, out_len: ptr, out_buffer: ptr) -> u32:
    ...

# @origin sa/src/rpc_parse.sai:13
def rpc_resolve_thread_id(state_ptr: ptr, body: ptr, body_len: u64, fallback: u64) -> u64:
    ...

# @origin sa/src/rpc_parse.sai:14
def bytes_has(body: ptr, body_len: u64, needle: ptr, needle_len: u64) -> u32:
    ...
