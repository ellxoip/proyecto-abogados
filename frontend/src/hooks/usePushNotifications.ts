import { useEffect, useRef } from 'react'
import { getPushVapidKey, subscribePush } from '../api'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  // Explicitly request permission — browser shows the system dialog
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  const reg = await navigator.serviceWorker.ready

  // Get or create subscription
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { public_key } = await getPushVapidKey()
    if (!public_key) return
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key),
    })
  }

  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return

  // Always POST so the server always has the current subscription
  await subscribePush({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  })
}

export function usePushNotifications(isAuthenticated: boolean) {
  const registered = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) { registered.current = false; return }
    if (registered.current) return
    registered.current = true

    registerPush().catch(() => {
      registered.current = false // allow retry on next mount
    })
  }, [isAuthenticated])
}
