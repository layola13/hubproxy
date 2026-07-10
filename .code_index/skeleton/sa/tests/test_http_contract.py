from __future__ import annotations

# import ../sa_http_client.sai
# import ../src/config.sa
# import ../src/strings.sa

# @origin sa/tests/test_http_contract.sa:422
def rpc_post_contains(auth_buf: ptr, auth_len: u64, body: ptr, body_len: u64, needle: ptr, needle_len: u64) -> u8:
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

# @origin sa/tests/test_http_contract.sa:509
def rpc_post_status_contains(auth_buf: ptr, auth_len: u64, body: ptr, body_len: u64, needle: ptr, needle_len: u64, expected_status: u32) -> u8:
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

# @origin sa/tests/test_http_contract.sa:597
def main() -> i32:
    cfg_load(...)
    cfg_get_port(...)
    sa_http_client_new(...)
    sa_http_client_req_new(...)
    sa_http_client_req_send(...)
    sa_http_client_resp_status(...)
    sa_http_client_resp_free(...)
    sa_http_client_req_free(...)
    sa_http_client_free(...)
    sa_http_client_req_add_header(...)
    sa_http_client_req_set_body(...)
    sa_http_client_resp_body_reader(...)
    sa_http_client_resp_read_chunk(...)
    sa_bytes_eq(...)
    sa_http_client_body_reader_free(...)
    sa_http_client_resp_get_header(...)
    sa_bytes_find(...)
    sa_bytes_copy(...)
    rpc_post_contains(...)
    return rpc_post_status_contains(...)
