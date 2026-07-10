from __future__ import annotations

# import rpc_emit.sai
# import sa_std/encoding/json.sa
# import sa_std/encoding/json.sai
# import sa_http_server.sai
# import strings.sai
# import json_support.sai
# import rpc_parse.sai

# @origin sa/src/rpc_emit.sa:158
def rpc_emit_begin_field_object(writer: ptr, key: ptr, key_len: u64) -> u32:
    sa_json_writer_object_field(...)
    return sa_json_writer_begin_object(...)

# @origin sa/src/rpc_emit.sa:169
def send_rpc_json(req: ptr, status: u16, json_ptr: ptr, json_len: u64) -> u32:
    sa_http_server_resp_new(...)
    sa_http_server_resp_send(...)
    return sa_http_server_resp_free(...)

# @origin sa/src/rpc_emit.sa:180
def send_json_response(req: ptr, status: u16, json_ptr: ptr, json_len: u64) -> u32:
    sa_http_server_resp_new(...)
    sa_http_server_resp_set_content_type(...)
    sa_http_server_resp_send(...)
    return sa_http_server_resp_free(...)

# @origin sa/src/rpc_emit.sa:193
def send_jsonrpc_envelope_with_id(req: ptr, status: u16, id_ptr: ptr, id_len: u64, payload_ptr: ptr, payload_len: u64, is_error: u8) -> u32:
    sa_json_parse(...)
    sa_json_writer_field_node(...)
    sa_json_free(...)
    json_writer_finish_view(...)
    send_rpc_json(...)
    return json_writer_dispose_finished(...)

# @origin sa/src/rpc_emit.sa:290
def send_wrapped_writer_with_id(req: ptr, id_ptr: ptr, id_len: u64, writer: ptr) -> u32:
    json_writer_finish_view(...)
    send_jsonrpc_envelope_with_id(...)
    return json_writer_dispose_finished(...)

# @origin sa/src/rpc_emit.sa:311
def send_json_writer_response(req: ptr, status: u16, writer: ptr) -> u32:
    json_writer_finish_view(...)
    send_json_response(...)
    return json_writer_dispose_finished(...)

# @origin sa/src/rpc_emit.sa:331
def send_wrapped_raw_json_with_id(req: ptr, id_ptr: ptr, id_len: u64, result_ptr: ptr, result_len: u64) -> u32:
    return send_jsonrpc_envelope_with_id(...)

# @origin sa/src/rpc_emit.sa:342
def send_json_bool_field_response(req: ptr, status: u16, key: ptr, key_len: u64, value: u8) -> u32:
    return send_json_writer_response(...)

# @origin sa/src/rpc_emit.sa:360
def send_json_error_string_response(req: ptr, status: u16, msg_ptr: ptr, msg_len: u64) -> u32:
    return send_json_writer_response(...)

# @origin sa/src/rpc_emit.sa:377
def send_empty_body_error_response(req: ptr) -> u32:
    rpc_emit_begin_field_object(...)
    return send_json_writer_response(...)

# @origin sa/src/rpc_emit.sa:399
def send_error_with_id(req: ptr, status: u16, id_ptr: ptr, id_len: u64, error_ptr: ptr, error_len: u64) -> u32:
    sa_bytes_eq(...)
    sa_json_writer_field_i64(...)
    json_writer_finish_view(...)
    send_jsonrpc_envelope_with_id(...)
    return json_writer_dispose_finished(...)

# @origin sa/src/rpc_emit.sa:502
def json_writer_write_voice(writer: ptr, id_ptr: ptr, id_len: u64, name_ptr: ptr, name_len: u64) -> u32:
    ...

# @origin sa/src/rpc_emit.sa:519
def json_writer_field_string_or_empty(writer: ptr, key: ptr, key_len: u64, value_ptr: ptr, value_len: u64) -> u32:
    return json_writer_field_default_or_null(...)

# @origin sa/src/rpc_emit.sa:530
def json_writer_field_empty_array(writer: ptr, key: ptr, key_len: u64) -> u32:
    sa_json_writer_object_field(...)
    sa_json_writer_begin_array(...)
    return sa_json_writer_end_array(...)

# @origin sa/src/rpc_emit.sa:543
def json_writer_field_empty_object(writer: ptr, key: ptr, key_len: u64) -> u32:
    return sa_json_writer_object_field(...)

# @origin sa/src/rpc_emit.sa:556
def json_writer_begin_field_array(writer: ptr, key: ptr, key_len: u64) -> u32:
    sa_json_writer_object_field(...)
    return sa_json_writer_begin_array(...)

# @origin sa/src/rpc_emit.sa:567
def json_writer_begin_field_object(writer: ptr, key: ptr, key_len: u64) -> u32:
    return sa_json_writer_object_field(...)

# @origin sa/src/rpc_emit.sa:578
def json_writer_field_default_or_null(writer: ptr, field_key: ptr, field_key_len: u64, fallback: ptr, fallback_len: u64, emit_null_if_missing: u8) -> u32:
    ...

# @origin sa/src/rpc_emit.sa:607
def json_writer_field_param_or_default_from_params(writer: ptr, field_key: ptr, field_key_len: u64, params_node: ptr, lookup_key: ptr, lookup_key_len: u64, fallback: ptr, fallback_len: u64, emit_null_if_missing: u8) -> u32:
    rpc_jsonrpc_lookup_key(...)
    sa_json_object_get(...)
    sa_json_writer_field_node(...)
    sa_json_free(...)
    return json_writer_field_default_or_null(...)

# @origin sa/src/rpc_emit.sa:659
def json_writer_write_empty_array_field_result(writer: ptr, field_key: ptr, field_key_len: u64) -> u32:
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_emit.sa:672
def send_rpc_empty_array_field_with_id(req: ptr, id_ptr: ptr, id_len: u64, field_key: ptr, field_key_len: u64) -> u32:
    json_writer_write_empty_array_field_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_emit.sa:686
def json_writer_write_empty_data_page_result(writer: ptr) -> u32:
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_emit.sa:699
def send_rpc_empty_data_page_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_empty_data_page_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_emit.sa:711
def json_writer_write_config_requirements_result(writer: ptr) -> u32:
    return json_writer_begin_field_object(...)

# @origin sa/src/rpc_emit.sa:742
def send_rpc_config_requirements_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_config_requirements_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_emit.sa:754
def json_writer_write_plugin_marketplaces_result(writer: ptr) -> u32:
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_emit.sa:769
def send_rpc_plugin_marketplaces_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_plugin_marketplaces_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_emit.sa:781
def json_writer_write_plugin_install_unavailable_result(writer: ptr) -> u32:
    return json_writer_field_empty_array(...)

# @origin sa/src/rpc_emit.sa:794
def send_rpc_plugin_install_unavailable_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_plugin_install_unavailable_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_emit.sa:806
def json_writer_write_experimental_features_result(writer: ptr) -> u32:
    return json_writer_begin_field_array(...)

# @origin sa/src/rpc_emit.sa:839
def send_rpc_experimental_features_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_experimental_features_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_emit.sa:851
def json_writer_write_account_login_state_result(writer: ptr, canceled: u8, logged_out: u8) -> u32:
    ...

# @origin sa/src/rpc_emit.sa:866
def send_rpc_account_login_state_with_id(req: ptr, id_ptr: ptr, id_len: u64, canceled: u8, logged_out: u8) -> u32:
    json_writer_write_account_login_state_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_emit.sa:880
def json_writer_write_approval_accept_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sa:891
def send_rpc_approval_accept_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_approval_accept_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_emit.sa:903
def json_writer_write_mcp_elicit_accept_result(writer: ptr) -> u32:
    ...

# @origin sa/src/rpc_emit.sa:918
def send_rpc_mcp_elicit_accept_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_mcp_elicit_accept_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_emit.sa:930
def json_writer_write_permissions_default_result(writer: ptr) -> u32:
    return json_writer_field_empty_object(...)

# @origin sa/src/rpc_emit.sa:945
def send_rpc_permissions_default_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_permissions_default_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_emit.sa:957
def json_writer_write_user_input_continue_result(writer: ptr) -> u32:
    json_writer_begin_field_object(...)
    json_writer_begin_field_array(...)
    return sa_json_writer_write_string(...)

# @origin sa/src/rpc_emit.sa:980
def send_rpc_user_input_continue_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_write_user_input_continue_result(...)
    return send_wrapped_writer_with_id(...)

# @origin sa/src/rpc_emit.sa:992
def send_rpc_realtime_voices_with_id(req: ptr, id_ptr: ptr, id_len: u64) -> u32:
    json_writer_begin_field_array(...)
    json_writer_write_voice(...)
    return send_wrapped_writer_with_id(...)
