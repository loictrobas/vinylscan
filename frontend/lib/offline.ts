const QUEUE_KEY = "vinylscan_offline_queue";

export interface OfflineQueueItem {
  id: string;
  fileName: string;
  fileDataUrl: string; // base64
  queuedAt: string;
}

export function getOfflineQueue(): OfflineQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToOfflineQueue(item: OfflineQueueItem) {
  const q = getOfflineQueue();
  q.push(item);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function removeFromOfflineQueue(id: string) {
  const q = getOfflineQueue().filter((i) => i.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function clearOfflineQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failure is non-fatal
    });
  });
}

/** Convert File to base64 data URL for offline storage */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Convert base64 data URL back to File */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], name, { type: mime });
}
