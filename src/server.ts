import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppStoreConnectClient } from "./asc/client.js";
import { registerFeedbackTools } from "./tools/feedback.js";
import { registerAppTools } from "./tools/apps.js";
import { registerTestFlightTools } from "./tools/testflight.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

export function createServer(client: AppStoreConnectClient): McpServer {
  const server = new McpServer({ name: "testflight-mcp", version });
  registerFeedbackTools(server, client);
  registerAppTools(server, client);
  registerTestFlightTools(server, client);
  return server;
}
