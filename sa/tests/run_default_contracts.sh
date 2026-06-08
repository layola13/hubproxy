#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"

cd "${sa_dir}"

sa build main.sa -o hubproxy
sa build tests/test_http_contract.sa

safe_shell_tests=(
  tests/test_account_email.sh
  tests/test_account_plan_type.sh
  tests/test_api_request_log.sh
  tests/test_api_request_log_disabled_by_default.sh
  tests/test_attestation_uuid.sh
  tests/test_auth_failure_log.sh
  tests/test_chat_large_tools_no_crash.sh
  tests/test_chat_tools_capture.sh
  tests/test_chatgpt_tokens_refresh_iso.sh
  tests/test_command_exec_cwd.sh
  tests/test_config_read_nulls.sh
  tests/test_config_write_cwd.sh
  tests/test_elicitation_lifecycle.sh
  tests/test_empty_body_reject.sh
  tests/test_events_contract.sh
  tests/test_external_detect_cwd.sh
  tests/test_external_import_iso.sh
  tests/test_fs_watch_unwatch.sh
  tests/test_goal_status_budget_null_parity.sh
  tests/test_goal_timestamp_current.sh
  tests/test_goal_update_timestamp_parity.sh
  tests/test_hooks_list_cwd.sh
  tests/test_initialize_runtime_info.sh
  tests/test_inject_items_lifecycle.sh
  tests/test_item_event_timestamp_current.sh
  tests/test_item_tool_call_no_progress_event.sh
  tests/test_large_non_sse_body.sh
  tests/test_large_response_body_over_64k.sh
  tests/test_marketplace_installed_root.sh
  tests/test_mcp_elicitation_event_shape.sh
  tests/test_mcp_reload_status_oauth_contract.sh
  tests/test_mcp_resource_unsupported.sh
  tests/test_mcp_tool_progress_event.sh
  tests/test_memory_reset_clears_state.sh
  tests/test_plugin_share_save_uuid.sh
  tests/test_plugin_share_update_targets.sh
  tests/test_process_lifecycle.sh
  tests/test_project_tasks_sa_default.sh
  tests/test_realtime_start_timestamp_current.sh
  tests/test_realtime_uuid.sh
  tests/test_responses_client_mcp_added_normalize.sh
  tests/test_responses_client_mcp_denormalize.sh
  tests/test_responses_fallback_capture.sh
  tests/test_responses_fallback_json_progress_continuation.sh
  tests/test_responses_fallback_json_progress_no_continuation.sh
  tests/test_responses_fallback_json_reasoning_content.sh
  tests/test_responses_fallback_json_thought_tag.sh
  tests/test_responses_fallback_json_tool_call.sh
  tests/test_responses_fallback_json_tool_only.sh
  tests/test_responses_fallback_stream_events.sh
  tests/test_responses_fallback_stream_mcp_dot_notation.sh
  tests/test_responses_fallback_stream_progress_continuation.sh
  tests/test_responses_fallback_stream_progress_no_continuation.sh
  tests/test_responses_fallback_stream_progress_no_exec_tool.sh
  tests/test_responses_fallback_stream_reasoning_content.sh
  tests/test_responses_fallback_stream_thought_tag.sh
  tests/test_responses_fallback_stream_tool_call.sh
  tests/test_responses_fallback_stream_tool_call_namespace.sh
  tests/test_responses_fallback_stream_tool_call_normalize.sh
  tests/test_responses_fallback_stream_tool_call_read_env_redact.sh
  tests/test_responses_fallback_stream_tool_call_read_shell_quote.sh
  tests/test_responses_fallback_stream_tool_call_split.sh
  tests/test_responses_fallback_strips_responses_only_fields.sh
  tests/test_responses_fallback_tool_history.sh
  tests/test_responses_gemini_capture.sh
  tests/test_responses_gemini_tool_history_no_fallback.sh
  tests/test_responses_long_input_request_no_crash.sh
  tests/test_responses_mcp_server_normalize.sh
  tests/test_responses_missing_base_capture.sh
  tests/test_responses_native_large_sse_no_crash.sh
  tests/test_responses_native_progress_continuation.sh
  tests/test_responses_native_progress_no_continuation.sh
  tests/test_responses_native_thinking_json.sh
  tests/test_responses_native_thinking_stream.sh
  tests/test_responses_plan_large_tools_no_crash.sh
  tests/test_responses_tools_capture.sh
  tests/test_responses_turn_context_deno_parity.sh
  tests/test_responses_turn_context_goal_continuation.sh
  tests/test_rpc_misc_parity.sh
  tests/test_thread_name_events.sh
  tests/test_thread_resume_envelope.sh
  tests/test_thread_rollback_numeric_num_turns.sh
  tests/test_thread_start_fork_param_overrides.sh
  tests/test_thread_string_id_lifecycle.sh
  tests/test_thread_timestamp_current.sh
  tests/test_thread_unsubscribe_status.sh
  tests/test_turn_goal_event_thread_id_parity.sh
  tests/test_turn_interrupt_lifecycle.sh
  tests/test_turn_items_list.sh
  tests/test_turn_start_collaboration_mode_rpc_parity.sh
  tests/test_turn_start_missing_thread.sh
  tests/test_turn_steer_items.sh
  tests/test_turn_timestamp_current.sh
  tests/test_upstream_auth_headers.sh
  tests/test_user_input_event_shape.sh
)

for test_script in "${safe_shell_tests[@]}"; do
  bash "${test_script}"
done

echo "sa_default_contracts_ok"
