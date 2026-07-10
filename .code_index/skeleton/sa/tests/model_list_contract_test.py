from __future__ import annotations

# import ../sa_http_client.sai
# import ../src/config.sa
# import ../src/strings.sa
# import sa_std/fmt.sai
# import sa_std/encoding/json.sai
# import sa_std/encoding/json.sal

# @origin sa/tests/model_list_contract_test.sa:152
def assert_contract(ok: u8, code: i32) -> Any:
    ...

# @origin sa/tests/model_list_contract_test.sa:166
def build_rpc_context(out_cfg: ptr, out_url_buf: ptr, out_url_len: ptr, out_auth_buf: ptr, out_auth_len: ptr) -> u32:
    cfg_load(...)
    assert_contract(...)
    sa_bytes_copy(...)
    cfg_get_port(...)
    return sa_fmt_u64_into(...)

# @origin sa/tests/model_list_contract_test.sa:233
def rpc_post_contains(url_buf: ptr, url_len: u64, auth_buf: ptr, auth_len: u64, body: ptr, body_len: u64, needle: ptr, needle_len: u64) -> u8:
    sa_http_client_new(...)
    sa_http_client_req_new(...)
    sa_http_client_req_add_header(...)
    sa_http_client_req_set_body(...)
    sa_http_client_req_send(...)
    sa_http_client_resp_status(...)
    sa_http_client_resp_body_reader(...)
    sa_http_client_resp_read_chunk(...)
    sa_bytes_find(...)
    sa_http_client_body_reader_free(...)
    sa_http_client_resp_free(...)
    sa_http_client_req_free(...)
    return sa_http_client_free(...)

# @origin sa/tests/model_list_contract_test.sa:322
def rpc_post_status_contains(url_buf: ptr, url_len: u64, auth_buf: ptr, auth_len: u64, body: ptr, body_len: u64, needle: ptr, needle_len: u64, expected_status: u32) -> u8:
    sa_http_client_new(...)
    sa_http_client_req_new(...)
    sa_http_client_req_add_header(...)
    sa_http_client_req_set_body(...)
    sa_http_client_req_send(...)
    sa_http_client_resp_status(...)
    sa_http_client_resp_body_reader(...)
    sa_http_client_resp_read_chunk(...)
    sa_bytes_find(...)
    sa_http_client_body_reader_free(...)
    sa_http_client_resp_free(...)
    sa_http_client_req_free(...)
    sa_http_client_free(...)
    build_rpc_context(...)
    assert_contract(...)
    sa_json_parse(...)
    sa_json_kind(...)
    sa_json_object_get_string(...)
    sa_bytes_eq(...)
    sa_json_object_get(...)
    sa_json_value_count(...)
    sa_json_array_get(...)
    sa_json_free(...)
    rpc_post_contains(...)
    return rpc_post_status_contains(...)
