from __future__ import annotations

class Handler:
    ...

# @origin sa/tests/test_responses_fallback_runtime_isolated.sh:22
def cleanup() -> Any:
    ...

# @origin sa/tests/test_responses_fallback_runtime_isolated.sh:35
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
