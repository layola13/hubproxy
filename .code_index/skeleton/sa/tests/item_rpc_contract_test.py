from __future__ import annotations

# import ../src/hub_modules.sa

# @origin sa/tests/item_rpc_contract_test.sa:86
def assert_contract(ok: u8, code: i32) -> Any:
    ...

# @origin sa/tests/item_rpc_contract_test.sa:99
def assert_buffer_contains(buf: ptr, len: u64, needle: ptr, needle_len: u64, code: i32) -> Any:
    sa_bytes_find(...)
    return assert_contract(...)

# @origin sa/tests/item_rpc_contract_test.sa:113
def assert_single_detail_item(body: ptr, body_len: u64, event_ptr: ptr, event_len: u64, id_ptr: ptr, id_len: u64, value_ptr: ptr, value_len: u64, code: i32) -> Any:
    state_init(...)
    assert_contract(...)
    state_thread_create_with_key(...)
    state_turn_create(...)
    state_notify_cursor(...)
    notify_turn_input_items_from_dom(...)
    state_notify_read(...)
    assert_buffer_contains(...)
    return assert_single_detail_item(...)
