export const SESSION_ID_RE = /^[a-z0-9]{4,64}$/;

export function newSessionId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isSessionId(value: string): boolean {
  return SESSION_ID_RE.test(value);
}
