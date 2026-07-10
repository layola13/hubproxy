from __future__ import annotations

# @origin sa/src/rpc_emit.sai:3
def send_rpc_json(req: ptr, status: u16, json_ptr: ptr, json_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:4
def send_json_response(req: ptr, status: u16, json_ptr: ptr, json_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:5
def send_jsonrpc_envelope_with_id(req: ptr, status: u16, id_ptr: ptr, id_len: u64, payload_ptr: ptr, payload_len: u64, is_error: u8) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:6
def send_wrapped_writer_with_id(req: ptr, id_ptr: ptr, id_len: u64, writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:7
def send_json_writer_response(req: ptr, status: u16, writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:8
def send_wrapped_raw_json_with_id(req: ptr, id_ptr: ptr, id_len: u64, result_ptr: ptr, result_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:9
def send_json_bool_field_response(req: ptr, status: u16, key: ptr, key_len: u64, value: u8) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:10
def send_json_error_string_response(req: ptr, status: u16, msg_ptr: ptr, msg_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:11
def send_empty_body_error_response(req: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:12
def send_error_with_id(req: ptr, status: u16, id_ptr: ptr, id_len: u64, error_ptr: ptr, error_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:13
def json_writer_write_voice(writer: ptr, id_ptr: ptr, id_len: u64, name_ptr: ptr, name_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:14
def json_writer_field_string_or_empty(writer: ptr, key: ptr, key_len: u64, value_ptr: ptr, value_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:15
def json_writer_field_empty_array(writer: ptr, key: ptr, key_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:16
def json_writer_field_empty_object(writer: ptr, key: ptr, key_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:17
def json_writer_begin_field_array(writer: ptr, key: ptr, key_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:18
def json_writer_begin_field_object(writer: ptr, key: ptr, key_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:19
def json_writer_field_default_or_null(writer: ptr, field_key: ptr, field_key_len: u64, fallback: ptr, fallback_len: u64, emit_null_if_missing: u8) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:20
def json_writer_field_param_or_default_from_params(writer: ptr, field_key: ptr, field_key_len: u64, params_node: ptr, lookup_key: ptr, lookup_key_len: u64, fallback: ptr, fallback_len: u64, emit_null_if_missing: u8) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:21
def json_writer_write_empty_array_field_result(writer: ptr, field_key: ptr, field_key_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:22
def send_rpc_empty_array_field_with_id(req: ptr, id_ptr: ptr, id_len: u64, field_key: ptr, field_key_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:23
def json_writer_write_empty_data_page_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:24
def send_rpc_empty_data_page_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:25
def json_writer_write_config_requirements_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:26
def send_rpc_config_requirements_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:27
def json_writer_write_plugin_marketplaces_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:28
def send_rpc_plugin_marketplaces_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:29
def json_writer_write_plugin_install_unavailable_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:30
def send_rpc_plugin_install_unavailable_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:31
def json_writer_write_experimental_features_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:32
def send_rpc_experimental_features_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:33
def json_writer_write_account_login_state_result(writer: ptr, canceled: u8, logged_out: u8) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:34
def send_rpc_account_login_state_with_id(req: ptr, id_ptr: ptr, id_len: u64, canceled: u8, logged_out: u8) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:35
def json_writer_write_approval_accept_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:36
def send_rpc_approval_accept_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:37
def json_writer_write_mcp_elicit_accept_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:38
def send_rpc_mcp_elicit_accept_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:39
def json_writer_write_permissions_default_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:40
def send_rpc_permissions_default_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:41
def json_writer_write_user_input_continue_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:42
def send_rpc_user_input_continue_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sai:43
def send_rpc_realtime_voices_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    ...
