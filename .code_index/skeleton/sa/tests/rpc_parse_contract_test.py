from __future__ import annotations

# import ../src/hub_modules.sa

# @origin sa/tests/rpc_parse_contract_test.sa:76
def assert_contract(ok: u8, code: i32) -> Any:
    ...

# @origin sa/tests/rpc_parse_contract_test.sa:89
def assert_bytes_eq(actual_ptr: ptr, actual_len: u64, expected_ptr: ptr, expected_len: u64, code: i32) -> Any:
    sa_bytes_eq(...)
    return assert_contract(...)

# @origin sa/tests/rpc_parse_contract_test.sa:103
def assert_buffer_contains(buf: ptr, len: u64, needle: ptr, needle_len: u64, code: i32) -> Any:
    sa_bytes_find(...)
    assert_contract(...)
    rpc_extract_id_token(...)
    assert_bytes_eq(...)
    rpc_jsonrpc_lookup_key(...)
    rpc_extract_param_string(...)
    rpc_extract_string_or_default(...)
    rpc_extract_bool_after(...)
    rpc_extract_i64_number_after(...)
    json_writer_write_thread_envelope_prefix(...)
    json_writer_finish_view(...)
    assert_buffer_contains(...)
    json_writer_dispose_finished(...)
    cfg_zero(...)
    cfg_store_str(...)
    json_writer_write_config_read_result(...)
    return json_writer_write_config_write_result(...)
