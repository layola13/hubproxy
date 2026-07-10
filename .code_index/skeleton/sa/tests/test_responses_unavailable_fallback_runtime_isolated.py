from __future__ import annotations

class Handler:
    ...

# @origin sa/tests/test_responses_unavailable_fallback_runtime_isolated.sh:21
def cleanup() -> Any:
    ...

# @origin sa/tests/test_responses_unavailable_fallback_runtime_isolated.sh:34
def pick_port() -> Any:
    socket.socket(...)
    s.bind(...)
    print(...)
    s.getsockname(...)
    return pick_port(...)

def do_GET() -> Any:
    ...

def do_POST() -> Any:
    ...

def log_message(arg2: Any) -> Any:
    ...
