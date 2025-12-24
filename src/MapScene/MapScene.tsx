import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapStyle from "./map-style.json";
import { z } from "zod";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  OffthreadVideo,
  Img,
} from "remotion";
import {
  MapSceneProps,
  getCategoryColor,
  CATEGORY_LABELS,
  getMediaType,
} from "./constants";

// Zoom constants
const ZOOM_START = 16;
const ZOOM_END = 18;

// Instagram Reel safe zone constants (1080x1920)
// Top 250px: username, profile icon
// Bottom 350px: captions, like/comment/share buttons
// Safe zone: ~1080x1320 centered
const SAFE_ZONE_TOP = 250;
const SAFE_ZONE_BOTTOM = 350;
const SAFE_ZONE_HORIZONTAL = 60;

export const MapScene: React.FC<z.infer<typeof MapSceneProps>> = ({
  title,
  type,
  latitude: latitudeStr,
  longitude: longitudeStr,
  mediaUrl,
}) => {
  // Detect media type from URL (empty string = no media)
  const hasMedia = mediaUrl && mediaUrl.length > 0;
  const mediaType = hasMedia ? getMediaType(mediaUrl) : null;
  const latitude = parseFloat(latitudeStr);
  const longitude = parseFloat(longitudeStr);
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [handle] = useState(() => delayRender("Loading map tiles"));
  const [mapReady, setMapReady] = useState(false);
  const hasCalledContinueRender = useRef(false);

  // Animation spans the full composition duration
  const animationDuration = durationInFrames;

  // Combined animation progress (0 to 1 over animation duration)
  const progress = interpolate(frame, [0, animationDuration], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Zoom: start close, end closer (with easing for smooth motion)
  const zoom = interpolate(progress, [0, 1], [ZOOM_START, ZOOM_END], {
    easing: Easing.out(Easing.cubic),
  });

  // Orbit: rotate 360° around center (linear for smooth continuous rotation)
  const bearing = interpolate(progress, [0, 1], [0, 360]);

  // Title fade in animation
  const titleOpacity = interpolate(frame, [fps * 1, fps * 2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleY = interpolate(frame, [fps * 1, fps * 2], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Type badge animation
  const badgeScale = spring({
    fps,
    frame: frame - fps * 1.5,
    config: {
      damping: 12,
      stiffness: 200,
    },
  });

  // Marker animation (same spring as badge, slightly delayed)
  const markerScale = spring({
    fps,
    frame: frame - fps * 2,
    config: {
      damping: 12,
      stiffness: 200,
    },
  });

  // Get color based on category type
  const categoryColor = getCategoryColor(type);
  const categoryLabel = CATEGORY_LABELS[type] ?? `Type ${type}`;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle as maplibregl.StyleSpecification,
      center: [longitude, latitude],
      zoom: ZOOM_START,
      pitch: 45,
      interactive: false,
      attributionControl: false,
      // Performance optimizations
      fadeDuration: 0, // Disable tile fade-in animation
      renderWorldCopies: false, // Don't render world copies
      maxTileCacheSize: 200, // Increase tile cache
      // Quality settings
      antialias: true, // Enable antialiasing for smoother edges
      pixelRatio: 2, // High DPI for crisp output
      preserveDrawingBuffer: true, // Required for Remotion frame capture
    });

    mapRef.current = map;

    // Handle errors
    map.on("error", (e) => {
      console.error("MapLibre error:", e.error);
    });

    // Force resize after style loads to ensure map fills container
    map.on("load", () => {
      map.resize();
    });

    // Wait for map to be idle (all tiles loaded)
    map.on("idle", () => {
      if (!hasCalledContinueRender.current) {
        hasCalledContinueRender.current = true;
        map.resize(); // Ensure map fills container before first render
        setMapReady(true);
        continueRender(handle);
      }
    });

    return () => {
      map.remove();
    };
  }, [latitude, longitude, handle]);

  // Calculate padding to shift map center into safe zone
  // This moves the visual center point upward, away from bottom UI
  const mapPadding = {
    top: SAFE_ZONE_TOP,
    bottom: SAFE_ZONE_BOTTOM,
    left: 0,
    right: 0,
  };

  // Update camera position on each frame
  useEffect(() => {
    if (mapRef.current && mapReady) {
      mapRef.current.jumpTo({
        center: [longitude, latitude],
        zoom,
        bearing,
        pitch: 45, // Tilted view for better 3D orbit effect
        padding: mapPadding,
      });
      // Force synchronous repaint for Remotion frame capture
      mapRef.current.triggerRepaint();
    }
  }, [frame, longitude, latitude, zoom, bearing, mapReady]);

  return (
    <AbsoluteFill>
      {/* Map Container - inline critical MapLibre styles */}
      <style>
        {`
          .maplibregl-map {
            position: absolute !important;
            top: 0;
            left: 0;
            width: 100% !important;
            height: 100% !important;
          }
          .maplibregl-canvas {
            position: absolute !important;
            top: 0;
            left: 0;
            width: 100% !important;
            height: 100% !important;
          }
        `}
      </style>
      <div
        ref={mapContainerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
        }}
      />

      {/* Gradient overlay for text readability - extends into safe zone */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "55%", // Extends above safe zone bottom for better text contrast
          background:
            "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 40%, transparent 100%)",
        }}
      />

      {/* Content overlay - positioned within Instagram safe zone */}
      <div
        style={{
          position: "absolute",
          bottom: SAFE_ZONE_BOTTOM + 20, // Above caption/buttons area
          left: SAFE_ZONE_HORIZONTAL,
          right: SAFE_ZONE_HORIZONTAL,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        {/* Type badge */}
        <div
          style={{
            backgroundColor: categoryColor,
            color: "white",
            padding: "12px 24px",
            borderRadius: 8,
            fontSize: 28,
            fontWeight: 600,
            fontFamily: "system-ui, -apple-system, sans-serif",
            textTransform: "uppercase",
            letterSpacing: 2,
            transform: `scale(${badgeScale})`,
          }}
        >
          {categoryLabel}
        </div>

        {/* Title */}
        <h1
          style={{
            color: "white",
            fontSize: 72,
            fontWeight: 800,
            fontFamily: "system-ui, -apple-system, sans-serif",
            margin: 0,
            lineHeight: 1.1,
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}
        >
          {title}
        </h1>

        {/* Coordinates */}
        <div
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: 24,
            fontFamily: "monospace",
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}
        >
          {latitude.toFixed(4)}°, {longitude.toFixed(4)}°
        </div>
      </div>

      {/* Location pin marker - positioned at safe zone center */}
      <div
        style={{
          position: "absolute",
          // Center of safe zone: (SAFE_ZONE_TOP + (height - SAFE_ZONE_BOTTOM)) / 2
          top: (SAFE_ZONE_TOP + (height - SAFE_ZONE_BOTTOM)) / 2,
          left: "50%",
          // Transform origin at bottom center (nub tip) so scaling keeps nub at coordinates
          transformOrigin: "center bottom",
          transform: `translate(-50%, -100%) scale(${markerScale * 1.5})`,
        }}
      >
        {/* Container for marker with relative positioning */}
        <div style={{ position: "relative", width: 150, height: 211 }}>
          {/* Media layer - positioned behind the marker frame */}
          {hasMedia && mediaType && (
            <div
              style={{
                position: "absolute",
                top: 7,
                left: 9,
                width: 132,
                height: 181,
                overflow: "hidden",
                // CSS clip-path using the interior shape (adjusted to local coordinates)
                clipPath: `path('M0 60C0 31.7157 0 17.5736 8.7868 8.7868C17.5736 0 31.7157 0 60 0H72C100.284 0 114.426 0 123.213 8.7868C132 17.5736 132 31.7157 132 60V121C132 149.284 132 163.426 123.213 172.213C114.426 181 100.284 181 72 181H60C31.7157 181 17.5736 181 8.7868 172.213C0 163.426 0 149.284 0 121V60Z')`,
              }}
            >
              {mediaType === "video" ? (
                <OffthreadVideo
                  src={mediaUrl}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <Img
                  src={mediaUrl}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              )}
            </div>
          )}

          {/* Marker SVG frame - rendered on top */}
          <svg
            width="150"
            height="211"
            viewBox="0 0 150 211"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ position: "absolute", top: 0, left: 0 }}
          >
            <defs>
              {/* Drop shadow filter */}
              <filter
                id="filter0_d_60_56"
                x="0"
                y="0"
                width="150"
                height="210.938"
                filterUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
              >
                <feFlood floodOpacity="0" result="BackgroundImageFix" />
                <feColorMatrix
                  in="SourceAlpha"
                  type="matrix"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                  result="hardAlpha"
                />
                <feOffset dy="2" />
                <feGaussianBlur stdDeviation="1.5" />
                <feComposite in2="hardAlpha" operator="out" />
                <feColorMatrix
                  type="matrix"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.32 0"
                />
                <feBlend
                  mode="normal"
                  in2="BackgroundImageFix"
                  result="effect1_dropShadow_60_56"
                />
                <feBlend
                  mode="normal"
                  in="SourceGraphic"
                  in2="effect1_dropShadow_60_56"
                  result="shape"
                />
              </filter>
              {/* Mask to cut out the interior - only show the frame border */}
              <mask id="markerFrameMask">
                {/* White = visible, Black = hidden */}
                <rect x="0" y="0" width="150" height="211" fill="white" />
                {/* Cut out the interior */}
                <path
                  d="M9 67C9 38.7157 9 24.5736 17.7868 15.7868C26.5736 7 40.7157 7 69 7H81C109.284 7 123.426 7 132.213 15.7868C141 24.5736 141 38.7157 141 67V128C141 156.284 141 170.426 132.213 179.213C123.426 188 109.284 188 81 188H69C40.7157 188 26.5736 188 17.7868 179.213C9 170.426 9 156.284 9 128V67Z"
                  fill="black"
                />
              </mask>
            </defs>

            {/* Marker frame with shadow - interior cut out to show media behind */}
            <g filter="url(#filter0_d_60_56)">
              {/* Marker pointer/tail */}
              <path
                d="M66.2191 202.677L57 194H93L82.1731 203.117C77.514 207.041 70.6546 206.851 66.2191 202.677Z"
                fill={categoryColor}
              />
              {/* Marker outer frame with interior masked out */}
              <g mask={hasMedia ? "url(#markerFrameMask)" : undefined}>
                <path
                  d="M3 128.466C2.99986 142.219 2.99974 153.152 4.15137 161.718C5.33918 170.552 7.84995 177.762 13.544 183.456C19.2379 189.15 26.4475 191.661 35.2822 192.849C43.8479 194 54.781 194 68.5344 194H81.4656C95.219 194 106.152 194 114.718 192.849C123.552 191.661 130.762 189.15 136.456 183.456C142.15 177.762 144.661 170.552 145.849 161.718C147 153.152 147 142.219 147 128.466V66.5344C147 52.781 147 41.8479 145.849 33.2822C144.661 24.4475 142.15 17.2379 136.456 11.544C130.762 5.84995 123.552 3.33918 114.718 2.15137C106.152 0.999743 95.219 0.999858 81.4656 1L68.5345 1C54.781 0.999858 43.848 0.999743 35.2822 2.15137C26.4475 3.33918 19.2379 5.84995 13.544 11.544C7.84995 17.2379 5.33918 24.4475 4.15137 33.2822C2.99974 41.848 2.99986 52.781 3 66.5345L3 128.466Z"
                  fill={categoryColor}
                />
                {/* White interior - only shown when no media */}
                {!hasMedia && (
                  <path
                    d="M9 67C9 38.7157 9 24.5736 17.7868 15.7868C26.5736 7 40.7157 7 69 7H81C109.284 7 123.426 7 132.213 15.7868C141 24.5736 141 38.7157 141 67V128C141 156.284 141 170.426 132.213 179.213C123.426 188 109.284 188 81 188H69C40.7157 188 26.5736 188 17.7868 179.213C9 170.426 9 156.284 9 128V67Z"
                    fill="white"
                  />
                )}
              </g>
            </g>
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};
