from __future__ import annotations

# import rpc_system.sai
# import sa_std/encoding/json.sa
# import sa_std/encoding/json.sai
# import sa_std/io/print.sai
# import sa_std/process.sal
# import sa_std/time.sai
# import deno.sal
# import config.sai
# import events.sai
# import json_support.sai
# import http_dispatch.sai
# import proxy.sai
# import rpc_emit.sai
# import rpc_parse.sai
# import state.sai
# import strings.sai

# @origin sa/src/rpc_system.sa:598
def send_rpc_bool_field_with_id(req: ptr, id_ptr: ptr, id_len: u64, key: ptr, key_len: u64, value: u8) -> u32:
    json_writer_write_bool_field_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:613
def json_writer_write_bool_field_result(writer: ptr, key: ptr, key_len: u64, value: u8) -> u32:
    ...

# @origin sa/src/rpc_system.sa:627
def send_rpc_status_with_id(req: ptr, id_ptr: ptr, id_len: u64, status_ptr: ptr, status_len: u64) -> u32:
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:645
def rpc_system_send_rpc_thread_elicitation_result(req: ptr, id_ptr: ptr, id_len: u64, count: u64) -> u32:
    sa_json_writer_field_i64(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:666
def notify_fs_changed(state_ptr: ptr, watch_id_ptr: ptr, watch_id_len: u64, path_ptr: ptr, path_len: u64) -> u32:
    json_writer_begin_field_array(...)
    sa_json_writer_write_string(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:690
def notify_thread_string(state_ptr: ptr, event_ptr: ptr, event_len: u64, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:716
def json_writer_write_realtime_started_params(writer: ptr, thread_ptr: ptr, thread_len: u64, session_ptr: ptr, session_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sa:735
def notify_realtime_started(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    plugin_random_uuid(...)
    json_writer_write_realtime_started_params(...)
    notify_writer_params(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:765
def notify_rt_item_value(state_ptr: ptr, event_ptr: ptr, event_len: u64, body: ptr, body_len: u64, key: ptr, key_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    rpc_extract_param_string(...)
    sa_bytes_eq(...)
    notify_writer_params(...)
    return json_writer_begin_field_object(...)

# @origin sa/src/rpc_system.sa:920
def notify_rt_role_value(state_ptr: ptr, event_ptr: ptr, event_len: u64, body: ptr, body_len: u64, value_key: ptr, value_key_len: u64, mid: ptr, mid_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    sa_bytes_eq(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:1008
def notify_rt_string_value(state_ptr: ptr, event_ptr: ptr, event_len: u64, body: ptr, body_len: u64, value_key: ptr, value_key_len: u64, json_key: ptr, json_key_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:1048
def notify_fuzzy_events(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    json_writer_field_empty_array(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:1094
def notify_server_resolved(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:1128
def notify_empty_params(state_ptr: ptr, event_ptr: ptr, event_len: u64) -> u32:
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:1142
def notify_sandbox_setup_params(state_ptr: ptr) -> u32:
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:1160
def send_rpc_thread_unsubscribe(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_resolve_thread_id(...)
    state_thread_find(...)
    return send_rpc_status_with_id(...)

# @origin sa/src/rpc_system.sa:1188
def send_rpc_thread_increment_elicitation(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_resolve_thread_id(...)
    state_thread_increment_elicitation(...)
    return rpc_system_send_rpc_thread_elicitation_result(...)

# @origin sa/src/rpc_system.sa:1201
def send_rpc_thread_decrement_elicitation(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_resolve_thread_id(...)
    state_thread_decrement_elicitation(...)
    return rpc_system_send_rpc_thread_elicitation_result(...)

# @origin sa/src/rpc_system.sa:1214
def send_rpc_fs_watch(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    send_error_with_id(...)
    state_watch_put(...)
    notify_fs_changed(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:1296
def send_rpc_fs_unwatch(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    state_watch_delete(...)
    return send_rpc_bool_field_with_id(...)

# @origin sa/src/rpc_system.sa:1345
def json_writer_write_external_import_result(writer: ptr, iso_ptr: ptr, iso_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sa:1360
def send_rpc_external_import(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    plugin_date_now_iso(...)
    json_writer_write_external_import_result(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:1380
def send_rpc_experimental_enablement_empty(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_field_empty_object(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:1394
def send_rpc_experimental_enablement_set(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    sa_json_parse(...)
    sa_json_object_get(...)
    sa_json_kind(...)
    sa_json_writer_field_node(...)
    send_wrapped_writer_with_id(...)
    sa_json_free(...)
    return send_rpc_experimental_enablement_empty(...)

# @origin sa/src/rpc_system.sa:1496
def json_writer_write_realtime_start_result(writer: ptr, uuid_ptr: ptr, uuid_len: u64, now_i: i64) -> u32:
    json_writer_begin_field_object(...)
    json_writer_field_empty_array(...)
    return sa_json_writer_field_i64(...)

# @origin sa/src/rpc_system.sa:1532
def send_rpc_realtime_start(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    sa_time_unix_s(...)
    plugin_random_uuid(...)
    json_writer_write_realtime_start_result(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:1554
def json_writer_write_realtime_thread_result(writer: ptr, thread_ptr: ptr, thread_len: u64, kind: u8) -> u32:
    ...

# @origin sa/src/rpc_system.sa:1612
def send_rpc_realtime_thread(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64, kind: u8) -> u32:
    rpc_extract_string_or_default(...)
    json_writer_write_realtime_thread_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:1633
def json_writer_write_sandbox_setup_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    return rpc_extract_string_or_default(...)

# @origin sa/src/rpc_system.sa:1656
def send_rpc_sandbox_setup(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_sandbox_setup_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:1668
def json_writer_write_fuzzy_search_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    json_writer_begin_field_array(...)
    sa_json_writer_field_i64(...)
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_system.sa:1735
def send_rpc_fuzzy_search(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_fuzzy_search_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:1747
def json_writer_write_fuzzy_session_result(writer: ptr, body: ptr, body_len: u64, is_stop: u8) -> u32:
    return rpc_extract_string_or_default(...)

# @origin sa/src/rpc_system.sa:1793
def send_rpc_fuzzy_session(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64, is_stop: u8) -> u32:
    json_writer_write_fuzzy_session_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:1806
def json_writer_write_server_resolved_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    return rpc_extract_string_or_default(...)

# @origin sa/src/rpc_system.sa:1839
def send_rpc_server_resolved(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_server_resolved_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:1853
def json_writer_write_model_capabilities_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sa:1868
def send_rpc_model_capabilities(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_model_capabilities_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:1880
def json_writer_write_collaboration_mode_list_result(writer: ptr) -> u32:
    return json_writer_begin_field_array(...)

# @origin sa/src/rpc_system.sa:1917
def send_rpc_collaboration_mode_list(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_collaboration_mode_list_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:1929
def json_writer_write_hooks_list_result(writer: ptr, cwd_ptr: ptr, cwd_len: u64) -> u32:
    json_writer_begin_field_array(...)
    json_writer_field_string_or_empty(...)
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_system.sa:1956
def send_rpc_hooks_list(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    sa_deno_plugin_cwd(...)
    json_writer_write_hooks_list_result(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:1977
def send_rpc_model_list(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    return handle_models_proxy(...)

# @origin sa/src/rpc_system.sa:1986
def json_writer_write_account_read_result(writer: ptr, plan_ptr: ptr, plan_len: u64, email_ptr: ptr, email_len: u64) -> u32:
    return json_writer_begin_field_object(...)

# @origin sa/src/rpc_system.sa:2059
def send_rpc_account_read(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    json_writer_write_account_read_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:2078
def json_writer_write_rate_limits_result(writer: ptr, plan_ptr: ptr, plan_len: u64) -> u32:
    return json_writer_begin_field_object(...)

# @origin sa/src/rpc_system.sa:2135
def send_rpc_rate_limits(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    json_writer_write_rate_limits_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:2150
def json_writer_write_chatgpt_tokens_refresh_result(writer: ptr, iso_ptr: ptr, iso_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sa:2165
def send_rpc_chatgpt_tokens_refresh(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    plugin_date_now_iso(...)
    json_writer_write_chatgpt_tokens_refresh_result(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:2185
def json_writer_write_config_read_result(writer: ptr, cfg_ptr: ptr) -> u32:
    json_writer_begin_field_object(...)
    json_writer_field_string_or_empty(...)
    json_writer_field_default_or_null(...)
    json_writer_field_empty_array(...)
    return json_writer_field_empty_object(...)

# @origin sa/src/rpc_system.sa:2241
def send_rpc_config_read(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    json_writer_write_config_read_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:2251
def json_writer_write_plugin_read_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    rpc_extract_param_string(...)
    json_writer_begin_field_object(...)
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_system.sa:2351
def send_rpc_plugin_read(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_plugin_read_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:2363
def json_writer_write_plugin_uninstall_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    return rpc_extract_string_or_default(...)

# @origin sa/src/rpc_system.sa:2386
def send_rpc_plugin_uninstall(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_plugin_uninstall_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:2398
def json_writer_write_plugin_share_checkout_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    return rpc_extract_string_or_default(...)

# @origin sa/src/rpc_system.sa:2431
def send_rpc_plugin_share_checkout(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_plugin_share_checkout_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:2443
def json_writer_write_plugin_share_delete_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    return rpc_extract_param_string(...)

# @origin sa/src/rpc_system.sa:2485
def send_rpc_plugin_share_delete(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_plugin_share_delete_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:2496
def json_writer_write_marketplace_add_result(writer: ptr, body: ptr, body_len: u64, cwd_ptr: ptr, cwd_len: u64) -> u32:
    return rpc_extract_string_or_default(...)

# @origin sa/src/rpc_system.sa:2523
def send_rpc_marketplace_add(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    sa_deno_plugin_cwd(...)
    json_writer_write_marketplace_add_result(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:2545
def json_writer_write_marketplace_remove_result(writer: ptr, body: ptr, body_len: u64, cwd_ptr: ptr, cwd_len: u64) -> u32:
    return rpc_extract_string_or_default(...)

# @origin sa/src/rpc_system.sa:2570
def send_rpc_marketplace_remove(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    sa_deno_plugin_cwd(...)
    json_writer_write_marketplace_remove_result(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:2592
def json_writer_write_marketplace_upgrade_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    json_writer_field_empty_array(...)
    json_writer_begin_field_array(...)
    return sa_json_writer_write_string(...)

# @origin sa/src/rpc_system.sa:2644
def send_rpc_marketplace_upgrade(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_marketplace_upgrade_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:2656
def json_writer_write_initialize_result(writer: ptr, version_ptr: ptr, version_len: u64, cwd_ptr: ptr, cwd_len: u64, family_ptr: ptr, family_len: u64, os_ptr: ptr, os_len: u64) -> u32:
    return prefix_with_owned(...)

# @origin sa/src/rpc_system.sa:2686
def send_rpc_initialize(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    sa_deno_plugin_version_deno(...)
    sa_deno_plugin_cwd(...)
    sa_deno_plugin_build_platform_family(...)
    sa_deno_plugin_build_os(...)
    json_writer_write_initialize_result(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:2736
def json_writer_write_account_login_start_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    return rpc_extract_string_or_default(...)

# @origin sa/src/rpc_system.sa:2759
def send_rpc_account_login_start(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_account_login_start_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:2771
def json_writer_write_environment_add_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    return rpc_extract_param_string(...)

# @origin sa/src/rpc_system.sa:2827
def send_rpc_environment_add(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_environment_add_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:2839
def json_writer_write_review_start_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    return rpc_extract_string_or_default(...)

# @origin sa/src/rpc_system.sa:2862
def send_rpc_review_start(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_review_start_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:2874
def mcp_oauth_login_has_required_name(body: ptr, body_len: u64) -> u8:
    sa_json_parse(...)
    sa_json_object_get(...)
    sa_json_object_get_string(...)
    return sa_json_free(...)

# @origin sa/src/rpc_system.sa:2945
def json_writer_write_oauth_login_result(writer: ptr, url_ptr: ptr, url_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sa:2958
def send_rpc_oauth_login(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr, body: ptr, body_len: u64) -> u32:
    mcp_oauth_login_has_required_name(...)
    http_url_owned(...)
    json_writer_write_oauth_login_result(...)
    send_wrapped_writer_with_id(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_system.sa:2998
def json_writer_write_mock_experimental_result(writer: ptr, value_node: ptr) -> u32:
    return sa_json_writer_field_node(...)

# @origin sa/src/rpc_system.sa:3026
def send_rpc_mock_experimental(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    sa_json_parse(...)
    sa_json_object_get(...)
    json_writer_write_mock_experimental_result(...)
    send_wrapped_writer_with_id(...)
    return sa_json_free(...)

# @origin sa/src/rpc_system.sa:3113
def json_writer_write_plugin_share_save_result(writer: ptr, remote_ptr: ptr, remote_len: u64, url_ptr: ptr, url_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sa:3132
def send_rpc_plugin_share_save(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    plugin_random_uuid(...)
    prefix_with_owned(...)
    http_url_owned(...)
    json_writer_write_plugin_share_save_result(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:3171
def json_writer_write_plugin_share_update_empty_result(writer: ptr) -> u32:
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_system.sa:3184
def send_rpc_plugin_share_update_empty(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_plugin_share_update_empty_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:3194
def json_writer_write_plugin_share_update_node_result(writer: ptr, principals_node: ptr) -> u32:
    return sa_json_writer_field_node(...)

# @origin sa/src/rpc_system.sa:3208
def send_rpc_plugin_share_update_node(req: ptr, id_ptr: ptr, id_len: u64, principals_node: ptr) -> u32:
    json_writer_write_plugin_share_update_node_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:3219
def send_rpc_plugin_share_update_targets(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    sa_json_parse(...)
    sa_json_object_get(...)
    sa_json_kind(...)
    send_rpc_plugin_share_update_node(...)
    sa_json_free(...)
    return send_rpc_plugin_share_update_empty(...)

# @origin sa/src/rpc_system.sa:3313
def write_mcp_reload_response_object(writer: ptr, body: ptr, body_len: u64) -> u32:
    return rpc_extract_string_or_default(...)

# @origin sa/src/rpc_system.sa:3336
def send_rpc_mcp_reload(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    write_mcp_reload_response_object(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:3348
def send_rpc_item_tool_call(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    json_writer_begin_field_array(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:3384
def send_rpc_mcp_tool_call(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    sa_deno_plugin_mcp_tool_call(...)
    send_error_with_id(...)
    sa_print_bytes(...)
    notify_mcp_tool_progress(...)
    send_wrapped_raw_json_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:3433
def send_rpc_fs_read(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    send_error_with_id(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:3491
def send_rpc_fs_write(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    send_error_with_id(...)
    return send_rpc_bool_field_with_id(...)

# @origin sa/src/rpc_system.sa:3560
def send_rpc_fs_mkdir(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    send_error_with_id(...)
    return send_rpc_bool_field_with_id(...)

# @origin sa/src/rpc_system.sa:3606
def send_rpc_fs_readdir(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    send_error_with_id(...)
    sa_json_parse(...)
    sa_json_writer_field_node(...)
    send_wrapped_writer_with_id(...)
    sa_json_free(...)
    plugin_free_buffer(...)
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_system.sa:3695
def send_rpc_fs_metadata(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    send_error_with_id(...)
    send_wrapped_raw_json_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:3745
def send_rpc_fs_remove(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    send_error_with_id(...)
    return send_rpc_bool_field_with_id(...)

# @origin sa/src/rpc_system.sa:3791
def send_rpc_fs_copy(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    send_error_with_id(...)
    return send_rpc_bool_field_with_id(...)

# @origin sa/src/rpc_system.sa:3860
def rpc_system_min_u64(a: u64, b: u64) -> u64:
    ...

# @origin sa/src/rpc_system.sa:3875
def b64_emit_char(out: ptr, out_i_slot: ptr, idx: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sa:3896
def base64_encode_into(src: ptr, src_len: u64, out: ptr, out_len_slot: ptr) -> u32:
    return b64_emit_char(...)

# @origin sa/src/rpc_system.sa:4050
def rpc_extract_command_argv(body: ptr, body_len: u64, argv: ptr, arg_storage: ptr, out_count: ptr) -> u32:
    sa_json_parse(...)
    sa_json_object_get(...)
    sa_json_kind(...)
    sa_json_value_count(...)
    sa_json_array_get(...)
    sa_json_string_ptr(...)
    sa_json_string_len(...)
    rpc_system_min_u64(...)
    copy_bytes_into(...)
    return sa_json_free(...)

# @origin sa/src/rpc_system.sa:4305
def notify_command_output(state_ptr: ptr, process_id_ptr: ptr, process_id_len: u64, stream_ptr: ptr, stream_len: u64, data_ptr: ptr, data_len: u64) -> u32:
    base64_encode_into(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:4353
def json_writer_write_command_exec_result(writer: ptr, exit_code: u64, stdout_ptr: ptr, stdout_len: u64, stderr_ptr: ptr, stderr_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sa:4375
def send_rpc_command_exec(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_command_argv(...)
    rpc_extract_param_string(...)
    notify_command_output(...)
    json_writer_write_command_exec_result(...)
    send_wrapped_writer_with_id(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_system.sa:4522
def notify_process_output(state_ptr: ptr, handle_ptr: ptr, handle_len: u64, stream_ptr: ptr, stream_len: u64, data_ptr: ptr, data_len: u64) -> u32:
    base64_encode_into(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:4570
def notify_process_exited(state_ptr: ptr, handle_ptr: ptr, handle_len: u64, exit_code: u64, stdout_ptr: ptr, stdout_len: u64, stderr_ptr: ptr, stderr_len: u64) -> u32:
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:4604
def json_writer_write_process_spawn_result(writer: ptr, handle_ptr: ptr, handle_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sa:4617
def send_rpc_process_spawn(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_command_argv(...)
    rpc_extract_param_string(...)
    state_process_put(...)
    notify_process_output(...)
    notify_process_exited(...)
    json_writer_write_process_spawn_result(...)
    send_wrapped_writer_with_id(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_system.sa:4766
def send_rpc_process_kill(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_param_string(...)
    state_process_delete(...)
    return send_rpc_bool_field_with_id(...)

# @origin sa/src/rpc_system.sa:4814
def json_writer_write_send_credits_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    return rpc_extract_param_string(...)

# @origin sa/src/rpc_system.sa:4856
def send_rpc_send_credits(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    json_writer_write_send_credits_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:4868
def json_writer_write_attestation_result(writer: ptr, token_ptr: ptr, token_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sa:4881
def send_rpc_attestation_generate(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    plugin_random_uuid(...)
    prefix_with_owned(...)
    json_writer_write_attestation_result(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:4906
def json_writer_write_external_detect_result(writer: ptr, cwd_ptr: ptr, cwd_len: u64) -> u32:
    path_join_owned(...)
    json_writer_begin_field_array(...)
    return json_writer_begin_field_object(...)

# @origin sa/src/rpc_system.sa:4967
def send_rpc_external_detect(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    sa_deno_plugin_cwd(...)
    json_writer_write_external_detect_result(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:4988
def json_writer_write_config_write_result(writer: ptr, cwd_ptr: ptr, cwd_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sa:5005
def send_rpc_config_write(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    sa_deno_plugin_cwd(...)
    json_writer_write_config_write_result(...)
    send_wrapped_writer_with_id(...)
    return plugin_free_buffer(...)

# @origin sa/src/rpc_system.sa:5026
def json_writer_write_remote_status_params(writer: ptr, body: ptr, body_len: u64, status_ptr: ptr, status_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    return rpc_extract_param_string(...)

# @origin sa/src/rpc_system.sa:5100
def notify_remote_status(state_ptr: ptr, body: ptr, body_len: u64, status_ptr: ptr, status_len: u64) -> u32:
    json_writer_write_remote_status_params(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_system.sa:5114
def send_rpc_remote_status(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64, status_ptr: ptr, status_len: u64) -> u32:
    json_writer_write_remote_status_params(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_system.sa:5128
def send_rpc_mcp_status_list(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    sa_deno_plugin_mcp_server_status_list(...)
    send_error_with_id(...)
    send_wrapped_raw_json_with_id(...)
    plugin_free_buffer(...)
    return sa_print_bytes(...)

# @origin sa/src/rpc_system.sa:5176
def send_rpc_mcp_resource_read(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    sa_deno_plugin_mcp_resource_read(...)
    send_error_with_id(...)
    sa_print_bytes(...)
    send_wrapped_raw_json_with_id(...)
    return plugin_free_buffer(...)
