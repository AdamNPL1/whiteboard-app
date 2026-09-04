export const PRE_CALL_SETTINGS_KEY = "scriboo-pre-call-settings-v1";

export type PreCallSettings = {
  microphoneId: string;
  cameraId: string;
  speakerId: string;
  joinMuted: boolean;
  joinWithCamera: boolean;
};

export const defaultPreCallSettings: PreCallSettings = {
  microphoneId: "",
  cameraId: "",
  speakerId: "",
  joinMuted: false,
  joinWithCamera: false,
};

export const parsePreCallSettings = (value: string | null): PreCallSettings => {
  if (!value) return defaultPreCallSettings;
  try {
    const parsed = JSON.parse(value) as Partial<PreCallSettings>;
    return {
      microphoneId: typeof parsed.microphoneId === "string" ? parsed.microphoneId : "",
      cameraId: typeof parsed.cameraId === "string" ? parsed.cameraId : "",
      speakerId: typeof parsed.speakerId === "string" ? parsed.speakerId : "",
      joinMuted: parsed.joinMuted === true,
      joinWithCamera: parsed.joinWithCamera === true,
    };
  } catch {
    return defaultPreCallSettings;
  }
};

export const supportsSpeakerSelection = (element: HTMLMediaElement) =>
  typeof element.setSinkId === "function";
