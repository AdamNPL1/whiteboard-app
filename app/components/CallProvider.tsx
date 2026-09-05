"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  LoaderCircle,
  Maximize2,
  Mic,
  MicOff,
  Minus,
  MoreHorizontal,
  Phone,
  PhoneOff,
  Settings2,
  BadgeCheck,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useLanguage } from "@/lib/i18n";
import { reportRealtimeDiagnostics } from "@/lib/realtime-diagnostics";
import { getLocalVideoDirection } from "@/lib/call-video";
import { CallReconnectionController } from "@/lib/call-reconnection";
import { CallMediaWatchdog } from "@/lib/call-media-watchdog";
import { TurnCredentialLoader } from "@/lib/turn-credential-loader";
import { resolveCallStatusKind } from "@/lib/call-status";
import { presentCallMessage } from "@/lib/call-message-presentation";
import { formatCallDuration, getParticipantInitials } from "@/lib/participant-presence";
import {
  CALL_DEVICE_SESSION_HEADER,
  CALL_OWNERSHIP_CHANNEL,
  getBrowserCallSessionId,
} from "@/lib/call-device-session";
import {
  withCallQualityRating,
  type CallQualitySnapshot,
} from "@/lib/call-quality";
import {
  normalizeParticipantVolume,
  shouldOpenParticipantMenuFromKey,
  toggleVideoFit,
} from "@/lib/participant-media-controls";
import {
  clampCallPanelPosition,
  readStoredCallLayout,
  type CallLayoutMode,
  type CallPanelDock,
} from "@/lib/call-layout";
import {
  aggregateParticipantConnectionStates,
  browserCallReducer,
  initialBrowserCallState,
} from "@/lib/browser-call-state";
import {
  CALL_SIGNAL_MAX_ATTEMPTS,
  CALL_SIGNAL_PROTOCOL_VERSION,
  callSignalRetryDelayMs,
  createPendingCallSignal,
  decideOfferCollision,
  isCallSignalEnvelope,
  isDurableCallSignal,
  shouldRetryCallSignal,
} from "@/lib/call-signaling";
import type {
  CallSignalData,
  CallSignalEnvelope,
  PendingCallSignal,
} from "@/lib/call-signaling";
import type {
  CallParticipantState,
  CallRecord,
  ParticipantConnectionState,
} from "@/lib/call-types";
import {
  PRE_CALL_SETTINGS_KEY,
  parsePreCallSettings,
  supportsSpeakerSelection,
} from "@/lib/pre-call-settings";
import {
  audioPacketsAreStalled,
  chooseAvailableDevice,
  classifyAudioDeviceError,
} from "@/lib/audio-device-management";

const CALL_LAYOUT_STORAGE_KEY = "scriboo-call-layout-v1";
import type { AudioDeviceState } from "@/lib/audio-device-management";

type BoardContext = { id: string; name: string };
type CallParticipant = {
  userId: string;
  name: string;
  role: "owner" | "collaborator";
};
type CallPhase =
  | "idle"
  | "choosing"
  | "incoming"
  | "precall-outgoing"
  | "precall-incoming"
  | "outgoing"
  | "connecting"
  | "connected"
  | "ended"
  | "error";
type CurrentUser = { id: string; name: string; email: string };
type CameraDevice = { deviceId: string; label: string };
type MediaDeviceOption = { deviceId: string; label: string };
type MediaPermissionState = "prompt" | "granted" | "denied" | "unavailable";

type CallContextValue = {
  setBoardContext: (board: BoardContext | null) => void;
};

const CallContext = createContext<CallContextValue | null>(null);

const toParticipantConnectionState = (
  state: RTCPeerConnectionState | RTCIceConnectionState
): ParticipantConnectionState => {
  if (state === "connected" || state === "completed") return "connected";
  if (state === "disconnected") return "reconnecting";
  if (state === "failed" || state === "closed") return "failed";
  return "connecting";
};

const apiRequest = async <T,>(
  path: string,
  options?: RequestInit
): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      [CALL_DEVICE_SESSION_HEADER]: getBrowserCallSessionId(),
      ...options?.headers,
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Call request failed.");
  return data;
};

const readCandidateType = (candidate: RTCIceCandidateInit | RTCIceCandidate) => {
  if ("type" in candidate && typeof candidate.type === "string") {
    return candidate.type;
  }
  return candidate.candidate?.match(/\btyp\s+(host|srflx|prflx|relay)\b/i)?.[1]
    ?.toLowerCase();
};

const waitForIceGathering = async (
  connection: RTCPeerConnection,
  timeoutMs = 4_000
) => {
  if (connection.iceGatheringState === "complete") return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    };
    const handleChange = () => {
      if (connection.iceGatheringState === "complete") finish();
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    connection.addEventListener("icegatheringstatechange", handleChange);
  });
};

const getGatheredLocalDescription = async (connection: RTCPeerConnection) => {
  await waitForIceGathering(connection);
  if (!connection.localDescription) {
    throw new Error("LOCAL_DESCRIPTION_MISSING");
  }
  return connection.localDescription.toJSON();
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { text: t } = useLanguage();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [board, setBoard] = useState<BoardContext | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [pendingParticipant, setPendingParticipant] = useState<CallParticipant | null>(null);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [browserCallState, dispatchBrowserCall] = useReducer(
    browserCallReducer,
    initialBrowserCallState
  );
  const call = browserCallState.call;
  const [peerName, setPeerName] = useState("");
  const [callBoardName, setCallBoardName] = useState("");
  const [message, setMessage] = useState("");
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [callEndedBy, setCallEndedBy] = useState<"you" | "participant" | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [showRecoveryRestored, setShowRecoveryRestored] = useState(false);
  const [isBrowserOffline, setIsBrowserOffline] = useState(false);
  const localConnectionStateRef = useRef<ParticipantConnectionState | "">("");
  const remoteConnectionStateRef = useRef<ParticipantConnectionState | "">("");
  const remoteConnectionVersionRef = useRef(0);
  const participantStateReportRef = useRef<Promise<void>>(Promise.resolve());
  const recoveryNoticeTimeoutRef = useRef<number | null>(null);
  const previousConnectionStateRef = useRef<ParticipantConnectionState | "">("");
  const connectionState = browserCallState.connectionState;
  const updateDisplayedConnectionState = useCallback(
    (local: ParticipantConnectionState | "", remote: ParticipantConnectionState | "") => {
      const displayed = aggregateParticipantConnectionStates(local, remote);
      if (
        previousConnectionStateRef.current === "reconnecting" &&
        displayed === "connected"
      ) {
        setShowRecoveryRestored(true);
        if (recoveryNoticeTimeoutRef.current !== null) {
          window.clearTimeout(recoveryNoticeTimeoutRef.current);
        }
        recoveryNoticeTimeoutRef.current = window.setTimeout(() => {
          recoveryNoticeTimeoutRef.current = null;
          setShowRecoveryRestored(false);
        }, 3_000);
      } else if (displayed === "reconnecting" || displayed === "failed" || !displayed) {
        setShowRecoveryRestored(false);
      }
      previousConnectionStateRef.current = displayed;
      dispatchBrowserCall({ type: "connection", state: displayed });
    },
    []
  );
  const setConnectionState = useCallback((state: ParticipantConnectionState | "") => {
    localConnectionStateRef.current = state;
    updateDisplayedConnectionState(state, remoteConnectionStateRef.current);
  }, [updateDisplayedConnectionState]);
  const [isRemoteAudioBlocked, setIsRemoteAudioBlocked] = useState(false);
  const [isCallToneBlocked, setIsCallToneBlocked] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [joinWithCamera, setJoinWithCamera] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isSelfViewVisible, setIsSelfViewVisible] = useState(true);
  const [isSelfViewMenuOpen, setIsSelfViewMenuOpen] = useState(false);
  const [isSelfViewMirrored, setIsSelfViewMirrored] = useState(true);
  const [selfViewFit, setSelfViewFit] = useState<"cover" | "contain">("cover");
  const [selfViewSize, setSelfViewSize] = useState<"small" | "medium" | "large">("medium");
  const [selfViewPosition, setSelfViewPosition] = useState<{ left: number; top: number } | null>(null);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceOption[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceOption[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");
  const [microphonePermission, setMicrophonePermission] =
    useState<MediaPermissionState>("prompt");
  const [cameraPermission, setCameraPermission] =
    useState<MediaPermissionState>("prompt");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [isMicrophoneReady, setIsMicrophoneReady] = useState(false);
  const [isPreparingMedia, setIsPreparingMedia] = useState(false);
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);
  const [isSpeakerSelectionSupported, setIsSpeakerSelectionSupported] = useState(false);
  const [preCallMessage, setPreCallMessage] = useState("");
  const [microphoneDeviceState, setMicrophoneDeviceState] =
    useState<AudioDeviceState>("ready");
  const [speakerDeviceState, setSpeakerDeviceState] =
    useState<AudioDeviceState>("ready");
  const [audioDeviceMessage, setAudioDeviceMessage] = useState("");
  const [isSwitchingMicrophone, setIsSwitchingMicrophone] = useState(false);
  const [isTestingMicrophone, setIsTestingMicrophone] = useState(false);
  const [outboundAudioActive, setOutboundAudioActive] = useState(false);
  const [inboundAudioActive, setInboundAudioActive] = useState(false);
  const [audioTransmissionWarning, setAudioTransmissionWarning] = useState(false);
  const [callQuality, setCallQuality] = useState<CallQualitySnapshot | null>(null);
  const [isCallQualityOpen, setIsCallQualityOpen] = useState(false);
  const [isRemoteVideoOn, setIsRemoteVideoOn] = useState(false);
  const [isParticipantVideoMenuOpen, setIsParticipantVideoMenuOpen] = useState(false);
  const [isParticipantMutedForMe, setIsParticipantMutedForMe] = useState(false);
  const [participantVolume, setParticipantVolume] = useState(1);
  const [isParticipantVideoPinned, setIsParticipantVideoPinned] = useState(false);
  const [isParticipantVideoHidden, setIsParticipantVideoHidden] = useState(false);
  const [participantVideoFit, setParticipantVideoFit] = useState<"cover" | "contain">("cover");
  const [isCallPanelMinimized, setIsCallPanelMinimized] = useState(false);
  const [isCallDeviceMenuOpen, setIsCallDeviceMenuOpen] = useState(false);
  const [isCallParticipantsMenuOpen, setIsCallParticipantsMenuOpen] = useState(false);
  const [isCallMoreMenuOpen, setIsCallMoreMenuOpen] = useState(false);
  const [callLayoutMode, setCallLayoutMode] = useState<CallLayoutMode>("standard");
  const [callPanelDock, setCallPanelDock] = useState<CallPanelDock>("top-right");
  const [participantVideoHeight, setParticipantVideoHeight] = useState(210);
  const [callPanelPosition, setCallPanelPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const userRef = useRef<CurrentUser | null>(null);
  const callRef = useRef<CallRecord | null>(null);
  const browserCallSessionIdRef = useRef("");
  const phaseRef = useRef<CallPhase>("idle");
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callChannelRef = useRef<RealtimeChannel | null>(null);
  const userChannelRef = useRef<RealtimeChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const participantVolumeRef = useRef(1);
  const participantMutedForMeRef = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const selfViewRef = useRef<HTMLDivElement | null>(null);
  const selfViewDragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const localCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const localCameraIntentRef = useRef(false);
  const localVideoSenderRef = useRef<RTCRtpSender | null>(null);
  const localVideoTransceiverRef = useRef<RTCRtpTransceiver | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const participantVideoRef = useRef<HTMLDivElement | null>(null);
  const participantLongPressTimerRef = useRef<number | null>(null);
  const remoteVideoStreamRef = useRef<MediaStream | null>(null);
  const queuedCandidatesRef = useRef<
    Array<{ generation: number; candidate: RTCIceCandidateInit }>
  >([]);
  const seenSignalsRef = useRef(new Set<string>());
  const negotiationGenerationRef = useRef(0);
  const signalingVersionRef = useRef(1);
  const signalSequenceRef = useRef(0);
  const pendingSignalsRef = useRef(new Map<string, PendingCallSignal>());
  const signalRetryIntervalRef = useRef<number | null>(null);
  const signalingRecoveryRef = useRef<() => void>(() => undefined);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const settingRemoteAnswerRef = useRef(false);
  const signalHandlerRef = useRef<(payload: unknown) => void>(() => undefined);
  const callPollRef = useRef<number | null>(null);
  const turnRefreshRef = useRef<number | null>(null);
  const turnCredentialLoaderRef = useRef<TurnCredentialLoader | null>(null);
  const reconnectionControllerRef = useRef<CallReconnectionController | null>(null);
  // This is a terminal connection diagnostic, not a recovery attempt. All ICE
  // restarts and retry timing are owned by reconnectionControllerRef.
  const connectionTimeoutRef = useRef<number | null>(null);
  const callStatsIntervalRef = useRef<number | null>(null);
  const callStatsBusyRef = useRef(false);
  const callMediaWatchdogRef = useRef<CallMediaWatchdog | null>(null);
  const identityRefreshRef = useRef<Promise<void> | null>(null);
  const identityRefreshQueuedRef = useRef(false);
  const activeCallsRequestRef = useRef<Promise<void> | null>(null);
  const callStatusPollBusyRef = useRef(false);
  const callHeartbeatRef = useRef<number | null>(null);
  const callHeartbeatBusyRef = useRef(false);
  const localCandidateTypesRef = useRef(new Set<string>());
  const remoteCandidateTypesRef = useRef(new Set<string>());
  const isTerminatingCallRef = useRef(false);
  const callAudioContextRef = useRef<AudioContext | null>(null);
  const callSoundIntervalRef = useRef<number | null>(null);
  const activeCallTonesRef = useRef(new Set<OscillatorNode>());
  const callPanelRef = useRef<HTMLElement | null>(null);
  const callPanelDragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const callLayoutLoadedRef = useRef(false);
  const microphoneMeterFrameRef = useRef<number | null>(null);
  const microphoneMeterContextRef = useRef<AudioContext | null>(null);
  const preCallSettingsLoadedRef = useRef(false);
  const previousAudioPacketsRef = useRef<{ sent: number | null; received: number | null }>({
    sent: null,
    received: null,
  });
  const previousVideoPacketsReceivedRef = useRef<number | null>(null);
  const lastMediaReceivedAtRef = useRef<number | null>(null);
  const outboundAudioStallsRef = useRef(0);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    callRef.current = call;
    if (call?.status === "accepted") signalingVersionRef.current = call.version;
  }, [call]);
  useEffect(() => {
    phaseRef.current = phase;
    reportRealtimeDiagnostics({ callStage: phase });
  }, [phase]);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const getCallSessionId = useCallback(() => {
    if (!browserCallSessionIdRef.current) {
      browserCallSessionIdRef.current = getBrowserCallSessionId();
    }
    return browserCallSessionIdRef.current;
  }, []);

  const claimCallOwnership = useCallback(async (callId: string) => {
    const sessionId = getCallSessionId();
    const response = await fetch(`/api/calls/${callId}/ownership`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [CALL_DEVICE_SESSION_HEADER]: sessionId,
      },
      body: JSON.stringify({ action: "claim" }),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const result = await response.json() as { owned?: boolean };
    if (!result.owned) return false;
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CALL_OWNERSHIP_CHANNEL);
      channel.postMessage({ callId, sessionId, type: "claimed" });
      channel.close();
    }
    return true;
  }, [getCallSessionId]);

  const refreshCallOwnership = useCallback(async (callId: string) => {
    const response = await fetch(`/api/calls/${callId}/ownership`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [CALL_DEVICE_SESSION_HEADER]: getCallSessionId(),
      },
      body: JSON.stringify({ action: "heartbeat" }),
      cache: "no-store",
    }).catch(() => null);
    if (response?.ok) return "owned" as const;
    if (response?.status === 409) return "not-owner" as const;
    return "unknown" as const;
  }, [getCallSessionId]);

  useEffect(() => {
    let cancelled = false;
    const stored = readStoredCallLayout(
      window.localStorage.getItem(CALL_LAYOUT_STORAGE_KEY)
    );
    queueMicrotask(() => {
      if (cancelled) return;
      if (stored) {
        setCallLayoutMode(stored.mode);
        setCallPanelDock(stored.dock);
        setCallPanelPosition(stored.position);
        setParticipantVideoHeight(stored.videoHeight);
      }
      callLayoutLoadedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!callLayoutLoadedRef.current) return;
    window.localStorage.setItem(
      CALL_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        dock: callPanelDock,
        mode: callLayoutMode,
        position: callPanelPosition,
        videoHeight: participantVideoHeight,
      })
    );
  }, [callLayoutMode, callPanelDock, callPanelPosition, participantVideoHeight]);

  useEffect(() => {
    const keepPanelVisible = () => {
      if (callPanelDock !== "free" || !callPanelPosition || !callPanelRef.current) return;
      const rect = callPanelRef.current.getBoundingClientRect();
      setCallPanelPosition((position) => position
        ? clampCallPanelPosition(
            position,
            { width: rect.width, height: rect.height },
            { width: window.innerWidth, height: window.innerHeight }
          )
        : null);
    };
    window.addEventListener("resize", keepPanelVisible);
    return () => window.removeEventListener("resize", keepPanelVisible);
  }, [callPanelDock, callPanelPosition]);

  const startMicrophoneMeter = useCallback((stream: MediaStream) => {
    if (microphoneMeterFrameRef.current !== null) {
      window.cancelAnimationFrame(microphoneMeterFrameRef.current);
    }
    const previousContext = microphoneMeterContextRef.current;
    if (previousContext && previousContext.state !== "closed") {
      void previousContext.close().catch(() => undefined);
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    microphoneMeterContextRef.current = context;
    const samples = new Uint8Array(analyser.fftSize);
    const measure = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += Math.abs(sample - 128);
      setMicrophoneLevel(Math.min(100, Math.round((sum / samples.length) * 4)));
      microphoneMeterFrameRef.current = window.requestAnimationFrame(measure);
    };
    measure();
  }, []);

  useEffect(() => {
    if (["precall-outgoing", "precall-incoming", "connected"].includes(phase)) return;
    if (microphoneMeterFrameRef.current !== null) {
      window.cancelAnimationFrame(microphoneMeterFrameRef.current);
      microphoneMeterFrameRef.current = null;
    }
    const context = microphoneMeterContextRef.current;
    microphoneMeterContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
  }, [phase]);

  useEffect(() => {
    const settings = parsePreCallSettings(
      window.localStorage.getItem(PRE_CALL_SETTINGS_KEY)
    );
    setSelectedMicrophoneId(settings.microphoneId);
    setSelectedCameraId(settings.cameraId);
    setSelectedSpeakerId(settings.speakerId);
    setIsMuted(settings.joinMuted);
    setJoinWithCamera(settings.joinWithCamera);
    setIsSpeakerSelectionSupported(
      Boolean(remoteAudioRef.current && supportsSpeakerSelection(remoteAudioRef.current))
    );
    preCallSettingsLoadedRef.current = true;
  }, []);

  useEffect(() => {
    if (!preCallSettingsLoadedRef.current) return;
    window.localStorage.setItem(
      PRE_CALL_SETTINGS_KEY,
      JSON.stringify({
        microphoneId: selectedMicrophoneId,
        cameraId: selectedCameraId,
        speakerId: selectedSpeakerId,
        joinMuted: isMuted,
        joinWithCamera,
      })
    );
  }, [isMuted, joinWithCamera, selectedCameraId, selectedMicrophoneId, selectedSpeakerId]);

  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (!audio || !selectedSpeakerId || !supportsSpeakerSelection(audio)) return;
    void audio.setSinkId(selectedSpeakerId).then(() => {
      setSpeakerDeviceState("ready");
    }).catch((error) => {
      setSpeakerDeviceState(classifyAudioDeviceError(error));
      setAudioDeviceMessage("The selected speaker is unavailable. Choose another output.");
      setPreCallMessage(
        t(
          "The selected speaker is unavailable. Choose another output.",
          "Wybrany głośnik jest niedostępny. Wybierz inne wyjście."
        )
      );
    });
  }, [selectedSpeakerId, t]);

  const stopCallPoll = useCallback(() => {
    if (callPollRef.current !== null) {
      window.clearInterval(callPollRef.current);
      callPollRef.current = null;
    }
  }, []);

  const ensureCallAudioContext = useCallback(async () => {
    if (!callAudioContextRef.current) {
      callAudioContextRef.current = new AudioContext();
    }
    const context = callAudioContextRef.current;
    if (context.state === "suspended") {
      await Promise.race([
        context.resume().catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 250)),
      ]);
    }
    if (context.state !== "running") {
      setIsCallToneBlocked(true);
      throw new Error("Call sound requires a browser interaction.");
    }
    setIsCallToneBlocked(false);
    return context;
  }, []);

  const stopCallSounds = useCallback(() => {
    if (callSoundIntervalRef.current !== null) {
      window.clearInterval(callSoundIntervalRef.current);
      callSoundIntervalRef.current = null;
    }
    activeCallTonesRef.current.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {
        // The tone may already have completed naturally.
      }
    });
    activeCallTonesRef.current.clear();
  }, []);

  const playCallTonePattern = useCallback(
    async (
      notes: Array<{ delay: number; frequency: number; duration: number }>,
      volume = 0.045
    ) => {
      const context = await ensureCallAudioContext();
      const startAt = context.currentTime + 0.015;
      notes.forEach(({ delay, frequency, duration }) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const noteStart = startAt + delay;
        const noteEnd = noteStart + duration;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(volume, noteStart + 0.025);
        gain.gain.setValueAtTime(volume, Math.max(noteStart + 0.03, noteEnd - 0.06));
        gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
        oscillator.connect(gain);
        gain.connect(context.destination);
        activeCallTonesRef.current.add(oscillator);
        oscillator.onended = () => {
          activeCallTonesRef.current.delete(oscillator);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(noteStart);
        oscillator.stop(noteEnd + 0.01);
      });
    },
    [ensureCallAudioContext]
  );

  const playIncomingCallTone = useCallback(
    () =>
      playCallTonePattern(
        [
          { delay: 0, frequency: 659.25, duration: 0.18 },
          { delay: 0.23, frequency: 783.99, duration: 0.22 },
        ],
        0.11
      ),
    [playCallTonePattern]
  );

  const playOutgoingCallTone = useCallback(
    () =>
      playCallTonePattern(
        [
          { delay: 0, frequency: 440, duration: 0.34 },
          { delay: 0.4, frequency: 523.25, duration: 0.34 },
        ],
        0.085
      ),
    [playCallTonePattern]
  );

  useEffect(() => {
    const unlockAudio = () => {
      void ensureCallAudioContext()
        .then(() => {
          if (phaseRef.current === "incoming") return playIncomingCallTone();
          if (phaseRef.current === "outgoing") return playOutgoingCallTone();
        })
        .catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [ensureCallAudioContext, playIncomingCallTone, playOutgoingCallTone]);

  useEffect(() => {
    stopCallSounds();

    const playIncomingRing = () =>
      void playIncomingCallTone().catch(() => undefined);
    const playOutgoingRing = () =>
      void playOutgoingCallTone().catch(() => undefined);

    if (phase === "incoming" || phase === "precall-incoming") {
      playIncomingRing();
      callSoundIntervalRef.current = window.setInterval(playIncomingRing, 2_700);
    } else if (phase === "outgoing") {
      playOutgoingRing();
      callSoundIntervalRef.current = window.setInterval(playOutgoingRing, 2_900);
    } else if (phase === "ended") {
      void playCallTonePattern([
        { delay: 0, frequency: 587.33, duration: 0.16 },
        { delay: 0.15, frequency: 440, duration: 0.18 },
        { delay: 0.32, frequency: 329.63, duration: 0.24 },
      ], 0.1).catch(() => undefined);
    }

    return stopCallSounds;
  }, [phase, playCallTonePattern, playIncomingCallTone, playOutgoingCallTone, stopCallSounds]);

  const clearCallResources = useCallback(() => {
    stopCallSounds();
    stopCallPoll();
    if (turnRefreshRef.current !== null) {
      window.clearTimeout(turnRefreshRef.current);
      turnRefreshRef.current = null;
    }
    reconnectionControllerRef.current?.dispose();
    reconnectionControllerRef.current = null;
    if (connectionTimeoutRef.current !== null) {
      window.clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    if (callStatsIntervalRef.current !== null) {
      window.clearInterval(callStatsIntervalRef.current);
      callStatsIntervalRef.current = null;
    }
    callMediaWatchdogRef.current?.reset();
    callMediaWatchdogRef.current = null;
    callStatsBusyRef.current = false;
    if (recoveryNoticeTimeoutRef.current !== null) {
      window.clearTimeout(recoveryNoticeTimeoutRef.current);
      recoveryNoticeTimeoutRef.current = null;
    }
    previousConnectionStateRef.current = "";
    setShowRecoveryRestored(false);
    setIsBrowserOffline(false);
    localConnectionStateRef.current = "";
    remoteConnectionStateRef.current = "";
    remoteConnectionVersionRef.current = 0;
    callStatusPollBusyRef.current = false;
    if (callHeartbeatRef.current !== null) {
      window.clearInterval(callHeartbeatRef.current);
      callHeartbeatRef.current = null;
    }
    callHeartbeatBusyRef.current = false;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    queuedCandidatesRef.current = [];
    seenSignalsRef.current.clear();
    negotiationGenerationRef.current = 0;
    signalingVersionRef.current = 1;
    signalSequenceRef.current = 0;
    pendingSignalsRef.current.clear();
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    settingRemoteAnswerRef.current = false;
    if (signalRetryIntervalRef.current !== null) {
      window.clearInterval(signalRetryIntervalRef.current);
      signalRetryIntervalRef.current = null;
    }
    localCandidateTypesRef.current.clear();
    remoteCandidateTypesRef.current.clear();
    if (microphoneMeterFrameRef.current !== null) {
      window.cancelAnimationFrame(microphoneMeterFrameRef.current);
      microphoneMeterFrameRef.current = null;
    }
    const meterContext = microphoneMeterContextRef.current;
    microphoneMeterContextRef.current = null;
    if (meterContext && meterContext.state !== "closed") {
      void meterContext.close().catch(() => undefined);
    }
    setMicrophoneLevel(0);
    previousAudioPacketsRef.current = { sent: null, received: null };
    previousVideoPacketsReceivedRef.current = null;
    lastMediaReceivedAtRef.current = null;
    outboundAudioStallsRef.current = 0;
    setOutboundAudioActive(false);
    setInboundAudioActive(false);
    setAudioTransmissionWarning(false);
    setCallQuality(null);
    setIsCallQualityOpen(false);
    setAudioDeviceMessage("");
    const cameraTrack = localCameraTrackRef.current;
    const streamTracks = localStreamRef.current?.getTracks() ?? [];
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (cameraTrack && !streamTracks.includes(cameraTrack)) cameraTrack.stop();
    localStreamRef.current = null;
    setIsMicrophoneReady(false);
    localCameraTrackRef.current = null;
    localCameraIntentRef.current = false;
    localVideoSenderRef.current = null;
    localVideoTransceiverRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    remoteVideoStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setIsCameraOn(false);
    setIsCameraStarting(false);
    setIsSwitchingCamera(false);
    setIsSelfViewVisible(true);
    setIsSelfViewMenuOpen(false);
    setSelfViewPosition(null);
    setCameraMessage("");
    setIsRemoteVideoOn(false);
    setIsParticipantVideoMenuOpen(false);
    setIsParticipantMutedForMe(false);
    setParticipantVolume(1);
    setIsParticipantVideoPinned(false);
    setIsParticipantVideoHidden(false);
    setParticipantVideoFit("cover");
    participantVolumeRef.current = 1;
    participantMutedForMeRef.current = false;
    if (participantLongPressTimerRef.current !== null) {
      window.clearTimeout(participantLongPressTimerRef.current);
      participantLongPressTimerRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.onloadedmetadata = null;
      remoteAudioRef.current.srcObject = null;
    }
    setIsRemoteAudioBlocked(false);
    const channel = callChannelRef.current;
    callChannelRef.current = null;
    if (channel) void getSupabaseBrowserClient().removeChannel(channel);
  }, [stopCallPoll, stopCallSounds]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CALL_OWNERSHIP_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const payload = event.data as { callId?: string; sessionId?: string; type?: string };
      if (
        payload.type !== "claimed" ||
        !payload.callId ||
        payload.sessionId === getCallSessionId() ||
        callRef.current?.id !== payload.callId
      ) return;
      callRef.current = null;
      dispatchBrowserCall({ type: "clear" });
      clearCallResources();
      setMessage(t("Call active on another device.", "Rozmowa jest aktywna na innym urządzeniu."));
      setPhase("error");
    };
    return () => channel.close();
  }, [clearCallResources, getCallSessionId, t]);

  useEffect(() => {
    const callId = call?.id;
    if (!callId || !["outgoing", "connecting", "connected"].includes(phase)) return;
    const sendOwnershipHeartbeat = async () => {
      const ownership = await refreshCallOwnership(callId);
      if (ownership !== "not-owner" || callRef.current?.id !== callId || !navigator.onLine) return;
      callRef.current = null;
      dispatchBrowserCall({ type: "clear" });
      clearCallResources();
      setMessage(t("Call active on another device.", "Rozmowa jest aktywna na innym urządzeniu."));
      setPhase("error");
    };
    void sendOwnershipHeartbeat();
    const interval = window.setInterval(() => void sendOwnershipHeartbeat(), 10_000);
    return () => window.clearInterval(interval);
  }, [call?.id, clearCallResources, phase, refreshCallOwnership, t]);

  const persistCallTermination = useCallback(
    async (activeCall: CallRecord, action: "cancel" | "end") => {
      const retryDelays = [0, 1_000, 3_000];
      for (const delay of retryDelays) {
        if (delay) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
        }
        try {
          if (action === "end") {
            await apiRequest(`/api/calls/${activeCall.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                action: "begin-ending",
                reason: "hangup_requested",
              }),
              keepalive: true,
            });
          }
          await apiRequest(`/api/calls/${activeCall.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              action,
              reason: action === "end" ? "local_hangup" : "caller_cancelled",
            }),
            keepalive: true,
          });
          return;
        } catch {
          // State transitions are idempotent, so a lost response can be retried.
        }
      }
    },
    []
  );

  const resetToIdle = useCallback(() => {
    // Close the UI and invalidate asynchronous call work first. Browser media
    // cleanup can occasionally throw on an already-closed track/connection;
    // that must never leave the terminal panel stuck on screen.
    phaseRef.current = "idle";
    callRef.current = null;
    isTerminatingCallRef.current = false;
    setPhase("idle");
    dispatchBrowserCall({ type: "clear" });
    setPeerName("");
    setCallBoardName("");
    setParticipants([]);
    setPendingParticipant(null);
    setMessage("");
    setCallDurationSeconds(0);
    setCallEndedBy(null);
    setPreCallMessage("");
    setIsPreparingMedia(false);
    setRemoteMuted(false);
    setConnectionState("");
    setIsCallPanelMinimized(false);
    try {
      clearCallResources();
    } catch (error) {
      console.warn("Scriboo call cleanup completed with an error", error);
    }
  }, [clearCallResources, setConnectionState]);

  useEffect(() => {
    if (phase !== "ended") return;

    const timeout = window.setTimeout(resetToIdle, 4_000);
    return () => window.clearTimeout(timeout);
  }, [phase, resetToIdle]);

  useEffect(() => {
    if (phase !== "connected") return;
    const startedAt = new Date(call?.acceptedAt ?? call?.stateChangedAt ?? Date.now()).getTime();
    const updateDuration = () => {
      setCallDurationSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)));
    };
    updateDuration();
    const interval = window.setInterval(updateDuration, 1_000);
    return () => window.clearInterval(interval);
  }, [call?.acceptedAt, call?.stateChangedAt, phase]);

  const heartbeatCallId = call?.id;
  const heartbeatCallStatus = call?.status;

  useEffect(() => {
    if (
      !heartbeatCallId ||
      !["accepted", "ending"].includes(heartbeatCallStatus ?? "") ||
      !["connecting", "connected"].includes(phase)
    ) {
      return;
    }

    let cancelled = false;
    const sendHeartbeat = async () => {
      if (cancelled || callHeartbeatBusyRef.current) return;
      callHeartbeatBusyRef.current = true;
      try {
        await apiRequest(`/api/calls/${heartbeatCallId}/heartbeat`, {
          method: "POST",
        });
      } catch {
        // Transient failures are tolerated. The server expires a participant
        // only after the heartbeat lease becomes stale.
      } finally {
        callHeartbeatBusyRef.current = false;
      }
    };

    void sendHeartbeat();
    callHeartbeatRef.current = window.setInterval(() => {
      void sendHeartbeat();
    }, 15_000);
    const sendAfterResume = () => void sendHeartbeat();
    window.addEventListener("focus", sendAfterResume);
    document.addEventListener("visibilitychange", sendAfterResume);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", sendAfterResume);
      document.removeEventListener("visibilitychange", sendAfterResume);
      if (callHeartbeatRef.current !== null) {
        window.clearInterval(callHeartbeatRef.current);
        callHeartbeatRef.current = null;
      }
      callHeartbeatBusyRef.current = false;
    };
  }, [heartbeatCallId, heartbeatCallStatus, phase]);

  useEffect(() => {
    const finishOnPageExit = () => {
      const activeCall = callRef.current;
      if (!activeCall || activeCall.status === "ended") return;
      void fetch(`/api/calls/${activeCall.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: ["accepted", "ending"].includes(activeCall.status)
            ? "end"
            : "cancel",
          reason: "page_closed",
        }),
        cache: "no-store",
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", finishOnPageExit);
    return () => window.removeEventListener("pagehide", finishOnPageExit);
  }, []);

  useEffect(() => {
    if (
      !call ||
      call.status !== "ringing" ||
      !["incoming", "precall-incoming", "outgoing", "connecting"].includes(phase)
    ) {
      return;
    }

    const expireCall = () => {
      if (userRef.current?.id === call.callerUserId) {
        void apiRequest<{ call: CallRecord }>(`/api/calls/${call.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "cancel", reason: "ring_timeout" }),
        }).catch(() => undefined);
      }
      clearCallResources();
      setMessage(t("No answer.", "Brak odpowiedzi."));
      setPhase("ended");
    };

    const remaining = new Date(call.ringExpiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      expireCall();
      return;
    }

    const timeout = window.setTimeout(expireCall, remaining);
    return () => window.clearTimeout(timeout);
  }, [call, clearCallResources, phase, t]);

  const getMicrophone = useCallback(async (
    microphoneId = selectedMicrophoneId,
    muted = isMuted
  ) => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        t(
          "This browser cannot access a microphone.",
          "Ta przeglądarka nie może uzyskać dostępu do mikrofonu."
        )
      );
    }

    try {
      const speechConstraints: MediaTrackConstraints = {
        ...(microphoneId ? { deviceId: { exact: microphoneId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: { ideal: 1 },
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: speechConstraints,
        video: false,
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
        track.onended = () => {
          setMicrophoneDeviceState("disconnected");
          setIsMicrophoneReady(false);
          setAudioDeviceMessage("The microphone disconnected. Connect it again or choose another microphone.");
        };
        try {
          track.contentHint = "speech";
        } catch {
          // Older browsers can expose contentHint as read-only. Audio still works.
        }
      });
      const activeMicrophoneId = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (activeMicrophoneId) setSelectedMicrophoneId(activeMicrophoneId);
      setMicrophonePermission("granted");
      setMicrophoneDeviceState("ready");
      setIsMicrophoneReady(true);
      localStreamRef.current = stream;
      return stream;
    } catch (error) {
      const deviceState = classifyAudioDeviceError(error);
      setMicrophoneDeviceState(deviceState);
      setMicrophonePermission(deviceState === "permission-denied" ? "denied" : "unavailable");
      throw new Error(
        t(
          "Microphone permission was denied or no microphone is available.",
          "Odmówiono dostępu do mikrofonu lub mikrofon nie jest dostępny."
        )
      );
    }
  }, [isMuted, selectedMicrophoneId, t]);

  const sendSignal = useCallback(async (
    data: CallSignalData,
    version = signalingVersionRef.current,
    generation = negotiationGenerationRef.current
  ) => {
    const activeCall = callRef.current;
    const activeUser = userRef.current;
    const channel = callChannelRef.current;
    if (!activeCall || !activeUser || !channel) return;

    signalSequenceRef.current += 1;
    const envelope: CallSignalEnvelope = {
      protocolVersion: CALL_SIGNAL_PROTOCOL_VERSION,
      callId: activeCall.id,
      senderUserId: activeUser.id,
      messageId: crypto.randomUUID(),
      sentAt: Date.now(),
      sequenceNumber: signalSequenceRef.current,
      signalingVersion: version,
      generation,
      data,
    };
    if (isDurableCallSignal(data)) {
      await apiRequest(`/api/calls/${activeCall.id}/signals`, {
        method: "POST",
        body: JSON.stringify(envelope),
      });
    }
    if (data.kind !== "ack") {
      pendingSignalsRef.current.set(
        envelope.messageId,
        createPendingCallSignal(envelope)
      );
    }
    reportRealtimeDiagnostics({ callStage: `sending ${data.kind}`, error: "" });
    await channel.send({ type: "broadcast", event: "signal", payload: envelope });
  }, []);

  const createAndSendOffer = useCallback(async (iceRestart = false) => {
    const connection = peerConnectionRef.current;
    if (!connection || connection.signalingState !== "stable") return;
    const videoTransceiver = localVideoTransceiverRef.current;
    if (videoTransceiver && videoTransceiver.direction !== "stopped") {
      videoTransceiver.direction = getLocalVideoDirection(
        localCameraIntentRef.current && Boolean(localCameraTrackRef.current)
      );
    }
    makingOfferRef.current = true;
    try {
      negotiationGenerationRef.current += 1;
      const offer = await connection.createOffer(
        iceRestart ? { iceRestart: true } : undefined
      );
      await connection.setLocalDescription(offer);
      await sendSignal({
        kind: "offer",
        description: await getGatheredLocalDescription(connection),
      });
    } finally {
      makingOfferRef.current = false;
    }
  }, [sendSignal]);

  const requestRenegotiation = useCallback(async () => {
    const activeCall = callRef.current;
    const activeUser = userRef.current;
    if (!activeCall || !activeUser || phaseRef.current !== "connected") return;
    if (activeUser.id === activeCall.callerUserId) {
      await createAndSendOffer();
    } else {
      await sendSignal({ kind: "renegotiate" });
    }
  }, [createAndSendOffer, sendSignal]);

  const resendPendingSignals = useCallback(() => {
    const channel = callChannelRef.current;
    const activeCallId = callRef.current?.id;
    if (!channel || !activeCallId) return;
    const now = Date.now();
    for (const [messageId, pending] of pendingSignalsRef.current) {
      if (
        pending.envelope.callId !== activeCallId ||
        pending.expiresAt <= now ||
        pending.attempts >= CALL_SIGNAL_MAX_ATTEMPTS
      ) {
        pendingSignalsRef.current.delete(messageId);
        continue;
      }
      if (!shouldRetryCallSignal(pending, now)) continue;
      pending.attempts += 1;
      pending.nextAttemptAt = now + callSignalRetryDelayMs(pending.attempts);
      void channel.send({
        type: "broadcast",
        event: "signal",
        payload: pending.envelope,
      }).catch(() => undefined);
    }
  }, []);

  const connectCallChannel = useCallback(async (activeCall: CallRecord) => {
    const existing = callChannelRef.current;
    if (existing) await getSupabaseBrowserClient().removeChannel(existing);

    const supabase = getSupabaseBrowserClient();
    await supabase.realtime.setAuth();
    const channel = supabase.channel(`call:${activeCall.id}`, {
      config: {
        private: true,
        broadcast: { ack: true },
        presence: { key: userRef.current?.id ?? "participant" },
      },
    });
    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      signalHandlerRef.current(payload);
    });
    callChannelRef.current = channel;
    let subscribedOnce = false;

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Realtime connection timed out.")),
          10_000
        );
        channel.subscribe((status, error) => {
          reportRealtimeDiagnostics({
            callStage: `signaling ${status.toLowerCase()}`,
            error: error?.message ?? "",
          });
          if (status === "SUBSCRIBED") {
            window.clearTimeout(timeout);
            if (subscribedOnce) {
              signalingRecoveryRef.current();
              for (const pending of pendingSignalsRef.current.values()) {
                pending.nextAttemptAt = 0;
              }
              resendPendingSignals();
            }
            subscribedOnce = true;
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            window.clearTimeout(timeout);
            reject(error ?? new Error("Realtime connection failed."));
          }
        });
      });
    } catch (error) {
      if (callChannelRef.current === channel) callChannelRef.current = null;
      void supabase.removeChannel(channel);
      throw error;
    }
    if (signalRetryIntervalRef.current !== null) {
      window.clearInterval(signalRetryIntervalRef.current);
    }
    signalRetryIntervalRef.current = window.setInterval(resendPendingSignals, 500);
  }, [resendPendingSignals]);

  const getFreshTurnCredentials = useCallback((callId: string) => {
    if (!turnCredentialLoaderRef.current) {
      turnCredentialLoaderRef.current = new TurnCredentialLoader((requestedCallId) =>
        apiRequest(`/api/calls/${requestedCallId}/turn-credentials`, { method: "POST" })
      );
    }
    return turnCredentialLoaderRef.current.loadFresh(callId);
  }, []);

  const refreshTurnConfiguration = useCallback(async (activeCall: CallRecord) => {
    const targetConnection = peerConnectionRef.current;
    if (!targetConnection) throw new Error("CALL_CONNECTION_NOT_READY");
    const data = await getFreshTurnCredentials(activeCall.id);
    if (
      callRef.current?.id !== activeCall.id ||
      callRef.current.status !== "accepted" ||
      peerConnectionRef.current !== targetConnection ||
      isTerminatingCallRef.current
    ) {
      throw new Error("STALE_TURN_CREDENTIAL_RESPONSE");
    }
    targetConnection.setConfiguration({ iceServers: data.iceServers });

    if (turnRefreshRef.current !== null) window.clearTimeout(turnRefreshRef.current);
    const refreshIn = Math.max(
      60_000,
      new Date(data.expiresAt).getTime() - Date.now() - 10 * 60 * 1000
    );
    turnRefreshRef.current = window.setTimeout(() => {
      refreshTurnConfiguration(activeCall).catch(() => {
        setMessage(
          t(
            "The network relay could not be refreshed.",
            "Nie udało się odświeżyć połączenia przekaźnikowego."
          )
        );
      });
    }, refreshIn);
    return data.iceServers;
  }, [getFreshTurnCredentials, t]);

  const reportParticipantState = useCallback(
    (state: ParticipantConnectionState, reason: string) => {
      const activeCall = callRef.current;
      if (!activeCall) return;
      participantStateReportRef.current = participantStateReportRef.current
        .catch(() => undefined)
        .then(async () => {
          const result = await apiRequest<{ participantState: CallParticipantState }>(
            `/api/calls/${activeCall.id}/participant-state`,
            {
              method: "PATCH",
              body: JSON.stringify({ connectionState: state, reason }),
              keepalive: true,
            }
          );
          if (
            callRef.current?.id === activeCall.id &&
            (state === "connected" || state === "reconnecting" || state === "failed")
          ) {
            await sendSignal({
              kind: "connection-state",
              state,
              reason,
              stateVersion: result.participantState.version,
            });
          }
        })
        .catch(() => undefined);
    },
    [sendSignal]
  );

  const applyRemoteConnectionState = useCallback(
    (participantState: Pick<CallParticipantState, "connectionState" | "version">) => {
      if (participantState.version <= remoteConnectionVersionRef.current) return;
      remoteConnectionVersionRef.current = participantState.version;
      remoteConnectionStateRef.current = participantState.connectionState;
      updateDisplayedConnectionState(
        localConnectionStateRef.current,
        remoteConnectionStateRef.current
      );
    },
    [updateDisplayedConnectionState]
  );

  const reportCallFailure = useCallback((reason: string) => {
    const activeCall = callRef.current;
    if (!activeCall || !["accepted", "ending"].includes(activeCall.status)) return;
    void apiRequest(`/api/calls/${activeCall.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "report-failed", reason }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const flushQueuedCandidates = useCallback(async () => {
    const connection = peerConnectionRef.current;
    if (!connection?.remoteDescription) return;
    const candidates = queuedCandidatesRef.current.splice(0);
    for (const queued of candidates) {
      if (queued.generation > negotiationGenerationRef.current) {
        queuedCandidatesRef.current.push(queued);
      } else if (queued.generation === negotiationGenerationRef.current) {
        await connection.addIceCandidate(queued.candidate).catch(() => undefined);
      }
    }
  }, []);

  const preparePeerConnection = useCallback(
    async (activeCall: CallRecord, callerCreatesOffer: boolean) => {
      if (peerConnectionRef.current) return peerConnectionRef.current;
      setConnectionState("connecting");
      reportParticipantState("connecting", "peer_connection_started");
      const stream = await getMicrophone();
      const credentials = await getFreshTurnCredentials(activeCall.id);
      if (
        callRef.current?.id !== activeCall.id ||
        callRef.current.status !== "accepted" ||
        isTerminatingCallRef.current
      ) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("STALE_TURN_CREDENTIAL_RESPONSE");
      }
      const connection = new RTCPeerConnection({ iceServers: credentials.iceServers });
      peerConnectionRef.current = connection;
      reportRealtimeDiagnostics({
        callStage: callerCreatesOffer ? "creating caller connection" : "creating recipient connection",
        signalingState: connection.signalingState,
        iceState: connection.iceConnectionState,
        connectionState: connection.connectionState,
        reconnectAttempts: reconnectionControllerRef.current?.attemptCount ?? 0,
        error: "",
      });
      stream.getAudioTracks().forEach((track) => connection.addTrack(track, stream));
      const previewCameraTrack = localCameraTrackRef.current;
      const videoTransceiver = previewCameraTrack
        ? connection.addTransceiver(previewCameraTrack, {
            direction: getLocalVideoDirection(true),
            streams: [new MediaStream([previewCameraTrack])],
          })
        : connection.addTransceiver("video", {
            direction: getLocalVideoDirection(false),
          });
      localVideoTransceiverRef.current = videoTransceiver;
      localVideoSenderRef.current = videoTransceiver.sender;

      connection.ontrack = (event) => {
        if (event.track.kind === "video") {
          const videoStream = event.streams[0] ?? new MediaStream([event.track]);
          remoteVideoStreamRef.current = videoStream;
          setIsRemoteVideoOn(!event.track.muted);
          event.track.onunmute = () => setIsRemoteVideoOn(true);
          event.track.onended = () => {
            if (remoteVideoStreamRef.current === videoStream) {
              remoteVideoStreamRef.current = null;
              setIsRemoteVideoOn(false);
              setIsParticipantVideoMenuOpen(false);
            }
          };
          return;
        }
        const audio = remoteAudioRef.current;
        if (!audio) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        audio.muted = participantMutedForMeRef.current;
        audio.volume = participantVolumeRef.current;
        const playRemoteAudio = () => {
          void audio
            .play()
            .then(() => setIsRemoteAudioBlocked(false))
            .catch(() => setIsRemoteAudioBlocked(true));
        };
        audio.onloadedmetadata = playRemoteAudio;
        event.track.onunmute = playRemoteAudio;
        playRemoteAudio();
      };
      connection.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateType = readCandidateType(event.candidate);
          if (candidateType) localCandidateTypesRef.current.add(candidateType);
          void sendSignal({
            kind: "ice-candidate",
            candidate: event.candidate.toJSON(),
          });
        }
      };
      reconnectionControllerRef.current?.dispose();
      const reconnectionController = new CallReconnectionController({
        canRecover: () => {
          const latestCall = callRef.current;
          return Boolean(
            latestCall &&
            !isTerminatingCallRef.current &&
            phaseRef.current !== "ended" &&
            userRef.current?.id === latestCall.callerUserId
          );
        },
        isConnected: () =>
          peerConnectionRef.current?.connectionState === "connected",
        restartConnection: async () => {
          const latestCall = callRef.current;
          const latestConnection = peerConnectionRef.current;
          if (!latestCall || !latestConnection) throw new Error("CALL_NOT_ACTIVE");
          await refreshTurnConfiguration(latestCall);
          latestConnection.restartIce();
          await createAndSendOffer(true);
        },
        onAttempt: (_reason, attempt) => {
          reportParticipantState("reconnecting", "ice_restart_started");
          reportRealtimeDiagnostics({ reconnectAttempts: attempt });
        },
        onStateChange: (state, _previousState, reason) => {
          reportRealtimeDiagnostics({
            callStage: `recovery ${state}`,
            error: state === "failed" ? reason : "",
          });
        },
        onExhausted: () => {
          reportParticipantState("failed", "ice_restart_exhausted");
          reportCallFailure("ice_restart_exhausted");
          setMessage(t("Connection lost.", "Połączenie zostało przerwane."));
        },
      });
      reconnectionControllerRef.current = reconnectionController;
      if (!navigator.onLine) reconnectionController.handleOffline();
      const handleConnectedTransport = () => {
        if (!reconnectionController.handleTransportState("connected")) return;
        reportParticipantState("connected", "ice_connected");
        if (connectionTimeoutRef.current !== null) {
          window.clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setPhase("connected");
        setMessage("");
      };
      connection.onconnectionstatechange = () => {
        if (isTerminatingCallRef.current || phaseRef.current === "ended") return;
        setConnectionState(toParticipantConnectionState(connection.connectionState));
        reportRealtimeDiagnostics({
          connectionState: connection.connectionState,
          signalingState: connection.signalingState,
          iceState: connection.iceConnectionState,
          reconnectAttempts: reconnectionControllerRef.current?.attemptCount ?? 0,
        });
        if (connection.connectionState === "connected") {
          handleConnectedTransport();
        } else if (connection.connectionState === "disconnected") {
          reportParticipantState("reconnecting", "ice_disconnected");
          reconnectionController.handleTransportState("disconnected");
        } else if (connection.connectionState === "failed") {
          reconnectionController.handleTransportState("failed");
        }
      };

      connection.oniceconnectionstatechange = () => {
        if (isTerminatingCallRef.current || phaseRef.current === "ended") return;
        setConnectionState(toParticipantConnectionState(connection.iceConnectionState));
        reportRealtimeDiagnostics({
          iceState: connection.iceConnectionState,
          connectionState: connection.connectionState,
        });
        // Some mobile browsers update ICE state before connectionState, or do
        // not reliably emit the latter after waking from suspension.
        if (
          connection.iceConnectionState === "connected" ||
          connection.iceConnectionState === "completed"
        ) {
          handleConnectedTransport();
        } else if (connection.iceConnectionState === "disconnected") {
          reportParticipantState("reconnecting", "ice_disconnected");
          reconnectionController.handleTransportState("disconnected");
        } else if (connection.iceConnectionState === "failed") {
          reconnectionController.handleTransportState("failed");
        }
      };

      connection.onsignalingstatechange = () => {
        reportRealtimeDiagnostics({ signalingState: connection.signalingState });
      };

      if (callStatsIntervalRef.current !== null) {
        window.clearInterval(callStatsIntervalRef.current);
      }
      callMediaWatchdogRef.current = new CallMediaWatchdog({
        stalledAfterMs: 10_000,
        onStalled: () => {
          if (isTerminatingCallRef.current || phaseRef.current === "ended") return;
          setConnectionState("reconnecting");
          reportParticipantState("reconnecting", "media_transport_stalled");
          reportRealtimeDiagnostics({
            callStage: "recovery interrupted",
            error: "media_transport_stalled",
          });
          reconnectionController.handleMediaStalled();
        },
        onRecovered: () => {
          if (isTerminatingCallRef.current || phaseRef.current === "ended") return;
          if (!reconnectionController.markConnected()) return;
          setConnectionState("connected");
          reportParticipantState("connected", "media_transport_recovered");
        },
      });
      const collectCallStats = async () => {
        const reports = await connection.getStats();
        let packetsSent = 0;
        let packetsReceived = 0;
        let audioPacketsLost = 0;
        let videoPacketsReceived = 0;
        let videoPacketsLost = 0;
        let roundTripTimeMs: number | null = null;
        let jitterMs: number | null = null;
        let availableBitrateKbps: number | null = null;
        let frameRate: number | null = null;
        let frameWidth: number | null = null;
        let frameHeight: number | null = null;
        let audioLevel: number | null = null;
        let frozenVideoSeconds: number | null = null;
        let route = "unknown";
        reports.forEach((report) => {
          const mediaKind = report.kind ?? report.mediaType;
          if (report.type === "outbound-rtp" && mediaKind === "audio") {
            packetsSent += Number(report.packetsSent) || 0;
          }
          if (report.type === "inbound-rtp" && mediaKind === "audio") {
            packetsReceived += Number(report.packetsReceived) || 0;
            audioPacketsLost += Number(report.packetsLost) || 0;
            if (Number.isFinite(Number(report.jitter))) {
              jitterMs = Math.max(jitterMs ?? 0, Number(report.jitter) * 1_000);
            }
            if (Number.isFinite(Number(report.audioLevel))) audioLevel = Number(report.audioLevel);
          }
          if (report.type === "inbound-rtp" && mediaKind === "video") {
            videoPacketsReceived += Number(report.packetsReceived) || 0;
            videoPacketsLost += Number(report.packetsLost) || 0;
            if (Number.isFinite(Number(report.framesPerSecond))) frameRate = Number(report.framesPerSecond);
            if (Number.isFinite(Number(report.frameWidth))) frameWidth = Number(report.frameWidth);
            if (Number.isFinite(Number(report.frameHeight))) frameHeight = Number(report.frameHeight);
            if (Number.isFinite(Number(report.totalFreezesDuration))) frozenVideoSeconds = Number(report.totalFreezesDuration);
          }
          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded" &&
            (report.nominated || report.selected)
          ) {
            const local = reports.get(report.localCandidateId);
            const remote = reports.get(report.remoteCandidateId);
            if (Number.isFinite(Number(report.currentRoundTripTime))) {
              roundTripTimeMs = Number(report.currentRoundTripTime) * 1_000;
            }
            const availableBitrate = Math.max(
              Number(report.availableIncomingBitrate) || 0,
              Number(report.availableOutgoingBitrate) || 0
            );
            if (availableBitrate > 0) availableBitrateKbps = availableBitrate / 1_000;
            route =
              local?.candidateType === "relay" || remote?.candidateType === "relay"
                ? "TURN relay"
                : `${local?.candidateType ?? "unknown"} → ${remote?.candidateType ?? "unknown"}`;
          }
        });
        const previous = previousAudioPacketsRef.current;
        const sentChanged = previous.sent !== null && packetsSent > previous.sent;
        const receivedChanged = previous.received !== null && packetsReceived > previous.received;
        const videoReceivedChanged = previousVideoPacketsReceivedRef.current !== null &&
          videoPacketsReceived > previousVideoPacketsReceivedRef.current;
        const sampledAt = Date.now();
        if (
          (previous.received === null && packetsReceived > 0) ||
          (previousVideoPacketsReceivedRef.current === null && videoPacketsReceived > 0) ||
          receivedChanged ||
          videoReceivedChanged
        ) lastMediaReceivedAtRef.current = sampledAt;
        setOutboundAudioActive(sentChanged && !isMutedRef.current);
        setInboundAudioActive(receivedChanged);
        outboundAudioStallsRef.current =
          !isMutedRef.current && previous.sent !== null && packetsSent <= previous.sent
            ? outboundAudioStallsRef.current + 1
            : 0;
        setAudioTransmissionWarning(
          audioPacketsAreStalled({
            previousPackets: previous.sent,
            currentPackets: packetsSent,
            consecutiveStalls: outboundAudioStallsRef.current,
            muted: isMutedRef.current,
          })
        );
        previousAudioPacketsRef.current = { sent: packetsSent, received: packetsReceived };
        previousVideoPacketsReceivedRef.current = videoPacketsReceived;
        const audioPacketTotal = packetsReceived + audioPacketsLost;
        const videoPacketTotal = videoPacketsReceived + videoPacketsLost;
        setCallQuality(withCallQualityRating({
          roundTripTimeMs,
          jitterMs,
          audioPacketLossPercent: audioPacketTotal > 0 ? (audioPacketsLost / audioPacketTotal) * 100 : null,
          videoPacketLossPercent: videoPacketTotal > 0 ? (videoPacketsLost / videoPacketTotal) * 100 : null,
          availableBitrateKbps,
          frameRate,
          frameWidth,
          frameHeight,
          audioLevel,
          frozenVideoSeconds,
          route,
          secondsSinceMediaReceived: lastMediaReceivedAtRef.current === null
            ? null
            : (sampledAt - lastMediaReceivedAtRef.current) / 1_000,
        }));
        reportRealtimeDiagnostics({
          audioPacketsSent: packetsSent,
          audioPacketsReceived: packetsReceived,
          route,
        });
        callMediaWatchdogRef.current?.observe({
          connected:
            connection.connectionState === "connected" ||
            connection.iceConnectionState === "connected" ||
            connection.iceConnectionState === "completed",
          packetsSent,
          packetsReceived,
        });
      };
      callStatsBusyRef.current = true;
      void collectCallStats()
        .catch(() => undefined)
        .finally(() => {
          callStatsBusyRef.current = false;
        });
      callStatsIntervalRef.current = window.setInterval(
        () => {
          if (callStatsBusyRef.current) return;
          callStatsBusyRef.current = true;
          void collectCallStats()
            .catch(() => undefined)
            .finally(() => {
              callStatsBusyRef.current = false;
            });
        },
        2_000
      );

      const refreshIn = Math.max(
        60_000,
        new Date(credentials.expiresAt).getTime() - Date.now() - 10 * 60 * 1000
      );
      turnRefreshRef.current = window.setTimeout(() => {
        refreshTurnConfiguration(activeCall).catch(() => undefined);
      }, refreshIn);

      if (callerCreatesOffer) {
        await createAndSendOffer();
      }

      reconnectionController.startInitialRecovery();

      if (connectionTimeoutRef.current === null) {
        connectionTimeoutRef.current = window.setTimeout(() => {
          void (async () => {
            const latestConnection = peerConnectionRef.current;
            const latestCall = callRef.current;
            if (
              !latestCall ||
              latestConnection?.connectionState === "connected" ||
              isTerminatingCallRef.current ||
              phaseRef.current === "ended"
            ) {
              return;
            }

            // A remote hang-up can reach the database at the same moment as the
            // connection diagnostic. Terminal call state must win that race.
            const refreshed = await apiRequest<{ call: CallRecord }>(
              `/api/calls/${latestCall.id}`
            ).catch(() => null);
            if (
              isTerminatingCallRef.current ||
              ["ended"].includes(phaseRef.current) ||
              peerConnectionRef.current?.connectionState === "connected"
            ) {
              return;
            }
            if (refreshed?.call.status === "ended") {
              isTerminatingCallRef.current = true;
              phaseRef.current = "ended";
              clearCallResources();
              setConnectionState("");
              setMessage(
                refreshed.call.outcome === "declined"
                  ? t("Call declined.", "Połączenie odrzucone.")
                  : refreshed.call.outcome === "missed"
                    ? t("No answer.", "Brak odpowiedzi.")
                    : refreshed.call.outcome === "unavailable"
                      ? t("The other person is unavailable.", "Druga osoba jest niedostępna.")
                      : refreshed.call.outcome === "failed"
                        ? t("The connection could not be established.", "Nie udało się nawiązać połączenia.")
                    : t("Call ended.", "Połączenie zakończone.")
              );
              setPhase("ended");
              return;
            }

            isTerminatingCallRef.current = true;
            void sendSignal({ kind: "ended" }).catch(() => undefined);
            void apiRequest(`/api/calls/${latestCall.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                action: "report-failed",
                reason: "connection_timeout",
              }),
              keepalive: true,
            }).catch(() => undefined);
            clearCallResources();
            setMessage(
              t(
                "We couldn't connect the call. Check your internet connection and try again.",
                "Nie udało się połączyć rozmowy. Sprawdź połączenie z internetem i spróbuj ponownie."
              )
            );
            setPhase("error");
          })();
        }, 25_000);
      }
      return connection;
    },
    [clearCallResources, createAndSendOffer, getFreshTurnCredentials, getMicrophone, refreshTurnConfiguration, reportCallFailure, reportParticipantState, sendSignal, setConnectionState, t]
  );

  const finishRemoteCall = useCallback(
    (text: string) => {
      if (phaseRef.current === "ended" || isTerminatingCallRef.current) return;
      isTerminatingCallRef.current = true;
      phaseRef.current = "ended";
      clearCallResources();
      setConnectionState("");
      setCallEndedBy(
        text === t("Call ended.", "Połączenie zakończone.") ||
        text === t("Call declined.", "Połączenie odrzucone.")
          ? "participant"
          : null
      );
      setMessage(text);
      setPhase("ended");
    },
    [clearCallResources, setConnectionState, t]
  );

  const handleSignal = useCallback(
    async (payload: unknown) => {
      if (!isCallSignalEnvelope(payload)) return;
      const activeCall = callRef.current;
      const activeUser = userRef.current;
      if (
        !activeCall ||
        !activeUser ||
        payload.callId !== activeCall.id ||
        payload.senderUserId === activeUser.id ||
        ![activeCall.callerUserId, activeCall.recipientUserId].includes(
          payload.senderUserId
        ) ||
        Math.abs(Date.now() - payload.sentAt) > 10 * 60 * 1000
      ) {
        return;
      }
      const signal = payload.data;
      if (signal.kind === "ack") {
        const pending = pendingSignalsRef.current.get(signal.acknowledgedMessageId);
        if (
          pending &&
          pending.envelope.sequenceNumber === signal.acknowledgedSequence &&
          pending.envelope.signalingVersion === payload.signalingVersion &&
          pending.envelope.generation === payload.generation
        ) {
          pendingSignalsRef.current.delete(signal.acknowledgedMessageId);
        }
        return;
      }
      const currentVersion = signalingVersionRef.current;
      if (
        (signal.kind === "accepted" && payload.signalingVersion < currentVersion) ||
        (signal.kind !== "accepted" && payload.signalingVersion !== currentVersion)
      ) return;
      void sendSignal(
        {
          kind: "ack",
          acknowledgedMessageId: payload.messageId,
          acknowledgedSequence: payload.sequenceNumber,
        },
        payload.signalingVersion,
        payload.generation
      ).catch(() => undefined);
      if (seenSignalsRef.current.has(payload.messageId)) return;
      seenSignalsRef.current.add(payload.messageId);
      if (seenSignalsRef.current.size > 500) {
        const oldestMessageId = seenSignalsRef.current.values().next().value;
        if (oldestMessageId) seenSignalsRef.current.delete(oldestMessageId);
      }

      if (
        signal.kind === "answer" &&
        payload.generation !== negotiationGenerationRef.current
      ) {
        return;
      }
      if (signal.kind === "offer") {
        if (payload.generation < negotiationGenerationRef.current) return;
        queuedCandidatesRef.current = queuedCandidatesRef.current.filter(
          (queued) => queued.generation >= payload.generation
        );
        negotiationGenerationRef.current = payload.generation;
      }
      reportRealtimeDiagnostics({ callStage: `received ${signal.kind}` });
      if (signal.kind === "accepted") {
        const authoritative = await apiRequest<{ call: CallRecord }>(
          `/api/calls/${activeCall.id}`
        ).catch(() => null);
        if (!authoritative || callRef.current?.id !== activeCall.id) return;
        dispatchBrowserCall({ type: "server-record", call: authoritative.call });
        callRef.current = authoritative.call;
        signalingVersionRef.current = authoritative.call.version;
        if (
          authoritative.call.status === "accepted" &&
          activeUser.id === activeCall.callerUserId
        ) {
          setPhase("connecting");
          await preparePeerConnection(authoritative.call, true);
        }
        return;
      }
      if (signal.kind === "declined") {
        const authoritative = await apiRequest<{ call: CallRecord }>(
          `/api/calls/${activeCall.id}`
        ).catch(() => null);
        if (
          authoritative?.call.status === "ended" &&
          authoritative.call.outcome === "declined" &&
          callRef.current?.id === activeCall.id
        ) {
          finishRemoteCall(t("Call declined.", "Połączenie odrzucone."));
        }
        return;
      }
      if (signal.kind === "ended") {
        const authoritative = await apiRequest<{ call: CallRecord }>(
          `/api/calls/${activeCall.id}`
        ).catch(() => null);
        if (
          authoritative?.call.status === "ended" &&
          callRef.current?.id === activeCall.id
        ) {
          finishRemoteCall(t("Call ended.", "Połączenie zakończone."));
        }
        return;
      }
      if (signal.kind === "mute") {
        setRemoteMuted(signal.muted);
        return;
      }
      if (signal.kind === "video-state") {
        // This signal describes only the other participant. Receiving it must
        // never request permission for or activate this browser's camera.
        if (!signal.enabled) {
          remoteVideoStreamRef.current = null;
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
          setIsRemoteVideoOn(false);
          setIsParticipantVideoMenuOpen(false);
        }
        return;
      }
      if (signal.kind === "connection-state") {
        applyRemoteConnectionState({
          connectionState: signal.state,
          version: signal.stateVersion,
        });
        return;
      }
      if (signal.kind === "renegotiate") {
        if (activeUser.id === activeCall.callerUserId) {
          await createAndSendOffer();
        }
        return;
      }
      if (signal.kind === "offer") {
        if (phaseRef.current !== "connected") setPhase("connecting");
        const connection = await preparePeerConnection(activeCall, false);
        const polite = activeUser.id === activeCall.recipientUserId;
        const collision = decideOfferCollision({
          makingOffer: makingOfferRef.current,
          settingRemoteAnswer: settingRemoteAnswerRef.current,
          signalingState: connection.signalingState,
          polite,
        });
        ignoreOfferRef.current = collision.ignore;
        if (ignoreOfferRef.current) return;
        if (collision.rollback) {
          await connection.setLocalDescription({ type: "rollback" });
        }
        await connection.setRemoteDescription(signal.description);
        const videoTransceiver = localVideoTransceiverRef.current;
        if (videoTransceiver && videoTransceiver.direction !== "stopped") {
          videoTransceiver.direction = getLocalVideoDirection(
            localCameraIntentRef.current && Boolean(localCameraTrackRef.current)
          );
        }
        await flushQueuedCandidates();
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await sendSignal({
          kind: "answer",
          description: await getGatheredLocalDescription(connection),
        });
        return;
      }
      if (signal.kind === "answer") {
        const connection = peerConnectionRef.current;
        if (!connection) return;
        settingRemoteAnswerRef.current = true;
        try {
          await connection.setRemoteDescription(signal.description);
          await flushQueuedCandidates();
          ignoreOfferRef.current = false;
        } finally {
          settingRemoteAnswerRef.current = false;
        }
        return;
      }
      if (signal.kind === "ice-candidate") {
        if (ignoreOfferRef.current) return;
        if (payload.generation < negotiationGenerationRef.current) return;
        const candidateType = readCandidateType(signal.candidate);
        if (candidateType) remoteCandidateTypesRef.current.add(candidateType);
        const connection = peerConnectionRef.current;
        if (
          payload.generation > negotiationGenerationRef.current ||
          !connection?.remoteDescription
        ) {
          queuedCandidatesRef.current.push({
            generation: payload.generation,
            candidate: signal.candidate,
          });
        } else {
          await connection.addIceCandidate(signal.candidate).catch(() => undefined);
        }
      }
    },
    [applyRemoteConnectionState, createAndSendOffer, finishRemoteCall, flushQueuedCandidates, preparePeerConnection, sendSignal, t]
  );
  signalHandlerRef.current = (payload) => {
    void handleSignal(payload).catch(() => {
      setMessage(t("Could not establish the audio connection.", "Nie udało się nawiązać połączenia audio."));
    });
  };

  const recoverSignaling = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall || activeCall.status !== "accepted") return;
    const version = signalingVersionRef.current;
    const [recovered, stateSnapshot] = await Promise.all([
      apiRequest<{ signals: CallSignalEnvelope[] }>(
        `/api/calls/${activeCall.id}/signals?version=${version}`
      ),
      apiRequest<{ participantStates: CallParticipantState[] }>(
        `/api/calls/${activeCall.id}/participant-state`
      ).catch(() => ({ participantStates: [] })),
    ]);
    if (callRef.current?.id !== activeCall.id) return;
    for (const envelope of recovered.signals) {
      signalHandlerRef.current(envelope);
    }
    const otherUserId =
      activeCall.callerUserId === userRef.current?.id
        ? activeCall.recipientUserId
        : activeCall.callerUserId;
    const remoteState = stateSnapshot.participantStates.find(
      (candidate) => candidate.userId === otherUserId
    );
    if (remoteState) applyRemoteConnectionState(remoteState);
  }, [applyRemoteConnectionState]);
  signalingRecoveryRef.current = () => {
    void recoverSignaling().catch(() => undefined);
  };

  useEffect(() => {
    const recoverAfterWake = (reason: "network-restored" | "app-resumed") => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      if (callRef.current?.status === "accepted") {
        if (reason === "network-restored") {
          reconnectionControllerRef.current?.handleOnline();
        } else {
          reconnectionControllerRef.current?.handleAppResumed();
        }
      }
      void getSupabaseBrowserClient().realtime.setAuth().catch(() => undefined);
      void recoverSignaling().catch(() => undefined);
      for (const pending of pendingSignalsRef.current.values()) {
        pending.nextAttemptAt = 0;
      }
      resendPendingSignals();
    };
    const handleOffline = () => {
      if (callRef.current?.status !== "accepted") return;
      setIsBrowserOffline(true);
      reconnectionControllerRef.current?.handleOffline();
      setConnectionState("reconnecting");
      reportParticipantState("reconnecting", "browser_offline");
      setMessage(
        t(
          "You're offline. The call will reconnect automatically.",
          "Brak połączenia z internetem. Rozmowa połączy się ponownie automatycznie."
        )
      );
    };
    const handleOnline = () => {
      setIsBrowserOffline(false);
      setMessage("");
      recoverAfterWake("network-restored");
    };
    const handleResume = () => recoverAfterWake("app-resumed");
    const handleVisibility = () => {
      if (document.visibilityState === "visible") handleResume();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("pageshow", handleResume);
    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pageshow", handleResume);
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [recoverSignaling, reportParticipantState, resendPendingSignals, setConnectionState, t]);

  const loadCallContext = useCallback(async (activeCall: CallRecord) => {
    const context = await apiRequest<{
      board: BoardContext;
      participants: CallParticipant[];
    }>(`/api/boards/${encodeURIComponent(activeCall.boardId)}/call-participants`);
    const otherUserId =
      activeCall.callerUserId === userRef.current?.id
        ? activeCall.recipientUserId
        : activeCall.callerUserId;
    return {
      boardName: context.board.name,
      peerName:
        context.participants.find((participant) => participant.userId === otherUserId)
          ?.name ?? t("Scriboo user", "Użytkownik Scriboo"),
    };
  }, [t]);

  const showIncomingCall = useCallback(
    async (incomingCall: CallRecord) => {
      if (phaseRef.current !== "idle" && callRef.current?.id !== incomingCall.id) return;
      const context = await loadCallContext(incomingCall);
      dispatchBrowserCall({ type: "select", call: incomingCall });
      callRef.current = incomingCall;
      setPeerName(context.peerName);
      setCallBoardName(context.boardName);
      setMessage("");
      setPhase("incoming");
    },
    [loadCallContext]
  );

  const loadActiveCalls = useCallback(async () => {
    if (!userRef.current) return;
    if (activeCallsRequestRef.current) return activeCallsRequestRef.current;
    const request = (async () => {
      const data = await apiRequest<{ calls: CallRecord[] }>("/api/calls");
      const current = callRef.current;
      if (current) {
        const refreshed = data.calls.find((candidate) => candidate.id === current.id);
        if (refreshed) {
          if (phaseRef.current === "incoming" && refreshed.status === "accepted") {
            const ownership = await refreshCallOwnership(refreshed.id);
            if (ownership === "not-owner") {
              callRef.current = null;
              dispatchBrowserCall({ type: "clear" });
              clearCallResources();
              setMessage(t("Call active on another device.", "Rozmowa jest aktywna na innym urządzeniu."));
              setPhase("error");
              return;
            }
          }
          dispatchBrowserCall({ type: "server-record", call: refreshed });
        } else if (["incoming", "outgoing"].includes(phaseRef.current)) {
          clearCallResources();
          setMessage(t("No answer.", "Brak odpowiedzi."));
          setPhase("ended");
        }
        return;
      }
      const incoming = data.calls.find(
        (candidate) =>
          candidate.recipientUserId === userRef.current?.id && candidate.status === "ringing"
      );
      if (incoming) {
        await showIncomingCall(incoming);
        return;
      }
      const activeElsewhere = data.calls.find((candidate) =>
        candidate.status === "accepted" &&
        [candidate.callerUserId, candidate.recipientUserId].includes(userRef.current?.id ?? "")
      );
      if (activeElsewhere) {
        const ownership = await refreshCallOwnership(activeElsewhere.id);
        if (ownership === "not-owner") {
          const context = await loadCallContext(activeElsewhere);
          setPeerName(context.peerName);
          setCallBoardName(context.boardName);
          setMessage(t("Call active on another device.", "Rozmowa jest aktywna na innym urządzeniu."));
          setPhase("error");
        }
      }
    })().finally(() => {
      activeCallsRequestRef.current = null;
    });
    activeCallsRequestRef.current = request;
    return request;
  }, [clearCallResources, loadCallContext, refreshCallOwnership, showIncomingCall, t]);

  const refreshIdentity = useCallback(async () => {
    if (identityRefreshRef.current) {
      identityRefreshQueuedRef.current = true;
      return identityRefreshRef.current;
    }
    const request = (async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) {
          setUser(null);
          return;
        }
        const data = (await response.json()) as { user?: CurrentUser | null };
        setUser(data.user?.id ? data.user : null);
      } catch {
        // A brief network interruption must not log the user out locally and
        // tear down calling while the authenticated session still exists.
      }
    })().finally(() => {
      identityRefreshRef.current = null;
      if (identityRefreshQueuedRef.current) {
        identityRefreshQueuedRef.current = false;
        window.setTimeout(() => void refreshIdentity(), 0);
      }
    });
    identityRefreshRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    void refreshIdentity();
    const handleAppAuthChange = () => {
      void refreshIdentity();
    };
    window.addEventListener("scriboo-auth-changed", handleAppAuthChange);
    const supabase = getSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void refreshIdentity(), 0);
    });
    return () => {
      window.removeEventListener("scriboo-auth-changed", handleAppAuthChange);
      data.subscription.unsubscribe();
    };
  }, [refreshIdentity]);

  useEffect(() => {
    const existing = userChannelRef.current;
    if (existing) {
      void getSupabaseBrowserClient().removeChannel(existing);
      userChannelRef.current = null;
    }
    if (!user) {
      resetToIdle();
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let notificationReady = false;

    void (async () => {
      // This is a private topic. Subscribe only after the authenticated
      // Realtime token is ready, otherwise slower devices can silently miss
      // the instant event and wait for the polling fallback.
      await supabase.realtime.setAuth();
      if (cancelled) return;

      const nextChannel = supabase.channel(`user:${user.id}:calls`, {
        config: { private: true, broadcast: { ack: true } },
      });
      channel = nextChannel;
      nextChannel.on("broadcast", { event: "incoming-call" }, () => {
        reportRealtimeDiagnostics({ incomingCallStatus: "event received" });
        void loadActiveCalls().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown API error";
          console.error("Scriboo could not load the incoming call", error);
          reportRealtimeDiagnostics({
            incomingCallStatus: "event load failed",
            error: `Incoming call load failed: ${message}`,
          });
        });
      });
      nextChannel.subscribe((status, subscriptionError) => {
        notificationReady = status === "SUBSCRIBED";
        const message = subscriptionError?.message?.trim();
        reportRealtimeDiagnostics({
          incomingCallStatus: status.toLowerCase(),
          error:
            status === "CHANNEL_ERROR" || status === "TIMED_OUT"
              ? `Incoming-call realtime ${status.toLowerCase()}${
                  message ? `: ${message}` : " (no server details returned)"
                }`
              : "",
        });
        if (subscriptionError) {
          console.error("Scriboo incoming-call subscription failed", {
            status,
            userId: user.id,
            error: subscriptionError,
          });
        }
      });
      userChannelRef.current = nextChannel;
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown setup error";
      console.error("Scriboo incoming-call realtime setup failed", error);
      reportRealtimeDiagnostics({
        incomingCallStatus: "setup error",
        error: `Incoming-call setup failed: ${message}`,
      });
    });

    let lastFallbackPollAt = 0;
    const pollForCalls = () => {
      const now = Date.now();
      // Realtime should deliver incoming calls instantly. Retain a slow safety
      // poll for missed events, and poll quickly only while the channel is down.
      if (notificationReady && phaseRef.current !== "incoming" && now - lastFallbackPollAt < 30_000) return;
      lastFallbackPollAt = now;
      void loadActiveCalls().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown API error";
        console.error("Scriboo incoming-call polling failed", error);
        reportRealtimeDiagnostics({
          incomingCallStatus: "poll failed",
          error: `Incoming-call polling failed: ${message}`,
        });
      });
    };
    pollForCalls();
    const poll = window.setInterval(
      pollForCalls,
      2_000
    );

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      if (userChannelRef.current === channel) userChannelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [loadActiveCalls, resetToIdle, user]);

  const startStatusPoll = useCallback(
    (activeCall: CallRecord) => {
      stopCallPoll();
      callPollRef.current = window.setInterval(() => {
        if (callStatusPollBusyRef.current) return;
        callStatusPollBusyRef.current = true;
        void apiRequest<{ call: CallRecord }>(`/api/calls/${activeCall.id}`)
          .then(async ({ call: refreshed }) => {
            if (
              callRef.current?.id !== activeCall.id ||
              phaseRef.current === "idle" ||
              phaseRef.current === "ended"
            ) {
              return;
            }
            if (refreshed.version < (callRef.current?.version ?? 0)) return;
            dispatchBrowserCall({ type: "server-record", call: refreshed });
            callRef.current = refreshed;
            if (refreshed.status === "accepted") {
              signalingVersionRef.current = refreshed.version;
            }
            if (
              refreshed.status === "ringing" &&
              new Date(refreshed.ringExpiresAt).getTime() <= Date.now()
            ) {
              if (userRef.current?.id === refreshed.callerUserId) {
                void apiRequest(`/api/calls/${refreshed.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ action: "cancel" }),
                }).catch(() => undefined);
              }
              finishRemoteCall(t("No answer.", "Brak odpowiedzi."));
            } else if (
              refreshed.status === "accepted" &&
              userRef.current?.id === refreshed.callerUserId &&
              !peerConnectionRef.current
            ) {
              setPhase("connecting");
              await preparePeerConnection(refreshed, true);
            } else if (
              refreshed.status === "ended" &&
              refreshed.outcome === "declined"
            ) {
              finishRemoteCall(t("Call declined.", "Połączenie odrzucone."));
            } else if (refreshed.status === "ended") {
              finishRemoteCall(
                refreshed.outcome === "missed"
                  ? t("No answer.", "Brak odpowiedzi.")
                  : refreshed.outcome === "unavailable"
                    ? t("The other person is unavailable.", "Druga osoba jest niedostępna.")
                    : refreshed.outcome === "failed"
                      ? t("The connection could not be established.", "Nie udało się nawiązać połączenia.")
                  : t("Call ended.", "Połączenie zakończone.")
              );
            }
          })
          .catch(() => undefined)
          .finally(() => {
            callStatusPollBusyRef.current = false;
          });
      }, 2_000);
    },
    [finishRemoteCall, preparePeerConnection, stopCallPoll, t]
  );

  const prepareOutgoingCall = useCallback((participant: CallParticipant) => {
    setPendingParticipant(participant);
    setParticipants([]);
    setPeerName(participant.name);
    setCallBoardName(board?.name ?? "");
    setPreCallMessage("");
    setPhase("precall-outgoing");
  }, [board]);

  const startCall = useCallback(
    async (participant: CallParticipant) => {
      if (!board || !user) return;
      if (!navigator.onLine) {
        setMessage(t("You are offline.", "Jesteś offline."));
        setPhase("error");
        return;
      }
      phaseRef.current = "connecting";
      setParticipants([]);
      setMessage("");
      setPeerName(participant.name);
      setCallBoardName(board.name);
      setPhase("connecting");
      let createdCall: CallRecord | null = null;
      try {
        // Start the authorized call request and microphone preparation in
        // parallel. This removes the usual getUserMedia startup delay before
        // the recipient receives the incoming-call notification.
        const microphoneResult = getMicrophone().then(
          () => ({ error: null as Error | null }),
          (error: unknown) => ({
            error:
              error instanceof Error
                ? error
                : new Error("Could not access the microphone."),
          })
        );
        const data = await apiRequest<{ call: CallRecord }>("/api/calls", {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            recipientUserId: participant.userId,
            clientRequestId: crypto.randomUUID(),
          }),
        });
        createdCall = data.call;
        if (!await claimCallOwnership(data.call.id)) {
          throw new Error(t("Call active on another device.", "Rozmowa jest aktywna na innym urządzeniu."));
        }
        dispatchBrowserCall({ type: "select", call: data.call });
        callRef.current = data.call;
        setPhase("outgoing");
        const microphone = await microphoneResult;
        if (microphone.error) throw microphone.error;
        await connectCallChannel(data.call);
        startStatusPoll(data.call);
      } catch (error) {
        if (createdCall) {
          void persistCallTermination(createdCall, "cancel");
        }
        clearCallResources();
        setMessage(error instanceof Error ? error.message : "Could not start the call.");
        setPhase("error");
      }
    },
    [board, claimCallOwnership, clearCallResources, connectCallChannel, getMicrophone, persistCallTermination, startStatusPoll, t, user]
  );

  const openCallChooser = useCallback(async () => {
    if (!board || !user || phaseRef.current !== "idle") return;
    phaseRef.current = "choosing";
    setMessage("");
    setPhase("choosing");
    try {
      const data = await apiRequest<{
        board: BoardContext;
        participants: CallParticipant[];
      }>(`/api/boards/${encodeURIComponent(board.id)}/call-participants`);
      if (data.participants.length === 0) {
        throw new Error(
          t(
            "Share this board with someone before starting a call.",
            "Udostępnij tę tablicę przed rozpoczęciem połączenia."
          )
        );
      }
      if (data.participants.length === 1) {
        prepareOutgoingCall(data.participants[0]);
        return;
      }
      setParticipants(data.participants);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare the call.");
      setPhase("error");
    }
  }, [board, prepareOutgoingCall, t, user]);

  const acceptCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return;
    if (phaseRef.current === "connecting" || phaseRef.current === "connected") return;
    phaseRef.current = "connecting";
    setMessage("");
    setPhase("connecting");
    setConnectionState("accepting");
    reportParticipantState("accepting", "accept_clicked");
    try {
      if (!await claimCallOwnership(activeCall.id)) {
        callRef.current = null;
        dispatchBrowserCall({ type: "clear" });
        clearCallResources();
        setMessage(t("Call active on another device.", "Rozmowa jest aktywna na innym urządzeniu."));
        setPhase("error");
        return;
      }
      await getMicrophone();
      await connectCallChannel(activeCall);
      const data = await apiRequest<{ call: CallRecord }>(
        `/api/calls/${activeCall.id}`,
        { method: "PATCH", body: JSON.stringify({ action: "accept" }) }
      );
      dispatchBrowserCall({ type: "server-record", call: data.call });
      callRef.current = data.call;
      signalingVersionRef.current = data.call.version;
      await preparePeerConnection(data.call, false);
      await sendSignal({ kind: "accepted" });
      startStatusPoll(data.call);
    } catch (error) {
      const latestCall = callRef.current;
      if (latestCall?.id === activeCall.id) {
        void apiRequest(`/api/calls/${activeCall.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            action:
              latestCall.status === "accepted"
                ? "report-failed"
                : "report-unavailable",
            reason:
              latestCall.status === "accepted"
                ? "connection_setup_failed"
                : "media_unavailable",
          }),
          keepalive: true,
        }).catch(() => undefined);
      }
      clearCallResources();
      setMessage(error instanceof Error ? error.message : "Could not accept the call.");
      setPhase("error");
    }
  }, [claimCallOwnership, clearCallResources, connectCallChannel, getMicrophone, preparePeerConnection, reportParticipantState, sendSignal, setConnectionState, startStatusPoll, t]);

  const declineCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return resetToIdle();
    // Close locally first. A slow API must never make Decline look frozen.
    resetToIdle();
    void apiRequest(`/api/calls/${activeCall.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "decline" }),
    }).catch(() => undefined);
  }, [resetToIdle]);

  const endCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return resetToIdle();
    if (phaseRef.current === "ended") return;
    const shouldNotifyRemote = !isTerminatingCallRef.current;
    isTerminatingCallRef.current = true;
    phaseRef.current = "ended";
    // Signal and persist in the background; local media and UI must close on
    // the click even when Realtime acknowledgement is delayed or unavailable.
    if (shouldNotifyRemote) {
      void sendSignal({ kind: "ended" }).catch(() => undefined);
      const action = activeCall.status === "accepted" ? "end" : "cancel";
      void persistCallTermination(activeCall, action);
    }
    try {
      clearCallResources();
    } catch (error) {
      console.warn("Scriboo call cleanup completed with an error", error);
    } finally {
      setConnectionState("");
      setCallEndedBy("you");
      setMessage(t("You ended the call.", "Zakończyłeś rozmowę."));
      setPhase("ended");
    }
  }, [clearCallResources, persistCallTermination, resetToIdle, sendSignal, setConnectionState, t]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
    void sendSignal({ kind: "mute", muted: nextMuted });
  }, [isMuted, sendSignal]);

  const switchMicrophone = useCallback(async (microphoneId: string) => {
    if (isSwitchingMicrophone || !navigator.mediaDevices?.getUserMedia) return;
    setIsSwitchingMicrophone(true);
    setAudioDeviceMessage("");
    let replacementStream: MediaStream | null = null;
    try {
      replacementStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(microphoneId ? { deviceId: { exact: microphoneId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
        },
        video: false,
      });
      const replacementTrack = replacementStream.getAudioTracks()[0];
      if (!replacementTrack) throw new DOMException("No microphone track", "NotFoundError");
      replacementTrack.enabled = !isMutedRef.current;
      try {
        replacementTrack.contentHint = "speech";
      } catch {
        // contentHint is optional.
      }
      replacementTrack.onended = () => {
        setMicrophoneDeviceState("disconnected");
        setIsMicrophoneReady(false);
        setAudioDeviceMessage("The microphone disconnected. Choose another microphone.");
      };

      const sender = peerConnectionRef.current
        ?.getSenders()
        .find((candidate) => candidate.track?.kind === "audio");
      if (sender) await sender.replaceTrack(replacementTrack);

      const currentStream = localStreamRef.current ?? new MediaStream();
      const previousTracks = currentStream.getAudioTracks();
      previousTracks.forEach((track) => {
        track.onended = null;
        currentStream.removeTrack(track);
      });
      currentStream.addTrack(replacementTrack);
      localStreamRef.current = currentStream;
      previousTracks.forEach((track) => track.stop());
      replacementStream = null;
      const activeDeviceId = replacementTrack.getSettings().deviceId || microphoneId;
      setSelectedMicrophoneId(activeDeviceId);
      setMicrophonePermission("granted");
      setMicrophoneDeviceState("ready");
      setIsMicrophoneReady(true);
      startMicrophoneMeter(currentStream);
      setAudioDeviceMessage(t("Microphone changed.", "Mikrofon został zmieniony."));
    } catch (error) {
      replacementStream?.getTracks().forEach((track) => track.stop());
      const state = classifyAudioDeviceError(error);
      setMicrophoneDeviceState(state);
      setAudioDeviceMessage(
        state === "permission-denied"
          ? t("Microphone permission is denied.", "Odmówiono dostępu do mikrofonu.")
          : state === "busy"
            ? t("That microphone is busy in another app.", "Ten mikrofon jest używany przez inną aplikację.")
            : state === "disconnected"
              ? t("That microphone is disconnected.", "Ten mikrofon jest odłączony.")
              : t("The microphone is unavailable.", "Mikrofon jest niedostępny.")
      );
    } finally {
      setIsSwitchingMicrophone(false);
    }
  }, [isSwitchingMicrophone, startMicrophoneMeter, t]);

  const testMicrophone = useCallback(async () => {
    if (isTestingMicrophone || !navigator.mediaDevices?.getUserMedia) return;
    setIsTestingMicrophone(true);
    setAudioDeviceMessage(t("Speak now. You should hear yourself for two seconds.", "Mów teraz. Przez dwie sekundy powinieneś słyszeć swój głos."));
    let testStream: MediaStream | null = null;
    const audio = new Audio();
    try {
      testStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : {}),
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      audio.srcObject = testStream;
      audio.volume = 0.65;
      if (selectedSpeakerId && supportsSpeakerSelection(audio)) {
        await audio.setSinkId(selectedSpeakerId);
      }
      await audio.play();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 2_000));
      setAudioDeviceMessage(t("Microphone and speaker test finished.", "Test mikrofonu i głośnika zakończony."));
    } catch (error) {
      setMicrophoneDeviceState(classifyAudioDeviceError(error));
      setAudioDeviceMessage(t("The microphone test could not run.", "Nie udało się uruchomić testu mikrofonu."));
    } finally {
      audio.pause();
      audio.srcObject = null;
      testStream?.getTracks().forEach((track) => track.stop());
      setIsTestingMicrophone(false);
    }
  }, [isTestingMicrophone, selectedMicrophoneId, selectedSpeakerId, t]);

  const stopCamera = useCallback(async () => {
    const cameraTrack = localCameraTrackRef.current;
    const videoSender = localVideoSenderRef.current;
    const videoTransceiver = localVideoTransceiverRef.current;
    localCameraTrackRef.current = null;
    localCameraIntentRef.current = false;
    if (cameraTrack) {
      cameraTrack.onended = null;
      localStreamRef.current?.removeTrack(cameraTrack);
      cameraTrack.stop();
    }
    if (videoSender) await videoSender.replaceTrack(null).catch(() => undefined);
    if (videoTransceiver && videoTransceiver.direction !== "stopped") {
      videoTransceiver.direction = getLocalVideoDirection(false);
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setIsCameraOn(false);
    setJoinWithCamera(false);
    setIsCameraStarting(false);
    setCameraMessage("");
    if (phaseRef.current === "connected") {
      await sendSignal({ kind: "video-state", enabled: false }).catch(() => undefined);
      await requestRenegotiation().catch(() => undefined);
    }
  }, [requestRenegotiation, sendSignal]);

  const refreshMediaDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `${t("Camera", "Kamera")} ${index + 1}`,
      }));
    setCameraDevices(cameras);
    const microphones = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `${t("Microphone", "Mikrofon")} ${index + 1}`,
      }));
    const speakers = devices
      .filter((device) => device.kind === "audiooutput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `${t("Speaker", "Głośnik")} ${index + 1}`,
      }));
    setSelectedCameraId((current) =>
      current && cameras.some((camera) => camera.deviceId === current)
        ? current
        : cameras[0]?.deviceId ?? ""
    );
    setMicrophoneDevices(microphones);
    setSpeakerDevices(speakers);
    setSelectedMicrophoneId((current) => {
      const choice = chooseAvailableDevice(current, microphones.map((device) => device.deviceId));
      if (choice.changed) {
        setMicrophoneDeviceState("disconnected");
        setAudioDeviceMessage(
          choice.deviceId
            ? t("The selected microphone disconnected. Switching to an available microphone.", "Wybrany mikrofon został odłączony. Przełączanie na dostępny mikrofon.")
            : t("No microphone is connected.", "Nie podłączono mikrofonu.")
        );
        if (choice.deviceId && phaseRef.current === "connected") {
          window.setTimeout(() => void switchMicrophone(choice.deviceId), 0);
        }
      } else if (microphones.length === 0) {
        setMicrophoneDeviceState("missing");
      }
      return choice.deviceId;
    });
    setSelectedSpeakerId((current) => {
      const choice = chooseAvailableDevice(current, speakers.map((device) => device.deviceId));
      if (choice.changed) {
        setSpeakerDeviceState(choice.deviceId ? "ready" : "missing");
        setAudioDeviceMessage(
          choice.deviceId
            ? t("The selected speaker disconnected. Using an available speaker.", "Wybrany głośnik został odłączony. Używany jest dostępny głośnik.")
            : t("No speaker output is available.", "Brak dostępnego wyjścia głośnikowego.")
        );
      } else if (speakers.length === 0 && isSpeakerSelectionSupported) {
        setSpeakerDeviceState("missing");
      } else {
        setSpeakerDeviceState("ready");
      }
      return choice.deviceId;
    });
  }, [isSpeakerSelectionSupported, switchMicrophone, t]);

  useEffect(() => {
    if (
      !["precall-outgoing", "precall-incoming", "connected"].includes(phase) ||
      !navigator.mediaDevices
    ) return;
    void refreshMediaDevices().catch(() => undefined);
    const handleDeviceChange = () => {
      void refreshMediaDevices().catch(() => undefined);
    };
    navigator.mediaDevices.addEventListener?.("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [phase, refreshMediaDevices]);

  useEffect(() => {
    if (!["precall-outgoing", "precall-incoming"].includes(phase)) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophonePermission("unavailable");
      setCameraPermission("unavailable");
      return;
    }
    const readPermission = async (
      name: "microphone" | "camera",
      update: (state: MediaPermissionState) => void
    ) => {
      if (!navigator.permissions?.query) return;
      try {
        const result = await navigator.permissions.query({ name } as PermissionDescriptor);
        update(result.state);
        result.onchange = () => update(result.state);
      } catch {
        // Safari does not expose camera/microphone through Permissions API.
      }
    };
    void readPermission("microphone", setMicrophonePermission);
    void readPermission("camera", setCameraPermission);
  }, [phase]);

  const enableMicrophone = useCallback(async (microphoneId = selectedMicrophoneId) => {
    if (isPreparingMedia) return;
    setIsPreparingMedia(true);
    setPreCallMessage("");
    try {
      localStreamRef.current?.getAudioTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setIsMicrophoneReady(false);
      const stream = await getMicrophone(microphoneId, isMuted);
      startMicrophoneMeter(stream);
      await refreshMediaDevices();
    } catch (error) {
      setPreCallMessage(
        error instanceof Error
          ? error.message
          : t("Microphone unavailable.", "Mikrofon niedostępny.")
      );
    } finally {
      setIsPreparingMedia(false);
    }
  }, [getMicrophone, isMuted, isPreparingMedia, refreshMediaDevices, selectedMicrophoneId, startMicrophoneMeter, t]);

  const testSpeaker = useCallback(async () => {
    if (isTestingSpeaker) return;
    setIsTestingSpeaker(true);
    setPreCallMessage("");
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const audio = new Audio();
    try {
      oscillator.frequency.value = 523.25;
      gain.gain.value = 0.12;
      oscillator.connect(gain).connect(destination);
      audio.srcObject = destination.stream;
      if (selectedSpeakerId && supportsSpeakerSelection(audio)) {
        await audio.setSinkId(selectedSpeakerId);
      }
      await audio.play();
      oscillator.start();
      oscillator.stop(context.currentTime + 0.45);
      await new Promise<void>((resolve) => {
        oscillator.onended = () => resolve();
      });
    } catch {
      setPreCallMessage(
        t(
          "The test sound could not play. Check browser sound permission and the selected speaker.",
          "Nie udało się odtworzyć dźwięku testowego. Sprawdź uprawnienia dźwięku i wybrany głośnik."
        )
      );
    } finally {
      audio.pause();
      audio.srcObject = null;
      destination.stream.getTracks().forEach((track) => track.stop());
      if (context.state !== "closed") await context.close().catch(() => undefined);
      setIsTestingSpeaker(false);
    }
  }, [isTestingSpeaker, selectedSpeakerId, t]);

  const startCamera = useCallback(async (cameraId = selectedCameraId) => {
    if (isCameraStarting || localCameraTrackRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage(
        t(
          "This browser cannot access a camera.",
          "Ta przeglądarka nie może uzyskać dostępu do kamery."
        )
      );
      return;
    }

    setIsCameraStarting(true);
    localCameraIntentRef.current = true;
    setCameraMessage("");
    let cameraStream: MediaStream | null = null;
    try {
      const openCamera = (deviceId?: string) =>
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: { ideal: "user" },
          },
        });

      try {
        cameraStream = await openCamera(cameraId || undefined);
      } catch (initialError) {
        if (
          initialError instanceof DOMException &&
          ["NotAllowedError", "SecurityError"].includes(initialError.name)
        ) {
          throw initialError;
        }

        // A laptop's default/integrated camera can be disabled or busy while a
        // USB webcam is healthy. Try every other detected camera before failing.
        const devices = await navigator.mediaDevices.enumerateDevices();
        const alternateCameraIds = devices
          .filter(
            (device) =>
              device.kind === "videoinput" &&
              Boolean(device.deviceId) &&
              device.deviceId !== cameraId
          )
          .map((device) => device.deviceId);
        for (const alternateCameraId of alternateCameraIds) {
          try {
            cameraStream = await openCamera(alternateCameraId);
            break;
          } catch {
            // Continue until all connected cameras have been tried.
          }
        }

        if (!cameraStream && cameraId) {
          try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: true,
            });
          } catch {
            // Report the original error below; it best describes the failure.
          }
        }
        if (!cameraStream) throw initialError;
      }
      const cameraTrack = cameraStream.getVideoTracks()[0];
      if (!cameraTrack) throw new Error("CAMERA_TRACK_MISSING");
      const activeCameraId = cameraTrack.getSettings().deviceId;
      if (activeCameraId) setSelectedCameraId(activeCameraId);
      void refreshMediaDevices().catch(() => undefined);
      try {
        cameraTrack.contentHint = "motion";
      } catch {
        // The camera remains usable when a browser does not support content hints.
      }
      cameraTrack.onended = () => {
        if (localCameraTrackRef.current === cameraTrack) {
          void stopCamera();
          setCameraMessage(
            t("The camera was disconnected.", "Kamera została odłączona.")
          );
        }
      };
      localCameraTrackRef.current = cameraTrack;
      const connection = peerConnectionRef.current;
      if (connection) {
        let videoTransceiver = localVideoTransceiverRef.current;
        if (!videoTransceiver || videoTransceiver.direction === "stopped") {
          videoTransceiver = connection.addTransceiver(cameraTrack, {
            direction: getLocalVideoDirection(true),
            streams: [cameraStream],
          });
          localVideoTransceiverRef.current = videoTransceiver;
          localVideoSenderRef.current = videoTransceiver.sender;
        } else {
          videoTransceiver.direction = getLocalVideoDirection(true);
          await videoTransceiver.sender.replaceTrack(cameraTrack);
          localVideoSenderRef.current = videoTransceiver.sender;
        }
      }
      setCameraPermission("granted");
      setIsCameraOn(true);
      setJoinWithCamera(true);
      try {
        if (connection) {
          await sendSignal({ kind: "video-state", enabled: true });
          await requestRenegotiation();
        }
      } catch {
        // The camera opened successfully. A transient signaling failure must
        // not be presented as a missing camera or tear down the local preview.
        setCameraMessage(
          t(
            "Your camera is on, but the video connection could not be updated. Try turning video off and on again.",
            "Kamera jest włączona, ale nie udało się zaktualizować połączenia wideo. Wyłącz i włącz wideo ponownie."
          )
        );
      }
    } catch (error) {
      const failedTrack = localCameraTrackRef.current;
      const failedSender = localVideoSenderRef.current;
      const failedTransceiver = localVideoTransceiverRef.current;
      localCameraTrackRef.current = null;
      localCameraIntentRef.current = false;
      if (failedSender) await failedSender.replaceTrack(null).catch(() => undefined);
      if (failedTransceiver && failedTransceiver.direction !== "stopped") {
        failedTransceiver.direction = getLocalVideoDirection(false);
      }
      if (failedTrack) {
        failedTrack.onended = null;
        localStreamRef.current?.removeTrack(failedTrack);
        failedTrack.stop();
      }
      cameraStream?.getTracks().forEach((track) => {
        if (track !== failedTrack) track.stop();
      });
      setIsCameraOn(false);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setCameraPermission("denied");
        setCameraMessage(
          t(
            "Camera access is blocked. Click the lock icon beside the address, allow Camera, then reload Scriboo.",
            "Dostęp do kamery jest zablokowany. Kliknij kłódkę obok adresu, zezwól na kamerę i odśwież Scriboo."
          )
        );
        return;
      }
      setCameraPermission("unavailable");
      if (error instanceof DOMException && error.name === "NotReadableError") {
        setCameraMessage(
          t(
            "Windows can see the camera, but it is busy or unavailable. Close Camera, Zoom, Teams, OBS, or Discord, reconnect the USB webcam, then try again.",
            "Windows widzi kamerę, ale jest ona zajęta lub niedostępna. Zamknij aplikacje Kamera, Zoom, Teams, OBS lub Discord, podłącz ponownie kamerę USB i spróbuj jeszcze raz."
          )
        );
        return;
      }
      if (
        error instanceof DOMException &&
        ["NotFoundError", "OverconstrainedError"].includes(error.name)
      ) {
        setCameraMessage(
          t(
            "The selected camera is no longer available. Reconnect it or choose another camera from the list.",
            "Wybrana kamera nie jest już dostępna. Podłącz ją ponownie lub wybierz inną kamerę z listy."
          )
        );
        return;
      }
      setCameraMessage(
        t(
          "Camera permission was denied or no camera is available. Audio is still connected.",
          "Odmówiono dostępu do kamery lub kamera nie jest dostępna. Dźwięk nadal jest połączony."
        )
      );
    } finally {
      setIsCameraStarting(false);
    }
  }, [isCameraStarting, refreshMediaDevices, requestRenegotiation, selectedCameraId, sendSignal, stopCamera, t]);

  const switchCamera = useCallback(async (cameraId: string) => {
    if (!cameraId || isSwitchingCamera || !navigator.mediaDevices?.getUserMedia) return;
    setSelectedCameraId(cameraId);
    setCameraMessage("");
    if (!localCameraTrackRef.current) {
      await startCamera(cameraId);
      return;
    }
    setIsSwitchingCamera(true);
    let replacementStream: MediaStream | null = null;
    try {
      replacementStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: cameraId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
      });
      const replacementTrack = replacementStream.getVideoTracks()[0];
      if (!replacementTrack) throw new DOMException("No camera track", "NotFoundError");
      const previousTrack = localCameraTrackRef.current;
      replacementTrack.onended = () => {
        if (localCameraTrackRef.current === replacementTrack) {
          void stopCamera();
          setCameraMessage(t("The camera was disconnected.", "Kamera została odłączona."));
        }
      };
      await localVideoSenderRef.current?.replaceTrack(replacementTrack);
      localCameraTrackRef.current = replacementTrack;
      previousTrack.onended = null;
      previousTrack.stop();
      replacementStream = null;
      const activeCameraId = replacementTrack.getSettings().deviceId || cameraId;
      setSelectedCameraId(activeCameraId);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = new MediaStream([replacementTrack]);
        await localVideoRef.current.play().catch(() => undefined);
      }
      await refreshMediaDevices().catch(() => undefined);
    } catch {
      replacementStream?.getTracks().forEach((track) => track.stop());
      setCameraMessage(
        t(
          "The selected camera could not be opened. Your current camera is still active.",
          "Nie udało się otworzyć wybranej kamery. Obecna kamera nadal działa."
        )
      );
    } finally {
      setIsSwitchingCamera(false);
    }
  }, [isSwitchingCamera, refreshMediaDevices, startCamera, stopCamera, t]);

  const prepareSelectedMedia = useCallback(async () => {
    if (joinWithCamera && !localCameraTrackRef.current) {
      await startCamera(selectedCameraId);
    }
    const stream = await getMicrophone(selectedMicrophoneId, isMuted);
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
  }, [getMicrophone, isMuted, joinWithCamera, selectedCameraId, selectedMicrophoneId, startCamera]);

  const joinOutgoingCall = useCallback(async () => {
    if (!pendingParticipant || isPreparingMedia) return;
    setIsPreparingMedia(true);
    setPreCallMessage("");
    try {
      await prepareSelectedMedia();
      await startCall(pendingParticipant);
    } catch (error) {
      setPreCallMessage(
        error instanceof Error ? error.message : t("Could not prepare the call.", "Nie udało się przygotować połączenia.")
      );
    } finally {
      setIsPreparingMedia(false);
    }
  }, [isPreparingMedia, pendingParticipant, prepareSelectedMedia, startCall, t]);

  const joinIncomingCall = useCallback(async () => {
    if (isPreparingMedia) return;
    setIsPreparingMedia(true);
    setPreCallMessage("");
    try {
      await prepareSelectedMedia();
      await acceptCall();
    } catch (error) {
      setPreCallMessage(
        error instanceof Error ? error.message : t("Could not prepare the call.", "Nie udało się przygotować połączenia.")
      );
    } finally {
      setIsPreparingMedia(false);
    }
  }, [acceptCall, isPreparingMedia, prepareSelectedMedia, t]);

  const openIncomingPreCall = useCallback(() => {
    setPreCallMessage("");
    setPhase("precall-incoming");
  }, []);

  useEffect(() => {
    if (!isCameraOn || !localCameraTrackRef.current || !localVideoRef.current) return;
    localVideoRef.current.srcObject = new MediaStream([localCameraTrackRef.current]);
    void localVideoRef.current.play().catch(() => undefined);
  }, [isCameraOn, isSelfViewVisible, phase]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!isRemoteVideoOn || !remoteVideoStreamRef.current || !video) return;
    video.srcObject = remoteVideoStreamRef.current;
    void video.play().catch(() => undefined);
  }, [isParticipantVideoHidden, isRemoteVideoOn]);

  useEffect(() => {
    return () => {
      clearCallResources();
      const audioContext = callAudioContextRef.current;
      callAudioContextRef.current = null;
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch(() => undefined);
      }
      const channel = userChannelRef.current;
      if (channel) void getSupabaseBrowserClient().removeChannel(channel);
    };
  }, [clearCallResources]);

  const contextValue = useMemo(
    () => ({ setBoardContext: setBoard }),
    []
  );

  const presentedCallMessage = presentCallMessage(message);
  const friendlyCallMessage = {
    busy: t("The participant is currently in another call.", "Uczestnik prowadzi obecnie inną rozmowę."),
    "rate-limited": t("Too many call attempts. Wait a moment, then try again.", "Zbyt wiele prób połączenia. Odczekaj chwilę i spróbuj ponownie."),
    "microphone-permission": t("Microphone access is blocked. Allow it in your browser settings.", "Dostęp do mikrofonu jest zablokowany. Zezwól na niego w ustawieniach przeglądarki."),
    "microphone-unavailable": t("The microphone is unavailable. Check the device and try again.", "Mikrofon jest niedostępny. Sprawdź urządzenie i spróbuj ponownie."),
    "participant-unavailable": t("The participant is unavailable right now.", "Uczestnik jest teraz niedostępny."),
    "connection-failed": t("The call couldn't connect. Check your connection and try again.", "Nie udało się połączyć rozmowy. Sprawdź internet i spróbuj ponownie."),
    offline: t("You're offline. Reconnect to the internet and try again.", "Brak połączenia z internetem. Połącz się ponownie i spróbuj jeszcze raz."),
    original: presentedCallMessage.cleaned,
  }[presentedCallMessage.kind];

  const statusKind = resolveCallStatusKind({
    phase,
    connectionState,
    remoteMuted,
    restored: showRecoveryRestored,
    hasMessage: Boolean(message),
    offline: isBrowserOffline,
  });
  const statusText = {
    message: friendlyCallMessage,
    incoming: t("Incoming call", "Połączenie przychodzące"),
    "precall-incoming": t(
      "Check your devices before answering",
      "Sprawdź urządzenia przed odebraniem"
    ),
    "precall-outgoing": t(
      "Check your devices before calling",
      "Sprawdź urządzenia przed połączeniem"
    ),
    ringing: t("Calling…", "Dzwonienie…"),
    connecting: t("Connecting…", "Łączenie…"),
    reconnecting: t(
      "Reconnecting… Keep this window open.",
      "Ponowne łączenie… Pozostaw to okno otwarte."
    ),
    offline: t(
      "You're offline. The call will reconnect automatically.",
      "Brak połączenia z internetem. Rozmowa połączy się ponownie automatycznie."
    ),
    restored: t("Connection restored", "Połączenie przywrócone"),
    connected: t("Connected", "Połączono"),
    "connected-muted": t(
      "Connected · participant muted",
      "Połączono · uczestnik wyciszony"
    ),
    failed: t(
      "Connection lost. Please end the call and try again.",
      "Połączenie zostało przerwane. Zakończ rozmowę i spróbuj ponownie."
    ),
    ending: t("Ending call…", "Kończenie rozmowy…"),
    idle: "",
  }[statusKind];
  const visibleStatusText = statusKind === "connected" &&
    (callQuality?.rating === "poor" || callQuality?.rating === "no-media")
      ? callQuality.rating === "no-media"
        ? t("No media received", "Brak odbieranych danych")
        : t("Poor connection", "Słabe połączenie")
      : statusText;
  const visibleQualityRating = connectionState === "reconnecting"
    ? "reconnecting"
    : callQuality?.rating ?? "good";
  const qualityPresentation = {
    good: { label: t("Good", "Dobra"), color: "#15803d", background: "#dcfce7" },
    fair: { label: t("Fair", "Średnia"), color: "#a16207", background: "#fef9c3" },
    poor: { label: t("Poor", "Słaba"), color: "#b91c1c", background: "#fee2e2" },
    "no-media": { label: t("No media", "Brak danych"), color: "#b91c1c", background: "#fee2e2" },
    reconnecting: { label: t("Reconnecting", "Ponowne łączenie"), color: "#a16207", background: "#fef3c7" },
  }[visibleQualityRating];
  const isRemoteSpeaking = phase === "connected" && !remoteMuted &&
    Boolean(callQuality?.audioLevel && callQuality.audioLevel > 0.03);
  const isPreCall = phase === "precall-outgoing" || phase === "precall-incoming";
  const permissionText = (state: MediaPermissionState) =>
    state === "granted"
      ? t("allowed", "dozwolone")
      : state === "denied"
        ? t("blocked", "zablokowane")
        : state === "unavailable"
          ? t("unavailable", "niedostępne")
          : t("not requested", "niepoproszone");

  const audioDeviceStateText = (state: AudioDeviceState) => {
    const labels: Record<AudioDeviceState, string> = {
      ready: t("ready", "gotowe"),
      "permission-denied": t("permission denied", "odmowa dostepu"),
      missing: t("missing", "brak"),
      disconnected: t("disconnected", "odlaczone"),
      busy: t("busy in another app", "uzywane przez inna aplikacje"),
      unavailable: t("unavailable", "niedostepne"),
    };
    return labels[state];
  };

  const selfViewDimensions = {
    small: { width: 180, height: 102 },
    medium: { width: 240, height: 135 },
    large: { width: 320, height: 180 },
  }[selfViewSize];
  const showCallVideo = callLayoutMode === "standard" || callLayoutMode === "video";
  const callPanelWidth = isPreCall
    ? 440
    : callLayoutMode === "video" || isParticipantVideoPinned
      ? 560
      : callLayoutMode === "whiteboard"
        ? 300
        : 350;
  const callPanelPlacementDock = callPanelDock === "free" && !callPanelPosition
    ? "top-right"
    : callPanelDock;
  const callPanelDockStyle: React.CSSProperties = callPanelDock === "free" && callPanelPosition
    ? { left: callPanelPosition.left, top: callPanelPosition.top }
    : {
        left: callPanelPlacementDock.endsWith("left")
          ? "max(12px, env(safe-area-inset-left))"
          : "auto",
        right: callPanelPlacementDock.endsWith("right")
          ? "max(12px, env(safe-area-inset-right))"
          : "auto",
        top: callPanelPlacementDock.startsWith("top")
          ? "max(58px, calc(env(safe-area-inset-top) + 50px))"
          : "auto",
        bottom: callPanelPlacementDock.startsWith("bottom")
          ? "max(12px, env(safe-area-inset-bottom))"
          : "auto",
      };

  const changeParticipantVolume = (volume: number) => {
    const normalized = normalizeParticipantVolume(volume);
    participantVolumeRef.current = normalized;
    setParticipantVolume(normalized);
    if (remoteAudioRef.current) remoteAudioRef.current.volume = normalized;
  };

  const toggleParticipantMuteForMe = () => {
    const muted = !participantMutedForMeRef.current;
    participantMutedForMeRef.current = muted;
    setIsParticipantMutedForMe(muted);
    if (remoteAudioRef.current) remoteAudioRef.current.muted = muted;
  };

  const openParticipantPictureInPicture = async () => {
    const video = remoteVideoRef.current;
    if (!video) return;
    try {
      if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) {
        throw new Error("PICTURE_IN_PICTURE_UNAVAILABLE");
      }
      await video.requestPictureInPicture();
      setIsParticipantVideoMenuOpen(false);
    } catch {
      setCameraMessage(
        t(
          "Picture-in-picture is not available in this browser.",
          "Obraz w obrazie nie jest dostępny w tej przeglądarce."
        )
      );
    }
  };

  const openParticipantFullscreen = async () => {
    try {
      if (!remoteVideoRef.current?.requestFullscreen) throw new Error("FULLSCREEN_UNAVAILABLE");
      await remoteVideoRef.current.requestFullscreen();
      setIsParticipantVideoMenuOpen(false);
    } catch {
      setCameraMessage(
        t(
          "Full screen is not available in this browser.",
          "Tryb pełnoekranowy nie jest dostępny w tej przeglądarce."
        )
      );
    }
  };

  const beginParticipantLongPress = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, input")) return;
    if (participantLongPressTimerRef.current !== null) {
      window.clearTimeout(participantLongPressTimerRef.current);
    }
    participantLongPressTimerRef.current = window.setTimeout(() => {
      participantLongPressTimerRef.current = null;
      setIsParticipantVideoMenuOpen(true);
    }, 550);
  };

  const cancelParticipantLongPress = () => {
    if (participantLongPressTimerRef.current !== null) {
      window.clearTimeout(participantLongPressTimerRef.current);
      participantLongPressTimerRef.current = null;
    }
  };

  const openSelfViewPictureInPicture = async () => {
    const video = localVideoRef.current;
    if (!video) return;
    try {
      if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) {
        throw new Error("PICTURE_IN_PICTURE_UNAVAILABLE");
      }
      await video.requestPictureInPicture();
      setIsSelfViewMenuOpen(false);
    } catch {
      setCameraMessage(
        t(
          "Picture-in-picture is not available in this browser.",
          "Obraz w obrazie nie jest dostępny w tej przeglądarce."
        )
      );
    }
  };

  const openSelfViewFullscreen = async () => {
    try {
      if (!localVideoRef.current?.requestFullscreen) throw new Error("FULLSCREEN_UNAVAILABLE");
      await localVideoRef.current.requestFullscreen();
      setIsSelfViewMenuOpen(false);
    } catch {
      setCameraMessage(
        t(
          "Full screen is not available in this browser.",
          "Tryb pełnoekranowy nie jest dostępny w tej przeglądarce."
        )
      );
    }
  };

  const beginSelfViewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, select, option")) return;
    const preview = selfViewRef.current;
    if (!preview) return;
    const rect = preview.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    selfViewDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setSelfViewPosition({ left: rect.left, top: rect.top });
  };

  const moveSelfView = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = selfViewDragRef.current;
    const preview = selfViewRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !preview) return;
    event.preventDefault();
    event.stopPropagation();
    const margin = 8;
    const rect = preview.getBoundingClientRect();
    setSelfViewPosition({
      left: Math.min(
        Math.max(margin, event.clientX - drag.offsetX),
        Math.max(margin, window.innerWidth - rect.width - margin)
      ),
      top: Math.min(
        Math.max(margin, event.clientY - drag.offsetY),
        Math.max(margin, window.innerHeight - rect.height - margin)
      ),
    });
  };

  const endSelfViewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    selfViewDragRef.current = null;
  };

  const beginCallPanelDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (
      (event.target as HTMLElement).closest(
        "button, input, select, option, label, video, audio, a"
      )
    ) return;
    const panel = callPanelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    callPanelDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setCallPanelDock("free");
    setCallPanelPosition({ left: rect.left, top: rect.top });
  };

  const moveCallPanel = (event: React.PointerEvent<HTMLElement>) => {
    const drag = callPanelDragRef.current;
    const panel = callPanelRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    setCallPanelPosition(clampCallPanelPosition(
      { left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY },
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight }
    ));
  };

  const endCallPanelDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    callPanelDragRef.current = null;
  };

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline hidden />

      {user && !board && phase === "idle" && (
        <button
          type="button"
          aria-label="Audio call is loading"
          disabled
          style={{
            position: "fixed",
            top: "7px",
            left: "112px",
            zIndex: 72,
            width: "34px",
            height: "34px",
            border: "none",
            borderRadius: "10px",
            background: "transparent",
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            opacity: 0.72,
            padding: 0,
          }}
        >
          <Phone size={16} />
        </button>
      )}

      {user && board && phase === "idle" && (
        <button
          type="button"
          aria-label={t(`Call from ${board.name}`, `Zadzwoń z tablicy ${board.name}`)}
          title={t("Start audio call", "Rozpocznij połączenie audio")}
          onClick={() => void openCallChooser()}
          style={{
            position: "fixed",
            top: "7px",
            left: "112px",
            zIndex: 72,
            width: "34px",
            height: "34px",
            borderRadius: "10px",
            border: "none",
            background: "transparent",
            backgroundColor: "transparent",
            backgroundImage: "none",
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            backdropFilter: "none",
            boxShadow: "none",
            outline: "none",
            appearance: "none",
            padding: 0,
            lineHeight: 0,
          }}
        >
          <Phone size={16} />
        </button>
      )}

      {phase === "choosing" && participants.length === 0 && (
        <div style={overlayStyle}>
          <div className="scriboo-call-dialog" style={dialogStyle} role="status" aria-live="polite">
            <LoaderCircle size={22} className="scriboo-call-spinner" />
            <span>{t("Preparing call…", "Przygotowywanie połączenia…")}</span>
          </div>
        </div>
      )}

      {phase === "choosing" && participants.length > 0 && (
        <div style={overlayStyle} role="presentation">
          <div className="scriboo-call-dialog" style={{ ...dialogStyle, width: "min(420px, calc(100vw - 32px))" }} role="dialog" aria-modal="true">
            <button type="button" aria-label={t("Close", "Zamknij")} onClick={resetToIdle} style={closeButtonStyle}>
              <X size={17} />
            </button>
            <strong style={{ fontSize: "18px" }}>{t("Who would you like to call?", "Do kogo chcesz zadzwonić?")}</strong>
            <span style={{ color: "#64748b", fontSize: "13px" }}>{board?.name}</span>
            <div style={{ display: "grid", gap: "8px", width: "100%" }}>
              {participants.map((participant) => (
                <button key={participant.userId} type="button" onClick={() => prepareOutgoingCall(participant)} style={participantButtonStyle}>
                  <Phone size={15} />
                  <span>{participant.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase !== "idle" && phase !== "choosing" && (
        <section
          ref={callPanelRef}
          className="scriboo-call-panel"
          aria-label={t("Audio call", "Połączenie audio")}
          onPointerDown={beginCallPanelDrag}
          onPointerMove={moveCallPanel}
          onPointerUp={endCallPanelDrag}
          onPointerCancel={endCallPanelDrag}
          style={{
            position: "fixed",
            ...callPanelDockStyle,
            zIndex: 210,
            width: `min(${callPanelWidth}px, calc(100vw - max(24px, env(safe-area-inset-left)) - max(24px, env(safe-area-inset-right))))`,
            maxHeight: "calc(100dvh - max(76px, env(safe-area-inset-top)) - max(12px, env(safe-area-inset-bottom)))",
            overflowY: isCallPanelMinimized ? "hidden" : "auto",
            padding: isCallPanelMinimized ? "10px 12px" : "18px",
            borderRadius: "20px",
            border: "1px solid rgba(203,213,225,0.88)",
            background: "rgba(255,255,255,0.97)",
            color: "#0f172a",
            boxShadow: "0 24px 70px rgba(15,23,42,0.24)",
            backdropFilter: "blur(18px)",
            display: "grid",
            gap: isCallPanelMinimized ? 0 : "13px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: isCallPanelMinimized ? "9px" : "12px",
              cursor: callPanelDragRef.current ? "grabbing" : "grab",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            <span aria-hidden="true" style={{ width: "42px", height: "42px", borderRadius: "999px", background: "linear-gradient(135deg,#7c3aed,#60a5fa)", color: "white", display: "grid", placeItems: "center", flex: "0 0 auto", fontSize: 14, fontWeight: 850 }}>
              {getParticipantInitials(peerName)}
            </span>
            <div style={{ minWidth: 0, display: "grid", gap: "3px", flex: 1 }}>
              <strong title={t("Verified Scriboo participant", "Zweryfikowany uczestnik Scriboo")} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{peerName || t("Audio call", "Połączenie audio")}</span>
                {peerName && <BadgeCheck size={15} color="#2563eb" aria-label={t("Verified participant", "Zweryfikowany uczestnik")} />}
              </strong>
              <span style={{ color: "#64748b", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {callBoardName}{(phase === "connected" || phase === "ended") ? ` · ${formatCallDuration(callDurationSeconds)}` : ""}
              </span>
            </div>
            <button
              type="button"
              aria-label={isCallPanelMinimized ? t("Restore call panel", "Przywróć panel połączenia") : t("Minimize call panel", "Zminimalizuj panel połączenia")}
              title={isCallPanelMinimized ? t("Restore", "Przywróć") : t("Minimize", "Zminimalizuj")}
              onClick={() => setIsCallPanelMinimized((isMinimized) => !isMinimized)}
              style={{
                width: "32px",
                height: "32px",
                flex: "0 0 auto",
                border: "1px solid #e2e8f0",
                borderRadius: "9px",
                background: "#f8fafc",
                color: "#475569",
                display: "grid",
                placeItems: "center",
                padding: 0,
                cursor: "pointer",
              }}
            >
              {isCallPanelMinimized ? <Maximize2 size={15} /> : <Minus size={16} />}
            </button>
          </div>
          {!isCallPanelMinimized && (
            <>
          <div aria-live="polite" style={{ color: phase === "error" || connectionState === "failed" ? "#b91c1c" : connectionState === "reconnecting" ? "#a16207" : "#475569", fontSize: "13px", fontWeight: 650 }}>
            {visibleStatusText}
          </div>
          {phase === "connected" && (
            <div aria-label={t("Participant presence", "Obecność uczestnika")} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <span style={presenceChipStyle}>{remoteMuted ? t("Muted", "Wyciszony") : isRemoteSpeaking ? t("Speaking", "Mówi") : t("Microphone on", "Mikrofon włączony")}</span>
              <span style={presenceChipStyle}>{isRemoteVideoOn ? t("Camera on", "Kamera włączona") : t("Camera off", "Kamera wyłączona")}</span>
              <span style={{ ...presenceChipStyle, color: connectionState === "reconnecting" ? "#a16207" : "#166534" }}>
                {connectionState === "reconnecting" ? t("Reconnecting", "Ponowne łączenie") : t("Connected", "Połączono")}
              </span>
            </div>
          )}
          {phase === "ended" && callEndedBy && (
            <div style={{ color: "#64748b", fontSize: 12 }}>
              {callEndedBy === "you" ? t("Ended by you", "Zakończone przez Ciebie") : t("Ended by participant", "Zakończone przez uczestnika")}
            </div>
          )}
          {phase === "connected" && callQuality && (
            <div style={{ display: "grid", gap: 7 }}>
              <button
                type="button"
                aria-expanded={isCallQualityOpen}
                aria-label={t("Show call quality details", "Pokaż szczegóły jakości rozmowy")}
                title={t("Call quality", "Jakość rozmowy")}
                onClick={() => setIsCallQualityOpen((open) => !open)}
                style={{
                  minHeight: 36,
                  padding: "0 11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  background: "#f8fafc",
                  color: "#334155",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 12,
                  fontWeight: 750,
                }}
              >
                <span>{t("Call quality", "Jakość rozmowy")}</span>
                <span style={{ padding: "3px 8px", borderRadius: 999, color: qualityPresentation.color, background: qualityPresentation.background }}>
                  {qualityPresentation.label}
                </span>
              </button>
              {isCallQualityOpen && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 12px", padding: 11, border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", color: "#475569", fontSize: 11 }}>
                  <span>{t("Round-trip time", "Opóźnienie")}: <strong>{callQuality.roundTripTimeMs === null ? "—" : `${Math.round(callQuality.roundTripTimeMs)} ms`}</strong></span>
                  <span>{t("Jitter", "Jitter")}: <strong>{callQuality.jitterMs === null ? "—" : `${Math.round(callQuality.jitterMs)} ms`}</strong></span>
                  <span>{t("Audio loss", "Straty audio")}: <strong>{callQuality.audioPacketLossPercent === null ? "—" : `${callQuality.audioPacketLossPercent.toFixed(1)}%`}</strong></span>
                  <span>{t("Video loss", "Straty wideo")}: <strong>{callQuality.videoPacketLossPercent === null ? "—" : `${callQuality.videoPacketLossPercent.toFixed(1)}%`}</strong></span>
                  <span>{t("Available bitrate", "Dostępne pasmo")}: <strong>{callQuality.availableBitrateKbps === null ? "—" : `${Math.round(callQuality.availableBitrateKbps)} kb/s`}</strong></span>
                  <span>{t("Video", "Wideo")}: <strong>{callQuality.frameWidth && callQuality.frameHeight ? `${callQuality.frameWidth}×${callQuality.frameHeight}` : "—"}{callQuality.frameRate === null ? "" : ` · ${Math.round(callQuality.frameRate)} fps`}</strong></span>
                  <span>{t("Audio level", "Poziom audio")}: <strong>{callQuality.audioLevel === null ? "—" : `${Math.round(callQuality.audioLevel * 100)}%`}</strong></span>
                  <span>{t("Frozen video", "Zatrzymane wideo")}: <strong>{callQuality.frozenVideoSeconds === null ? "—" : `${callQuality.frozenVideoSeconds.toFixed(1)} s`}</strong></span>
                  <span>{t("Connection route", "Trasa połączenia")}: <strong>{callQuality.route}</strong></span>
                  <span>{t("Last media", "Ostatnie dane")}: <strong>{callQuality.secondsSinceMediaReceived === null ? "—" : `${callQuality.secondsSinceMediaReceived.toFixed(1)} s`}</strong></span>
                </div>
              )}
            </div>
          )}
          {presentedCallMessage.technicalDetails && (phase === "error" || phase === "ended") && (
            <details style={{ color: "#64748b", fontSize: 11 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                {t("Technical details", "Szczegóły techniczne")}
              </summary>
              <code style={{ display: "block", marginTop: 6, padding: 8, borderRadius: 8, background: "#f1f5f9", overflowWrap: "anywhere" }}>
                {presentedCallMessage.technicalDetails}
              </code>
            </details>
          )}
          {phase === "connected" && isCallMoreMenuOpen && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ ...preCallLabelStyle, minWidth: 0 }}>
                {t("Layout", "Układ")}
                <select
                  aria-label={t("Call layout", "Układ rozmowy")}
                  value={callLayoutMode}
                  onChange={(event) => setCallLayoutMode(event.target.value as CallLayoutMode)}
                  style={preCallSelectStyle}
                >
                  <option value="standard">{t("Standard", "Standardowy")}</option>
                  <option value="video">{t("Video focus", "Widok wideo")}</option>
                  <option value="audio">{t("Audio only", "Tylko dźwięk")}</option>
                  <option value="whiteboard">{t("Whiteboard focus", "Widok tablicy")}</option>
                </select>
              </label>
              <label style={{ ...preCallLabelStyle, minWidth: 0 }}>
                {t("Panel position", "Pozycja panelu")}
                <select
                  aria-label={t("Dock call panel", "Przypnij panel rozmowy")}
                  value={callPanelDock}
                  onChange={(event) => {
                    const dock = event.target.value as CallPanelDock;
                    setCallPanelDock(dock);
                    if (dock !== "free") setCallPanelPosition(null);
                  }}
                  style={preCallSelectStyle}
                >
                  <option value="top-right">{t("Top right", "Prawy górny")}</option>
                  <option value="top-left">{t("Top left", "Lewy górny")}</option>
                  <option value="bottom-right">{t("Bottom right", "Prawy dolny")}</option>
                  <option value="bottom-left">{t("Bottom left", "Lewy dolny")}</option>
                  <option value="free">{t("Free position", "Dowolna pozycja")}</option>
                </select>
              </label>
              {showCallVideo && isRemoteVideoOn && (
                <label style={{ ...preCallLabelStyle, gridColumn: "1 / -1" }}>
                  {t("Video size", "Rozmiar wideo")} · {participantVideoHeight}px
                  <input
                    type="range"
                    min="140"
                    max="420"
                    step="10"
                    value={participantVideoHeight}
                    onChange={(event) => setParticipantVideoHeight(Number(event.target.value))}
                    style={{ width: "100%", accentColor: "#7c3aed" }}
                  />
                </label>
              )}
            </div>
          )}
          {isPreCall && (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={preCallFieldStyle}>
                <label htmlFor="precall-microphone" style={preCallLabelStyle}>
                  {t("Microphone", "Mikrofon")}
                </label>
                <select
                  id="precall-microphone"
                  value={selectedMicrophoneId}
                  onChange={(event) => {
                    const deviceId = event.target.value;
                    setSelectedMicrophoneId(deviceId);
                    if (isMicrophoneReady) void enableMicrophone(deviceId);
                  }}
                  style={preCallSelectStyle}
                >
                  {microphoneDevices.length === 0 && (
                    <option value="">{t("Default microphone", "Domyślny mikrofon")}</option>
                  )}
                  {microphoneDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void enableMicrophone()}
                  disabled={isPreparingMedia}
                  style={{ ...preCallSmallButtonStyle, color: isMicrophoneReady ? "#166534" : "#334155" }}
                >
                  <Mic size={15} />
                  {isMicrophoneReady
                    ? t("Microphone ready", "Mikrofon gotowy")
                    : t("Enable microphone", "Włącz mikrofon")}
                </button>
                <div
                  role="meter"
                  aria-label={t("Microphone activity", "Aktywność mikrofonu")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={microphoneLevel}
                  style={{ height: 8, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}
                >
                  <div style={{ width: `${microphoneLevel}%`, height: "100%", background: microphoneLevel > 3 ? "#22c55e" : "#94a3b8", transition: "width 80ms linear" }} />
                </div>
              </div>

              <div style={preCallFieldStyle}>
                <label htmlFor="precall-camera" style={preCallLabelStyle}>
                  {t("Camera", "Kamera")}
                </label>
                <select
                  id="precall-camera"
                  value={selectedCameraId}
                  disabled={isCameraOn || isCameraStarting}
                  onChange={(event) => setSelectedCameraId(event.target.value)}
                  style={preCallSelectStyle}
                >
                  {cameraDevices.length === 0 && (
                    <option value="">{t("Default camera", "Domyślna kamera")}</option>
                  )}
                  {cameraDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => isCameraOn ? void stopCamera() : void startCamera(selectedCameraId)}
                  disabled={isCameraStarting}
                  aria-pressed={isCameraOn}
                  style={{ ...preCallSmallButtonStyle, color: isCameraOn ? "#6d28d9" : "#334155" }}
                >
                  {isCameraOn ? <VideoOff size={15} /> : <Video size={15} />}
                  {isCameraStarting
                    ? t("Starting…", "Uruchamianie…")
                    : isCameraOn
                      ? t("Join without camera", "Dołącz bez kamery")
                      : t("Preview camera", "Podgląd kamery")}
                </button>
              </div>

              <div style={preCallFieldStyle}>
                <span style={preCallLabelStyle}>{t("Speaker", "Głośnik")}</span>
                {isSpeakerSelectionSupported && speakerDevices.length > 0 ? (
                  <select
                    aria-label={t("Speaker", "Głośnik")}
                    value={selectedSpeakerId}
                    onChange={(event) => setSelectedSpeakerId(event.target.value)}
                    style={preCallSelectStyle}
                  >
                    {speakerDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ color: "#64748b", fontSize: 12 }}>
                    {t("Using the browser's default speaker", "Używany jest domyślny głośnik przeglądarki")}
                  </span>
                )}
                <button type="button" onClick={() => void testSpeaker()} disabled={isTestingSpeaker} style={preCallSmallButtonStyle}>
                  {isTestingSpeaker ? t("Playing…", "Odtwarzanie…") : t("Test speaker", "Testuj głośnik")}
                </button>
              </div>

              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={isMuted}
                style={{ ...preCallSmallButtonStyle, justifyContent: "center", background: isMuted ? "#ede9fe" : "#ecfdf5" }}
              >
                {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
                {isMuted
                  ? t("Join muted", "Dołącz z wyciszeniem")
                  : t("Join unmuted", "Dołącz bez wyciszenia")}
              </button>

              <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.45 }}>
                {t("Microphone permission", "Uprawnienie mikrofonu")}: {permissionText(microphonePermission)} · {t("Camera permission", "Uprawnienie kamery")}: {permissionText(cameraPermission)}
              </div>
              {(microphonePermission === "denied" || cameraPermission === "denied") && (
                <div role="alert" style={{ color: "#b45309", fontSize: 12, lineHeight: 1.45 }}>
                  {t(
                    "Access is blocked. Click the lock icon beside the address, allow the device, then reload the page.",
                    "Dostęp jest zablokowany. Kliknij kłódkę obok adresu, zezwól na urządzenie i odśwież stronę."
                  )}
                </div>
              )}
              {(preCallMessage || cameraMessage) && (
                <div role="alert" style={{ color: "#b45309", fontSize: 12, lineHeight: 1.45 }}>
                  {preCallMessage || cameraMessage}
                </div>
              )}
            </div>
          )}
          {phase === "connected" && isCallDeviceMenuOpen && (
            <div style={{ display: "grid", gap: 10, padding: 12, border: "1px solid #e2e8f0", borderRadius: 12, background: "#f8fafc" }}>
              <strong style={{ fontSize: 13 }}>{t("Audio devices", "Urzadzenia audio")}</strong>
              <label style={preCallLabelStyle}>
                {t("Microphone", "Mikrofon")} · {audioDeviceStateText(microphoneDeviceState)}
                <select
                  value={selectedMicrophoneId}
                  disabled={isSwitchingMicrophone || microphoneDevices.length === 0}
                  onChange={(event) => void switchMicrophone(event.target.value)}
                  style={preCallSelectStyle}
                >
                  {microphoneDevices.length === 0 && <option value="">{t("No microphone", "Brak mikrofonu")}</option>}
                  {microphoneDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
                </select>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <span style={{ color: "#64748b", fontSize: 11 }}>{t("Input", "Wejscie")}</span>
                  <div role="meter" aria-label={t("Microphone input level", "Poziom mikrofonu")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={microphoneLevel} style={{ height: 7, marginTop: 4, borderRadius: 999, overflow: "hidden", background: "#e2e8f0" }}>
                    <div style={{ width: `${microphoneLevel}%`, height: "100%", background: microphoneLevel > 3 ? "#22c55e" : "#94a3b8" }} />
                  </div>
                </div>
                <div>
                  <span style={{ color: "#64748b", fontSize: 11 }}>{t("Transmission", "Transmisja")}</span>
                  <div style={{ marginTop: 4, color: outboundAudioActive ? "#166534" : "#64748b", fontSize: 11, fontWeight: 700 }}>
                    {isMuted ? t("Muted", "Wyciszony") : outboundAudioActive ? t("Sending audio", "Wysylanie audio") : t("Waiting for audio", "Oczekiwanie na audio")}
                  </div>
                </div>
              </div>
              {isSpeakerSelectionSupported && (
                <label style={preCallLabelStyle}>
                  {t("Speaker", "Glosnik")} · {audioDeviceStateText(speakerDeviceState)}
                  <select value={selectedSpeakerId} disabled={speakerDevices.length === 0} onChange={(event) => setSelectedSpeakerId(event.target.value)} style={preCallSelectStyle}>
                    {speakerDevices.length === 0 && <option value="">{t("No speaker", "Brak glosnika")}</option>}
                    {speakerDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
                  </select>
                </label>
              )}
              {!isSpeakerSelectionSupported && <span style={{ color: "#64748b", fontSize: 11 }}>{t("This browser controls the speaker through system settings.", "Ta przegladarka steruje glosnikiem przez ustawienia systemowe.")}</span>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button type="button" onClick={() => void testSpeaker()} disabled={isTestingSpeaker} style={preCallSmallButtonStyle}>
                  {isTestingSpeaker ? t("Playing...", "Odtwarzanie...") : t("Test speaker", "Testuj glosnik")}
                </button>
                <button type="button" onClick={() => void testMicrophone()} disabled={isTestingMicrophone} style={preCallSmallButtonStyle}>
                  {isTestingMicrophone ? t("Testing...", "Testowanie...") : t("Mic & echo test", "Test mikrofonu")}
                </button>
              </div>
              <div style={{ color: inboundAudioActive ? "#166534" : "#64748b", fontSize: 11, fontWeight: 650 }}>
                {inboundAudioActive ? t("Receiving participant audio", "Odbieranie dzwieku uczestnika") : t("No incoming audio activity yet", "Brak aktywnosci dzwieku przychodzacego")}
              </div>
              {audioTransmissionWarning && !isMuted && <div role="alert" style={{ color: "#b45309", fontSize: 12 }}>{t("Your microphone is on, but audio packets are not being sent. Try changing the microphone.", "Mikrofon jest wlaczony, ale dzwiek nie jest wysylany. Sprobuj zmienic mikrofon.")}</div>}
              {audioDeviceMessage && <div role="status" style={{ color: "#b45309", fontSize: 12 }}>{audioDeviceMessage}</div>}
            </div>
          )}
          {phase === "connected" && isCallParticipantsMenuOpen && (
            <label
              style={{
                display: "grid",
                gap: "8px",
                padding: "12px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
            >
              <span style={{ color: "#0f172a", fontSize: 13, fontWeight: 800 }}>
                {peerName || t("Participant", "Uczestnik")} · {t("Connected", "Połączono")}
              </span>
              <span
                style={{
                  color: "#475569",
                  fontSize: "13px",
                  fontWeight: 650,
                }}
              >
                {t("Call volume", "Głośność rozmowy")}
              </span>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={participantVolume}
                aria-label={t("Call volume", "Głośność rozmowy")}
                onChange={(event) => {
                  changeParticipantVolume(Number(event.target.value));
                }}
                style={{
                  width: "100%",
                  accentColor: "#7c3aed",
                  cursor: "pointer",
                }}
              />
            </label>
          )}
          {isCallToneBlocked && (phase === "incoming" || phase === "precall-incoming" || phase === "outgoing") && (
            <button
              type="button"
              onClick={() => {
                const playTone =
                  phase === "incoming" || phase === "precall-incoming"
                    ? playIncomingCallTone
                    : playOutgoingCallTone;
                void playTone().catch(() => undefined);
              }}
              style={{
                ...callActionStyle,
                minHeight: "38px",
                background: "#ede9fe",
                color: "#6d28d9",
              }}
            >
              {t("Enable call sound", "Włącz dźwięk połączenia")}
            </button>
          )}

          {phase === "connected" && isRemoteAudioBlocked && (
            <button
              type="button"
              onClick={() => {
                const audio = remoteAudioRef.current;
                if (!audio) return;
                void audio
                  .play()
                  .then(() => setIsRemoteAudioBlocked(false))
                  .catch(() => setIsRemoteAudioBlocked(true));
              }}
              style={{
                ...callActionStyle,
                background: "#ede9fe",
                color: "#6d28d9",
              }}
            >
              <Phone size={17} /> {t("Play audio", "Włącz dźwięk")}
            </button>
          )}

          {phase === "connected" && showCallVideo && isRemoteVideoOn && !isParticipantVideoHidden && (
            <div
              ref={participantVideoRef}
              tabIndex={0}
              aria-label={t("Participant video and options", "Wideo uczestnika i opcje")}
              onContextMenu={(event) => {
                event.preventDefault();
                setIsParticipantVideoMenuOpen(true);
              }}
              onKeyDown={(event) => {
                if (shouldOpenParticipantMenuFromKey(event.key, event.shiftKey)) {
                  event.preventDefault();
                  setIsParticipantVideoMenuOpen(true);
                }
              }}
              onPointerDown={beginParticipantLongPress}
              onPointerUp={cancelParticipantLongPress}
              onPointerCancel={cancelParticipantLongPress}
              onPointerMove={cancelParticipantLongPress}
              style={{
                position: "relative",
                overflow: "visible",
                height: `${participantVideoHeight}px`,
                minHeight: "140px",
                maxHeight: "min(420px, calc(100dvh - 190px))",
                borderRadius: "14px",
                background: "#0f172a",
                outline: isParticipantVideoPinned ? "2px solid #7c3aed" : "none",
              }}
            >
              <video
                ref={remoteVideoRef}
                autoPlay
                muted
                playsInline
                aria-label={t("Participant video", "Wideo uczestnika")}
                style={{ width: "100%", height: "100%", display: "block", objectFit: participantVideoFit, borderRadius: "inherit" }}
              />
              <span
                style={{
                  position: "absolute",
                  left: "9px",
                  bottom: "8px",
                  padding: "4px 8px",
                  borderRadius: "999px",
                  background: "rgba(15,23,42,0.68)",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: 700,
                  pointerEvents: "none",
                }}
              >
                {peerName || t("Participant", "Uczestnik")}
              </span>
              <button
                type="button"
                aria-label={t("Participant options", "Opcje uczestnika")}
                aria-expanded={isParticipantVideoMenuOpen}
                onClick={() => setIsParticipantVideoMenuOpen((open) => !open)}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 32,
                  height: 32,
                  border: "1px solid rgba(255,255,255,0.35)",
                  borderRadius: 9,
                  background: "rgba(15,23,42,0.72)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 20,
                  lineHeight: 1,
                }}
              >
                ⋮
              </button>
              {isParticipantVideoMenuOpen && (
                <div
                  role="menu"
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{
                    position: "absolute",
                    top: 46,
                    right: 8,
                    zIndex: 3,
                    width: 220,
                    padding: 8,
                    display: "grid",
                    gap: 5,
                    border: "1px solid #dbe3ef",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.98)",
                    color: "#172036",
                    boxShadow: "0 14px 35px rgba(15,23,42,0.26)",
                  }}
                >
                  <label style={{ display: "grid", gap: 5, padding: "5px 8px", fontSize: 11, fontWeight: 700 }}>
                    {t("Participant volume", "Głośność uczestnika")} · {Math.round(participantVolume * 100)}%
                    <input type="range" min="0" max="1" step="0.05" value={participantVolume} onChange={(event) => changeParticipantVolume(Number(event.target.value))} style={{ width: "100%", accentColor: "#7c3aed" }} />
                  </label>
                  <button type="button" role="menuitem" onClick={toggleParticipantMuteForMe} style={selfViewMenuButtonStyle}>
                    {isParticipantMutedForMe ? t("Unmute for me", "Włącz dźwięk dla mnie") : t("Mute for me", "Wycisz dla mnie")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => setIsParticipantVideoPinned((pinned) => !pinned)} style={selfViewMenuButtonStyle}>
                    {isParticipantVideoPinned ? t("Unpin video", "Odepnij wideo") : t("Pin video", "Przypnij wideo")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setIsParticipantVideoHidden(true); setIsParticipantVideoMenuOpen(false); }} style={selfViewMenuButtonStyle}>
                    {t("Hide video for me", "Ukryj wideo dla mnie")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => setParticipantVideoFit(toggleVideoFit)} style={selfViewMenuButtonStyle}>
                    {participantVideoFit === "cover" ? t("Fit entire video", "Dopasuj cały obraz") : t("Fill frame", "Wypełnij kadr")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => void openParticipantPictureInPicture()} style={selfViewMenuButtonStyle}>
                    {t("Picture in picture", "Obraz w obrazie")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => void openParticipantFullscreen()} style={selfViewMenuButtonStyle}>
                    {t("Full screen", "Pełny ekran")}
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === "connected" && showCallVideo && isRemoteVideoOn && isParticipantVideoHidden && (
            <button
              type="button"
              onClick={() => setIsParticipantVideoHidden(false)}
              style={{ ...preCallSmallButtonStyle, justifyContent: "center" }}
            >
              {t("Show participant video", "Pokaż wideo uczestnika")}
            </button>
          )}

          {isPreCall && isCameraOn && (
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                aspectRatio: "16 / 9",
                borderRadius: "14px",
                background: "#0f172a",
              }}
            >
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                aria-label={t("Your camera preview", "Podgląd Twojej kamery")}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  objectFit: selfViewFit,
                  transform: isSelfViewMirrored ? "scaleX(-1)" : "none",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: "9px",
                  bottom: "8px",
                  padding: "4px 8px",
                  borderRadius: "999px",
                  background: "rgba(15,23,42,0.68)",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: 700,
                }}
              >
                {t("Local preview only", "Tylko lokalny podgląd")}
              </span>
            </div>
          )}

          {phase === "connected" && cameraMessage && (
            <div role="alert" style={{ color: "#b45309", fontSize: "12px", lineHeight: 1.45 }}>
              {cameraMessage}
            </div>
          )}

          {phase === "connected" && showCallVideo && isCameraOn && !isSelfViewVisible && (
            <button
              type="button"
              onClick={() => setIsSelfViewVisible(true)}
              style={{ ...preCallSmallButtonStyle, justifyContent: "center" }}
            >
              {t("Show self-view", "Pokaż swój podgląd")}
            </button>
          )}

          {phase === "connected" && isCallDeviceMenuOpen && cameraDevices.length > 0 && (
            <label
              style={{
                display: "grid",
                gap: "5px",
                color: "#475569",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              {t("Camera", "Kamera")}
              <select
                value={selectedCameraId}
                disabled={isCameraStarting || isSwitchingCamera}
                onChange={(event) => {
                  const cameraId = event.target.value;
                  if (isCameraOn) void switchCamera(cameraId);
                  else setSelectedCameraId(cameraId);
                  setCameraMessage("");
                }}
                style={{
                  width: "100%",
                  minWidth: 0,
                  height: "34px",
                  padding: "0 9px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "9px",
                  background: isSwitchingCamera ? "#f1f5f9" : "#ffffff",
                  color: "#334155",
                  fontSize: "12px",
                }}
              >
                {cameraDevices.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {isPreCall ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px" }}>
              <button
                type="button"
                onClick={() => phase === "precall-incoming" ? void declineCall() : resetToIdle()}
                disabled={isPreparingMedia}
                style={{ ...callActionStyle, background: "#fee2e2", color: "#b91c1c" }}
              >
                <PhoneOff size={17} /> {phase === "precall-incoming" ? t("Decline", "Odrzuć") : t("Cancel", "Anuluj")}
              </button>
              <button
                type="button"
                onClick={() => phase === "precall-incoming" ? void joinIncomingCall() : void joinOutgoingCall()}
                disabled={isPreparingMedia}
                style={{ ...callActionStyle, background: "#dcfce7", color: "#166534", opacity: isPreparingMedia ? 0.65 : 1 }}
              >
                <Phone size={17} />
                {isPreparingMedia
                  ? t("Preparing…", "Przygotowywanie…")
                  : phase === "precall-incoming"
                    ? t("Join call", "Dołącz do rozmowy")
                    : t("Start call", "Rozpocznij rozmowę")}
              </button>
            </div>
          ) : phase === "incoming" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px" }}>
              <button type="button" onClick={() => void declineCall()} style={{ ...callActionStyle, background: "#fee2e2", color: "#b91c1c" }}>
                <PhoneOff size={17} /> {t("Decline", "Odrzuć")}
              </button>
              <button type="button" onClick={openIncomingPreCall} style={{ ...callActionStyle, background: "#dcfce7", color: "#166534" }}>
                <Phone size={17} /> {t("Set up & answer", "Ustaw i odbierz")}
              </button>
            </div>
          ) : phase === "connected" ? (
            <div
              role="toolbar"
              aria-label={t("Call controls", "Sterowanie rozmową")}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(58px, 1fr))",
                gap: 7,
                paddingTop: 2,
              }}
            >
              <button
                type="button"
                aria-label={isMuted ? t("Unmute microphone", "Włącz mikrofon") : t("Mute microphone", "Wycisz mikrofon")}
                title={isMuted ? t("Unmute", "Włącz mikrofon") : t("Mute", "Wycisz")}
                aria-pressed={isMuted}
                onClick={toggleMute}
                style={{ ...callToolbarButtonStyle, background: isMuted ? "#ede9fe" : "#f8fafc", color: isMuted ? "#6d28d9" : "#334155" }}
              >
                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                <span>{isMuted ? t("Unmute", "Włącz") : t("Mute", "Wycisz")}</span>
              </button>
              <button
                type="button"
                aria-label={isCameraOn ? t("Turn camera off", "Wyłącz kamerę") : t("Turn camera on", "Włącz kamerę")}
                title={isCameraOn ? t("Stop video", "Wyłącz wideo") : t("Start video", "Włącz wideo")}
                aria-pressed={isCameraOn}
                disabled={isCameraStarting}
                onClick={() => (isCameraOn ? void stopCamera() : void startCamera(selectedCameraId))}
                style={{ ...callToolbarButtonStyle, background: isCameraOn ? "#ede9fe" : "#f8fafc", color: isCameraOn ? "#6d28d9" : "#334155", opacity: isCameraStarting ? 0.6 : 1 }}
              >
                {isCameraOn ? <VideoOff size={18} /> : <Video size={18} />}
                <span>{isCameraStarting ? t("Starting", "Start") : t("Camera", "Kamera")}</span>
              </button>
              <button
                type="button"
                aria-label={t("Audio and device settings", "Ustawienia dźwięku i urządzeń")}
                title={t("Audio and devices", "Dźwięk i urządzenia")}
                aria-expanded={isCallDeviceMenuOpen}
                onClick={() => {
                  setIsCallDeviceMenuOpen((open) => !open);
                  setIsCallParticipantsMenuOpen(false);
                  setIsCallMoreMenuOpen(false);
                }}
                style={{ ...callToolbarButtonStyle, background: isCallDeviceMenuOpen ? "#ede9fe" : "#f8fafc", color: isCallDeviceMenuOpen ? "#6d28d9" : "#334155" }}
              >
                <Settings2 size={18} />
                <span>{t("Devices", "Urządzenia")}</span>
              </button>
              <button
                type="button"
                aria-label={t("Participants", "Uczestnicy")}
                title={t("Participants", "Uczestnicy")}
                aria-expanded={isCallParticipantsMenuOpen}
                onClick={() => {
                  setIsCallParticipantsMenuOpen((open) => !open);
                  setIsCallDeviceMenuOpen(false);
                  setIsCallMoreMenuOpen(false);
                }}
                style={{ ...callToolbarButtonStyle, background: isCallParticipantsMenuOpen ? "#ede9fe" : "#f8fafc", color: isCallParticipantsMenuOpen ? "#6d28d9" : "#334155" }}
              >
                <Users size={18} />
                <span>{t("People", "Osoby")}</span>
              </button>
              <button
                type="button"
                aria-label={t("More call options", "Więcej opcji rozmowy")}
                title={t("More options", "Więcej opcji")}
                aria-expanded={isCallMoreMenuOpen}
                onClick={() => {
                  setIsCallMoreMenuOpen((open) => !open);
                  setIsCallDeviceMenuOpen(false);
                  setIsCallParticipantsMenuOpen(false);
                }}
                style={{ ...callToolbarButtonStyle, background: isCallMoreMenuOpen ? "#ede9fe" : "#f8fafc", color: isCallMoreMenuOpen ? "#6d28d9" : "#334155" }}
              >
                <MoreHorizontal size={19} />
                <span>{t("More", "Więcej")}</span>
              </button>
              <button
                type="button"
                aria-label={t("Minimize call panel", "Zminimalizuj panel rozmowy")}
                title={t("Minimize", "Zminimalizuj")}
                onClick={() => setIsCallPanelMinimized(true)}
                style={callToolbarButtonStyle}
              >
                <Minus size={19} />
                <span>{t("Minimize", "Minimalizuj")}</span>
              </button>
              <button
                type="button"
                aria-label={t("End call", "Zakończ rozmowę")}
                title={t("End call", "Zakończ rozmowę")}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void endCall();
                }}
                style={{ ...callToolbarButtonStyle, gridColumn: "span 2", background: "#fee2e2", borderColor: "#fecaca", color: "#b91c1c" }}
              >
                <PhoneOff size={19} />
                <span>{t("End call", "Zakończ")}</span>
              </button>
            </div>
          ) : phase === "error" || phase === "ended" ? (
            <button type="button" onClick={resetToIdle} style={{ ...callActionStyle, background: "#f1f5f9", color: "#334155" }}>
              {t("Close", "Zamknij")}
            </button>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: phase === "outgoing" ? "1fr" : "1fr 1fr", gap: "9px" }}>
              {phase !== "outgoing" && (
                <button type="button" onClick={toggleMute} aria-pressed={isMuted} style={{ ...callActionStyle, background: isMuted ? "#ede9fe" : "#f1f5f9", color: isMuted ? "#6d28d9" : "#334155" }}>
                  {isMuted ? <MicOff size={17} /> : <Mic size={17} />}
                  {isMuted ? t("Unmute", "Włącz mikrofon") : t("Mute", "Wycisz")}
                </button>
              )}
              {phaseRef.current === "connected" && (
                <button
                  type="button"
                  onClick={() => (isCameraOn ? void stopCamera() : void startCamera(selectedCameraId))}
                  disabled={isCameraStarting}
                  aria-pressed={isCameraOn}
                  style={{
                    ...callActionStyle,
                    padding: "0 8px",
                    background: isCameraOn ? "#ede9fe" : "#f1f5f9",
                    color: isCameraOn ? "#6d28d9" : "#334155",
                    opacity: isCameraStarting ? 0.68 : 1,
                  }}
                >
                  {isCameraOn ? <VideoOff size={17} /> : <Video size={17} />}
                  {isCameraStarting
                    ? t("Starting…", "Uruchamianie…")
                    : isCameraOn
                      ? t("Stop video", "Wyłącz wideo")
                      : t("Start video", "Włącz wideo")}
                </button>
              )}
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void endCall();
                }}
                style={{ ...callActionStyle, background: "#fee2e2", color: "#b91c1c", position: "relative", zIndex: 1, pointerEvents: "auto" }}
              >
                <PhoneOff size={17} /> {phase === "outgoing" ? t("Cancel", "Anuluj") : t("End", "Zakończ")}
              </button>
            </div>
          )}
            </>
          )}
        </section>
      )}

      {phase === "connected" && showCallVideo && isCameraOn && isSelfViewVisible && (
        <div
          ref={selfViewRef}
          onPointerDown={beginSelfViewDrag}
          onPointerMove={moveSelfView}
          onPointerUp={endSelfViewDrag}
          onPointerCancel={endSelfViewDrag}
          onContextMenu={(event) => {
            event.preventDefault();
            setIsSelfViewMenuOpen(true);
          }}
          style={{
            position: "fixed",
            left: selfViewPosition ? `${selfViewPosition.left}px` : "auto",
            right: selfViewPosition ? "auto" : "18px",
            top: selfViewPosition ? `${selfViewPosition.top}px` : "auto",
            bottom: selfViewPosition ? "auto" : "80px",
            zIndex: 220,
            width: `min(${selfViewDimensions.width}px, calc(100vw - 16px))`,
            height: `${selfViewDimensions.height}px`,
            minWidth: "160px",
            minHeight: "90px",
            maxWidth: "min(480px, calc(100vw - 16px))",
            maxHeight: "min(270px, calc(100dvh - 16px))",
            overflow: "visible",
            borderRadius: "14px",
            border: "1px solid rgba(255,255,255,0.7)",
            background: "#0f172a",
            boxShadow: "0 16px 44px rgba(15,23,42,0.32)",
            cursor: selfViewDragRef.current ? "grabbing" : "grab",
            touchAction: "none",
          }}
        >
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            aria-label={t("Your camera preview", "Podgląd Twojej kamery")}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              objectFit: selfViewFit,
              transform: isSelfViewMirrored ? "scaleX(-1)" : "none",
              borderRadius: "inherit",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: "9px",
              bottom: "8px",
              padding: "4px 8px",
              borderRadius: "999px",
              background: "rgba(15,23,42,0.68)",
              color: "#ffffff",
              fontSize: "10px",
              fontWeight: 700,
              pointerEvents: "none",
            }}
          >
            {t("You", "Ty")}
          </span>
          <button
            type="button"
            aria-label={t("Self-view options", "Opcje własnego podglądu")}
            aria-expanded={isSelfViewMenuOpen}
            onClick={() => setIsSelfViewMenuOpen((open) => !open)}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 32,
              height: 32,
              border: "1px solid rgba(255,255,255,0.35)",
              borderRadius: 9,
              background: "rgba(15,23,42,0.72)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ⋮
          </button>
          {isSelfViewMenuOpen && (
            <div
              role="menu"
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                position: "absolute",
                top: "auto",
                bottom: 8,
                right: 8,
                width: "210px",
                maxHeight: "calc(100% - 54px)",
                overflowY: "auto",
                padding: 8,
                display: "grid",
                gap: 5,
                border: "1px solid #dbe3ef",
                borderRadius: 12,
                background: "rgba(255,255,255,0.98)",
                color: "#172036",
                boxShadow: "0 14px 35px rgba(15,23,42,0.26)",
                cursor: "default",
              }}
            >
              <button type="button" role="menuitem" onClick={() => { setIsSelfViewVisible(false); setIsSelfViewMenuOpen(false); }} style={selfViewMenuButtonStyle}>
                {t("Hide self-view", "Ukryj swój podgląd")}
              </button>
              <button type="button" role="menuitem" onClick={() => setIsSelfViewMirrored((mirrored) => !mirrored)} style={selfViewMenuButtonStyle}>
                {isSelfViewMirrored ? t("Unmirror preview", "Wyłącz odbicie") : t("Mirror preview", "Odbij podgląd")}
              </button>
              <button type="button" role="menuitem" onClick={() => setSelfViewFit((fit) => fit === "cover" ? "contain" : "cover")} style={selfViewMenuButtonStyle}>
                {selfViewFit === "cover" ? t("Fit entire video", "Dopasuj cały obraz") : t("Fill preview", "Wypełnij podgląd")}
              </button>
              <label style={{ display: "grid", gap: 4, padding: "5px 8px", fontSize: 11, fontWeight: 700 }}>
                {t("Preview size", "Rozmiar podglądu")}
                <select value={selfViewSize} onChange={(event) => setSelfViewSize(event.target.value as "small" | "medium" | "large")} style={{ height: 30, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }}>
                  <option value="small">{t("Small", "Mały")}</option>
                  <option value="medium">{t("Medium", "Średni")}</option>
                  <option value="large">{t("Large", "Duży")}</option>
                </select>
              </label>
              {cameraDevices.length > 1 && (
                <label style={{ display: "grid", gap: 4, padding: "5px 8px", fontSize: 11, fontWeight: 700 }}>
                  {t("Camera", "Kamera")}
                  <select value={selectedCameraId} disabled={isSwitchingCamera} onChange={(event) => void switchCamera(event.target.value)} style={{ height: 30, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }}>
                    {cameraDevices.map((camera) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label}</option>)}
                  </select>
                </label>
              )}
              <button type="button" role="menuitem" onClick={() => void openSelfViewPictureInPicture()} style={selfViewMenuButtonStyle}>
                {t("Picture in picture", "Obraz w obrazie")}
              </button>
              <button type="button" role="menuitem" onClick={() => void openSelfViewFullscreen()} style={selfViewMenuButtonStyle}>
                {t("Full screen", "Pełny ekran")}
              </button>
            </div>
          )}
        </div>
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCall must be used inside CallProvider");
  return context;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 205,
  display: "grid",
  placeItems: "center",
  padding: "16px",
  background: "rgba(15,23,42,0.34)",
  backdropFilter: "blur(6px)",
};
const dialogStyle: React.CSSProperties = {
  position: "relative",
  minWidth: "240px",
  padding: "22px",
  borderRadius: "18px",
  background: "#ffffff",
  color: "#0f172a",
  boxShadow: "0 28px 80px rgba(15,23,42,0.28)",
  display: "grid",
  justifyItems: "center",
  gap: "12px",
};
const closeButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: "10px",
  right: "10px",
  width: "32px",
  height: "32px",
  borderRadius: "9px",
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  color: "#475569",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};
const participantButtonStyle: React.CSSProperties = {
  minHeight: "46px",
  padding: "0 14px",
  borderRadius: "12px",
  border: "1px solid #ddd6fe",
  background: "#f5f3ff",
  color: "#5b21b6",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  fontSize: "14px",
  fontWeight: 750,
  cursor: "pointer",
};
const preCallFieldStyle: React.CSSProperties = {
  display: "grid",
  gap: "7px",
  padding: "11px",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  background: "#f8fafc",
};
const preCallLabelStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: "12px",
  fontWeight: 800,
};
const preCallSelectStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: "36px",
  padding: "0 9px",
  border: "1px solid #cbd5e1",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#334155",
  fontSize: "12px",
};
const preCallSmallButtonStyle: React.CSSProperties = {
  minHeight: "36px",
  padding: "0 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "9px",
  background: "#ffffff",
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  fontSize: "12px",
  fontWeight: 750,
  cursor: "pointer",
};
const callActionStyle: React.CSSProperties = {
  minHeight: "42px",
  padding: "0 13px",
  borderRadius: "12px",
  border: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "7px",
  fontSize: "13px",
  fontWeight: 800,
  cursor: "pointer",
};
const callToolbarButtonStyle: React.CSSProperties = {
  minWidth: 0,
  minHeight: 52,
  padding: "6px 5px",
  border: "1px solid #dbe3ef",
  borderRadius: 11,
  background: "#f8fafc",
  color: "#334155",
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  font: "inherit",
  fontSize: 10,
  fontWeight: 750,
  lineHeight: 1.1,
  cursor: "pointer",
  touchAction: "manipulation",
};
const presenceChipStyle: React.CSSProperties = {
  padding: "4px 8px",
  border: "1px solid #e2e8f0",
  borderRadius: 999,
  background: "#f8fafc",
  color: "#475569",
  fontSize: 10,
  fontWeight: 750,
};
const selfViewMenuButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 32,
  padding: "6px 8px",
  border: 0,
  borderRadius: 8,
  background: "transparent",
  color: "#334155",
  textAlign: "left",
  font: "inherit",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};
