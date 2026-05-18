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

export function usePushNotifications(isAuthenticated: boolean) {
  const done = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || done.current) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) { done.current = true; return }

        const { public_key: vapid_public_key } = await getPushVapidKey()
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid_public_key),
        })

        const json = sub.toJSON()
        await subscribePush({
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
        })
        done.current = true
      } catch {
        // Silently fail — push is optional
      }
    }

    register()
  }, [isAuthenticated])
}
