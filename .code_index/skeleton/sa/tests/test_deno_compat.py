from __future__ import annotations

# import sa_std/io/print.sai
# import deno.sai

# @origin sa/tests/test_deno_compat.sa:33
def main() -> i32:
    sa_deno_plugin_hostname(...)
    sa_print_bytes(...)
    sa_deno_plugin_free_buffer(...)
    sa_deno_plugin_os_release(...)
    sa_deno_plugin_os_uptime(...)
    sa_deno_plugin_loadavg(...)
    sa_deno_plugin_system_memory_info(...)
    sa_deno_plugin_network_interfaces(...)
    sa_deno_plugin_pid(...)
    sa_deno_plugin_ppid(...)
    sa_deno_plugin_uid(...)
    sa_deno_plugin_gid(...)
    sa_deno_plugin_exec_path(...)
    return sa_deno_plugin_memory_usage(...)
