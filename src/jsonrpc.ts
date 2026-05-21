import type { RpcRequest, RpcResponse } from './types.ts';

export function isRpcRequest(value: unknown): value is RpcRequest {
  return !!value && typeof value === 'object' && 'method' in value;
}

export function rpcError(id: RpcRequest['id'], code: number, message: string): RpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

export function rpcResult(id: RpcRequest['id'], result: unknown): RpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result };
}
