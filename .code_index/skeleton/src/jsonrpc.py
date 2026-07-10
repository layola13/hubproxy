from __future__ import annotations

from .types import RpcRequest, RpcResponse

# @origin src/jsonrpc.ts:3
def isRpcRequest(value: Any) -> value is RpcRequest:
    ...

# @origin src/jsonrpc.ts:7
def rpcError(id: RpcRequest[id], code: float, message: str) -> RpcResponse:
    ...

# @origin src/jsonrpc.ts:11
def rpcResult(id: RpcRequest[id], result: Any) -> RpcResponse:
    ...
