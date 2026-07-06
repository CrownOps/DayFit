import { pushApi } from "./resources";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function subscribeToPush(deviceLabel?: string): Promise<void> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("VAPID 공개키가 설정되어 있지 않습니다");

  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("알림 권한이 거부되었습니다");

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = sub.toJSON();
  await pushApi.subscribe({
    endpoint: json.endpoint!,
    keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
    device_label: deviceLabel,
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getExistingSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  // Remove matching server-side row(s).
  const rows = await pushApi.list();
  await Promise.all(rows.filter((r) => r.endpoint === endpoint).map((r) => pushApi.remove(r.id)));
}
