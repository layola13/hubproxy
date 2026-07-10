from __future__ import annotations

# import strings.sai
# import sa_std/fmt.sai
# import sa_std/string.sai
# import sa_std/path.sa
# import sa_std/encoding/json.sai

# @origin sa/src/strings.sa:18
def sa_bytes_eq(a: ptr, a_len: u64, b: ptr, b_len: u64) -> u8:
    ...

# @origin sa/src/strings.sa:87
def sa_bytes_find(hay: ptr, hay_len: u64, needle: ptr, needle_len: u64) -> i64:
    return sa_bytes_eq(...)

# @origin sa/src/strings.sa:152
def sa_bytes_find_byte(hay: ptr, hay_len: u64, needle_byte: u8) -> i64:
    ...

# @origin sa/src/strings.sa:199
def sa_bytes_copy(dst: ptr, src: ptr, len: u64) -> u64:
    ...

# @origin sa/src/strings.sa:232
def bytes_to_owned(src: ptr, src_len: u64, out_len: ptr) -> ptr:
    return sa_bytes_copy(...)

# @origin sa/src/strings.sa:243
def build_concat_owned(left_ptr: ptr, left_len: u64, right_ptr: ptr, right_len: u64, out_len: ptr) -> ptr:
    sa_string_concat(...)
    sa_fmt_buffer_data(...)
    sa_fmt_buffer_len(...)
    bytes_to_owned(...)
    return sa_fmt_buffer_free(...)

# @origin sa/src/strings.sa:260
def build_concat3_owned(left_ptr: ptr, left_len: u64, mid_ptr: ptr, mid_len: u64, right_ptr: ptr, right_len: u64, out_len: ptr) -> ptr:
    return build_concat_owned(...)

# @origin sa/src/strings.sa:281
def build_concat4_owned(a_ptr: ptr, a_len: u64, b_ptr: ptr, b_len: u64, c_ptr: ptr, c_len: u64, d_ptr: ptr, d_len: u64, out_len: ptr) -> ptr:
    return build_concat_owned(...)

# @origin sa/src/strings.sa:305
def build_concat5_owned(a_ptr: ptr, a_len: u64, b_ptr: ptr, b_len: u64, c_ptr: ptr, c_len: u64, d_ptr: ptr, d_len: u64, e_ptr: ptr, e_len: u64, out_len: ptr) -> ptr:
    build_concat4_owned(...)
    return build_concat_owned(...)

# @origin sa/src/strings.sa:326
def build_concat6_owned(a_ptr: ptr, a_len: u64, b_ptr: ptr, b_len: u64, c_ptr: ptr, c_len: u64, d_ptr: ptr, d_len: u64, e_ptr: ptr, e_len: u64, f_ptr: ptr, f_len: u64, out_len: ptr) -> ptr:
    build_concat5_owned(...)
    return build_concat_owned(...)

# @origin sa/src/strings.sa:349
def token_preview_owned(prefix_ptr: ptr, prefix_len: u64, suffix_ptr: ptr, suffix_len: u64, token_len: u64, mid_a_ptr: ptr, mid_a_len: u64, mid_b_ptr: ptr, mid_b_len: u64, ellipsis_ptr: ptr, ellipsis_len: u64, out_len: ptr) -> ptr:
    u64_to_owned(...)
    return build_concat6_owned(...)

# @origin sa/src/strings.sa:371
def prefix_with_owned(prefix_ptr: ptr, prefix_len: u64, value_ptr: ptr, value_len: u64, out_len: ptr) -> ptr:
    return build_concat_owned(...)

# @origin sa/src/strings.sa:381
def namespace_tool_name_owned(prefix_ptr: ptr, prefix_len: u64, value_ptr: ptr, value_len: u64, out_len: ptr) -> ptr:
    bytes_to_owned(...)
    sa_bytes_eq(...)
    build_concat_owned(...)
    return build_concat3_owned(...)

# @origin sa/src/strings.sa:444
def path_join_owned(base_ptr: ptr, base_len: u64, child_ptr: ptr, child_len: u64, out_len: ptr) -> ptr:
    return bytes_to_owned(...)

# @origin sa/src/strings.sa:496
def http_url_owned(host_ptr: ptr, host_len: u64, port_u64: u64, suffix_ptr: ptr, suffix_len: u64, out_len: ptr) -> ptr:
    u64_to_owned(...)
    return build_concat5_owned(...)

# @origin sa/src/strings.sa:512
def u64_to_owned(value: u64, out_len: ptr) -> ptr:
    sa_fmt_u64_into(...)
    return bytes_to_owned(...)

# @origin sa/src/strings.sa:525
def json_buffer_to_owned(buffer: ptr, out_len: ptr) -> ptr:
    sa_json_buffer_data(...)
    sa_json_buffer_len(...)
    return bytes_to_owned(...)

# @origin sa/src/strings.sa:539
def sa_bytes_to_u64(buf: ptr, buf_len: u64) -> i64:
    ...
