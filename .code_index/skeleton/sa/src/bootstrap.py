from __future__ import annotations

# import sa_std/io/print.sai
# import deno.sal
# import sa_http_server.sai
# import config.sai
# import http_dispatch.sai
# import state.sai

# @origin sa/src/bootstrap.sa:22
def hubproxy_main() -> i32:
    sa_print_bytes(...)
    cfg_load(...)
    state_init(...)
    cfg_get_port(...)
    cfg_get_host(...)
    sa_http_server_new(...)
    sa_http_server_start(...)
    return accept_and_handle_http_request(...)
