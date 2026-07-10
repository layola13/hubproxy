from __future__ import annotations

# @origin sa/src/config.sai:32
def cfg_load(env_path: ptr, env_path_len: u64, out_cfg: ptr) -> u32:
    ...

# @origin sa/src/config.sai:35
def cfg_get_port(cfg: ptr) -> u16:
    ...

# @origin sa/src/config.sai:38
def cfg_get_host(cfg: ptr, out_ptr: ptr, out_len: ptr) -> u32:
    ...
