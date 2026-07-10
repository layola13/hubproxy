from __future__ import annotations

# @origin sa/src/strings.sai:4
def sa_bytes_eq(a: ptr, a_len: u64, b: ptr, b_len: u64) -> u8:
    ...

# @origin sa/src/strings.sai:5
def sa_bytes_find(hay: ptr, hay_len: u64, needle: ptr, needle_len: u64) -> i64:
    ...

# @origin sa/src/strings.sai:6
def sa_bytes_find_byte(hay: ptr, hay_len: u64, needle_byte: u8) -> i64:
    ...

# @origin sa/src/strings.sai:7
def sa_bytes_copy(dst: ptr, src: ptr, len: u64) -> u64:
    ...

# @origin sa/src/strings.sai:8
def build_concat_owned(left_ptr: ptr, left_len: u64, right_ptr: ptr, right_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:9
def build_concat3_owned(left_ptr: ptr, left_len: u64, mid_ptr: ptr, mid_len: u64, right_ptr: ptr, right_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:10
def build_concat4_owned(a_ptr: ptr, a_len: u64, b_ptr: ptr, b_len: u64, c_ptr: ptr, c_len: u64, d_ptr: ptr, d_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:11
def build_concat5_owned(a_ptr: ptr, a_len: u64, b_ptr: ptr, b_len: u64, c_ptr: ptr, c_len: u64, d_ptr: ptr, d_len: u64, e_ptr: ptr, e_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:12
def build_concat6_owned(a_ptr: ptr, a_len: u64, b_ptr: ptr, b_len: u64, c_ptr: ptr, c_len: u64, d_ptr: ptr, d_len: u64, e_ptr: ptr, e_len: u64, f_ptr: ptr, f_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:13
def token_preview_owned(prefix_ptr: ptr, prefix_len: u64, suffix_ptr: ptr, suffix_len: u64, token_len: u64, mid_a_ptr: ptr, mid_a_len: u64, mid_b_ptr: ptr, mid_b_len: u64, ellipsis_ptr: ptr, ellipsis_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:14
def prefix_with_owned(prefix_ptr: ptr, prefix_len: u64, value_ptr: ptr, value_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:15
def namespace_tool_name_owned(prefix_ptr: ptr, prefix_len: u64, value_ptr: ptr, value_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:16
def path_join_owned(base_ptr: ptr, base_len: u64, child_ptr: ptr, child_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:17
def http_url_owned(host_ptr: ptr, host_len: u64, port_u64: u64, suffix_ptr: ptr, suffix_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:18
def bytes_to_owned(src: ptr, src_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:19
def u64_to_owned(value: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:20
def json_buffer_to_owned(buffer: ptr, out_len: ptr) -> ptr:
    ...

# @origin sa/src/strings.sai:21
def sa_bytes_to_u64(buf: ptr, buf_len: u64) -> i64:
    ...
