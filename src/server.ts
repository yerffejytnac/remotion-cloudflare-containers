import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { renderMedia, selectComposition } from "@remotion/renderer";
import express from "express";
import fs from "fs/promises";
import path from "path";

const app = express();
app.use(express.json({ limit: "10mb" }));
const port = process.env.PORT || 8080;

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

// Initialize S3 client for R2 from request config
const getS3Client = (config: R2Config | undefined): S3Client | null => {
  if (!config?.accountId || !config?.accessKeyId || !config?.secretAccessKey) {
    return null;
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

app.post("/render", async (req, res) => {
  const { compositionId, inputProps, renderId, r2Config } = req.body as {
    compositionId: string;
    inputProps: Record<string, unknown>;
    renderId: string;
    r2Config?: R2Config;
  };
  const outputLocation = path.join("/tmp", `out-${Date.now()}.mp4`);

  try {
    if (!compositionId) {
      res.status(400).json({ message: "`compositionId` is required." });
      return;
    }

    // For WebGL/MapLibre: use angle for GPU-accelerated rendering
    const chromiumOptions = {
      gl: "angle" as const,
    };

    const composition = await selectComposition({
      serveUrl: "./build",
      id: compositionId,
      inputProps,
      chromiumOptions,
    });

    console.log(`[${renderId}] Starting render...`);
    await renderMedia({
      composition,
      inputProps,
      codec: "h264",
      outputLocation,
      serveUrl: "./build",
      chromiumOptions,
      // JPEG is faster than PNG for non-transparent content
      imageFormat: "jpeg",
      jpegQuality: 90,
    });
    console.log(`[${renderId}] Render finished.`);

    // Read the rendered file
    const fileBuffer = await fs.readFile(outputLocation);
    const fileSize = fileBuffer.byteLength;
    console.log(`[${renderId}] Video size: ${fileSize} bytes`);

    // Try to upload directly to R2 if credentials are available
    const s3Client = getS3Client(r2Config);
    if (s3Client && renderId && r2Config) {
      const key = `${renderId}.mp4`;
      console.log(`[${renderId}] Uploading to R2: ${key}`);

      await s3Client.send(
        new PutObjectCommand({
          Bucket: r2Config.bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: "video/mp4",
        })
      );

      console.log(`[${renderId}] R2 upload complete.`);

      // Return just metadata (no video buffer)
      res.status(200).json({
        success: true,
        renderId,
        key,
        size: fileSize,
        uploadedToR2: true,
      });
    } else {
      // Fallback: return video buffer (original behavior)
      console.log(`[${renderId}] No R2 credentials, returning buffer.`);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", fileSize);
      res.status(200).send(fileBuffer);
    }
  } catch (err) {
    console.error(`[${renderId}] Error:`, err);
    res.status(500).json({
      message: "Error rendering video.",
      error: (err as Error).stack,
    });
  } finally {
    // Clean up the temporary file from the container's filesystem
    if (await fs.stat(outputLocation).catch(() => null)) {
      await fs.unlink(outputLocation);
    }
  }
});

app.listen(port, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Renderer server listening on port ${port}`);
});
