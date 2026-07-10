from __future__ import annotations

# import rpc_session.sai
# import sa_std/encoding/json.sa
# import sa_std/encoding/json.sai
# import sa_std/time.sai
# import config.sai
# import events.sai
# import json_support.sai
# import request_context.sai
# import rpc_emit.sai
# import rpc_parse.sai
# import state.sai
# import strings.sai

# @origin sa/src/rpc_session.sa:342
def json_writer_field_thread_id_string(writer: ptr, key: ptr, key_len: u64, state_ptr: ptr, thread_id: u64) -> u32:
    state_thread_find(...)
    return u64_to_owned(...)

# @origin sa/src/rpc_session.sa:395
def json_writer_field_thread_id_goal_key(writer: ptr, key: ptr, key_len: u64, state_ptr: ptr, thread_id: u64, goal_key_ptr: ptr, goal_key_len: u64) -> u32:
    return json_writer_field_thread_id_string(...)

# @origin sa/src/rpc_session.sa:426
def json_writer_field_goal_status(writer: ptr, status: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sa:499
def json_writer_field_goal_status_text(writer: ptr, status: u8, status_ptr: ptr, status_len: u64) -> u32:
    return json_writer_field_goal_status(...)

# @origin sa/src/rpc_session.sa:540
def json_writer_field_goal_budget(writer: ptr, budget_null: u8, budget: i64) -> u32:
    return sa_json_writer_field_i64(...)

# @origin sa/src/rpc_session.sa:563
def json_writer_field_u64_string(writer: ptr, key: ptr, key_len: u64, value: u64) -> u32:
    return u64_to_owned(...)

# @origin sa/src/rpc_session.sa:578
def json_writer_write_u64_string(writer: ptr, value: u64) -> u32:
    u64_to_owned(...)
    return sa_json_writer_write_string(...)

# @origin sa/src/rpc_session.sa:591
def json_writer_field_nullable_string(writer: ptr, key: ptr, key_len: u64, value_ptr: ptr, value_len: u64, is_set: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sa:620
def json_writer_field_nullable_thread_id_string(writer: ptr, key: ptr, key_len: u64, state_ptr: ptr, thread_id: u64) -> u32:
    return json_writer_field_thread_id_string(...)

# @origin sa/src/rpc_session.sa:647
def json_writer_write_thread_id_string(writer: ptr, state_ptr: ptr, thread_id: u64) -> u32:
    state_thread_find(...)
    sa_json_writer_write_string(...)
    return json_writer_write_u64_string(...)

# @origin sa/src/rpc_session.sa:691
def json_writer_field_mode_value(writer: ptr, key: ptr, key_len: u64, mode: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sa:746
def json_writer_field_mode_text_or_value(writer: ptr, key: ptr, key_len: u64, mode: u8, mode_ptr: ptr, mode_len: u64) -> u32:
    return json_writer_field_mode_value(...)

# @origin sa/src/rpc_session.sa:775
def json_writer_field_thread_git_info(writer: ptr, state_ptr: ptr, thread_id: u64) -> u32:
    state_thread_find(...)
    sa_json_parse(...)
    sa_json_writer_field_node(...)
    return sa_json_free(...)

# @origin sa/src/rpc_session.sa:857
def json_writer_field_items_or_empty(writer: ptr, key: ptr, key_len: u64, items_ptr: ptr, items_len: u64) -> u32:
    sa_json_parse(...)
    sa_json_writer_field_node(...)
    sa_json_free(...)
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_session.sa:900
def json_writer_write_thread_object(writer: ptr, state_ptr: ptr, tid: u64, forked_from_id: u64, preview_ptr: ptr, preview_len: u64, provider_ptr: ptr, provider_len: u64, ephemeral: u8, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64, name_ptr: ptr, name_len: u64, name_set: u8, include_empty_turns: u8) -> u32:
    json_writer_field_thread_id_string(...)
    json_writer_field_nullable_thread_id_string(...)
    sa_time_unix_s(...)
    sa_json_writer_field_i64(...)
    json_writer_begin_field_object(...)
    json_writer_field_thread_git_info(...)
    json_writer_field_nullable_string(...)
    json_writer_field_empty_array(...)
    return json_writer_write_thread_turns_array(...)

# @origin sa/src/rpc_session.sa:994
def json_writer_write_thread_object_field(writer: ptr, key: ptr, key_len: u64, state_ptr: ptr, tid: u64, forked_from_id: u64, preview_ptr: ptr, preview_len: u64, provider_ptr: ptr, provider_len: u64, ephemeral: u8, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64, name_ptr: ptr, name_len: u64, name_set: u8, include_empty_turns: u8) -> u32:
    sa_json_writer_object_field(...)
    return json_writer_write_thread_object(...)

# @origin sa/src/rpc_session.sa:1021
def json_writer_write_turn_status_string(writer: ptr, status: u8) -> u32:
    return sa_json_writer_write_string(...)

# @origin sa/src/rpc_session.sa:1055
def json_writer_write_turn_status_field(writer: ptr, key: ptr, key_len: u64, status: u8) -> u32:
    sa_json_writer_object_field(...)
    return json_writer_write_turn_status_string(...)

# @origin sa/src/rpc_session.sa:1067
def json_writer_write_turn_completion_fields(writer: ptr, status: u8, completed_ts: u64) -> u32:
    return sa_json_writer_field_i64(...)

# @origin sa/src/rpc_session.sa:1113
def json_writer_write_turn_object(writer: ptr, turn_id: u64, status: u8, mode: u8, created_ts: u64, updated_ts: u64, completed_ts: u64, mode_ptr: ptr, mode_len: u64, items_ptr: ptr, items_len: u64) -> u32:
    json_writer_field_u64_string(...)
    json_writer_field_items_or_empty(...)
    json_writer_write_turn_status_field(...)
    sa_json_writer_field_i64(...)
    json_writer_field_mode_text_or_value(...)
    return json_writer_write_turn_completion_fields(...)

# @origin sa/src/rpc_session.sa:1154
def json_writer_write_turn_object_field(writer: ptr, key: ptr, key_len: u64, turn_id: u64, status: u8, mode: u8, created_ts: u64, updated_ts: u64, completed_ts: u64, mode_ptr: ptr, mode_len: u64, items_ptr: ptr, items_len: u64) -> u32:
    sa_json_writer_object_field(...)
    return json_writer_write_turn_object(...)

# @origin sa/src/rpc_session.sa:1175
def json_writer_write_turn_object_mode(writer: ptr, turn_id: u64, mode: u8) -> u32:
    sa_time_unix_s(...)
    return json_writer_write_turn_object(...)

# @origin sa/src/rpc_session.sa:1190
def notify_thread_started_with_values(state_ptr: ptr, thread_id: u64, forked_from_id: u64, provider_ptr: ptr, provider_len: u64, ephemeral: u8, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64) -> u32:
    json_writer_write_thread_object_field(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:1213
def notify_thread_status_idle(state_ptr: ptr, thread_id: u64) -> u32:
    json_writer_field_thread_id_string(...)
    json_writer_begin_field_object(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:1234
def notify_thread_id_only(state_ptr: ptr, event_ptr: ptr, event_len: u64, thread_id: u64) -> u32:
    json_writer_field_thread_id_string(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:1251
def notify_thread_id_string(state_ptr: ptr, event_ptr: ptr, event_len: u64, thread_ptr: ptr, thread_len: u64) -> u32:
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:1269
def notify_thread_name_updated(state_ptr: ptr, thread_id: u64, name_ptr: ptr, name_len: u64, is_set: u8) -> u32:
    json_writer_field_thread_id_string(...)
    json_writer_field_nullable_string(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:1289
def notify_goal_updated(state_ptr: ptr, thread_id: u64, goal_key_ptr: ptr, goal_key_len: u64, status: u8, status_ptr: ptr, status_len: u64, budget_null: u8, budget: i64, used: u64, created: u64, updated: u64, obj_ptr: ptr, obj_len: u64) -> u32:
    json_writer_field_thread_id_goal_key(...)
    json_writer_begin_field_object(...)
    json_writer_field_goal_status_text(...)
    json_writer_field_goal_budget(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:1342
def notify_turn_started(state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    json_writer_field_thread_id_string(...)
    state_turn_find(...)
    json_writer_write_turn_object_field(...)
    sa_time_unix_s(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:1401
def notify_turn_completed(state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    json_writer_field_thread_id_string(...)
    state_turn_find(...)
    json_writer_write_turn_object_field(...)
    sa_time_unix_s(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:1458
def notify_turn_diff(state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    json_writer_field_thread_id_string(...)
    json_writer_field_u64_string(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:1478
def notify_turn_plan(state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    json_writer_field_thread_id_string(...)
    json_writer_field_u64_string(...)
    json_writer_field_empty_array(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:1500
def send_rpc_goal_null_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_session.sa:1516
def send_rpc_goal_obj(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, goal_key_ptr: ptr, goal_key_len: u64, status: u8, status_ptr: ptr, status_len: u64, budget_null: u8, budget: i64, used: u64, created: u64, updated: u64, obj_ptr: ptr, obj_len: u64) -> u32:
    json_writer_begin_field_object(...)
    json_writer_field_thread_id_goal_key(...)
    json_writer_field_goal_status_text(...)
    json_writer_field_goal_budget(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_session.sa:1568
def send_rpc_goal_clear(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, goal_key_ptr: ptr, goal_key_len: u64, cleared: u8) -> u32:
    json_writer_begin_field_object(...)
    json_writer_field_thread_id_goal_key(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_session.sa:1625
def send_rpc_goal_set_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_resolve_thread_id(...)
    rpc_extract_param_string(...)
    rpc_goal_status_from_body(...)
    rpc_extract_i64_number_after(...)
    state_goal_set(...)
    state_goal_get_full(...)
    notify_goal_updated(...)
    return send_rpc_goal_obj(...)

# @origin sa/src/rpc_session.sa:1752
def send_rpc_goal_get_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_resolve_thread_id(...)
    rpc_extract_param_string(...)
    state_goal_get_full(...)
    send_rpc_goal_obj(...)
    return send_rpc_goal_null_with_id(...)

# @origin sa/src/rpc_session.sa:1826
def send_rpc_goal_clear_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_resolve_thread_id(...)
    rpc_extract_param_string(...)
    state_goal_clear(...)
    notify_thread_id_string(...)
    send_rpc_goal_clear(...)
    return notify_thread_id_only(...)

# @origin sa/src/rpc_session.sa:1882
def send_rpc_thread_archive(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64) -> u32:
    state_thread_archive(...)
    notify_thread_id_only(...)
    json_writer_field_thread_id_string(...)
    send_wrapped_writer_with_id(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:1917
def send_rpc_thread_name_set(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_resolve_thread_id(...)
    rpc_extract_param_string(...)
    state_thread_set_name(...)
    state_thread_clear_name(...)
    notify_thread_name_updated(...)
    json_writer_field_thread_id_string(...)
    send_wrapped_writer_with_id(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:2009
def send_rpc_thread_read(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, include_turns: u8) -> u32:
    state_thread_find(...)
    json_writer_write_thread_object_field(...)
    send_wrapped_writer_with_id(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:2081
def send_rpc_thread_unarchive(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64) -> u32:
    state_thread_unarchive(...)
    notify_thread_id_only(...)
    notify_thread_status_idle(...)
    send_rpc_thread_read(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:2106
def send_rpc_thread_metadata_update(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_resolve_thread_id(...)
    state_thread_find(...)
    rpc_extract_param_string(...)
    state_thread_set_preview(...)
    rpc_param_is_null(...)
    state_thread_clear_preview(...)
    apply_thread_git_info_from_body(...)
    send_rpc_thread_read(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:2166
def apply_thread_git_info_from_body(state_ptr: ptr, thread_id: u64, body: ptr, body_len: u64) -> u32:
    sa_json_parse(...)
    sa_json_object_get(...)
    sa_json_kind(...)
    json_stringify_view(...)
    state_thread_set_git_info(...)
    json_buffer_dispose(...)
    sa_json_free(...)
    return state_thread_clear_git_info(...)

# @origin sa/src/rpc_session.sa:2294
def send_rpc_turns_list(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64) -> u32:
    state_turn_list(...)
    json_writer_begin_field_array(...)
    state_turn_find(...)
    json_writer_write_turn_object(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_session.sa:2370
def send_rpc_turn_items_list(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    state_turn_find(...)
    json_writer_field_items_or_empty(...)
    send_wrapped_writer_with_id(...)
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_session.sa:2455
def send_rpc_thread_rollback(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, remove_count: u64) -> u32:
    state_turn_rollback(...)
    send_rpc_thread_read(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:2480
def send_rpc_turn_start(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, turn_id: u64, mode: u8) -> u32:
    state_turn_find(...)
    json_writer_write_turn_object_field(...)
    sa_time_unix_s(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_session.sa:2537
def send_rpc_turn_start_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_resolve_thread_id(...)
    state_turn_create(...)
    rpc_extract_param_array_json(...)
    state_turn_set_items(...)
    json_buffer_dispose(...)
    rpc_turn_start_set_collaboration_mode(...)
    notify_turn_started(...)
    notify_turn_diff(...)
    notify_turn_plan(...)
    notify_turn_input_items_from_dom(...)
    send_rpc_turn_start(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:2599
def send_rpc_turn_interrupt(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    state_turn_interrupt(...)
    notify_turn_completed(...)
    u64_to_owned(...)
    json_writer_field_thread_id_string(...)
    send_wrapped_writer_with_id(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:2642
def json_writer_field_raw_node_or_null(writer: ptr, key: ptr, key_len: u64, raw_ptr: ptr, raw_len: u64) -> u32:
    sa_json_parse(...)
    sa_json_writer_field_node(...)
    return sa_json_free(...)

# @origin sa/src/rpc_session.sa:2685
def notify_injected_item(state_ptr: ptr, event_ptr: ptr, event_len: u64, thread_id: u64, turn_id: u64, item_ptr: ptr, item_len: u64, item_suffix: ptr, item_suffix_len: u64) -> u32:
    json_writer_field_thread_id_string(...)
    json_writer_field_u64_string(...)
    json_writer_field_raw_node_or_null(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:2711
def notify_timed_item(state_ptr: ptr, event_ptr: ptr, event_len: u64, thread_id: u64, turn_id: u64, item_ptr: ptr, item_len: u64, time_prefix: ptr, time_prefix_len: u64) -> u32:
    sa_time_unix_ms(...)
    json_writer_field_thread_id_string(...)
    json_writer_field_u64_string(...)
    sa_bytes_eq(...)
    json_writer_field_raw_node_or_null(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:2757
def item_id_or_empty(item_node: ptr, out_ptr: ptr, out_len: ptr) -> u32:
    return sa_json_object_get_string(...)

# @origin sa/src/rpc_session.sa:2791
def notify_item_string_detail(state_ptr: ptr, event_ptr: ptr, event_len: u64, thread_id: u64, turn_id: u64, item_id_ptr: ptr, item_id_len: u64, value_key_ptr: ptr, value_key_len: u64, value_ptr: ptr, value_len: u64, index_kind: u8, index_value: i64) -> u32:
    json_writer_field_thread_id_string(...)
    json_writer_field_u64_string(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:2870
def notify_item_index_detail(state_ptr: ptr, event_ptr: ptr, event_len: u64, thread_id: u64, turn_id: u64, item_id_ptr: ptr, item_id_len: u64, index_key_ptr: ptr, index_key_len: u64, index_value: i64) -> u32:
    json_writer_field_thread_id_string(...)
    json_writer_field_u64_string(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:2899
def notify_item_changes_detail(state_ptr: ptr, thread_id: u64, turn_id: u64, item_id_ptr: ptr, item_id_len: u64, changes_node: ptr) -> u32:
    sa_json_value_count(...)
    json_writer_field_thread_id_string(...)
    json_writer_field_u64_string(...)
    sa_json_writer_field_node(...)
    return notify_writer_params(...)

# @origin sa/src/rpc_session.sa:2958
def notify_agent_message_detail(state_ptr: ptr, thread_id: u64, turn_id: u64, item_node: ptr, item_id_ptr: ptr, item_id_len: u64) -> u32:
    sa_json_object_get(...)
    sa_json_value_count(...)
    sa_json_array_get(...)
    sa_json_object_get_string(...)
    sa_bytes_eq(...)
    notify_item_string_detail(...)
    return sa_json_free(...)

# @origin sa/src/rpc_session.sa:3087
def notify_reasoning_detail(state_ptr: ptr, thread_id: u64, turn_id: u64, item_node: ptr, item_id_ptr: ptr, item_id_len: u64) -> u32:
    sa_json_object_get_string(...)
    notify_item_string_detail(...)
    notify_item_index_detail(...)
    sa_json_object_get(...)
    sa_json_value_count(...)
    sa_json_array_get(...)
    return sa_json_free(...)

# @origin sa/src/rpc_session.sa:3202
def notify_simple_text_detail(state_ptr: ptr, event_ptr: ptr, event_len: u64, thread_id: u64, turn_id: u64, item_node: ptr, item_id_ptr: ptr, item_id_len: u64, primary_key_ptr: ptr, primary_key_len: u64, fallback_key_ptr: ptr, fallback_key_len: u64, value_key_ptr: ptr, value_key_len: u64) -> u32:
    sa_json_object_get_string(...)
    return notify_item_string_detail(...)

# @origin sa/src/rpc_session.sa:3286
def notify_file_change_detail(state_ptr: ptr, thread_id: u64, turn_id: u64, item_node: ptr, item_id_ptr: ptr, item_id_len: u64) -> u32:
    sa_json_object_get(...)
    notify_item_changes_detail(...)
    return sa_json_free(...)

# @origin sa/src/rpc_session.sa:3320
def notify_item_detail_events(state_ptr: ptr, thread_id: u64, turn_id: u64, item_node: ptr) -> u32:
    sa_json_object_get_string(...)
    item_id_or_empty(...)
    sa_bytes_eq(...)
    notify_agent_message_detail(...)
    notify_reasoning_detail(...)
    notify_simple_text_detail(...)
    return notify_file_change_detail(...)

# @origin sa/src/rpc_session.sa:3446
def notify_completed_item_node(state_ptr: ptr, thread_id: u64, turn_id: u64, item_node: ptr) -> u32:
    json_stringify_view(...)
    notify_timed_item(...)
    notify_item_detail_events(...)
    notify_injected_item(...)
    return json_buffer_dispose(...)

# @origin sa/src/rpc_session.sa:3484
def notify_turn_input_items_from_dom(state_ptr: ptr, body: ptr, body_len: u64, thread_id: u64, turn_id: u64) -> u64:
    sa_json_parse(...)
    sa_json_object_get(...)
    sa_json_value_count(...)
    sa_json_array_get(...)
    notify_completed_item_node(...)
    return sa_json_free(...)

# @origin sa/src/rpc_session.sa:3627
def notify_injected_items_from_dom(state_ptr: ptr, body: ptr, body_len: u64, thread_id: u64, turn_id: u64) -> u64:
    sa_json_parse(...)
    sa_json_object_get(...)
    sa_json_value_count(...)
    sa_json_array_get(...)
    json_stringify_view(...)
    notify_timed_item(...)
    notify_item_detail_events(...)
    notify_injected_item(...)
    json_buffer_dispose(...)
    return sa_json_free(...)

# @origin sa/src/rpc_session.sa:3831
def send_rpc_turn_steer(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, turn_id: u64, body: ptr, body_len: u64) -> u32:
    state_turn_find(...)
    rpc_extract_param_array_json(...)
    state_turn_append_items(...)
    json_buffer_dispose(...)
    notify_turn_input_items_from_dom(...)
    u64_to_owned(...)
    send_wrapped_writer_with_id(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:3906
def send_rpc_memory_reset(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    state_reset_runtime(...)
    notify_thread_id_string(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_session.sa:3936
def json_writer_write_thread_envelope_prefix(writer: ptr, body: ptr, body_len: u64, model_ptr: ptr, model_len: u64, provider_ptr: ptr, provider_len: u64, dir_ptr: ptr, dir_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_session.sa:3993
def json_writer_write_thread_turns_array(writer: ptr, state_ptr: ptr, thread_id: u64) -> u32:
    json_writer_begin_field_array(...)
    state_turn_list(...)
    state_turn_find(...)
    json_writer_write_turn_object(...)
    return sa_json_writer_end_array(...)

# @origin sa/src/rpc_session.sa:4059
def rpc_goal_status_from_body(body: ptr, body_len: u64) -> u8:
    rpc_extract_param_string(...)
    return sa_bytes_eq(...)

# @origin sa/src/rpc_session.sa:4174
def send_rpc_thread_start_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, cfg_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    rpc_extract_bool_after(...)
    state_thread_create_with_key(...)
    state_thread_set_model_provider(...)
    state_thread_set_ephemeral(...)
    notify_thread_started_with_values(...)
    notify_thread_status_idle(...)
    return send_rpc_thread_start_with_values(...)

# @origin sa/src/rpc_session.sa:4247
def send_rpc_thread_start_with_values(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, forked_from_id: u64, provider_ptr: ptr, provider_len: u64, ephemeral: u8, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64, body: ptr, body_len: u64) -> u32:
    state_thread_find(...)
    json_writer_write_thread_envelope_prefix(...)
    json_writer_write_thread_object_field(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_session.sa:4287
def send_rpc_thread_fork_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_resolve_thread_id(...)
    state_thread_find(...)
    rpc_extract_string_or_default(...)
    rpc_extract_bool_after(...)
    state_thread_create(...)
    state_thread_set_model_provider(...)
    state_thread_set_ephemeral(...)
    copy_bytes_into(...)
    state_thread_copy_git_info(...)
    notify_thread_started_with_values(...)
    notify_thread_status_idle(...)
    send_rpc_thread_start_with_values(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:4398
def send_rpc_thread_list(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr) -> u32:
    state_thread_list_active(...)
    json_writer_begin_field_array(...)
    state_thread_find(...)
    json_writer_write_thread_object(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_session.sa:4481
def send_rpc_thread_loaded_list(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr) -> u32:
    state_thread_list_active(...)
    json_writer_begin_field_array(...)
    json_writer_write_thread_id_string(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_session.sa:4534
def send_rpc_thread_resume(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, body: ptr, body_len: u64) -> u32:
    state_thread_find(...)
    json_writer_write_thread_envelope_prefix(...)
    json_writer_write_thread_object_field(...)
    send_wrapped_writer_with_id(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:4599
def send_rpc_thread_inject_items(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_resolve_thread_id(...)
    state_thread_find(...)
    rpc_extract_param_array_json(...)
    state_turn_create(...)
    state_turn_set_items(...)
    json_buffer_dispose(...)
    notify_injected_items_from_dom(...)
    json_writer_field_thread_id_string(...)
    sa_json_writer_field_i64(...)
    send_wrapped_writer_with_id(...)
    return send_error_with_id(...)

# @origin sa/src/rpc_session.sa:4692
def send_rpc_thread_simple_id(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64, kind: u8) -> u32:
    rpc_extract_string_or_default(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_session.sa:4795
def send_rpc_thread_shell_command(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    prefix_with_owned(...)
    state_emit_warning(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_session.sa:4838
def send_rpc_thread_memory_mode(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    rpc_extract_string_or_default(...)
    return send_wrapped_writer_with_id(...)
