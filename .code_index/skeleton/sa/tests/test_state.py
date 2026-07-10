from __future__ import annotations

# import ../src/state.sa
# import sa_std/io/print.sai

# @origin sa/tests/test_state.sa:40
def main() -> i32:
    state_init(...)
    sa_print_bytes(...)
    state_thread_create(...)
    state_thread_find(...)
    state_thread_archive(...)
    state_thread_unarchive(...)
    state_turn_create(...)
    state_turn_rollback(...)
    state_turn_find(...)
    state_goal_set(...)
    state_thread_set_name(...)
    state_thread_set_preview(...)
    state_thread_set_model_provider(...)
    state_thread_set_ephemeral(...)
    state_thread_increment_elicitation(...)
    state_thread_decrement_elicitation(...)
    state_notify_cursor(...)
    state_notify_push(...)
    state_notify_read(...)
    state_copy_bytes(...)
    state_process_put(...)
    state_watch_put(...)
    state_reset_runtime(...)
    state_goal_get(...)
    state_thread_list_active(...)
    state_process_delete(...)
    return state_watch_delete(...)
