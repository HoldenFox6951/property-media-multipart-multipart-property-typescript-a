import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError, z } from "zod";
import { InfraiError } from "./infrai_storage";
import {
  cancelPropertyMediaUpload,
  completePropertyMediaUpload,
  completionSchema,
  mediaRequestSchema,
  preparePropertyMediaBucket,
  startPropertyMediaUpload,
} from "./property_media_upload";

const uploadIdSchema = z.string().min(1).max(300);

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "POST" && url.pathname === "/media-uploads") {
    const input = mediaRequestSchema.parse(await jsonBody(request));
    send(response, 201, await startPropertyMediaUpload(input));
    return;
  }

  const match = url.pathname.match(/^\/media-uploads\/([^/]+)\/(complete|cancel)$/);
  if (request.method === "POST" && match) {
    const uploadId = uploadIdSchema.parse(decodeURIComponent(match[1]));
    if (match[2] === "complete") {
      const input = completionSchema.parse(await jsonBody(request));
      send(response, 200, await completePropertyMediaUpload(uploadId, input.parts));
    } else {
      send(response, 200, await cancelPropertyMediaUpload(uploadId));
    }
    return;
  }

  send(response, 404, { error: "route_not_found" });
}

const server = createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "invalid_request" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, message: error.message });
      return;
    }
    send(response, 500, { error: "internal_error" });
  });
});

const port = Number(process.env.PORT ?? 3000);
await preparePropertyMediaBucket();
server.listen(port, () => console.log(`Property media service listening on http://localhost:${port}`));
