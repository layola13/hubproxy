from __future__ import annotations

# import sa_std/fs.sai
# import ../src/strings.sa

# @origin sa/tests/project_tasks_contract_test.sa:27
def assert_task_contract(ok: u8, code: i32) -> Any:
    ...

# @origin sa/tests/project_tasks_contract_test.sa:40
def assert_contains(hay: ptr, hay_len: u64, needle: ptr, needle_len: u64, code: i32) -> Any:
    sa_bytes_find(...)
    return assert_task_contract(...)

# @origin sa/tests/project_tasks_contract_test.sa:49
def assert_not_contains(hay: ptr, hay_len: u64, needle: ptr, needle_len: u64, code: i32) -> Any:
    sa_bytes_find(...)
    assert_task_contract(...)
    sa_std_fs_read_file(...)
    sa_fs_read_buffer_data(...)
    sa_fs_read_buffer_len(...)
    assert_contains(...)
    assert_not_contains(...)
    return sa_fs_read_buffer_free(...)
