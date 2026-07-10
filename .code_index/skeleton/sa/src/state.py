from __future__ import annotations

# import state.sai
# import sa_std/io/print.sai
# import sa_std/encoding/json.sa
# import sa_std/encoding/json.sai
# import sa_std/encoding/json.sal
# import sa_std/time.sai
# import sa_std/fmt.sai
# import sa_std/string.sai
# import strings.sa

# @origin sa/src/state.sa:31
def state_clamp_len(len: u64, cap: u64) -> u64:
    ...

# @origin sa/src/state.sa:46
def json_writer_begin_field_object(writer: ptr, key: ptr, key_len: u64) -> u32:
    sa_json_writer_object_field(...)
    return sa_json_writer_begin_object(...)

# @origin sa/src/state.sa:57
def json_writer_finish_view(writer: ptr, out_buffer: ptr, out_ptr: ptr, out_len: ptr) -> u32:
    sa_json_writer_finish(...)
    sa_json_buffer_data(...)
    return sa_json_buffer_len(...)

# @origin sa/src/state.sa:75
def json_writer_dispose_finished(buffer: ptr, writer: ptr) -> u32:
    sa_json_buffer_free(...)
    return sa_json_writer_free(...)

# @origin sa/src/state.sa:83
def copy_bytes_into(dst_ptr: ptr, src_ptr: ptr, src_len: u64) -> u64:
    return sa_bytes_copy(...)

# @origin sa/src/state.sa:91
def copy_bytes_owned(src_ptr: ptr, src_len: u64, out_len: ptr) -> ptr:
    return bytes_to_owned(...)

# @origin sa/src/state.sa:99
def sse_warning_frame_build(json_ptr: ptr, json_len: u64, out_len: ptr) -> ptr:
    return build_concat3_owned(...)

# @origin sa/src/state.sa:106
def state_init(state: ptr) -> u32:
    return sa_print_bytes(...)

# @origin sa/src/state.sa:135
def state_reset_runtime(state: ptr) -> u32:
    ...

# @origin sa/src/state.sa:167
def state_next_id(state: ptr) -> u64:
    ...

# @origin sa/src/state.sa:176
def state_thread_create(state: ptr, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64) -> u64:
    return state_thread_create_with_key(...)

# @origin sa/src/state.sa:186
def state_thread_create_with_key(state: ptr, key_ptr: ptr, key_len: u64, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64) -> u64:
    state_next_id(...)
    sa_time_unix_s(...)
    copy_bytes_owned(...)
    state_clamp_len(...)
    return copy_bytes_into(...)

# @origin sa/src/state.sa:272
def state_thread_find_by_key(state: ptr, key_ptr: ptr, key_len: u64) -> ptr:
    return sa_bytes_eq(...)

# @origin sa/src/state.sa:351
def state_thread_find(state: ptr, thread_id: u64) -> ptr:
    ...

# @origin sa/src/state.sa:406
def state_thread_list_active(state: ptr, out_ids: ptr, out_count: ptr) -> u32:
    ...

# @origin sa/src/state.sa:472
def state_thread_archive(state: ptr, thread_id: u64) -> u32:
    return state_thread_find(...)

# @origin sa/src/state.sa:493
def state_thread_unarchive(state: ptr, thread_id: u64) -> u32:
    return state_thread_find(...)

# @origin sa/src/state.sa:514
def state_thread_set_name(state: ptr, thread_id: u64, name_ptr: ptr, name_len: u64) -> u32:
    state_thread_find(...)
    state_clamp_len(...)
    return copy_bytes_into(...)

# @origin sa/src/state.sa:546
def state_thread_clear_name(state: ptr, thread_id: u64) -> u32:
    return state_thread_find(...)

# @origin sa/src/state.sa:568
def state_thread_set_preview(state: ptr, thread_id: u64, preview_ptr: ptr, preview_len: u64) -> u32:
    state_thread_find(...)
    state_clamp_len(...)
    return copy_bytes_into(...)

# @origin sa/src/state.sa:599
def state_thread_clear_preview(state: ptr, thread_id: u64) -> u32:
    return state_thread_find(...)

# @origin sa/src/state.sa:620
def state_thread_set_git_info(state: ptr, thread_id: u64, git_ptr: ptr, git_len: u64) -> u32:
    state_thread_find(...)
    return copy_bytes_owned(...)

# @origin sa/src/state.sa:662
def state_thread_clear_git_info(state: ptr, thread_id: u64) -> u32:
    return state_thread_find(...)

# @origin sa/src/state.sa:695
def state_thread_copy_git_info(state: ptr, source_thread_id: u64, target_thread_id: u64) -> u32:
    state_thread_find(...)
    state_thread_set_git_info(...)
    return state_thread_clear_git_info(...)

# @origin sa/src/state.sa:758
def state_thread_set_model_provider(state: ptr, thread_id: u64, provider_ptr: ptr, provider_len: u64) -> u32:
    state_thread_find(...)
    return copy_bytes_owned(...)

# @origin sa/src/state.sa:789
def state_thread_set_ephemeral(state: ptr, thread_id: u64, ephemeral: u8) -> u32:
    return state_thread_find(...)

# @origin sa/src/state.sa:812
def state_thread_increment_elicitation(state: ptr, thread_id: u64) -> u64:
    return state_thread_find(...)

# @origin sa/src/state.sa:836
def state_thread_decrement_elicitation(state: ptr, thread_id: u64) -> u64:
    return state_thread_find(...)

# @origin sa/src/state.sa:873
def state_turn_create(state: ptr, thread_id: u64) -> u64:
    state_thread_find(...)
    state_next_id(...)
    return sa_time_unix_s(...)

# @origin sa/src/state.sa:931
def state_turn_find(state: ptr, thread_id: u64, turn_id: u64) -> ptr:
    ...

# @origin sa/src/state.sa:999
def state_turn_set_mode(state: ptr, thread_id: u64, turn_id: u64, mode: u8) -> u32:
    return state_turn_find(...)

# @origin sa/src/state.sa:1025
def state_turn_set_mode_text(state: ptr, thread_id: u64, turn_id: u64, mode: u8, mode_ptr: ptr, mode_len: u64) -> u32:
    state_turn_find(...)
    state_clamp_len(...)
    return copy_bytes_into(...)

# @origin sa/src/state.sa:1079
def state_turn_set_items(state: ptr, thread_id: u64, turn_id: u64, items_ptr: ptr, items_len: u64) -> u32:
    state_turn_find(...)
    state_clamp_len(...)
    return copy_bytes_into(...)

# @origin sa/src/state.sa:1112
def state_turn_append_items(state: ptr, thread_id: u64, turn_id: u64, items_ptr: ptr, items_len: u64) -> u32:
    state_turn_find(...)
    sa_time_unix_s(...)
    state_turn_set_items(...)
    sa_json_parse(...)
    sa_json_value_count(...)
    sa_json_array_get(...)
    sa_json_writer_write_node(...)
    sa_json_free(...)
    json_writer_finish_view(...)
    copy_bytes_into(...)
    return json_writer_dispose_finished(...)

# @origin sa/src/state.sa:1424
def state_turn_interrupt(state: ptr, thread_id: u64, turn_id: u64) -> u32:
    state_turn_find(...)
    return sa_time_unix_s(...)

# @origin sa/src/state.sa:1453
def state_turn_list(state: ptr, thread_id: u64, out_ids: ptr, out_count: ptr) -> u32:
    ...

# @origin sa/src/state.sa:1526
def state_turn_rollback(state: ptr, thread_id: u64, remove_count: u64) -> u32:
    return state_thread_find(...)

# @origin sa/src/state.sa:1685
def state_goal_set(state: ptr, thread_id: u64, key_ptr: ptr, key_len: u64, status: u8, status_ptr: ptr, status_len: u64, budget_null: u8, budget: i64, obj_ptr: ptr, obj_len: u64) -> u32:
    sa_bytes_eq(...)
    sa_time_unix_s(...)
    state_clamp_len(...)
    return copy_bytes_into(...)

# @origin sa/src/state.sa:1892
def state_goal_get_full(state: ptr, thread_id: u64, key_ptr: ptr, key_len: u64, out_status: ptr, out_key_ptr: ptr, out_key_len: ptr, out_status_ptr: ptr, out_status_len: ptr, out_budget_null: ptr, out_budget: ptr, out_used: ptr, out_created: ptr, out_updated: ptr, out_obj_ptr: ptr, out_obj_len: ptr) -> i32:
    return sa_bytes_eq(...)

# @origin sa/src/state.sa:2050
def state_goal_get(state: ptr, thread_id: u64, out_budget: ptr, out_used: ptr) -> i32:
    ...

# @origin sa/src/state.sa:2119
def state_goal_clear(state: ptr, thread_id: u64, key_ptr: ptr, key_len: u64) -> u32:
    return sa_bytes_eq(...)

# @origin sa/src/state.sa:2226
def state_goal_add_tokens(state: ptr, thread_id: u64, tokens: u64) -> u32:
    ...

# @origin sa/src/state.sa:2286
def state_process_put(state: ptr, handle_ptr: ptr, handle_len: u64) -> u32:
    sa_bytes_eq(...)
    state_clamp_len(...)
    return copy_bytes_into(...)

# @origin sa/src/state.sa:2412
def state_process_delete(state: ptr, handle_ptr: ptr, handle_len: u64) -> u32:
    return sa_bytes_eq(...)

# @origin sa/src/state.sa:2486
def state_watch_put(state: ptr, watch_ptr: ptr, watch_len: u64) -> u32:
    sa_bytes_eq(...)
    state_clamp_len(...)
    return copy_bytes_into(...)

# @origin sa/src/state.sa:2612
def state_watch_delete(state: ptr, watch_ptr: ptr, watch_len: u64) -> u32:
    return sa_bytes_eq(...)

# @origin sa/src/state.sa:2686
def state_copy_bytes(dst: ptr, src: ptr, len: u64) -> u32:
    ...

# @origin sa/src/state.sa:2720
def state_notify_push(state: ptr, frame: ptr, frame_len: u64) -> u32:
    return state_copy_bytes(...)

# @origin sa/src/state.sa:2774
def state_emit_warning(state: ptr, message_ptr: ptr, message_len: u64, thread_ptr: ptr, thread_len: u64) -> u32:
    json_writer_begin_field_object(...)
    json_writer_finish_view(...)
    sse_warning_frame_build(...)
    state_notify_push(...)
    return json_writer_dispose_finished(...)

# @origin sa/src/state.sa:2831
def state_notify_pop(state: ptr, out_frame: ptr, out_cap: u64, out_len: ptr) -> u32:
    return state_copy_bytes(...)

# @origin sa/src/state.sa:2926
def state_notify_cursor(state: ptr) -> u64:
    ...

# @origin sa/src/state.sa:2932
def state_notify_read(state: ptr, cursor: ptr, out_frame: ptr, out_cap: u64, out_len: ptr) -> u32:
    return state_copy_bytes(...)
