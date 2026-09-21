export const TTS_MAX_CHARS = 15_000;

export const SPEECH_BRACKET_TAGS = [
  "pause",
  "long-pause",
  "laugh",
  "chuckle",
  "giggle",
  "cry",
  "sigh",
  "breath",
  "inhale",
  "exhale",
  "tsk",
  "tongue-click",
  "lip-smack",
  "hum-tune",
] as const;

export const SPEECH_WRAP_TAGS = [
  "whisper",
  "soft",
  "loud",
  "emphasis",
  "build-intensity",
  "decrease-intensity",
  "slow",
  "fast",
  "higher-pitch",
  "lower-pitch",
  "singing",
  "sing-song",
] as const;

const FENCED_RE = /```[\w-]*\r?\n[\s\S]*?```/g;
const TILDE_FENCED_RE = /~~~[\w-]*\r?\n[\s\S]*?~~~/g;
const IMAGE_RE = /!\[([^\]]*)\]\([^)]+\)/g;
const LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const BOLD_RE = /(\*\*|__)(.*?)\1/g;
const ITALIC_RE = /(\*|_)([^*_]+)\1/g;
const STRIKE_RE = /~~(.*?)~~/g;
const HEADING_RE = /^#{1,6}\s+/gm;
const BLOCKQUOTE_RE = /^>\s?/gm;
const LIST_RE = /^(\s*)(?:[-*+]|\d+\.)\s+/gm;
const BRACKET_TAG_RE = new RegExp(
  `\\[\\s*(?:${SPEECH_BRACKET_TAGS.join("|")})\\s*\\]`,
  "gi",
);
const WRAP_TAG_RE = new RegExp(`</?(?:${SPEECH_WRAP_TAGS.join("|")})>`, "gi");

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return false;
  return trimmed.includes("|") && !trimmed.startsWith("```");
}

function splitCells(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function tableToSentences(block: string[]): string {
  const rows = block.filter((line) => !isTableSeparator(line)).map(splitCells);
  if (rows.length === 0) return "";
  const [first, ...rest] = rows;
  if (!first) return "";
  if (rest.length === 0) {
    return first.filter(Boolean).join(", ") + ".";
  }
  return rest
    .map((row) => {
      const parts = first
        .map((header, i) => {
          const value = row[i] ?? "";
          if (!header && !value) return "";
          if (!header) return value;
          if (!value) return header;
          return `${header} is ${value}`;
        })
        .filter(Boolean);
      return parts.join(", ") + ".";
    })
    .join(" ");
}

function replaceTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isTableLine(line) || isTableSeparator(line)) {
      const block: string[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? "";
        if (!(isTableLine(current) || isTableSeparator(current))) break;
        block.push(current);
        i += 1;
      }
      const spoken = tableToSentences(block);
      if (spoken) out.push(spoken);
      continue;
    }
    out.push(line);
    i += 1;
  }
  return out.join("\n");
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(IMAGE_RE, "$1")
    .replace(LINK_RE, "$1")
    .replace(INLINE_CODE_RE, "$1")
    .replace(BOLD_RE, "$2")
    .replace(STRIKE_RE, "$1")
    .replace(ITALIC_RE, "$2")
    .replace(HEADING_RE, "")
    .replace(BLOCKQUOTE_RE, "")
    .replace(LIST_RE, "$1");
}

function stripSpeechTags(text: string): string {
  return text.replace(BRACKET_TAG_RE, "").replace(WRAP_TAG_RE, "");
}

export function prepareSpeakableText(markdown: string): string {
  let text = markdown.replace(/\r\n/g, "\n");
  text = text.replace(FENCED_RE, "[pause] Code block omitted.");
  text = text.replace(TILDE_FENCED_RE, "[pause] Code block omitted.");
  text = replaceTables(text);
  text = stripMarkdownInline(text);
  text = stripSpeechTags(text);
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}

function splitByBoundary(text: string, max: number, pattern: RegExp): string[] | null {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    const window = remaining.slice(0, max);
    let cut = -1;
    const re = new RegExp(pattern, "g");
    let match: RegExpExecArray | null = re.exec(window);
    while (match) {
      cut = match.index + match[0].length;
      match = re.exec(window);
    }
    if (cut <= 0) return null;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts.filter(Boolean);
}

export function splitForTts(text: string, max = TTS_MAX_CHARS): string[] {
  const prepared = text.trim();
  if (!prepared) return [];
  if (prepared.length <= max) return [prepared];
  const byParagraph = splitByBoundary(prepared, max, /\n\n+/);
  if (byParagraph) {
    return byParagraph.flatMap((part) =>
      part.length <= max ? [part] : (splitByBoundary(part, max, /(?<=[.!?])\s+/) ?? [part]),
    ).flatMap((part) => (part.length <= max ? [part] : splitByWords(part, max)));
  }
  return splitByWords(prepared, max);
}

function splitByWords(text: string, max: number): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    const window = remaining.slice(0, max);
    const cut = window.lastIndexOf(" ");
    const at = cut > 0 ? cut : max;
    parts.push(remaining.slice(0, at).trim());
    remaining = remaining.slice(at).trim();
  }
  if (remaining) parts.push(remaining);
  return parts.filter(Boolean);
}
