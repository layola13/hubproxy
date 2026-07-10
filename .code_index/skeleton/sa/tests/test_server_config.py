from __future__ import annotations

# import ../src/config.sa
# import ../src/strings.sa
# import ../sa_http_server.sai

# @origin sa/tests/test_server_config.sa:8
def main() -> i32:
    cfg_load(...)
    cfg_get_port(...)
    cfg_get_host(...)
    sa_http_server_new(...)
    sa_http_server_start(...)
    return sa_http_server_free(...)
