from __future__ import annotations

# @origin sa/src/rpc_system.sai:3
def notify_fs_changed(state_ptr: ptr, watch_id_ptr: ptr, watch_id_len: u64, path_ptr: ptr, path_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:4
def notify_thread_string(state_ptr: ptr, event_ptr: ptr, event_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:5
def json_writer_write_realtime_started_params(writer: ptr, thread_ptr: ptr, thread_len: u64, session_ptr: ptr, session_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:6
def notify_realtime_started(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:7
def notify_rt_item_value(state_ptr: ptr, event_ptr: ptr, event_len: u64, body: ptr, body_len: u64, key: ptr, key_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:8
def notify_rt_role_value(state_ptr: ptr, event_ptr: ptr, event_len: u64, body: ptr, body_len: u64, value_key: ptr, value_key_len: u64, mid: ptr, mid_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:9
def notify_rt_string_value(state_ptr: ptr, event_ptr: ptr, event_len: u64, body: ptr, body_len: u64, value_key: ptr, value_key_len: u64, json_key: ptr, json_key_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:10
def notify_fuzzy_events(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:11
def notify_server_resolved(state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:12
def notify_empty_params(state_ptr: ptr, event_ptr: ptr, event_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:13
def notify_sandbox_setup_params(state_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:14
def json_writer_write_bool_field_result(writer: ptr, key: ptr, key_len: u64, value: u8) -> u32:
    ...

# @origin sa/src/rpc_system.sai:15
def send_rpc_bool_field_with_id(req: ptr, id_ptr: ptr, id_len: u64, key: ptr, key_len: u64, value: u8) -> u32:
    ...

# @origin sa/src/rpc_system.sai:16
def send_rpc_status_with_id(req: ptr, id_ptr: ptr, id_len: u64, status_ptr: ptr, status_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:18
def send_rpc_thread_unsubscribe(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:19
def send_rpc_thread_increment_elicitation(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:20
def send_rpc_thread_decrement_elicitation(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:21
def send_rpc_fs_watch(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:22
def send_rpc_fs_unwatch(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:23
def json_writer_write_external_import_result(writer: ptr, iso_ptr: ptr, iso_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:24
def send_rpc_external_import(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:25
def send_rpc_experimental_enablement_empty(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:26
def send_rpc_experimental_enablement_set(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:27
def json_writer_write_realtime_start_result(writer: ptr, uuid_ptr: ptr, uuid_len: u64, now_i: i64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:28
def json_writer_write_realtime_thread_result(writer: ptr, thread_ptr: ptr, thread_len: u64, kind: u8) -> u32:
    ...

# @origin sa/src/rpc_system.sai:29
def send_rpc_realtime_start(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:30
def send_rpc_realtime_thread(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64, kind: u8) -> u32:
    ...

# @origin sa/src/rpc_system.sai:31
def json_writer_write_sandbox_setup_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:32
def send_rpc_sandbox_setup(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:33
def json_writer_write_fuzzy_search_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:34
def send_rpc_fuzzy_search(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:35
def json_writer_write_fuzzy_session_result(writer: ptr, body: ptr, body_len: u64, is_stop: u8) -> u32:
    ...

# @origin sa/src/rpc_system.sai:36
def send_rpc_fuzzy_session(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64, is_stop: u8) -> u32:
    ...

# @origin sa/src/rpc_system.sai:37
def json_writer_write_server_resolved_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:38
def send_rpc_server_resolved(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:39
def json_writer_write_model_capabilities_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:40
def send_rpc_model_capabilities(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:41
def json_writer_write_collaboration_mode_list_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:42
def send_rpc_collaboration_mode_list(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:43
def json_writer_write_hooks_list_result(writer: ptr, cwd_ptr: ptr, cwd_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:44
def send_rpc_hooks_list(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:45
def send_rpc_model_list(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:46
def json_writer_write_account_read_result(writer: ptr, plan_ptr: ptr, plan_len: u64, email_ptr: ptr, email_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:47
def send_rpc_account_read(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:48
def json_writer_write_rate_limits_result(writer: ptr, plan_ptr: ptr, plan_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:49
def send_rpc_rate_limits(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:50
def json_writer_write_chatgpt_tokens_refresh_result(writer: ptr, iso_ptr: ptr, iso_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:51
def send_rpc_chatgpt_tokens_refresh(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:52
def json_writer_write_config_read_result(writer: ptr, cfg_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:53
def send_rpc_config_read(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:54
def json_writer_write_plugin_read_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:55
def send_rpc_plugin_read(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:56
def json_writer_write_plugin_uninstall_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:57
def send_rpc_plugin_uninstall(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:58
def json_writer_write_plugin_share_checkout_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:59
def send_rpc_plugin_share_checkout(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:60
def json_writer_write_plugin_share_delete_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:61
def send_rpc_plugin_share_delete(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:62
def json_writer_write_plugin_share_save_result(writer: ptr, remote_ptr: ptr, remote_len: u64, url_ptr: ptr, url_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:63
def send_rpc_plugin_share_save(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:64
def json_writer_write_plugin_share_update_empty_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:65
def send_rpc_plugin_share_update_empty(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:66
def json_writer_write_plugin_share_update_node_result(writer: ptr, principals_node: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:67
def send_rpc_plugin_share_update_node(req: ptr, id_ptr: ptr, id_len: u64, principals_node: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:68
def send_rpc_plugin_share_update_targets(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:69
def json_writer_write_marketplace_add_result(writer: ptr, body: ptr, body_len: u64, cwd_ptr: ptr, cwd_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:70
def send_rpc_marketplace_add(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:71
def json_writer_write_marketplace_remove_result(writer: ptr, body: ptr, body_len: u64, cwd_ptr: ptr, cwd_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:72
def send_rpc_marketplace_remove(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:73
def json_writer_write_marketplace_upgrade_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:74
def send_rpc_marketplace_upgrade(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:75
def json_writer_write_initialize_result(writer: ptr, version_ptr: ptr, version_len: u64, cwd_ptr: ptr, cwd_len: u64, family_ptr: ptr, family_len: u64, os_ptr: ptr, os_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:76
def send_rpc_initialize(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:77
def json_writer_write_account_login_start_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:78
def send_rpc_account_login_start(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:79
def json_writer_write_environment_add_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:80
def send_rpc_environment_add(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:81
def json_writer_write_review_start_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:82
def send_rpc_review_start(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:83
def json_writer_write_oauth_login_result(writer: ptr, url_ptr: ptr, url_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:84
def send_rpc_oauth_login(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:85
def mcp_oauth_login_has_required_name(body: ptr, body_len: u64) -> u8:
    ...

# @origin sa/src/rpc_system.sai:86
def json_writer_write_mock_experimental_result(writer: ptr, value_node: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:87
def send_rpc_mock_experimental(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:88
def send_rpc_mcp_reload(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:89
def write_mcp_reload_response_object(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:90
def send_rpc_item_tool_call(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:91
def send_rpc_mcp_tool_call(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:92
def send_rpc_fs_read(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:93
def send_rpc_fs_write(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:94
def send_rpc_fs_mkdir(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:95
def send_rpc_fs_readdir(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:96
def send_rpc_fs_metadata(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:97
def send_rpc_fs_remove(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:98
def send_rpc_fs_copy(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:99
def notify_command_output(state_ptr: ptr, process_id_ptr: ptr, process_id_len: u64, stream_ptr: ptr, stream_len: u64, data_ptr: ptr, data_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:100
def json_writer_write_command_exec_result(writer: ptr, exit_code: u64, stdout_ptr: ptr, stdout_len: u64, stderr_ptr: ptr, stderr_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:101
def send_rpc_command_exec(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:102
def notify_process_output(state_ptr: ptr, handle_ptr: ptr, handle_len: u64, stream_ptr: ptr, stream_len: u64, data_ptr: ptr, data_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:103
def notify_process_exited(state_ptr: ptr, handle_ptr: ptr, handle_len: u64, exit_code: u64, stdout_ptr: ptr, stdout_len: u64, stderr_ptr: ptr, stderr_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:104
def json_writer_write_process_spawn_result(writer: ptr, handle_ptr: ptr, handle_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:105
def send_rpc_process_spawn(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:106
def send_rpc_process_kill(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:107
def json_writer_write_send_credits_result(writer: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:108
def send_rpc_send_credits(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:109
def json_writer_write_attestation_result(writer: ptr, token_ptr: ptr, token_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:110
def send_rpc_attestation_generate(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:111
def json_writer_write_external_detect_result(writer: ptr, cwd_ptr: ptr, cwd_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:112
def send_rpc_external_detect(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:113
def json_writer_write_config_write_result(writer: ptr, cwd_ptr: ptr, cwd_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:114
def send_rpc_config_write(req: ptr, id_ptr: ptr, id_len: u64, cfg_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_system.sai:115
def json_writer_write_remote_status_params(writer: ptr, body: ptr, body_len: u64, status_ptr: ptr, status_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:116
def notify_remote_status(state_ptr: ptr, body: ptr, body_len: u64, status_ptr: ptr, status_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:117
def send_rpc_remote_status(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64, status_ptr: ptr, status_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:118
def send_rpc_mcp_status_list(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_system.sai:119
def send_rpc_mcp_resource_read(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...
