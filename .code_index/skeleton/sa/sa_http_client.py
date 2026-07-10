from __future__ import annotations

# @origin sa/sa_http_client.sai:2
def sa_http_client_new(use_tls: u8, out_client: ptr) -> u32:
    ...

# @origin sa/sa_http_client.sai:3
def sa_http_client_req_new(client: ptr, method: u8, url: ptr, url_len: u64, out_req: ptr) -> u32:
    ...

# @origin sa/sa_http_client.sai:4
def sa_http_client_req_add_header(req: ptr, key: ptr, key_len: u64, val: ptr, val_len: u64) -> u32:
    ...

# @origin sa/sa_http_client.sai:5
def sa_http_client_req_set_body(req: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/sa_http_client.sai:6
def sa_http_client_req_send(req: ptr, out_resp: ptr) -> u32:
    ...

# @origin sa/sa_http_client.sai:7
def sa_http_client_resp_status(resp: ptr) -> u16:
    ...

# @origin sa/sa_http_client.sai:8
def sa_http_client_resp_get_header(resp: ptr, key: ptr, key_len: u64, out_val: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/sa_http_client.sai:9
def sa_http_client_resp_body_slice(resp: ptr, out_body: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/sa_http_client.sai:10
def sa_http_client_resp_body_reader(resp: ptr, out_reader: ptr) -> u32:
    ...

# @origin sa/sa_http_client.sai:11
def sa_http_client_resp_read_chunk(reader: ptr, buf: ptr, cap: u64, out_len: ptr) -> u32:
    ...

# @origin sa/sa_http_client.sai:12
def sa_http_client_resp_free(resp: ptr) -> u32:
    ...

# @origin sa/sa_http_client.sai:13
def sa_http_client_body_reader_free(reader: ptr) -> u32:
    ...

# @origin sa/sa_http_client.sai:14
def sa_http_client_req_free(req: ptr) -> u32:
    ...

# @origin sa/sa_http_client.sai:15
def sa_http_client_free(client: ptr) -> u32:
    ...
