from __future__ import annotations

# @origin sa/tests/test_thread_rpc_transport_runtime_isolated.sh:26
def cleanup() -> Any:
    ...

# @origin sa/tests/test_thread_rpc_transport_runtime_isolated.sh:35
def pick_port() -> Any:
    socket.socket(...)
    s.bind(...)
    print(...)
    s.getsockname(...)
    return pick_port(...)

# @origin sa/tests/test_thread_rpc_transport_runtime_isolated.sh:85
def rpc_call() -> Any:
    return rpc_call(...)

def load_env_json(name: Any) -> Any:
    ...

def assert_envelope(doc: Any, request_id: Any) -> Any:
    ...

def assert_thread_object(thread: Any, turns_expected: Any) -> Any:
    ...
