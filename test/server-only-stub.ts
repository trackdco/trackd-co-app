/**
 * A no-op stand-in for the `server-only` package, for vitest.
 *
 * `server-only` has no runtime: it is a package whose "browser" entry point
 * throws at BUILD time, so a client component importing a server module fails
 * the build rather than shipping a secret. Outside a Next bundle it does not
 * resolve at all, and vitest resolves for real.
 *
 * Aliased in `vitest.config.ts`. Nothing imports this file directly.
 */
export {};
