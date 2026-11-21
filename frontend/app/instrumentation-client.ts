import { installGlobalErrorHandlers } from "@/lib/errors/global";

/**
 * Runs after the document is loaded and before hydration (`instrumentation-client.md`): the global error handlers of
 * WP-32 are installed here, synchronously, so an error during hydration is reported. Keep it light — only top-level
 * synchronous code is guaranteed to finish before hydration, and the module imports no React, catalogue or PostHog.
 */
installGlobalErrorHandlers();
