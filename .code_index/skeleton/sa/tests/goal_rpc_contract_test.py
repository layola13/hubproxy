from __future__ import annotations

# import ../src/hub_modules.sa

# @origin sa/tests/goal_rpc_contract_test.sa:59
def assert_contract(ok: u8, code: i32) -> Any:
    rpc_goal_status_from_body(...)
    assert_contract(...)
    rpc_extract_i64_number_after(...)
    state_init(...)
    state_goal_set(...)
    state_goal_get_full(...)
    sa_bytes_eq(...)
    json_writer_begin_field_object(...)
    json_writer_field_thread_id_goal_key(...)
    json_writer_field_goal_status_text(...)
    json_writer_field_goal_budget(...)
    json_writer_finish_view(...)
    sa_bytes_find(...)
    json_writer_dispose_finished(...)
    state_thread_create_with_key(...)
    state_notify_cursor(...)
    notify_goal_updated(...)
    return state_notify_read(...)
