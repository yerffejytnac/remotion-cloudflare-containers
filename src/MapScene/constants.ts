import { z } from "zod";

export const MAP_COMP_NAME = "MapScene";

// Category type ID to color mapping
export const CATEGORY_COLORS: Record<number, string> = {
  1: "#EF4444", // Red
  2: "#F97316", // Orange
  3: "#EAB308", // Yellow
  4: "#22C55E", // Green
  5: "#3B82F6", // Blue
};

export const CATEGORY_LABELS: Record<number, string> = {
  1: "Type 1",
  2: "Type 2",
  3: "Type 3",
  4: "Type 4",
  5: "Type 5",
};

export const getCategoryColor = (type: number): string => {
  return CATEGORY_COLORS[type] ?? CATEGORY_COLORS[1];
};

// Supported media file extensions
export const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".avi", ".mkv"];
export const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
];

// Helper to detect media type from URL
export const getMediaType = (url: string): "video" | "image" | null => {
  const urlLower = url.toLowerCase();
  // Extract path from URL (before query params)
  const pathMatch = urlLower.match(/^[^?#]+/);
  const path = pathMatch ? pathMatch[0] : urlLower;

  if (VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return "video";
  }
  if (IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return "image";
  }
  return null;
};

export const MapSceneProps = z.object({
  title: z.string(),
  type: z.number().int().min(1).max(5), // category ID: 1-5
  latitude: z.string(),
  longitude: z.string(),
  mediaUrl: z.string().default(""), // Media URL (image or video) for marker, empty string = no media
});

export const defaultMapSceneProps: z.infer<typeof MapSceneProps> = {
  title: "Cronut tofu retro leggings try-hard occupy.",
  type: 1,
  latitude: "41.9584",
  longitude: "-87.6531",
  mediaUrl:
    "https://api.hielo.app/storage/v1/object/public/media/3fa319f7-177f-466c-aefe-121ce5c976fb/1765572416418_bldykv.jpg",
};

// Duration constants
export const MIN_DURATION_SECONDS = 30;
export const MAX_DURATION_SECONDS = 60;
export const DEFAULT_DURATION_FRAMES = MIN_DURATION_SECONDS * 30; // 30 seconds at 30fps

// TikTok/Instagram Stories format (9:16 vertical)
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;
