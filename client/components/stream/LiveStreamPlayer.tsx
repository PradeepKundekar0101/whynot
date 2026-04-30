"use client";

import {
  LiveKitRoom,
  VideoTrack,
  RoomAudioRenderer,
  useTracks,
  useConnectionState,
  useRoomContext,
} from "@livekit/components-react";
import { useTrackMutedIndicator } from "@livekit/components-react/hooks";
import {
  Track,
  ConnectionState,
  RoomEvent,
  type TrackPublication,
} from "livekit-client";
import { useCallback, useEffect, useState } from "react";
import "@livekit/components-styles";
import { CameraOffPlaceholder } from "./CameraOffPlaceholder";

export interface StreamSellerInfo {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Reads the muted state of a single subscribed track. Must only be rendered
 * when `trackRef` is defined — calling `useTrackMutedIndicator(undefined)`
 * throws "No TrackRef" inside the LiveKit SDK and used to crash the page.
 */
function MutedFlag({
  trackRef,
  onChange,
}: {
  trackRef: NonNullable<ReturnType<typeof useTracks>[number]>;
  onChange: (isMuted: boolean) => void;
}) {
  const { isMuted } = useTrackMutedIndicator(trackRef);
  useEffect(() => {
    onChange(isMuted);
  }, [isMuted, onChange]);
  return null;
}

function VideoDisplay({
  serverUrl,
  seller,
}: {
  serverUrl: string;
  seller?: StreamSellerInfo;
}) {
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });
  const videoTrackRef = tracks[0];
  const audioTrackRef = audioTracks[0];

  // Mute state is reported up from the conditionally-rendered MutedFlag children
  // below. We start optimistic ("not muted") and let the LiveKit SDK correct us.
  const [sellerCameraMuted, setSellerCameraMuted] = useState(false);
  const [sellerMicMuted, setSellerMicMuted] = useState(false);

  const handleCamMuted = useCallback((m: boolean) => setSellerCameraMuted(m), []);
  const handleMicMuted = useCallback((m: boolean) => setSellerMicMuted(m), []);

  // Track number of remote participants so we can distinguish "seller hasn't published yet"
  // from "we're not actually connected".
  const [remoteCount, setRemoteCount] = useState(room.remoteParticipants.size);
  useEffect(() => {
    const update = () => setRemoteCount(room.remoteParticipants.size);
    update();
    room
      .on(RoomEvent.ParticipantConnected, update)
      .on(RoomEvent.ParticipantDisconnected, update)
      .on(RoomEvent.TrackSubscribed, update)
      .on(RoomEvent.TrackUnsubscribed, update)
      .on(RoomEvent.TrackMuted, update)
      .on(RoomEvent.TrackUnmuted, update);
    return () => {
      room
        .off(RoomEvent.ParticipantConnected, update)
        .off(RoomEvent.ParticipantDisconnected, update)
        .off(RoomEvent.TrackSubscribed, update)
        .off(RoomEvent.TrackUnsubscribed, update)
        .off(RoomEvent.TrackMuted, update)
        .off(RoomEvent.TrackUnmuted, update);
    };
  }, [room]);

  // Surface a hint if we sit in "Connecting" for too long.
  const [slowConnect, setSlowConnect] = useState(false);
  useEffect(() => {
    setSlowConnect(false);
    if (connectionState !== ConnectionState.Connecting) return;
    const t = setTimeout(() => setSlowConnect(true), 15000);
    return () => clearTimeout(t);
  }, [connectionState]);

  if (
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  ) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full bg-black text-white text-sm px-6 text-center">
        <p>Connecting to stream...</p>
        {slowConnect && (
          <div className="text-xs text-amber-300 max-w-xs space-y-1">
            <p>Still trying after 15s — common causes:</p>
            <ul className="text-left list-disc list-inside text-neutral-400">
              <li>
                <code className="text-neutral-300">{serverUrl}</code> not reachable from this browser
              </li>
              <li>Same logged-in user open as both seller and viewer (test in incognito)</li>
              <li>WebRTC blocked by browser extension or VPN</li>
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (connectionState === ConnectionState.Disconnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 h-full bg-black text-red-300 text-sm px-6 text-center">
        <p className="font-medium text-white">Disconnected</p>
        <p className="text-xs text-neutral-400">
          Check that LiveKit (<code className="text-neutral-300">{serverUrl}</code>) is reachable.
        </p>
      </div>
    );
  }

  // Mute-flag children render only when the corresponding track exists.
  const flags = (
    <>
      {videoTrackRef && (
        <MutedFlag trackRef={videoTrackRef} onChange={handleCamMuted} />
      )}
      {audioTrackRef && (
        <MutedFlag trackRef={audioTrackRef} onChange={handleMicMuted} />
      )}
    </>
  );

  if (!videoTrackRef) {
    // Either seller hasn't published yet, or seller is connected without camera.
    if (remoteCount === 0 || !seller) {
      return (
        <>
          {flags}
          <div className="flex items-center justify-center h-full bg-black text-white text-sm">
            {remoteCount === 0
              ? "Waiting for seller to start broadcasting..."
              : "Waiting for video..."}
          </div>
        </>
      );
    }
    return (
      <>
        {flags}
        <CameraOffPlaceholder
          variant="buyer"
          displayName={seller.displayName}
          username={seller.username}
          avatarUrl={seller.avatarUrl}
          micOn={!!audioTrackRef && !sellerMicMuted}
        />
      </>
    );
  }

  // Camera publication can stay subscribed while muted — `<VideoTrack>` would paint black.
  const pub = videoTrackRef.publication as TrackPublication | undefined;
  const hasLiveVideoFrames = !sellerCameraMuted && pub?.track != null;

  if (!hasLiveVideoFrames && seller) {
    return (
      <>
        {flags}
        <CameraOffPlaceholder
          variant="buyer"
          displayName={seller.displayName}
          username={seller.username}
          avatarUrl={seller.avatarUrl}
          micOn={!!audioTrackRef && !sellerMicMuted}
        />
      </>
    );
  }

  if (!hasLiveVideoFrames) {
    return (
      <>
        {flags}
        <div className="flex items-center justify-center h-full bg-black text-white text-sm px-6 text-center">
          Waiting for video...
        </div>
      </>
    );
  }

  return (
    <>
      {flags}
      <VideoTrack trackRef={videoTrackRef} className="w-full h-full object-contain" />
    </>
  );
}

interface LiveStreamPlayerProps {
  token: string;
  serverUrl: string;
  onDisconnected?: () => void;
  /** Used to render the camera-off placeholder when the seller pauses video. */
  seller?: StreamSellerInfo;
}

export function LiveStreamPlayer({
  token,
  serverUrl,
  onDisconnected,
  seller,
}: LiveStreamPlayerProps) {
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleError = useCallback((err: Error) => {
    console.error("LiveKit viewer error:", err);
    setConnectionError(err.message);
  }, []);

  if (connectionError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full bg-black text-red-400 text-sm px-6 text-center">
        <p className="font-medium text-white">Could not connect to stream</p>
        <p>{connectionError}</p>
        <p className="text-xs text-neutral-400 mt-1">
          Make sure the LiveKit container is running and reachable at{" "}
          <code className="text-neutral-300">{serverUrl}</code>.
        </p>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      video={false}
      audio={false}
      onDisconnected={onDisconnected}
      onError={handleError}
      className="w-full h-full"
    >
      <VideoDisplay serverUrl={serverUrl} seller={seller} />
      {/* Plays remote audio (seller's mic) — without this the room is silent. */}
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
