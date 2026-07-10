from __future__ import annotations

# @origin sa/src/rpc_session.sai:3
def json_writer_field_thread_id_string(writer: ptr, key: ptr, key_len: u64, state_ptr: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:4
def json_writer_field_thread_id_goal_key(writer: ptr, key: ptr, key_len: u64, state_ptr: ptr, thread_id: u64, goal_key_ptr: ptr, goal_key_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:5
def json_writer_field_goal_status(writer: ptr, status: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:6
def json_writer_field_goal_status_text(writer: ptr, status: u8, status_ptr: ptr, status_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:7
def json_writer_field_goal_budget(writer: ptr, budget_null: u8, budget: i64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:8
def json_writer_field_u64_string(writer: ptr, key: ptr, key_len: u64, value: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:9
def json_writer_write_u64_string(writer: ptr, value: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:10
def json_writer_field_nullable_string(writer: ptr, key: ptr, key_len: u64, value_ptr: ptr, value_len: u64, is_set: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:11
def json_writer_field_nullable_thread_id_string(writer: ptr, key: ptr, key_len: u64, state_ptr: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:12
def json_writer_write_thread_id_string(writer: ptr, state_ptr: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:13
def json_writer_field_mode_value(writer: ptr, key: ptr, key_len: u64, mode: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:14
def json_writer_field_mode_text_or_value(writer: ptr, key: ptr, key_len: u64, mode: u8, mode_ptr: ptr, mode_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:15
def json_writer_field_thread_git_info(writer: ptr, state_ptr: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:16
def json_writer_field_items_or_empty(writer: ptr, key: ptr, key_len: u64, items_ptr: ptr, items_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:17
def json_writer_write_thread_object(writer: ptr, state_ptr: ptr, tid: u64, forked_from_id: u64, preview_ptr: ptr, preview_len: u64, provider_ptr: ptr, provider_len: u64, ephemeral: u8, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64, name_ptr: ptr, name_len: u64, name_set: u8, include_empty_turns: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:18
def json_writer_write_thread_object_field(writer: ptr, key: ptr, key_len: u64, state_ptr: ptr, tid: u64, forked_from_id: u64, preview_ptr: ptr, preview_len: u64, provider_ptr: ptr, provider_len: u64, ephemeral: u8, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64, name_ptr: ptr, name_len: u64, name_set: u8, include_empty_turns: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:19
def json_writer_write_turn_status_string(writer: ptr, status: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:20
def json_writer_write_turn_status_field(writer: ptr, key: ptr, key_len: u64, status: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:21
def json_writer_write_turn_completion_fields(writer: ptr, status: u8, completed_ts: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:22
def json_writer_write_turn_object(writer: ptr, turn_id: u64, status: u8, mode: u8, created_ts: u64, updated_ts: u64, completed_ts: u64, mode_ptr: ptr, mode_len: u64, items_ptr: ptr, items_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:23
def json_writer_write_turn_object_field(writer: ptr, key: ptr, key_len: u64, turn_id: u64, status: u8, mode: u8, created_ts: u64, updated_ts: u64, completed_ts: u64, mode_ptr: ptr, mode_len: u64, items_ptr: ptr, items_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:24
def json_writer_write_turn_object_mode(writer: ptr, turn_id: u64, mode: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:25
def notify_thread_started_with_values(state_ptr: ptr, thread_id: u64, forked_from_id: u64, provider_ptr: ptr, provider_len: u64, ephemeral: u8, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:26
def notify_thread_status_idle(state_ptr: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:27
def notify_thread_id_only(state_ptr: ptr, event_ptr: ptr, event_len: u64, thread_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:28
def notify_thread_id_string(state_ptr: ptr, event_ptr: ptr, event_len: u64, thread_ptr: ptr, thread_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:29
def notify_thread_name_updated(state_ptr: ptr, thread_id: u64, name_ptr: ptr, name_len: u64, is_set: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:30
def notify_goal_updated(state_ptr: ptr, thread_id: u64, goal_key_ptr: ptr, goal_key_len: u64, status: u8, status_ptr: ptr, status_len: u64, budget_null: u8, budget: i64, used: u64, created: u64, updated: u64, obj_ptr: ptr, obj_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:31
def notify_turn_started(state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:32
def notify_turn_completed(state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:33
def notify_turn_diff(state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:34
def notify_turn_plan(state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:35
def send_rpc_goal_null_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:36
def send_rpc_goal_obj(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, goal_key_ptr: ptr, goal_key_len: u64, status: u8, status_ptr: ptr, status_len: u64, budget_null: u8, budget: i64, used: u64, created: u64, updated: u64, obj_ptr: ptr, obj_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:37
def send_rpc_goal_clear(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, goal_key_ptr: ptr, goal_key_len: u64, cleared: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:38
def send_rpc_goal_set_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:39
def send_rpc_goal_get_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:40
def send_rpc_goal_clear_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:41
def send_rpc_thread_archive(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:42
def send_rpc_thread_name_set(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:43
def send_rpc_thread_read(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, include_turns: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:44
def send_rpc_thread_unarchive(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:45
def send_rpc_thread_metadata_update(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:46
def apply_thread_git_info_from_body(state_ptr: ptr, thread_id: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:47
def send_rpc_turns_list(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:48
def send_rpc_turn_items_list(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:49
def send_rpc_thread_rollback(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, remove_count: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:50
def send_rpc_turn_start(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, turn_id: u64, mode: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:51
def send_rpc_turn_start_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:52
def send_rpc_turn_interrupt(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, turn_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:53
def notify_turn_input_items_from_dom(state_ptr: ptr, body: ptr, body_len: u64, thread_id: u64, turn_id: u64) -> u64:
    ...

# @origin sa/src/rpc_session.sai:54
def notify_injected_items_from_dom(state_ptr: ptr, body: ptr, body_len: u64, thread_id: u64, turn_id: u64) -> u64:
    ...

# @origin sa/src/rpc_session.sai:55
def notify_item_detail_events(state_ptr: ptr, thread_id: u64, turn_id: u64, item_node: ptr) -> u32:
    ...

# @origin sa/src/rpc_session.sai:56
def send_rpc_turn_steer(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, turn_id: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:57
def send_rpc_memory_reset(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:58
def json_writer_write_thread_envelope_prefix(writer: ptr, body: ptr, body_len: u64, model_ptr: ptr, model_len: u64, provider_ptr: ptr, provider_len: u64, dir_ptr: ptr, dir_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:59
def json_writer_write_thread_turns_array(writer: ptr, state_ptr: ptr, thread_id: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:60
def rpc_goal_status_from_body(body: ptr, body_len: u64) -> u8:
    ...

# @origin sa/src/rpc_session.sai:61
def send_rpc_thread_start_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, cfg_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:62
def send_rpc_thread_start_with_values(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, forked_from_id: u64, provider_ptr: ptr, provider_len: u64, ephemeral: u8, model_ptr: ptr, model_len: u64, dir_ptr: ptr, dir_len: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:63
def send_rpc_thread_fork_from_body(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:64
def send_rpc_thread_list(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_session.sai:65
def send_rpc_thread_loaded_list(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr) -> u32:
    ...

# @origin sa/src/rpc_session.sai:66
def send_rpc_thread_resume(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, thread_id: u64, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:67
def send_rpc_thread_inject_items(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:68
def send_rpc_thread_simple_id(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64, kind: u8) -> u32:
    ...

# @origin sa/src/rpc_session.sai:69
def send_rpc_thread_shell_command(req: ptr, id_ptr: ptr, id_len: u64, state_ptr: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/rpc_session.sai:70
def send_rpc_thread_memory_mode(req: ptr, id_ptr: ptr, id_len: u64, body: ptr, body_len: u64) -> u32:
    ...
