const MAX_CUES = 50_000;

function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new Error("Subtitle files must be valid UTF-8 text.");
  }
}

function parseTimestamp(value: string) {
  const match = /^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value.trim());
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) throw new Error("A subtitle timestamp is invalid.");
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  return {
    value: `${match[1].padStart(2, "0")}:${match[2]}:${match[3]}.${match[4]}`,
    milliseconds: (((hours * 60 + minutes) * 60 + seconds) * 1000) + milliseconds,
  };
}

export function convertSrtToVtt(bytes: Uint8Array) {
  const text = decodeUtf8(bytes).replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error("The subtitle file is empty.");
  const blocks = text.split(/\n\s*\n/).filter(Boolean);
  if (blocks.length > MAX_CUES) throw new Error("The subtitle file contains too many cues.");
  const cues = blocks.map((block) => {
    const lines = block.split("\n");
    if (/^\d+$/.test(lines[0]?.trim() || "")) lines.shift();
    const timing = lines.shift()?.trim() || "";
    const match = /^(\d{1,3}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{3})(.*)$/.exec(timing);
    if (!match || !lines.some((line) => line.trim())) throw new Error("A subtitle cue is missing a valid timestamp or text.");
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    if (start.milliseconds >= end.milliseconds) throw new Error("Subtitle cue end times must come after start times.");
    return `${start.value} --> ${end.value}${match[3]}\n${lines.join("\n")}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

export function validateVtt(bytes: Uint8Array) {
  const text = decodeUtf8(bytes).replace(/\r\n?/g, "\n").trim();
  if (!/^WEBVTT(?:\s|$)/.test(text)) throw new Error("A WebVTT file must begin with WEBVTT.");
  const timingLines = text.split("\n").filter((line) => line.includes("-->"));
  if (!timingLines.length || timingLines.length > MAX_CUES) throw new Error("The WebVTT file has no cues or contains too many cues.");
  for (const line of timingLines) {
    const match = /^(\d{1,3}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}\.\d{3})(?:\s|$)/.exec(line.trim());
    if (!match) throw new Error("A WebVTT cue has invalid timestamps.");
    try {
      if (parseTimestamp(match[1]).milliseconds >= parseTimestamp(match[2]).milliseconds) throw new Error("A WebVTT cue has invalid timestamps.");
    } catch {
      throw new Error("A WebVTT cue has invalid timestamps.");
    }
  }
  return text.endsWith("\n") ? text : `${text}\n`;
}
