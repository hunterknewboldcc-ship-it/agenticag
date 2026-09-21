# AgenticAG

Chat with Grok in the browser. The composer starts **voice mode** (speech-to-speech). Finished assistant replies get a **read aloud** speaker.

## Setup

```bash
cp .env.example .env.local
# put your key in .env.local — never NEXT_PUBLIC_XAI_API_KEY
```

```
XAI_API_KEY=...
# optional
# XAI_CHAT_MODEL=grok-4-fast
```

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Voice mode

- Empty composer: the **waveform** button starts a duplex Grok session (`grok-voice-latest`).
- Click again (animated bars) to end the session. Status is the composer placeholder: Connecting… / Listening… / Thinking… / Speaking…
- Type while voice is live and press send: the text goes into the live session.
- Use **headphones**. On speakers the mic hears Grok and the model answers itself.

Auth: the server mints a 300s ephemeral token at `POST /api/realtime/session`. The browser connects to `wss://api.x.ai/v1/realtime?model=grok-voice-latest` with `xai-client-secret.<token>`. The long-lived key never ships in the client.

## Read aloud

- A ghost **speaker** appears on a reply only after it finishes streaming.
- Loading shows a spinner; playing shows a stop square. One utterance at a time.
- Auto-speak is off until you toggle it; it still needs a gesture on the page.
- Server route: `POST /api/tts` → `https://api.x.ai/v1/tts` (MP3). Markdown is stripped first.

## Debug logs

Dev-only `POST /api/voice/log` writes `.voice-logs/<sessionId>.ndjson` (gitignored). The session id is in the voice status line.

```bash
npm run voice:logs -- ab12cd34
```

Set `VOICE_LOG=1` to keep the sink on in production.

## Tests

```bash
npm test
npm run typecheck
```
