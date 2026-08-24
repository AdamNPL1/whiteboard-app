export const getLocalVideoDirection = (
  localCameraEnabled: boolean
): RTCRtpTransceiverDirection =>
  localCameraEnabled ? "sendrecv" : "recvonly";
