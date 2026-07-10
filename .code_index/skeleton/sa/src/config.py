from __future__ import annotations

# import config.sai
# import sa_std/io/print.sai
# import strings.sai

# @origin sa/src/config.sa:6
def sa_fs_read_file(path: ptr, path_len: u64, max_bytes: u64) -> u64:
    ...

# @origin sa/src/config.sa:7
def sa_fs_read_buffer_data(buffer: u64) -> Any:
    ...

# @origin sa/src/config.sa:8
def sa_fs_read_buffer_len(buffer: u64) -> u64:
    ...

# @origin sa/src/config.sa:9
def sa_fs_read_buffer_free(buffer: u64) -> i32:
    ...

# @origin sa/src/config.sa:10
def sa_env_get(key: ptr, key_len: u64) -> u64:
    ...

# @origin sa/src/config.sa:11
def sa_env_buffer_data(buffer: u64) -> Any:
    ...

# @origin sa/src/config.sa:12
def sa_env_buffer_len(buffer: u64) -> u64:
    ...

# @origin sa/src/config.sa:13
def sa_env_buffer_free(buffer: u64) -> i32:
    ...

# @origin sa/src/config.sa:54
def cfg_get_port(cfg: ptr) -> u16:
    ...

# @origin sa/src/config.sa:60
def cfg_get_host(cfg: ptr, out_ptr: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/src/config.sa:73
def cfg_zero(cfg: ptr) -> u32:
    ...

# @origin sa/src/config.sa:101
def cfg_store_str(cfg: ptr, offset: u64, val_ptr: ptr, val_len: u64) -> u32:
    ...

# @origin sa/src/config.sa:117
def cfg_overlay_process_env(cfg: ptr) -> u32:
    sa_env_get(...)
    sa_env_buffer_data(...)
    sa_env_buffer_len(...)
    bytes_to_owned(...)
    cfg_store_str(...)
    return sa_env_buffer_free(...)

# @origin sa/src/config.sa:159
def cfg_is_space(byte: u8) -> u8:
    ...

# @origin sa/src/config.sa:173
def cfg_trim_span(in_ptr: ptr, in_len: u64, out_ptr: ptr, out_len: ptr) -> u32:
    return cfg_is_space(...)

# @origin sa/src/config.sa:270
def cfg_unquote_span(in_ptr: ptr, in_len: u64, out_ptr: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/src/config.sa:330
def cfg_parse_line(cfg: ptr, line: ptr, line_len: u64) -> u32:
    sa_bytes_find_byte(...)
    cfg_trim_span(...)
    cfg_unquote_span(...)
    sa_bytes_eq(...)
    sa_bytes_to_u64(...)
    return cfg_store_str(...)

# @origin sa/src/config.sa:621
def cfg_load(env_path: ptr, env_path_len: u64, out_cfg: ptr) -> u32:
    cfg_zero(...)
    cfg_store_str(...)
    sa_fs_read_file(...)
    sa_fs_read_buffer_data(...)
    sa_fs_read_buffer_len(...)
    sa_bytes_find_byte(...)
    cfg_parse_line(...)
    cfg_overlay_process_env(...)
    return sa_print_bytes(...)
