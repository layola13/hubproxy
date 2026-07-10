from __future__ import annotations

# @origin sa/src/http_dispatch.sai:3
def body_is_blank(body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/src/http_dispatch.sai:4
def route_is_public_models_get(path_ptr: ptr, path_len: u64, is_get: u8) -> u8:
    ...

# @origin sa/src/http_dispatch.sai:5
def auth_header_matches_token(hdr_ptr: ptr, hdr_len: u64, token_ptr: ptr, token_len: u64) -> u8:
    ...

# @origin sa/src/http_dispatch.sai:6
def check_auth(req: ptr, token_ptr: ptr, token_len: u64) -> u8:
    ...

# @origin sa/src/http_dispatch.sai:7
def scan_chunk_for_tokens(buf: ptr, len: u64) -> u64:
    ...

# @origin sa/src/http_dispatch.sai:8
def token_preview_value_owned(token_ptr: ptr, token_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/http_dispatch.sai:9
def build_upstream_auth_header_owned(api_key_ptr: ptr, api_key_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/http_dispatch.sai:10
def build_upstream_url_owned(base_ptr: ptr, base_len: u64, route_kind: u32, out_len: ptr) -> ptr:
    ...

# @origin sa/src/http_dispatch.sai:11
def build_upstream_forward_header_plan_owned(api_key_ptr: ptr, api_key_len: u64, include_content_type: u8, out_len: ptr) -> ptr:
    ...

# @origin sa/src/http_dispatch.sai:12
def json_writer_field_token_preview(writer: ptr, key: ptr, key_len: u64, token_ptr: ptr, token_len: u64) -> u32:
    ...

# @origin sa/src/http_dispatch.sai:13
def build_auth_failure_log_body_owned(path_ptr: ptr, path_len: u64, auth_ptr: ptr, auth_len: u64, xkey_ptr: ptr, xkey_len: u64, token_ptr: ptr, token_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/http_dispatch.sai:14
def write_log_body_to_dir_owned(log_dir_ptr: ptr, log_dir_len: u64, body_ptr: ptr, body_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/http_dispatch.sai:15
def build_api_request_log_body_owned(path_ptr: ptr, path_len: u64, method_ptr: ptr, method_len: u64, auth_ptr: ptr, auth_len: u64, xkey_ptr: ptr, xkey_len: u64, content_type_ptr: ptr, content_type_len: u64, body_ptr_in: ptr, body_len: u64, raw_body_ptr_in: ptr, raw_body_len: u64, out_len: ptr) -> ptr:
    ...

# @origin sa/src/http_dispatch.sai:16
def write_auth_failure_log(req: ptr, cfg_ptr: ptr, path_ptr: ptr, path_len: u64, token_ptr: ptr, token_len: u64) -> u32:
    ...

# @origin sa/src/http_dispatch.sai:17
def write_api_request_log(req: ptr, cfg_ptr: ptr, path_ptr: ptr, path_len: u64, method_ptr: ptr, method_len: u64, body_ptr_in: ptr, body_len: u64, raw_body_ptr_in: ptr, raw_body_len: u64) -> u32:
    ...

# @origin sa/src/http_dispatch.sai:18
def send_builder_response(req: ptr, buf: ptr) -> u32:
    ...

# @origin sa/src/http_dispatch.sai:19
def handle_models_proxy(req: ptr, cfg_ptr: ptr, path_ptr: ptr, path_len: u64, method_ptr: ptr, method_len: u64) -> u32:
    ...

# @origin sa/src/http_dispatch.sai:20
def handle_chat_proxy(req: ptr, state_ptr: ptr, cfg_ptr: ptr, path_ptr: ptr, path_len: u64, method_ptr: ptr, method_len: u64, is_get: u8, is_post: u8) -> u32:
    ...

# @origin sa/src/http_dispatch.sai:21
def handle_responses_proxy(req: ptr, state_ptr: ptr, cfg_ptr: ptr, path_ptr: ptr, path_len: u64, method_ptr: ptr, method_len: u64, is_get: u8, is_post: u8) -> u32:
    ...

# @origin sa/src/http_dispatch.sai:22
def handle_rpc_request(req: ptr, rpc_body_ptr: ptr, rpc_body_len: u64, state_ptr: ptr, cfg_ptr: ptr) -> u32:
    ...
