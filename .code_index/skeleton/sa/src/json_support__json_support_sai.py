from __future__ import annotations

# @origin sa/src/json_support.sai:3
def json_writer_finish_view(writer: ptr, out_buffer: ptr, out_ptr: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/src/json_support.sai:4
def json_stringify_view(node: ptr, out_buffer: ptr, out_ptr: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/src/json_support.sai:5
def json_buffer_to_owned_and_free(buffer: ptr, data_ptr: ptr, data_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/json_support.sai:6
def copy_bytes_owned(src_ptr: ptr, src_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/json_support.sai:7
def copy_bytes_into(dst_ptr: ptr, src_ptr: ptr, src_len: u64) -> u64:
    ...

# @origin sa/src/json_support.sai:8
def json_writer_dispose_finished(buffer: ptr, writer: ptr) -> u32:
    ...

# @origin sa/src/json_support.sai:9
def json_buffer_dispose(buffer: ptr) -> u32:
    ...

# @origin sa/src/json_support.sai:10
def json_writer_dispose(writer: ptr) -> u32:
    ...
