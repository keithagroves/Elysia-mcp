import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import logger from './logger.ts';
import { executeCapabilityById } from "./execute.ts"

// Create an MCP server
const server = new McpServer({
  name: "enact-mcp-server",
  version: "1.0.0"
});

// Add an addition tool
server.tool("add",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }]
  })
);

server.prompt(
  "echo",
  { message: z.string() },
  ({ message }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please process this message: ${message}`
      }
    }]
  })
);


// Register server tools
server.tool(
  "execute-capability-by-id",
  "Execute an enact capability by its ID",
  { 
    id: z.string(), 
    args: z.record(z.any()).optional()
  },
  async ({ id, args = {} }) => {
    const result = await executeCapabilityById(id, args);
    
    if (!result.success) {
      return {
        content: [{ 
          type: "text", 
          text: `Error executing capability with ID: ${id}: ${result.error?.message}` 
        }],
        isError: true
      };
    }
    
    return {
      content: [{ 
        type: "text", 
        text: `Successfully executed capability with ID: ${id}\nOutputs: ${JSON.stringify(result.outputs, null, 2)}` 
      }],
      isError: false
    };
  }
);



server.tool(
  "enact-search-capabilities",
  "Search capabilities in the Enact ecosystem",
  { query: z.string() },
  async ({ query }) => {
    try {
      // Encode the query parameter to handle special characters
      const encodedQuery = encodeURIComponent(query);
      // Remove or comment out console.log statements
      // console.log(encodedQuery);
      
      // Fetch from localhost:8081/yaml/search
      // http://localhost:8081/api/yaml/search?q=%22hello%22
      const response = await fetch(`http://localhost:8081/api/yaml/search?q=${encodedQuery}`);
      // Remove or comment out console.log statements
      // console.log('response', response);
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      // Parse the JSON response
      const results = await response.json();
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(results, null, 2) 
        }]
      };
    } catch (error) {
      logger.error("Error searching capabilities:", error);
      return {
        content: [{ 
          type: "text", 
          text: `Error searching capabilities: ${(error as Error).message}` 
        }],
        isError: true
      };
    }
  }
);


// Add a dynamic greeting resource
server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  async (uri, { name }) => ({
    contents: [{
      uri: uri.href,
      text: `Hello, ${name}!`
    }]
  })
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);