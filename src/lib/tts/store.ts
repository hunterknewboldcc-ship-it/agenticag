export type ReadAloudStatus = "idle" | "loading" | "playing";

export type ReadAloudState = {
  activeMessageId: string | null;
  status: ReadAloudStatus;
  error: string | null;
};

const listeners = new Set<() => void>();

let state: ReadAloudState = {
  activeMessageId: null,
  status: "idle",
  error: null,
};

export function getReadAloudState(): ReadAloudState {
  return state;
}

export function subscribeReadAloud(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function setReadAloudState(next: Partial<ReadAloudState>): void {
  state = { ...state, ...next };
  emit();
}

export function resetReadAloudState(): void {
  state = { activeMessageId: null, status: "idle", error: null };
  emit();
}
