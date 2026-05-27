export const AUDIO_MESSAGE_PREFIX = "__AT_AUDIO__";
export const FILE_MESSAGE_PREFIX = "__AT_FILE__";

export type AudioMessagePayload = {
  kind: "audio";
  url: string;
  name: string;
  mime: string;
  size: number;
};

export type FileMessagePayload = {
  kind: "file";
  url: string;
  name: string;
  mime: string;
  size: number;
};

export function encodeAudioMessage(payload: AudioMessagePayload) {
  return `${AUDIO_MESSAGE_PREFIX}${JSON.stringify(payload)}`;
}

export function parseAudioMessage(body: string): AudioMessagePayload | null {
  if (!body.startsWith(AUDIO_MESSAGE_PREFIX)) return null;
  try {
    const payload = JSON.parse(body.slice(AUDIO_MESSAGE_PREFIX.length)) as AudioMessagePayload;
    if (payload.kind !== "audio" || !payload.url) return null;
    return payload;
  } catch {
    return null;
  }
}

export function encodeFileMessage(payload: FileMessagePayload) {
  return `${FILE_MESSAGE_PREFIX}${JSON.stringify(payload)}`;
}

export function parseFileMessage(body: string): FileMessagePayload | null {
  if (!body.startsWith(FILE_MESSAGE_PREFIX)) return null;
  try {
    const payload = JSON.parse(body.slice(FILE_MESSAGE_PREFIX.length)) as FileMessagePayload;
    if (payload.kind !== "file" || !payload.url) return null;
    return payload;
  } catch {
    return null;
  }
}

export function messageNotificationBody(body: string) {
  if (parseAudioMessage(body)) return "Se compartio un audio en el chat del caso.";
  if (parseFileMessage(body)) return "Se compartió un documento en el chat del caso.";
  return body;
}
