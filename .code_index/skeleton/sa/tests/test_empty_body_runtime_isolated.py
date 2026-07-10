from __future__ import annotations

class Handler:
    ...

# @origin sa/tests/test_empty_body_runtime_isolated.sh:20
def cleanup() -> Any:
    ...

# @origin sa/tests/test_empty_body_runtime_isolated.sh:33
def pick_port() -> Any:
    socket.socket(...)
    s.bind(...)
    print(...)
    s.getsockname(...)
    return pick_port(...)

# @origin sa/tests/test_empty_body_runtime_isolated.sh:151
def assert_rejected_empty_body() -> Any:
    return assert_rejected_empty_body(...)

def do_GET() -> Any:
    ...

def do_POST() -> Any:
    ...

def log_message(arg2: Any) -> Any:
    ...
