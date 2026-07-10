from __future__ import annotations

class Handler:
    ...

# @origin sa/tests/test_models_runtime_isolated.sh:20
def cleanup() -> Any:
    ...

# @origin sa/tests/test_models_runtime_isolated.sh:33
def pick_port() -> Any:
    socket.socket(...)
    s.bind(...)
    print(...)
    s.getsockname(...)
    return pick_port(...)

def do_GET() -> Any:
    ...

def log_message(arg2: Any) -> Any:
    ...
