from __future__ import annotations

# import rpc_dispatch.sai
# import sa_std/io/print.sai
# import sa_std/io.sai
# import sa_std/process.sai
# import sa_std/process.sal
# import sa_std/fmt.sai
# import sa_std/time.sai
# import sa_std/string.sai
# import sa_std/encoding/json.sa
# import deno.sal
# import config.sai
# import events.sai
# import json_support.sai
# import proxy.sai
# import rpc_emit.sai
# import rpc_parse.sai
# import rpc_session.sai
# import rpc_system.sai
# import request_context.sai
# import state.sai
# import strings.sai

# @origin sa/src/rpc_dispatch.sa:24
def sa_bytes_find(hay: ptr, hay_len: u64, needle: ptr, needle_len: u64) -> i64:
    ...

# @origin sa/src/rpc_dispatch.sa:1311
def handle_rpc_request(req: ptr, rpc_body_ptr: ptr, rpc_body_len: u64, state_ptr: ptr, cfg_ptr: ptr) -> u32:
    rpc_extract_id_token(...)
    sa_bytes_find(...)
    send_rpc_initialize(...)
    send_rpc_thread_start_from_body(...)
    send_rpc_thread_list(...)
    send_rpc_thread_loaded_list(...)
    rpc_resolve_thread_id(...)
    send_rpc_thread_read(...)
    send_rpc_thread_archive(...)
    send_rpc_thread_unarchive(...)
    send_rpc_thread_name_set(...)
    send_rpc_thread_metadata_update(...)
    send_rpc_thread_fork_from_body(...)
    send_rpc_thread_resume(...)
    rpc_extract_u64_after(...)
    send_rpc_thread_rollback(...)
    send_rpc_turns_list(...)
    send_rpc_turn_items_list(...)
    send_rpc_thread_inject_items(...)
    send_rpc_thread_increment_elicitation(...)
    send_rpc_thread_decrement_elicitation(...)
    send_rpc_turn_start_from_body(...)
    send_rpc_thread_simple_id(...)
    send_rpc_thread_shell_command(...)
    send_rpc_thread_memory_mode(...)
    send_rpc_turn_steer(...)
    send_rpc_turn_interrupt(...)
    send_rpc_goal_set_from_body(...)
    send_rpc_goal_get_from_body(...)
    send_rpc_goal_clear_from_body(...)
    send_rpc_account_read(...)
    send_rpc_model_list(...)
    send_rpc_config_requirements_with_id(...)
    send_rpc_thread_unsubscribe(...)
    send_rpc_memory_reset(...)
    send_rpc_hooks_list(...)
    notify_skills_changed(...)
    send_rpc_empty_array_field_with_id(...)
    send_rpc_plugin_marketplaces_with_id(...)
    send_rpc_plugin_read(...)
    send_rpc_plugin_install_unavailable_with_id(...)
    send_rpc_plugin_uninstall(...)
    send_rpc_marketplace_add(...)
    send_rpc_marketplace_remove(...)
    send_rpc_marketplace_upgrade(...)
    send_rpc_model_capabilities(...)
    send_rpc_empty_data_page_with_id(...)
    send_rpc_experimental_features_with_id(...)
    send_rpc_experimental_enablement_set(...)
    send_rpc_collaboration_mode_list(...)
    notify_remote_status(...)
    send_rpc_remote_status(...)
    notify_sandbox_setup_params(...)
    send_rpc_sandbox_setup(...)
    send_rpc_status_with_id(...)
    send_rpc_config_read(...)
    send_rpc_plugin_share_save(...)
    send_rpc_plugin_share_update_targets(...)
    send_rpc_plugin_share_checkout(...)
    send_rpc_plugin_share_delete(...)
    send_rpc_account_login_start(...)
    send_rpc_account_login_state_with_id(...)
    send_rpc_rate_limits(...)
    send_rpc_send_credits(...)
    send_rpc_chatgpt_tokens_refresh(...)
    send_rpc_attestation_generate(...)
    send_rpc_approval_accept_with_id(...)
    state_thread_increment_elicitation(...)
    notify_user_input_request(...)
    send_rpc_user_input_continue_with_id(...)
    notify_mcp_elicitation_request(...)
    send_rpc_mcp_elicit_accept_with_id(...)
    send_rpc_permissions_default_with_id(...)
    send_rpc_item_tool_call(...)
    send_rpc_config_write(...)
    send_rpc_external_detect(...)
    notify_empty_params(...)
    send_rpc_external_import(...)
    notify_realtime_started(...)
    send_rpc_realtime_start(...)
    notify_rt_item_value(...)
    send_rpc_realtime_thread(...)
    notify_rt_role_value(...)
    notify_thread_string(...)
    send_rpc_realtime_voices_with_id(...)
    notify_mcp_startup_params(...)
    send_rpc_mcp_reload(...)
    send_rpc_mcp_status_list(...)
    send_rpc_mcp_resource_read(...)
    send_error_with_id(...)
    send_rpc_mcp_tool_call(...)
    send_rpc_fuzzy_session(...)
    notify_fuzzy_events(...)
    send_rpc_fuzzy_search(...)
    state_thread_decrement_elicitation(...)
    notify_server_resolved(...)
    send_rpc_server_resolved(...)
    notify_world_warning_params(...)
    send_rpc_bool_field_with_id(...)
    send_rpc_environment_add(...)
    send_rpc_review_start(...)
    send_rpc_oauth_login(...)
    send_rpc_mock_experimental(...)
    send_rpc_fs_read(...)
    send_rpc_fs_write(...)
    send_rpc_fs_mkdir(...)
    send_rpc_fs_readdir(...)
    send_rpc_fs_metadata(...)
    send_rpc_fs_remove(...)
    send_rpc_fs_copy(...)
    send_rpc_fs_watch(...)
    send_rpc_fs_unwatch(...)
    send_rpc_command_exec(...)
    send_rpc_process_spawn(...)
    return send_rpc_process_kill(...)
