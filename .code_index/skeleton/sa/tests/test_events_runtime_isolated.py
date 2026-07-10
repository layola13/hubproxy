from __future__ import annotations

# @origin sa/tests/test_events_runtime_isolated.sh:16
def cleanup() -> Any:
    ...

# @origin sa/tests/test_events_runtime_isolated.sh:25
def pick_port() -> Any:
    socket.socket(...)
    s.bind(...)
    print(...)
    s.getsockname(...)
    return pick_port(...)

def snapshot() -> Any:
    ...

def reader(resp: Any) -> Any:
    ...

def wait_for(predicate: Any, label: Any, timeout: Any) -> Any:
    ...

def rpc_call(payload: Any) -> Any:
    ...

def parse_frames(raw: Any) -> Any:
    ...

def find_item_payload(event_name: Any, content: Any) -> Any:
    ...
