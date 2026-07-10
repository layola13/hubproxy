from __future__ import annotations

# import deno.sai
# import ../src/hub_modules.sa

# @origin sa/tests/responses_chat_fallback_request_test.sa:359
def assert_contract(ok: u8, code: i32) -> Any:
    sa_deno_plugin_responses_chat_fallback_request(...)
    assert_contract(...)
    sa_bytes_find(...)
    sa_deno_plugin_free_buffer(...)
    sa_deno_plugin_chat_sse_to_responses(...)
    sa_deno_plugin_chat_json_to_responses(...)
    sa_deno_plugin_responses_request_normalize(...)
    build_responses_proxy_body(...)
    sa_deno_plugin_responses_json_normalize(...)
    sa_deno_plugin_responses_json_normalize_with_request(...)
    sa_deno_plugin_responses_sse_normalize(...)
    sa_deno_plugin_responses_sse_normalize_with_request(...)
    sa_deno_plugin_mcp_server_status_list(...)
    sa_deno_plugin_mcp_resource_read(...)
    sa_deno_plugin_mcp_tool_call(...)
    body_allows_progress_continuation(...)
    responses_sse_is_progress_message(...)
    build_native_progress_continuation(...)
    state_init(...)
    state_thread_create_with_key(...)
    state_turn_create(...)
    state_turn_set_mode(...)
    response_request_context_mode_from_ids(...)
    return state_thread_create(...)
