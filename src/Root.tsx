import "./index.css";
import { Composition } from "remotion";
import { getVideoMetadata } from "@remotion/media-utils";
import { z } from "zod";
import { HelloWorld, myCompSchema } from "./HelloWorld";
import { Logo, myCompSchema2 } from "./HelloWorld/Logo";
import {
  MapScene,
  MAP_COMP_NAME,
  MapSceneProps,
  defaultMapSceneProps,
  DEFAULT_DURATION_FRAMES,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  getMediaType,
} from "./MapScene";

// Calculate composition duration based on video length (if provided)
const calculateMapSceneMetadata = async ({
  props,
}: {
  props: z.infer<typeof MapSceneProps>;
}) => {
  const { mediaUrl } = props;

  // Check if we have a video URL (empty string = no media)
  if (mediaUrl && mediaUrl.length > 0) {
    const mediaType = getMediaType(mediaUrl);

    if (mediaType === "video") {
      try {
        const metadata = await getVideoMetadata(mediaUrl);
        const videoDurationSeconds = metadata.durationInSeconds;

        // Clamp to min 30s, max 60s
        const targetDurationSeconds = Math.max(
          MIN_DURATION_SECONDS,
          Math.min(videoDurationSeconds, MAX_DURATION_SECONDS)
        );

        return {
          durationInFrames: Math.ceil(targetDurationSeconds * VIDEO_FPS),
        };
      } catch (error) {
        console.warn(
          "Could not get video metadata, using default duration:",
          error
        );
      }
    }
  }

  // Default duration for images or when no media
  return {
    durationInFrames: DEFAULT_DURATION_FRAMES,
  };
};

// Each <Composition> is an entry in the sidebar!

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* MapScene - Instagram Reels format (9:16 vertical) */}
      <Composition
        id={MAP_COMP_NAME}
        component={MapScene}
        durationInFrames={DEFAULT_DURATION_FRAMES}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={defaultMapSceneProps}
        schema={MapSceneProps}
        calculateMetadata={calculateMapSceneMetadata}
      />

      {/* HelloWorld - Landscape format */}
      <Composition
        id="HelloWorld"
        component={HelloWorld}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        schema={myCompSchema}
        defaultProps={{
          titleText: "Welcome to Remotion",
          titleColor: "#000000",
          logoColor1: "#91EAE4",
          logoColor2: "#86A8E7",
        }}
      />

      {/* Mount any React component to make it show up in the sidebar and work on it individually! */}
      <Composition
        id="OnlyLogo"
        component={Logo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        schema={myCompSchema2}
        defaultProps={{
          logoColor1: "#91dAE2" as const,
          logoColor2: "#86A8E7" as const,
        }}
      />
    </>
  );
};
