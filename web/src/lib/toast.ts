export type ToastTone = "error" | "success";

export type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type Listener = (item: ToastItem) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function toast(message: string, tone: ToastTone = "error"): void {
  const text = String(message ?? "").trim();
  if (!text) return;
  const item: ToastItem = { id: nextId++, message: text, tone };
  listeners.forEach((fn) => fn(item));
}

export function toastError(message: string): void {
  toast(message, "error");
}

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
