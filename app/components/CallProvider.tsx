"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  X,
} from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useLanguage } from "@/lib/i18n";

type BoardContext = { id: string; name: string };
type CallParticipant = {
  userId: string;
  name: string;
  role: "owner" | "collaborator";
};
type CallStatus =
  | "ringing"
  | "accepted"
  | "declined"
  | "cancelled"
  | "missed"
  | "ended";
type CallRecord = {
  id: string;
  boardId: string;
  callerUserId: string;
  recipientUserId: string;
  status: CallStatus;
  createdAt: string;
  updatedAt: string;
  ringExpiresAt: string;
  expiresAt: string;
};
type CallPhase =
  | "idle"
  | "choosing"
  | "incoming"
  | "outgoing"
  | "connecting"
  | "connected"
  | "ended"
  | "error";
type SignalData =
  | { kind: "accepted" }
  | { kind: "declined" }
  | { kind: "ended" }
  | { kind: "mute"; muted: boolean }
  | { kind: "offer"; description: RTCSessionDescriptionInit }
  | { kind: "answer"; description: RTCSessionDescriptionInit }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };
type SignalEnvelope = {
  callId: string;
  senderUserId: string;
  messageId: string;
  sentAt: number;
  data: SignalData;
};
type CurrentUser = { id: string; name: string; email: string };

type CallContextValue = {
  setBoardContext: (board: BoardContext | null) => void;
};

const CallContext = createContext<CallContextValue | null>(null);

const apiRequest = async <T,>(
  path: string,
  options?: RequestInit
): Promise<T> => {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
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

const isSignalEnvelope = (value: unknown): value is SignalEnvelope => {
  if (!value || typeof value !== "object") return false;
  const signal = value as Partial<SignalEnvelope>;
  return (
    typeof signal.callId === "string" &&
    typeof signal.senderUserId === "string" &&
    typeof signal.messageId === "string" &&
    typeof signal.sentAt === "number" &&
    Boolean(signal.data && typeof signal.data === "object")
  );
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { text: t } = useLanguage();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [board, setBoard] = useState<BoardContext | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [call, setCall] = useState<CallRecord | null>(null);
  const [peerName, setPeerName] = useState("");
  const [callBoardName, setCallBoardName] = useState("");
  const [message, setMessage] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [connectionState, setConnectionState] = useState("");

  const userRef = useRef<CurrentUser | null>(null);
  const callRef = useRef<CallRecord | null>(null);
  const phaseRef = useRef<CallPhase>("idle");
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callChannelRef = useRef<RealtimeChannel | null>(null);
  const userChannelRef = useRef<RealtimeChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const seenSignalsRef = useRef(new Set<string>());
  const signalHandlerRef = useRef<(payload: unknown) => void>(() => undefined);
  const callPollRef = useRef<number | null>(null);
  const turnRefreshRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    callRef.current = call;
  }, [call]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const stopCallPoll = useCallback(() => {
    if (callPollRef.current !== null) {
      window.clearInterval(callPollRef.current);
      callPollRef.current = null;
    }
  }, []);

  const clearCallResources = useCallback(() => {
    stopCallPoll();
    if (turnRefreshRef.current !== null) {
      window.clearTimeout(turnRefreshRef.current);
      turnRefreshRef.current = null;
    }
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    queuedCandidatesRef.current = [];
    reconnectAttemptsRef.current = 0;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    const channel = callChannelRef.current;
    callChannelRef.current = null;
    if (channel) void getSupabaseBrowserClient().removeChannel(channel);
  }, [stopCallPoll]);

  const resetToIdle = useCallback(() => {
    clearCallResources();
    setCall(null);
    setPeerName("");
    setCallBoardName("");
    setParticipants([]);
    setMessage("");
    setIsMuted(false);
    setRemoteMuted(false);
    setConnectionState("");
    setPhase("idle");
  }, [clearCallResources]);

  useEffect(() => {
    if (phase !== "ended") return;

    const timeout = window.setTimeout(resetToIdle, 4_000);
    return () => window.clearTimeout(timeout);
  }, [phase, resetToIdle]);

  useEffect(() => {
    if (
      !call ||
      call.status !== "ringing" ||
      !["incoming", "outgoing", "connecting"].includes(phase)
    ) {
      return;
    }

    const expireCall = () => {
      if (userRef.current?.id === call.callerUserId) {
        void apiRequest<{ call: CallRecord }>(`/api/calls/${call.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "cancel" }),
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

  const getMicrophone = useCallback(async () => {
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      return stream;
    } catch {
      throw new Error(
        t(
          "Microphone permission was denied or no microphone is available.",
          "Odmówiono dostępu do mikrofonu lub mikrofon nie jest dostępny."
        )
      );
    }
  }, [t]);

  const sendSignal = useCallback(async (data: SignalData) => {
    const activeCall = callRef.current;
    const activeUser = userRef.current;
    const channel = callChannelRef.current;
    if (!activeCall || !activeUser || !channel) return;

    const envelope: SignalEnvelope = {
      callId: activeCall.id,
      senderUserId: activeUser.id,
      messageId: crypto.randomUUID(),
      sentAt: Date.now(),
      data,
    };
    await channel.send({ type: "broadcast", event: "signal", payload: envelope });
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

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Realtime connection timed out.")),
        10_000
      );
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          window.clearTimeout(timeout);
          reject(error ?? new Error("Realtime connection failed."));
        }
      });
    });
    callChannelRef.current = channel;
  }, []);

  const refreshTurnConfiguration = useCallback(async (activeCall: CallRecord) => {
    const data = await apiRequest<{
      iceServers: RTCIceServer[];
      expiresAt: string;
    }>(`/api/calls/${activeCall.id}/turn-credentials`, { method: "POST" });
    peerConnectionRef.current?.setConfiguration({ iceServers: data.iceServers });

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
  }, [t]);

  const flushQueuedCandidates = useCallback(async () => {
    const connection = peerConnectionRef.current;
    if (!connection?.remoteDescription) return;
    const candidates = queuedCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      await connection.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  const preparePeerConnection = useCallback(
    async (activeCall: CallRecord, callerCreatesOffer: boolean) => {
      if (peerConnectionRef.current) return peerConnectionRef.current;
      const stream = await getMicrophone();
      const credentials = await apiRequest<{
        iceServers: RTCIceServer[];
        expiresAt: string;
      }>(`/api/calls/${activeCall.id}/turn-credentials`, { method: "POST" });
      const connection = new RTCPeerConnection({ iceServers: credentials.iceServers });
      peerConnectionRef.current = connection;
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));

      connection.ontrack = (event) => {
        if (!remoteAudioRef.current) return;
        remoteAudioRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void remoteAudioRef.current.play().catch(() => undefined);
      };
      connection.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal({
            kind: "ice-candidate",
            candidate: event.candidate.toJSON(),
          });
        }
      };
      connection.onconnectionstatechange = () => {
        setConnectionState(connection.connectionState);
        if (connection.connectionState === "connected") {
          setPhase("connected");
          setMessage("");
        } else if (connection.connectionState === "failed") {
          const activeUser = userRef.current;
          const latestCall = callRef.current;
          if (
            activeUser?.id === latestCall?.callerUserId &&
            reconnectAttemptsRef.current < 2
          ) {
            reconnectAttemptsRef.current += 1;
            void (async () => {
              const offer = await connection.createOffer({ iceRestart: true });
              await connection.setLocalDescription(offer);
              await sendSignal({ kind: "offer", description: offer });
            })().catch(() => {
              setMessage(t("Connection lost.", "Połączenie zostało przerwane."));
            });
          } else {
            setMessage(t("Connection lost.", "Połączenie zostało przerwane."));
          }
        }
      };

      const refreshIn = Math.max(
        60_000,
        new Date(credentials.expiresAt).getTime() - Date.now() - 10 * 60 * 1000
      );
      turnRefreshRef.current = window.setTimeout(() => {
        refreshTurnConfiguration(activeCall).catch(() => undefined);
      }, refreshIn);

      if (callerCreatesOffer) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await sendSignal({ kind: "offer", description: offer });
      }
      return connection;
    },
    [getMicrophone, refreshTurnConfiguration, sendSignal, t]
  );

  const finishRemoteCall = useCallback(
    (text: string) => {
      clearCallResources();
      setMessage(text);
      setPhase("ended");
    },
    [clearCallResources]
  );

  const handleSignal = useCallback(
    async (payload: unknown) => {
      if (!isSignalEnvelope(payload)) return;
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
        Math.abs(Date.now() - payload.sentAt) > 2 * 60 * 1000 ||
        seenSignalsRef.current.has(payload.messageId)
      ) {
        return;
      }
      seenSignalsRef.current.add(payload.messageId);
      if (seenSignalsRef.current.size > 500) seenSignalsRef.current.clear();

      const signal = payload.data;
      if (signal.kind === "accepted") {
        if (activeUser.id === activeCall.callerUserId) {
          setPhase("connecting");
          await preparePeerConnection(activeCall, true);
        }
        return;
      }
      if (signal.kind === "declined") {
        finishRemoteCall(t("Call declined.", "Połączenie odrzucone."));
        return;
      }
      if (signal.kind === "ended") {
        finishRemoteCall(t("Call ended.", "Połączenie zakończone."));
        return;
      }
      if (signal.kind === "mute") {
        setRemoteMuted(signal.muted);
        return;
      }
      if (signal.kind === "offer") {
        setPhase("connecting");
        const connection = await preparePeerConnection(activeCall, false);
        await connection.setRemoteDescription(signal.description);
        await flushQueuedCandidates();
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await sendSignal({ kind: "answer", description: answer });
        return;
      }
      if (signal.kind === "answer") {
        const connection = peerConnectionRef.current;
        if (!connection) return;
        await connection.setRemoteDescription(signal.description);
        await flushQueuedCandidates();
        return;
      }
      if (signal.kind === "ice-candidate") {
        const connection = peerConnectionRef.current;
        if (!connection?.remoteDescription) {
          queuedCandidatesRef.current.push(signal.candidate);
        } else {
          await connection.addIceCandidate(signal.candidate).catch(() => undefined);
        }
      }
    },
    [finishRemoteCall, flushQueuedCandidates, preparePeerConnection, sendSignal, t]
  );
  signalHandlerRef.current = (payload) => {
    void handleSignal(payload).catch(() => {
      setMessage(t("Could not establish the audio connection.", "Nie udało się nawiązać połączenia audio."));
    });
  };

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
      setCall(incomingCall);
      setPeerName(context.peerName);
      setCallBoardName(context.boardName);
      setMessage("");
      setPhase("incoming");
    },
    [loadCallContext]
  );

  const loadActiveCalls = useCallback(async () => {
    if (!userRef.current) return;
    const data = await apiRequest<{ calls: CallRecord[] }>("/api/calls");
    const current = callRef.current;
    if (current) {
      const refreshed = data.calls.find((candidate) => candidate.id === current.id);
      if (refreshed) setCall(refreshed);
      return;
    }
    const incoming = data.calls.find(
      (candidate) =>
        candidate.recipientUserId === userRef.current?.id && candidate.status === "ringing"
    );
    if (incoming) await showIncomingCall(incoming);
  }, [showIncomingCall]);

  const refreshIdentity = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) {
        setUser(null);
        return;
      }
      const data = (await response.json()) as { user?: CurrentUser | null };
      setUser(data.user?.id ? data.user : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshIdentity();
    const supabase = getSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void refreshIdentity(), 0);
    });
    return () => data.subscription.unsubscribe();
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
    void supabase.realtime.setAuth();
    const channel = supabase.channel(`user:${user.id}:calls`, {
      config: { private: true, broadcast: { ack: true } },
    });
    channel.on("broadcast", { event: "incoming-call" }, () => {
      void loadActiveCalls().catch(() => undefined);
    });
    channel.subscribe();
    userChannelRef.current = channel;
    void loadActiveCalls().catch(() => undefined);
    const poll = window.setInterval(
      () => void loadActiveCalls().catch(() => undefined),
      15_000
    );

    return () => {
      window.clearInterval(poll);
      if (userChannelRef.current === channel) userChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [loadActiveCalls, resetToIdle, user]);

  const startStatusPoll = useCallback(
    (activeCall: CallRecord) => {
      stopCallPoll();
      callPollRef.current = window.setInterval(() => {
        void apiRequest<{ call: CallRecord }>(`/api/calls/${activeCall.id}`)
          .then(async ({ call: refreshed }) => {
            setCall(refreshed);
            if (
              refreshed.status === "accepted" &&
              userRef.current?.id === refreshed.callerUserId &&
              !peerConnectionRef.current
            ) {
              setPhase("connecting");
              await preparePeerConnection(refreshed, true);
            } else if (refreshed.status === "declined") {
              finishRemoteCall(t("Call declined.", "Połączenie odrzucone."));
            } else if (
              ["cancelled", "missed", "ended"].includes(refreshed.status)
            ) {
              finishRemoteCall(
                refreshed.status === "missed"
                  ? t("No answer.", "Brak odpowiedzi.")
                  : t("Call ended.", "Połączenie zakończone.")
              );
            }
          })
          .catch(() => undefined);
      }, 2_000);
    },
    [finishRemoteCall, preparePeerConnection, stopCallPoll, t]
  );

  const startCall = useCallback(
    async (participant: CallParticipant) => {
      if (!board || !user) return;
      setParticipants([]);
      setMessage("");
      setPeerName(participant.name);
      setCallBoardName(board.name);
      setPhase("connecting");
      try {
        await getMicrophone();
        const data = await apiRequest<{ call: CallRecord }>("/api/calls", {
          method: "POST",
          body: JSON.stringify({
            boardId: board.id,
            recipientUserId: participant.userId,
          }),
        });
        setCall(data.call);
        callRef.current = data.call;
        setPhase("outgoing");
        await connectCallChannel(data.call);
        startStatusPoll(data.call);
      } catch (error) {
        clearCallResources();
        setMessage(error instanceof Error ? error.message : "Could not start the call.");
        setPhase("error");
      }
    },
    [board, clearCallResources, connectCallChannel, getMicrophone, startStatusPoll, user]
  );

  const openCallChooser = useCallback(async () => {
    if (!board || !user || phaseRef.current !== "idle") return;
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
        await startCall(data.participants[0]);
        return;
      }
      setParticipants(data.participants);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare the call.");
      setPhase("error");
    }
  }, [board, startCall, t, user]);

  const acceptCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return;
    setMessage("");
    setPhase("connecting");
    try {
      await getMicrophone();
      await connectCallChannel(activeCall);
      const data = await apiRequest<{ call: CallRecord }>(
        `/api/calls/${activeCall.id}`,
        { method: "PATCH", body: JSON.stringify({ action: "accept" }) }
      );
      setCall(data.call);
      callRef.current = data.call;
      await preparePeerConnection(data.call, false);
      await sendSignal({ kind: "accepted" });
      startStatusPoll(data.call);
    } catch (error) {
      clearCallResources();
      setMessage(error instanceof Error ? error.message : "Could not accept the call.");
      setPhase("error");
    }
  }, [clearCallResources, connectCallChannel, getMicrophone, preparePeerConnection, sendSignal, startStatusPoll]);

  const declineCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return resetToIdle();
    await apiRequest(`/api/calls/${activeCall.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "decline" }),
    }).catch(() => undefined);
    resetToIdle();
  }, [resetToIdle]);

  const endCall = useCallback(async () => {
    const activeCall = callRef.current;
    if (!activeCall) return resetToIdle();
    await sendSignal({ kind: "ended" }).catch(() => undefined);
    const action = activeCall.status === "accepted" ? "end" : "cancel";
    await apiRequest(`/api/calls/${activeCall.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
      keepalive: true,
    }).catch(() => undefined);
    resetToIdle();
  }, [resetToIdle, sendSignal]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
    void sendSignal({ kind: "mute", muted: nextMuted });
  }, [isMuted, sendSignal]);

  useEffect(() => {
    return () => {
      clearCallResources();
      const channel = userChannelRef.current;
      if (channel) void getSupabaseBrowserClient().removeChannel(channel);
    };
  }, [clearCallResources]);

  const contextValue = useMemo(
    () => ({ setBoardContext: setBoard }),
    []
  );

  const statusText =
    phase === "incoming"
      ? t("Incoming call", "Połączenie przychodzące")
      : phase === "outgoing"
        ? t("Ringing…", "Dzwonienie…")
        : phase === "connecting"
          ? t("Connecting…", "Łączenie…")
          : phase === "connected"
            ? remoteMuted
              ? t("Connected · participant muted", "Połączono · uczestnik wyciszony")
              : t("Connected", "Połączono")
            : message;

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline hidden />

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
            border: "1.5px solid rgba(255,255,255,0.42)",
            background: "rgba(255,255,255,0.1)",
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            backdropFilter: "blur(8px)",
          }}
        >
          <Phone size={16} />
        </button>
      )}

      {phase === "choosing" && participants.length === 0 && (
        <div style={overlayStyle}>
          <div style={dialogStyle} role="status" aria-live="polite">
            <LoaderCircle size={22} className="scriboo-call-spinner" />
            <span>{t("Preparing call…", "Przygotowywanie połączenia…")}</span>
          </div>
        </div>
      )}

      {phase === "choosing" && participants.length > 0 && (
        <div style={overlayStyle} role="presentation">
          <div style={{ ...dialogStyle, width: "min(420px, calc(100vw - 32px))" }} role="dialog" aria-modal="true">
            <button type="button" aria-label={t("Close", "Zamknij")} onClick={resetToIdle} style={closeButtonStyle}>
              <X size={17} />
            </button>
            <strong style={{ fontSize: "18px" }}>{t("Who would you like to call?", "Do kogo chcesz zadzwonić?")}</strong>
            <span style={{ color: "#64748b", fontSize: "13px" }}>{board?.name}</span>
            <div style={{ display: "grid", gap: "8px", width: "100%" }}>
              {participants.map((participant) => (
                <button key={participant.userId} type="button" onClick={() => void startCall(participant)} style={participantButtonStyle}>
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
          aria-label={t("Audio call", "Połączenie audio")}
          style={{
            position: "fixed",
            right: "18px",
            bottom: "18px",
            zIndex: 210,
            width: "min(350px, calc(100vw - 36px))",
            padding: "18px",
            borderRadius: "20px",
            border: "1px solid rgba(203,213,225,0.88)",
            background: "rgba(255,255,255,0.97)",
            color: "#0f172a",
            boxShadow: "0 24px 70px rgba(15,23,42,0.24)",
            backdropFilter: "blur(18px)",
            display: "grid",
            gap: "13px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ width: "42px", height: "42px", borderRadius: "999px", background: "linear-gradient(135deg,#7c3aed,#60a5fa)", color: "white", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
              <Phone size={18} />
            </span>
            <div style={{ minWidth: 0, display: "grid", gap: "3px" }}>
              <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{peerName || t("Audio call", "Połączenie audio")}</strong>
              <span style={{ color: "#64748b", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{callBoardName}</span>
            </div>
          </div>
          <div aria-live="polite" style={{ color: phase === "error" ? "#b91c1c" : "#475569", fontSize: "13px", fontWeight: 650 }}>
            {statusText || connectionState}
          </div>

          {phase === "incoming" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px" }}>
              <button type="button" onClick={() => void declineCall()} style={{ ...callActionStyle, background: "#fee2e2", color: "#b91c1c" }}>
                <PhoneOff size={17} /> {t("Decline", "Odrzuć")}
              </button>
              <button type="button" onClick={() => void acceptCall()} style={{ ...callActionStyle, background: "#dcfce7", color: "#166534" }}>
                <Phone size={17} /> {t("Accept", "Odbierz")}
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
              <button type="button" onClick={() => void endCall()} style={{ ...callActionStyle, background: "#fee2e2", color: "#b91c1c" }}>
                <PhoneOff size={17} /> {phase === "outgoing" ? t("Cancel", "Anuluj") : t("End", "Zakończ")}
              </button>
            </div>
          )}
        </section>
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
