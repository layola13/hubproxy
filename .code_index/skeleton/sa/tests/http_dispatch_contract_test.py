from __future__ import annotations

# import sa_std/fs.sai
# import ../src/hub_modules.sa

# @origin sa/tests/http_dispatch_contract_test.sa:135
def assert_contract(ok: u8, code: i32) -> Any:
    ...

# @origin sa/tests/http_dispatch_contract_test.sa:148
def assert_buffer_contains(buf: ptr, len: u64, needle: ptr, needle_len: u64, code: i32) -> Any:
    sa_bytes_find(...)
    return assert_contract(...)

# @origin sa/tests/http_dispatch_contract_test.sa:162
def assert_buffer_not_contains(buf: ptr, len: u64, needle: ptr, needle_len: u64, code: i32) -> Any:
    sa_bytes_find(...)
    assert_contract(...)
    body_is_blank(...)
    token_preview_value_owned(...)
    sa_bytes_eq(...)
    build_auth_failure_log_body_owned(...)
    assert_buffer_contains(...)
    assert_buffer_not_contains(...)
    build_api_request_log_body_owned(...)
    write_log_body_to_dir_owned(...)
    sa_std_fs_read_file(...)
    sa_fs_read_buffer_data(...)
    sa_fs_read_buffer_len(...)
    sa_fs_read_buffer_free(...)
    build_upstream_auth_header_owned(...)
    build_upstream_forward_header_plan_owned(...)
    build_upstream_url_owned(...)
    auth_header_matches_token(...)
    route_is_public_models_get(...)
    build_request_log_file_path(...)
    cfg_zero(...)
    write_api_request_log(...)
    return write_auth_failure_log(...)
