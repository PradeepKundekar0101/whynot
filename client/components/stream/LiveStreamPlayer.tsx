"use client";

import {
  LiveKitRoom,
  VideoTrack,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";

function VideoDisplay() {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });

  const videoTrackRef = tracks[0];

  if (!videoTrackRef) {
    return (
      <div className="flex items-center justify-center h-full bg-black text-white text-sm">
        Waiting for stream to start...
      </div>
    );
  }

  return (
    <VideoTrack
      trackRef={videoTrackRef}
      className="w-full h-full object-contain"
    />
  );
}

interface LiveStreamPlayerProps {
  token: string;
  serverUrl: string;
  onDisconnected?: () => void;
}

export function LiveStreamPlayer({
  token,
  serverUrl,
  onDisconnected,
}: LiveStreamPlayerProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      video={false}
      audio={false}
      onDisconnected={onDisconnected}
      className="w-full h-full"
    >
      <VideoDisplay />
    </LiveKitRoom>
  );
}
