from __future__ import annotations

# @origin sa/src/state.sai:115
def state_init(state: ptr) -> u32:
    ...

# @origin sa/src/state.sai:116
def state_reset_runtime(state: ptr) -> u32:
    ...

# @origin sa/src/state.sai:117
def state_thread_create(state: ptr, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64) -> u64:
    ...

# @origin sa/src/state.sai:118
def state_thread_create_with_key(state: ptr, key_ptr: ptr, key_len: u64, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64) -> u64:
    ...

# @origin sa/src/state.sai:119
def state_thread_find(state: ptr, thread_id: u64) -> ptr:
    ...

# @origin sa/src/state.sai:120
def state_thread_find_by_key(state: ptr, key_ptr: ptr, key_len: u64) -> ptr:
    ...

# @origin sa/src/state.sai:121
def state_thread_list_active(state: ptr, out_ids: ptr, out_count: ptr) -> u32:
    ...

# @origin sa/src/state.sai:122
def state_thread_archive(state: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/state.sai:123
def state_thread_unarchive(state: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/state.sai:124
def state_thread_set_name(state: ptr, thread_id: u64, name_ptr: ptr, name_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:125
def state_thread_clear_name(state: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/state.sai:126
def state_thread_set_preview(state: ptr, thread_id: u64, preview_ptr: ptr, preview_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:127
def state_thread_clear_preview(state: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/state.sai:128
def state_thread_set_git_info(state: ptr, thread_id: u64, git_ptr: ptr, git_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:129
def state_thread_clear_git_info(state: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/state.sai:130
def state_thread_copy_git_info(state: ptr, source_thread_id: u64, target_thread_id: u64) -> u32:
    ...

# @origin sa/src/state.sai:131
def state_thread_set_model_provider(state: ptr, thread_id: u64, provider_ptr: ptr, provider_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:132
def state_thread_set_ephemeral(state: ptr, thread_id: u64, ephemeral: u8) -> u32:
    ...

# @origin sa/src/state.sai:133
def state_thread_increment_elicitation(state: ptr, thread_id: u64) -> u64:
    ...

# @origin sa/src/state.sai:134
def state_thread_decrement_elicitation(state: ptr, thread_id: u64) -> u64:
    ...

# @origin sa/src/state.sai:135
def state_turn_create(state: ptr, thread_id: u64) -> u64:
    ...

# @origin sa/src/state.sai:136
def state_turn_find(state: ptr, thread_id: u64, turn_id: u64) -> ptr:
    ...

# @origin sa/src/state.sai:137
def state_turn_set_mode(state: ptr, thread_id: u64, turn_id: u64, mode: u8) -> u32:
    ...

# @origin sa/src/state.sai:138
def state_turn_set_mode_text(state: ptr, thread_id: u64, turn_id: u64, mode: u8, mode_ptr: ptr, mode_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:139
def state_turn_set_items(state: ptr, thread_id: u64, turn_id: u64, items_ptr: ptr, items_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:140
def state_turn_append_items(state: ptr, thread_id: u64, turn_id: u64, items_ptr: ptr, items_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:141
def state_turn_interrupt(state: ptr, thread_id: u64, turn_id: u64) -> u32:
    ...

# @origin sa/src/state.sai:142
def state_turn_list(state: ptr, thread_id: u64, out_ids: ptr, out_count: ptr) -> u32:
    ...

# @origin sa/src/state.sai:143
def state_turn_rollback(state: ptr, thread_id: u64, remove_count: u64) -> u32:
    ...

# @origin sa/src/state.sai:144
def state_goal_set(state: ptr, thread_id: u64, key_ptr: ptr, key_len: u64, status: u8, status_ptr: ptr, status_len: u64, budget_null: u8, budget: i64, obj_ptr: ptr, obj_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:145
def state_goal_get(state: ptr, thread_id: u64, out_budget: ptr, out_used: ptr) -> i32:
    ...

# @origin sa/src/state.sai:146
def state_goal_get_full(state: ptr, thread_id: u64, key_ptr: ptr, key_len: u64, out_status: ptr, out_key_ptr: ptr, out_key_len: ptr, out_status_ptr: ptr, out_status_len: ptr, out_budget_null: ptr, out_budget: ptr, out_used: ptr, out_created: ptr, out_updated: ptr, out_obj_ptr: ptr, out_obj_len: ptr) -> i32:
    ...

# @origin sa/src/state.sai:147
def state_goal_clear(state: ptr, thread_id: u64, key_ptr: ptr, key_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:148
def state_goal_add_tokens(state: ptr, thread_id: u64, tokens: u64) -> u32:
    ...

# @origin sa/src/state.sai:149
def state_process_put(state: ptr, handle_ptr: ptr, handle_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:150
def state_process_delete(state: ptr, handle_ptr: ptr, handle_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:151
def state_watch_put(state: ptr, watch_ptr: ptr, watch_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:152
def state_watch_delete(state: ptr, watch_ptr: ptr, watch_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:153
def state_next_id(state: ptr) -> u64:
    ...

# @origin sa/src/state.sai:154
def state_notify_push(state: ptr, frame: ptr, frame_len: u64) -> u32:
    ...

# @origin sa/src/state.sai:155
def state_notify_pop(state: ptr, out_frame: ptr, out_cap: u64, out_len: ptr) -> u32:
    ...

# @origin sa/src/state.sai:156
def state_notify_cursor(state: ptr) -> u64:
    ...

# @origin sa/src/state.sai:157
def state_notify_read(state: ptr, cursor: ptr, out_frame: ptr, out_cap: u64, out_len: ptr) -> u32:
    ...
