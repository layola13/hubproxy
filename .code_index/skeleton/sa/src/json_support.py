from __future__ import annotations

# import json_support.sai
# import sa_std/encoding/json.sa
# import sa_std/encoding/json.sai
# import strings.sai

# @origin sa/src/json_support.sa:7
def json_writer_finish_view(writer: ptr, out_buffer: ptr, out_ptr: ptr, out_len: ptr) -> u32:
    sa_json_writer_finish(...)
    sa_json_buffer_data(...)
    return sa_json_buffer_len(...)

# @origin sa/src/json_support.sa:25
def json_stringify_view(node: ptr, out_buffer: ptr, out_ptr: ptr, out_len: ptr) -> u32:
    sa_json_stringify(...)
    sa_json_buffer_data(...)
    return sa_json_buffer_len(...)

# @origin sa/src/json_support.sa:43
def json_buffer_to_owned_and_free(buffer: ptr, data_ptr: ptr, data_len: u64, out_len: ptr) -> ptr:
    bytes_to_owned(...)
    return sa_json_buffer_free(...)

# @origin sa/src/json_support.sa:53
def copy_bytes_owned(src_ptr: ptr, src_len: u64, out_len: ptr) -> ptr:
    return bytes_to_owned(...)

# @origin sa/src/json_support.sa:61
def copy_bytes_into(dst_ptr: ptr, src_ptr: ptr, src_len: u64) -> u64:
    return sa_bytes_copy(...)

# @origin sa/src/json_support.sa:69
def json_writer_dispose_finished(buffer: ptr, writer: ptr) -> u32:
    sa_json_buffer_free(...)
    return sa_json_writer_free(...)

# @origin sa/src/json_support.sa:77
def json_buffer_dispose(buffer: ptr) -> u32:
    return sa_json_buffer_free(...)

# @origin sa/src/json_support.sa:83
def json_writer_dispose(writer: ptr) -> u32:
    return sa_json_writer_free(...)
