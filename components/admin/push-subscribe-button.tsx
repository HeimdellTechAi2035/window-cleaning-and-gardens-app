"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savePushSubscriptionAction, removePushSubscriptionAction } from "@/app/actions/push-subscription";

type Status = "checking" | "subscribed" | "unsubscribed" | "unsupported";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function PushSubscribeButton() {
  const [status, setStatus] = useState<Status>("checking");
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setStatus(existing ? "subscribed" : "unsubscribed");
    })();
  }, []);

  async function subscribe() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      alert("Push notifications aren't configured yet — add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Netlify first.");
      return;
    }

    setIsPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("unsubscribed");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON();

      const result = await savePushSubscriptionAction({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
      });
      if ("error" in result) {
        alert(result.error);
        return;
      }
      setStatus("subscribed");
    } finally {
      setIsPending(false);
    }
  }

  async function unsubscribe() {
    setIsPending(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("unsubscribed");
    } finally {
      setIsPending(false);
    }
  }

  if (status === "unsupported" || status === "checking") return null;

  return status === "subscribed" ? (
    <Button variant="outline" size="sm" onClick={unsubscribe} disabled={isPending} title="Turn off sign-up alerts">
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
      <span className="hidden sm:inline">Alerts on</span>
    </Button>
  ) : (
    <Button variant="outline" size="sm" onClick={subscribe} disabled={isPending} title="Enable sign-up alerts">
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
      <span className="hidden sm:inline">Enable sign-up alerts</span>
    </Button>
  );
}
