#!/bin/sh
# Launch the dev server with the billing gate ON.
# ⚠️ MUST export-and-exec. `nohup env FLAG=true npx next dev` did NOT set the flag
# on this machine and produced a fully green vacuous run. npx re-execs and loses it.
cd /Users/adrianschimizzi/Documents/GitHub/trackd-co-app

# ⚠️ CLEAR THE DEV CACHE FIRST, AND THIS IS NOT SUPERSTITION.
#
# Killing a Turbopack dev server mid-compile leaves `.next/dev` inconsistent, and
# the NEXT start reuses it and serves 404 FOR EVERY ROUTE with no compile error
# and a suspiciously fast "Ready in 4xxms". Measured twice on 18 Aug 2026, both
# times after a restart, and it reads exactly like a broken feature: the first
# time it cost a cycle chasing a launch-notice "defect" that did not exist.
#
# It is NOT the documented orphan trap — one server, no EADDRINUSE. The tell is
# gate-7's CONTROL failing: `Access null` for BOTH accounts rather than a wrong
# label on one. A control that fails on the control account means the environment
# is broken, not the product.
#
# ⚠️ Safe here and ONLY here: this script owns the lifecycle, and it kills every
# next process and waits for the port before touching `.next`. Never delete
# `.next` while a dev server is running.
pkill -f "node_modules/.bin/next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
for _ in 1 2 3 4 5 6 7 8 9 10; do
  lsof -nP -iTCP:3100 -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 1
done
if lsof -nP -iTCP:3100 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "REFUSING: something is still listening on 3100. Not clearing .next." >&2
  exit 1
fi
rm -rf .next

export BILLING_GATE_ENABLED=true
exec ./node_modules/.bin/next dev -H 127.0.0.1 -p 3100
