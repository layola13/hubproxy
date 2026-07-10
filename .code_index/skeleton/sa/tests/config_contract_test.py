from __future__ import annotations

# import sa_std/fs.sai
# import ../src/config.sa
# import ../src/strings.sa

# @origin sa/tests/config_contract_test.sa:40
def assert_cfg_contract(ok: u8, code: i32) -> Any:
    cfg_zero(...)
    assert_cfg_contract(...)
    cfg_parse_line(...)
    cfg_get_port(...)
    sa_bytes_eq(...)
    sa_fs_write_file(...)
    cfg_load(...)
    return sa_fs_remove_file(...)
