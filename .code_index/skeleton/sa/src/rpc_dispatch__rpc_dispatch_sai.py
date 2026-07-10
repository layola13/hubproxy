from __future__ import annotations

# @origin sa/src/rpc_dispatch.sai:3
def handle_rpc_request(req: ptr, rpc_body_ptr: ptr, rpc_body_len: u64, state_ptr: ptr, cfg_ptr: ptr) -> u32:
    ...
