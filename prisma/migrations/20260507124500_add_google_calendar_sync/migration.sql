-- CreateTable
CREATE TABLE "google_calendar_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "picture" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "accessTokenExpires" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_google_calendar_events" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "eventId" TEXT NOT NULL,
    "htmlLink" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_google_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_connections_userId_googleAccountId_key" ON "google_calendar_connections"("userId", "googleAccountId");

-- CreateIndex
CREATE INDEX "google_calendar_connections_userId_active_idx" ON "google_calendar_connections"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "lead_google_calendar_events_leadId_connectionId_calendarId_key" ON "lead_google_calendar_events"("leadId", "connectionId", "calendarId");

-- CreateIndex
CREATE INDEX "lead_google_calendar_events_connectionId_idx" ON "lead_google_calendar_events"("connectionId");

-- CreateIndex
CREATE INDEX "lead_google_calendar_events_leadId_idx" ON "lead_google_calendar_events"("leadId");

-- AddForeignKey
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_google_calendar_events" ADD CONSTRAINT "lead_google_calendar_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_google_calendar_events" ADD CONSTRAINT "lead_google_calendar_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "google_calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
