import { auth } from "@/lib/auth";
// Presence update needs direct DB access (like auth bootstrap) — RLS
// depends on the session being established, and we're just pinging lastSeenAt.
// eslint-disable-next-line no-restricted-imports
import { _prisma } from "@/lib/db/_client";

/**
 * Updates the current user's lastSeenAt timestamp.
 * Called from the admin layout on each server-side render.
 * Uses direct prisma (not RLS) since this is a simple presence ping.
 */
export async function updatePresence() {
  try {
    const session = await auth();
    if (!session?.user?.id) return;

    await _prisma.user.updateMany({
      where: { id: session.user.id },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    // Silently fail — presence is non-critical
  }
}

/**
 * Checks if a user is "online" based on their lastSeenAt timestamp.
 * Online = last seen within the last 5 minutes.
 */
export function isOnline(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return lastSeenAt.getTime() > fiveMinutesAgo;
}
