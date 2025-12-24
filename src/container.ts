import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  REMOTION_CONTAINER: DurableObjectNamespace<Container>;
  R2_BUCKET: R2Bucket;
  R2_BUCKET_NAME: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

export class RemotionContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";

  onStart(): void {
    console.log("Remotion container started successfully");
  }

  onStop(): void {
    console.log("Remotion container stopped");
  }

  onError(error: unknown): void {
    console.error("Remotion container error:", error);
  }

  async fetch(request: Request): Promise<Response> {
    return await super.containerFetch(request);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/render") {
      const container = getContainer(env.REMOTION_CONTAINER, "renderer");
      const renderId = crypto.randomUUID();

      try {
        // Parse the original request body and add renderId + R2 credentials
        const originalBody = await request.json();
        const enhancedBody = {
          ...originalBody,
          renderId,
          // Pass R2 credentials so container can upload directly
          r2Config: {
            accountId: env.CLOUDFLARE_ACCOUNT_ID,
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            bucketName: env.R2_BUCKET_NAME,
          },
        };

        console.log(`[${renderId}] Forwarding render request to container...`);

        // Create a new request with the enhanced body
        const containerRequest = new Request(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(enhancedBody),
        });

        const response = await container.fetch(containerRequest);
        console.log(`[${renderId}] Container response status: ${response.status}`);

        if (response.status === 200) {
          const contentType = response.headers.get("Content-Type") || "";

          // Check if container uploaded to R2 (returns JSON) or returned buffer
          if (contentType.includes("application/json")) {
            // Container uploaded directly to R2, forward the response
            const result = await response.json();
            console.log(`[${renderId}] Container uploaded to R2:`, result);

            return Response.json({
              renderId,
              bucketName: env.R2_BUCKET_NAME,
              key: result.key,
              size: result.size,
              url: `https://renders.tremendous.dev/${result.key}`,
            });
          } else {
            // Container returned video buffer (fallback), upload via worker
            console.log(`[${renderId}] Container returned buffer, uploading to R2...`);
            const key = `${renderId}.mp4`;

            const body = response.body;
            if (!body) {
              console.error(`[${renderId}] Response body is null`);
              return Response.json({ error: "Empty response from container" }, { status: 500 });
            }

            const r2Object = await env.R2_BUCKET.put(key, body, {
              httpMetadata: { contentType: "video/mp4" },
            });

            console.log(`[${renderId}] R2 upload complete: ${r2Object.key}, size: ${r2Object.size}`);

            return Response.json({
              renderId,
              bucketName: env.R2_BUCKET_NAME,
              key,
              size: r2Object.size,
              url: `https://renders.tremendous.dev/${key}`,
            });
          }
        }

        // Forward error response from container
        const errorText = await response.text();
        console.error(`[${renderId}] Container error: ${errorText}`);
        return new Response(errorText, {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error(`[${renderId}] Worker error:`, error);
        return Response.json(
          {
            error: "Render failed",
            message: error instanceof Error ? error.message : String(error),
            renderId,
          },
          { status: 500 }
        );
      }
    }

    return new Response("Remotion Worker - use POST /render to render videos", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  },
};
