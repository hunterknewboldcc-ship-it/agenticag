import { POST as postTts } from "@/app/api/tts/route";
import { POST as postVoiceLog } from "@/app/api/voice/log/route";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resampleFloat32, floatToPcm16, evenAlignBytes } from "@/lib/audio/pcm";
import { composerButtonMode } from "@/lib/chat/composerMode";
import { extractClientSecret } from "@/lib/server/realtimeSession";
import { appendVoiceLog, parseVoiceLogBody } from "@/lib/server/voiceLog";
import { prepareSpeakableText, splitForTts } from "@/lib/tts/prepareText";
import { parseTtsRequest } from "@/lib/tts/validate";
import { redact } from "@/lib/voice/redact";
import { isSessionId, newSessionId } from "@/lib/voice/sessionId";

describe("prepareSpeakableText", () => {
  it("strips markdown, keeps citations, drops speech tags, and omits code", () => {
    const input = `Hello [laugh]

See the paper [1] for [note] details.

\`\`\`js
console.log("secret")
\`\`\`

| Name | Age |
|------|-----|
| Ada  | 36  |
`;
    const spoken = prepareSpeakableText(input);
    expect(spoken).toContain("Code block omitted");
    expect(spoken).toContain("[1]");
    expect(spoken).toContain("[note]");
    expect(spoken).not.toContain("[laugh]");
    expect(spoken).not.toContain("console.log");
    expect(spoken).toMatch(/Name is Ada/);
    expect(spoken).toMatch(/Age is 36/);
  });

  it("strips wrap tags but leaves other brackets", () => {
    expect(prepareSpeakableText("<whisper>Quiet now</whisper> item [2]")).toBe("Quiet now item [2]");
  });
});

describe("splitForTts", () => {
  it("splits long text on paragraph then sentence boundaries", () => {
    const paragraph = `${"Hello world. ".repeat(800)}\n\n${"Next part. ".repeat(800)}`;
    const parts = splitForTts(paragraph, 1000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 1000)).toBe(true);
  });
});

describe("parseTtsRequest", () => {
  it("accepts a valid payload and defaults", () => {
    const parsed = parseTtsRequest({ text: "Hello from read aloud." });
    expect(parsed).toEqual({
      ok: true,
      value: { text: "Hello from read aloud.", voice_id: "eve", language: "auto", speed: undefined },
    });
  });

  it("rejects empty text, bad voice ids, and missing shape", () => {
    expect(parseTtsRequest({ text: "   " }).ok).toBe(false);
    expect(parseTtsRequest({ text: "hi", voice_id: "NOPE!" }).ok).toBe(false);
    expect(parseTtsRequest({ text: "hi", language: "english" }).ok).toBe(false);
    expect(parseTtsRequest(null).ok).toBe(false);
  });
});

describe("voice logger helpers", () => {
  it("mints 8-char hex session ids", () => {
    const id = newSessionId();
    expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(isSessionId(id)).toBe(true);
    expect(isSessionId("../x")).toBe(false);
  });

  it("redacts audio payloads to byte counts and truncates long strings", () => {
    const long = "a".repeat(500);
    const redacted = redact({
      type: "response.output_audio.delta",
      delta: Buffer.from("abcd").toString("base64"),
      note: long,
    });
    expect(redacted.bytes).toBe(4);
    expect(redacted.delta).toBeUndefined();
    expect(String(redacted.note)).toContain("…[500 chars]");
  });

  it("parses log bodies and rejects path-like session ids", () => {
    expect(parseVoiceLogBody({ sessionId: "../x", entries: [] }).ok).toBe(false);
    expect(parseVoiceLogBody({ sessionId: "smoke001", entries: [{ kind: "start" }] }).ok).toBe(true);
  });

  it("appends ndjson for valid entries", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "voice-logs-"));
    try {
      await appendVoiceLog("smoke001", [{ t: 0, ts: 0, kind: "start" }], dir);
      const contents = await readFile(path.join(dir, "smoke001.ndjson"), "utf8");
      expect(contents).toContain('"kind":"start"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("extractClientSecret", () => {
  it("accepts flat and nested secret payloads", () => {
    expect(extractClientSecret({ value: "tok" })).toBe("tok");
    expect(extractClientSecret({ client_secret: { value: "nested" } })).toBe("nested");
    expect(extractClientSecret({ client_secret: "string-secret" })).toBe("string-secret");
    expect(extractClientSecret({})).toBeNull();
  });
});

describe("composerButtonMode", () => {
  it("uses waveform, send, stop, and live according to composer state", () => {
    expect(composerButtonMode("", "idle", false)).toBe("waveform");
    expect(composerButtonMode("hi", "idle", false)).toBe("send");
    expect(composerButtonMode("hi", "listening", false)).toBe("send");
    expect(composerButtonMode("", "listening", false)).toBe("live");
    expect(composerButtonMode("", "idle", true)).toBe("stop");
  });
});

describe("pcm helpers", () => {
  it("resamples and keeps even byte alignment", () => {
    const input = Float32Array.from([0, 1, 0, -1]);
    const out = resampleFloat32(input, 48_000, 24_000);
    expect(out.length).toBe(2);
    const pcm = floatToPcm16(out);
    expect(pcm.length).toBe(2);
    expect(evenAlignBytes(new Uint8Array([1, 2, 3])).byteLength).toBe(2);
  });
});

describe("api routes", () => {
  it("rejects invalid TTS and voice-log payloads without calling xAI", async () => {
    const tts = await postTts(
      new Request("http://localhost/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "", voice_id: "nope" }),
      }),
    );
    expect(tts.status).toBe(400);

    const badLog = await postVoiceLog(
      new Request("http://localhost/api/voice/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "../x", entries: [] }),
      }),
    );
    expect(badLog.status).toBe(400);
  });

  it("appends voice log entries and returns 204", async () => {
    const res = await postVoiceLog(
      new Request("http://localhost/api/voice/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "smoke001",
          entries: [{ t: 0, ts: 0, kind: "start" }],
        }),
      }),
    );
    expect(res.status).toBe(204);
    const contents = await readFile(path.join(process.cwd(), ".voice-logs", "smoke001.ndjson"), "utf8");
    expect(contents).toContain('"kind":"start"');
    await rm(path.join(process.cwd(), ".voice-logs", "smoke001.ndjson"), { force: true });
  });
});
