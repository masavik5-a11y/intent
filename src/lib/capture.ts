import { useSyncExternalStore } from "react";

// Whether the capture dialog is open (PRD P8: capture from anywhere). Opened by the I
// key on any screen and by "Capture for later" in the phone's More sheet; the dialog
// itself is mounted once, in the app shell.

const listeners = new Set<() => void>();
let open = false;

function set(next: boolean): void {
  open = next;
  for (const listener of listeners) listener();
}

export const openCapture = () => set(true);
export const closeCapture = () => set(false);

export function useCaptureOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
  );
}
