/**
 * The build of the app (WP-32): `NEXT_PUBLIC_BUILD_VERSION`, set by the deploy, at most 40 characters; `dev` when
 * unset. The `v` of `app_launch` (WP-21, which read `NEXT_PUBLIC_APP_VERSION`, never set) and of `app_error`, and the
 * `build` super property of PostHog.
 */
export const BUILD_VERSION = (process.env.NEXT_PUBLIC_BUILD_VERSION ?? "").trim().slice(0, 40) || "dev";
