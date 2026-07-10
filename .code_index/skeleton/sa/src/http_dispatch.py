from __future__ import annotations

# import http_dispatch.sai
# import sa_std/io/print.sai
# import sa_std/encoding/json.sa
# import sa_http_server.sai
# import sa_http_client.sai
# import deno.sal
# import config.sai
# import events.sai
# import json_support.sai
# import proxy.sai
# import request_context.sai
# import rpc_emit.sai
# import strings.sai

# @origin sa/src/http_dispatch.sa:169
def body_is_blank(body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/http_dispatch.sa:243
def route_is_public_models_get(path_ptr: ptr, path_len: u64, is_get: u8) -> u8:
    return sa_bytes_eq(...)

# @origin sa/src/http_dispatch.sa:266
def auth_header_matches_token(hdr_ptr: ptr, hdr_len: u64, token_ptr: ptr, token_len: u64) -> u8:
    return sa_bytes_eq(...)

# @origin sa/src/http_dispatch.sa:321
def check_auth(req: ptr, token_ptr: ptr, token_len: u64) -> u8:
    sa_http_server_req_get_header(...)
    sa_bytes_eq(...)
    auth_header_matches_token(...)
    return sa_print_bytes(...)

# @origin sa/src/http_dispatch.sa:423
def scan_chunk_for_tokens(buf: ptr, len: u64) -> u64:
    sa_bytes_find(...)
    sa_bytes_find_byte(...)
    return sa_bytes_to_u64(...)

# @origin sa/src/http_dispatch.sa:511
def token_preview_value_owned(token_ptr: ptr, token_len: u64, out_len: ptr) -> ptr:
    bytes_to_owned(...)
    return token_preview_owned(...)

# @origin sa/src/http_dispatch.sa:572
def build_upstream_auth_header_owned(api_key_ptr: ptr, api_key_len: u64, out_len: ptr) -> ptr:
    return prefix_with_owned(...)

# @origin sa/src/http_dispatch.sa:580
def build_upstream_url_owned(base_ptr: ptr, base_len: u64, route_kind: u32, out_len: ptr) -> ptr:
    path_join_owned(...)
    return copy_bytes_owned(...)

# @origin sa/src/http_dispatch.sa:631
def forward_optional_upstream_header(src_req: ptr, out_req: ptr, key: ptr, key_len: u64) -> u32:
    sa_http_server_req_get_header(...)
    return sa_http_client_req_add_header(...)

# @origin sa/src/http_dispatch.sa:670
def forward_deno_passthrough_headers(src_req: ptr, out_req: ptr) -> u32:
    return forward_optional_upstream_header(...)

# @origin sa/src/http_dispatch.sa:686
def build_upstream_forward_header_plan_owned(api_key_ptr: ptr, api_key_len: u64, include_content_type: u8, out_len: ptr) -> ptr:
    json_writer_begin_field_object(...)
    build_upstream_auth_header_owned(...)
    json_writer_begin_field_array(...)
    json_writer_finish_view(...)
    json_buffer_to_owned_and_free(...)
    return json_writer_dispose(...)

# @origin sa/src/http_dispatch.sa:770
def json_writer_field_token_preview(writer: ptr, key: ptr, key_len: u64, token_ptr: ptr, token_len: u64) -> u32:
    return token_preview_value_owned(...)

# @origin sa/src/http_dispatch.sa:786
def sanitize_log_stamp_owned(stamp_ptr: ptr, stamp_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/http_dispatch.sa:851
def build_request_log_file_path(log_dir_ptr: ptr, log_dir_len: u64, out_len: ptr) -> ptr:
    plugin_date_now_iso(...)
    sanitize_log_stamp_owned(...)
    plugin_random_uuid(...)
    build_concat5_owned(...)
    path_join_owned(...)
    return plugin_free_buffer(...)

# @origin sa/src/http_dispatch.sa:889
def write_log_body_to_dir_owned(log_dir_ptr: ptr, log_dir_len: u64, body_ptr: ptr, body_len: u64, out_len: ptr) -> ptr:
    sa_deno_plugin_mkdir(...)
    build_request_log_file_path(...)
    return sa_deno_plugin_write_text_file(...)

# @origin sa/src/http_dispatch.sa:905
def build_auth_failure_log_body_owned(path_ptr: ptr, path_len: u64, auth_ptr: ptr, auth_len: u64, xkey_ptr: ptr, xkey_len: u64, token_ptr: ptr, token_len: u64, out_len: ptr) -> ptr:
    json_writer_field_token_preview(...)
    sa_bytes_eq(...)
    json_writer_finish_view(...)
    json_buffer_to_owned_and_free(...)
    return json_writer_dispose(...)

# @origin sa/src/http_dispatch.sa:990
def write_auth_failure_log(req: ptr, cfg_ptr: ptr, path_ptr: ptr, path_len: u64, token_ptr: ptr, token_len: u64) -> u32:
    sa_http_server_req_get_header(...)
    build_auth_failure_log_body_owned(...)
    return write_log_body_to_dir_owned(...)

# @origin sa/src/http_dispatch.sa:1051
def build_api_request_log_body_owned(path_ptr: ptr, path_len: u64, method_ptr: ptr, method_len: u64, auth_ptr: ptr, auth_len: u64, xkey_ptr: ptr, xkey_len: u64, content_type_ptr: ptr, content_type_len: u64, body_ptr_in: ptr, body_len: u64, raw_body_ptr_in: ptr, raw_body_len: u64, out_len: ptr) -> ptr:
    json_writer_begin_field_object(...)
    json_writer_field_token_preview(...)
    sa_bytes_eq(...)
    json_writer_finish_view(...)
    json_buffer_to_owned_and_free(...)
    return json_writer_dispose(...)

# @origin sa/src/http_dispatch.sa:1202
def write_api_request_log(req: ptr, cfg_ptr: ptr, path_ptr: ptr, path_len: u64, method_ptr: ptr, method_len: u64, body_ptr_in: ptr, body_len: u64, raw_body_ptr_in: ptr, raw_body_len: u64) -> u32:
    sa_http_server_req_get_header(...)
    build_api_request_log_body_owned(...)
    return write_log_body_to_dir_owned(...)

# @origin sa/src/http_dispatch.sa:1281
def send_builder_response(req: ptr, buf: ptr) -> u32:
    rpc_builder_data(...)
    rpc_builder_len(...)
    return send_rpc_json(...)

# @origin sa/src/http_dispatch.sa:1292
def handle_models_proxy(req: ptr, cfg_ptr: ptr, path_ptr: ptr, path_len: u64, method_ptr: ptr, method_len: u64) -> u32:
    sa_print_bytes(...)
    write_api_request_log(...)
    send_json_error_string_response(...)
    build_upstream_url_owned(...)
    build_upstream_auth_header_owned(...)
    sa_http_client_new(...)
    sa_http_client_req_new(...)
    sa_http_client_req_add_header(...)
    forward_deno_passthrough_headers(...)
    sa_http_client_req_send(...)
    sa_http_client_req_free(...)
    sa_http_client_free(...)
    sa_http_client_resp_status(...)
    sa_http_client_resp_get_header(...)
    http_response_read_all(...)
    sa_http_server_resp_new(...)
    sa_http_server_resp_set_content_type(...)
    sa_http_server_resp_send(...)
    sa_http_server_resp_free(...)
    return sa_http_client_resp_free(...)

# @origin sa/src/http_dispatch.sa:1444
def handle_chat_proxy(req: ptr, state_ptr: ptr, cfg_ptr: ptr, path_ptr: ptr, path_len: u64, method_ptr: ptr, method_len: u64, is_get: u8, is_post: u8) -> u32:
    sa_print_bytes(...)
    sa_http_server_req_get_body(...)
    body_is_blank(...)
    send_empty_body_error_response(...)
    sa_http_server_req_free(...)
    build_chat_proxy_body(...)
    write_api_request_log(...)
    send_json_error_string_response(...)
    build_upstream_url_owned(...)
    build_upstream_auth_header_owned(...)
    sa_http_client_new(...)
    sa_http_client_req_new(...)
    sa_http_client_req_add_header(...)
    forward_deno_passthrough_headers(...)
    sa_http_client_req_set_body(...)
    sa_http_client_req_send(...)
    sa_http_client_req_free(...)
    sa_http_client_free(...)
    sa_http_client_resp_status(...)
    sa_http_client_resp_get_header(...)
    sa_bytes_find(...)
    http_response_read_all(...)
    sa_http_server_resp_new(...)
    sa_http_server_resp_set_content_type(...)
    sa_http_server_resp_send(...)
    sa_http_server_resp_free(...)
    sa_http_client_resp_free(...)
    sa_http_server_resp_stream_new(...)
    sa_http_client_resp_body_reader(...)
    sa_http_client_resp_read_chunk(...)
    sa_http_server_resp_stream_write(...)
    sa_http_server_resp_stream_flush(...)
    scan_chunk_for_tokens(...)
    sa_http_server_resp_stream_end(...)
    sa_http_client_body_reader_free(...)
    return sa_http_server_resp_stream_free(...)

# @origin sa/src/http_dispatch.sa:1813
def handle_responses_proxy(req: ptr, state_ptr: ptr, cfg_ptr: ptr, path_ptr: ptr, path_len: u64, method_ptr: ptr, method_len: u64, is_get: u8, is_post: u8) -> u32:
    sa_print_bytes(...)
    sa_http_server_req_get_body(...)
    send_json_error_string_response(...)
    sa_http_server_req_free(...)
    body_is_blank(...)
    send_empty_body_error_response(...)
    body_is_gemini_responses_request(...)
    build_responses_proxy_body(...)
    sa_deno_plugin_responses_request_normalize(...)
    plugin_buffer_to_owned_and_free(...)
    copy_bytes_owned(...)
    build_upstream_auth_header_owned(...)
    build_chat_fallback_body(...)
    build_upstream_url_owned(...)
    write_api_request_log(...)
    sa_http_client_new(...)
    sa_http_client_req_new(...)
    sa_http_client_req_add_header(...)
    forward_deno_passthrough_headers(...)
    sa_http_client_req_set_body(...)
    sa_http_client_req_send(...)
    sa_http_client_req_free(...)
    sa_http_client_free(...)
    sa_http_client_resp_status(...)
    body_is_unsafe_gemini_chat_fallback(...)
    sa_http_client_resp_get_header(...)
    http_response_read_all(...)
    sa_http_server_resp_new(...)
    sa_http_server_resp_set_content_type(...)
    sa_http_server_resp_send(...)
    sa_http_server_resp_free(...)
    sa_http_client_resp_free(...)
    sa_bytes_find(...)
    build_response_request_context_body(...)
    chat_fallback_sse_to_responses_body(...)
    normalize_chat_fallback_json_body(...)
    normalize_responses_client_json_body(...)
    sa_http_server_resp_stream_new(...)
    normalize_responses_client_sse_body(...)
    sa_http_server_resp_stream_write(...)
    sa_http_server_resp_stream_flush(...)
    sa_http_server_resp_stream_end(...)
    return sa_http_server_resp_stream_free(...)

# @origin sa/src/http_dispatch.sa:2654
def accept_and_handle_http_request(server: ptr, req_slot: ptr, state_ptr: ptr, cfg_ptr: ptr) -> u32:
    sa_http_server_accept(...)
    return handle_http_request(...)

# @origin sa/src/http_dispatch.sa:2680
def handle_http_request(req: ptr, state_ptr: ptr, cfg_ptr: ptr) -> u32:
    sa_http_server_req_get_method(...)
    sa_http_server_req_get_path(...)
    sa_bytes_eq(...)
    route_is_public_models_get(...)
    check_auth(...)
    sa_http_server_req_get_body(...)
    write_api_request_log(...)
    write_auth_failure_log(...)
    send_json_error_string_response(...)
    sa_http_server_req_free(...)
    sa_print_bytes(...)
    send_json_bool_field_response(...)
    handle_chat_proxy(...)
    handle_responses_proxy(...)
    handle_models_proxy(...)
    rpc_canonicalize_body(...)
    handle_rpc_request(...)
    json_buffer_dispose(...)
    return spawn_event_stream(...)
