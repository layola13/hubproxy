from __future__ import annotations

# import ../src/hub_modules.sa

# @origin sa/tests/turn_rpc_contract_test.sa:58
def assert_contract(ok: u8, code: i32) -> Any:
    rpc_turn_start_collaboration_mode(...)
    assert_contract(...)
    state_init(...)
    state_thread_create_with_key(...)
    state_turn_create(...)
    rpc_turn_start_set_collaboration_mode(...)
    state_turn_find(...)
    sa_bytes_eq(...)
    state_turn_set_items(...)
    state_turn_append_items(...)
    state_turn_interrupt(...)
    state_turn_set_mode_text(...)
    state_notify_cursor(...)
    notify_turn_started(...)
    state_notify_read(...)
    sa_bytes_find(...)
    return notify_turn_completed(...)
