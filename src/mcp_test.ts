import { assertEquals } from 'jsr:@std/assert@1';
import { callMcpTool, setCodexMcpServerDiscoveryForTests } from './mcp.ts';

const fakeMcpServerSource = String.raw`
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let buffer = '';

async function write(value) {
  await Deno.stdout.write(encoder.encode(JSON.stringify(value) + '\n'));
}

for await (const chunk of Deno.stdin.readable) {
  buffer += decoder.decode(chunk, { stream: true });
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    if (!('id' in request)) continue;
    if (request.method === 'initialize') {
      await write({ jsonrpc: '2.0', id: request.id, result: { serverInfo: { name: 'fake' } } });
      continue;
    }
    if (request.method === 'tools/list') {
      await write({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [{
            name: 'describe-index',
            description: 'Describe index',
            inputSchema: { type: 'object', properties: {} },
          }],
        },
      });
      continue;
    }
    if (request.method === 'tools/call') {
      const name = request.params?.name;
      await write({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ name }) }],
          isError: name !== 'describe-index',
        },
      });
      continue;
    }
    await write({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'not found' } });
  }
}
`;

Deno.test('callMcpTool maps Responses-safe tool names back to MCP tool names', async () => {
  const dir = await Deno.makeTempDir();
  const serverPath = `${dir}/fake_mcp_server.js`;
  await Deno.writeTextFile(serverPath, fakeMcpServerSource);
  setCodexMcpServerDiscoveryForTests(() => [{
    name: 'fake',
    enabled: true,
    auth_status: 'unsupported',
    transport: {
      type: 'stdio',
      command: Deno.execPath(),
      args: ['run', '--quiet', '--allow-read', serverPath],
      cwd: dir,
    },
  }]);

  try {
    const result = await callMcpTool('fake', 'describe_index', {}, null, 'thr_mcp_test') as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    assertEquals(result.isError, false);
    assertEquals(JSON.parse(result.content?.[0]?.text ?? '{}'), { name: 'describe-index' });
  } finally {
    setCodexMcpServerDiscoveryForTests(null);
    await Deno.remove(dir, { recursive: true });
  }
});
