// Connect your AI: the connector a DM adds to Claude, ChatGPT or another AI app (an MCP server,
// stateless, over Streamable HTTP). See src/features/connector/.
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { callerOf, unauthorized } from '@/features/connector/server';
import { connectorServer } from '@/features/connector/tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const caller = await callerOf(req);
  if (!caller) return unauthorized(req);
  const server = connectorServer(caller);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

// stateless: no event stream to open and no session to end
const notHere = () => new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }), { status: 405, headers: { 'content-type': 'application/json', allow: 'POST' } });
export async function GET(req: Request) { return (await callerOf(req)) ? notHere() : unauthorized(req); }
export const DELETE = notHere;
