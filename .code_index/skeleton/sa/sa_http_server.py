from __future__ import annotations

# @origin sa/sa_http_server.sai:2
def sa_http_server_new(out_server: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:3
def sa_http_server_start(server: ptr, host: ptr, host_len: u64, port: u16) -> u32:
    ...

# @origin sa/sa_http_server.sai:4
def sa_http_server_accept(server: ptr, out_req: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:5
def sa_http_server_req_get_method(req: ptr, out_method: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:6
def sa_http_server_req_get_path(req: ptr, out_path: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:7
def sa_http_server_req_get_header(req: ptr, key: ptr, key_len: u64, out_val: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:8
def sa_http_server_req_get_body(req: ptr, out_body: ptr, out_len: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:9
def sa_http_server_resp_new(req: ptr, status: u16, out_resp: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:10
def sa_http_server_resp_set_content_type(resp: ptr, content_type: ptr, content_type_len: u64) -> u32:
    ...

# @origin sa/sa_http_server.sai:11
def sa_http_server_resp_send(resp: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/sa_http_server.sai:12
def sa_http_server_resp_stream_new(req: ptr, status: u16, out_resp: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:13
def sa_http_server_resp_stream_write(resp: ptr, body: ptr, body_len: u64) -> u32:
    ...

# @origin sa/sa_http_server.sai:14
def sa_http_server_resp_stream_flush(resp: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:15
def sa_http_server_resp_stream_end(resp: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:16
def sa_http_server_resp_stream_free(resp: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:17
def sa_http_server_resp_free(resp: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:18
def sa_http_server_req_free(req: ptr) -> u32:
    ...

# @origin sa/sa_http_server.sai:19
def sa_http_server_free(server: ptr) -> u32:
    ...
