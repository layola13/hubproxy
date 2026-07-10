from __future__ import annotations

# import ../src/hub_modules.sa

# @origin sa/tests/mcp_rpc_contract_test.sa:248
def assert_contract(ok: u8, code: i32) -> Any:
    ...

# @origin sa/tests/mcp_rpc_contract_test.sa:261
def assert_buffer_contains(buf: ptr, len: u64, needle: ptr, needle_len: u64, code: i32) -> Any:
    sa_bytes_find(...)
    return assert_contract(...)

# @origin sa/tests/mcp_rpc_contract_test.sa:275
def assert_buffer_not_contains(buf: ptr, len: u64, needle: ptr, needle_len: u64, code: i32) -> Any:
    sa_bytes_find(...)
    return assert_contract(...)

# @origin sa/tests/mcp_rpc_contract_test.sa:289
def assert_uuid_v4_shape(value: ptr, value_len: u64, code: i32) -> Any:
    assert_contract(...)
    mcp_oauth_login_has_required_name(...)
    sa_deno_plugin_mcp_tool_call(...)
    state_init(...)
    state_notify_cursor(...)
    notify_mcp_tool_progress(...)
    state_notify_read(...)
    sa_bytes_find(...)
    notify_user_input_request(...)
    assert_buffer_contains(...)
    notify_mcp_elicitation_request(...)
    notify_mcp_startup_params(...)
    notify_world_warning_params(...)
    notify_skills_changed(...)
    notify_fs_changed(...)
    notify_process_output(...)
    notify_process_exited(...)
    notify_realtime_started(...)
    assert_buffer_not_contains(...)
    notify_rt_item_value(...)
    notify_rt_role_value(...)
    notify_rt_string_value(...)
    notify_thread_string(...)
    plugin_random_uuid(...)
    assert_uuid_v4_shape(...)
    sa_bytes_eq(...)
    json_writer_write_realtime_start_result(...)
    json_writer_finish_view(...)
    json_buffer_dispose(...)
    json_writer_write_realtime_started_params(...)
    plugin_free_buffer(...)
    json_writer_write_realtime_thread_result(...)
    prefix_with_owned(...)
    json_writer_write_attestation_result(...)
    write_mcp_reload_response_object(...)
    return sa_deno_plugin_mcp_server_status_list(...)
