import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./src/lib/liminal/monitoring";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.LIMINAL_ENVIRONMENT,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,
  tracesSampleRate: 0.05,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
});
