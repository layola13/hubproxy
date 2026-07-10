from __future__ import annotations

# @origin sa/tests/test_rpc_transport_runtime_isolated.sh:22
def cleanup() -> Any:
    ...

# @origin sa/tests/test_rpc_transport_runtime_isolated.sh:31
def pick_port() -> Any:
    socket.socket(...)
    s.bind(...)
    print(...)
    s.getsockname(...)
    return pick_port(...)

# @origin sa/tests/test_rpc_transport_runtime_isolated.sh:81
def rpc_call() -> Any:
    return rpc_call(...)

# @origin sa/tests/test_rpc_transport_runtime_isolated.sh:99
def rpc_call_file() -> Any:
    ...

def load_env_json(name: Any) -> Any:
    ...
