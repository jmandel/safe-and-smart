#!/usr/bin/env bash
# Bootstrap a new clinical-sandbox wrapper from the known-good reference
# implementation (the repo this skill ships in). All security-critical config
# (two-origin dev server, CSP, classic-worker build, broker) is inherited, so the
# result is safe by default. Bundled with Bun (no Vite).
#
# Usage:
#   new-project.sh <target-dir> [--name NAME] [--host-port 5173] [--sandbox-port 5174] [--ref PATH]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# skills/clinical-sandbox-applet/scripts -> repo root is three levels up.
REF_DEFAULT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

TARGET=""; NAME=""; HP=5173; SP=5174; REF="${REF_IMPL:-$REF_DEFAULT}"
while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="$2"; shift 2;;
    --host-port) HP="$2"; shift 2;;
    --sandbox-port) SP="$2"; shift 2;;
    --ref) REF="$2"; shift 2;;
    -*) echo "unknown flag: $1" >&2; exit 2;;
    *) TARGET="$1"; shift;;
  esac
done
[ -n "$TARGET" ] || { echo "usage: new-project.sh <target-dir> [--name NAME] [--host-port N] [--sandbox-port N] [--ref PATH]" >&2; exit 2; }
[ -f "$REF/build.ts" ] || { echo "reference implementation not found at: $REF (set --ref or REF_IMPL)" >&2; exit 1; }
[ -e "$TARGET" ] && { echo "target already exists: $TARGET" >&2; exit 1; }
NAME="${NAME:-$(basename "$TARGET")}"

echo "Cloning reference impl: $REF -> $TARGET"
mkdir -p "$TARGET"
( cd "$REF" && tar --exclude=node_modules --exclude=dist --exclude=.git \
    --exclude=skills --exclude='*.zip' --exclude=bun.lock -cf - . ) | ( cd "$TARGET" && tar -xf - )

echo "Rewriting ports ($HP host / $SP sandbox) and name ($NAME)"
for f in tools/serve.mjs src/host/App.tsx playwright.config.ts; do
  [ -f "$TARGET/$f" ] && sed -i "s/4173/$HP/g; s/4174/$SP/g" "$TARGET/$f"
done
[ -f "$TARGET/package.json" ] && sed -i "s/\"name\": \"[^\"]*\"/\"name\": \"$NAME\"/" "$TARGET/package.json"
[ -f "$TARGET/index.html" ] && sed -i "s#<title>.*</title>#<title>$NAME</title>#" "$TARGET/index.html"

cat <<DONE

Done. Next:
  cd "$TARGET"
  bun install
  bun run build.ts        # host/landing/launcher + applet bundles (classic IIFE)
  node tools/serve.mjs    # wrapper: http://localhost:$HP   sandbox: http://127.0.0.1:$SP

The starter ships two applets (Growth Explorer, Med Reconciliation) behind a
picker. Two ways to run your own applet:

A) HOST IT ANYWHERE, NO REGISTRATION. Build any compatible applet to one classic
   bundle (see the skill's standalone-applets.md) and serve it with permissive
   CORS (GitHub Pages, a CDN, S3…). Then run it in ANY compatible wrapper —
   including the public demo — by appending ?applet=<url>:
     https://joshuamandel.com/safe-and-smart/run/?applet=<your-bundle-url>
   Nothing is registered; the wrapper just fetches and sandboxes it.

B) BUNDLE IT INTO THIS WRAPPER (so it ships in the picker):
  1. Write src/applet/<your>/App.tsx (a React component; Zustand etc. work as-is).
  2. Add src/applet/<your>/entry.tsx: runApplet(App, {appletId, appletVersion}).
  3. Register it in build.ts (APPLETS) and in REGISTRY in src/host/App.tsx.
To use a real SMART launch instead of the open-endpoint demo, open /fhir/ (or the landing page)
(see skill references/capabilities.md). To deploy to GitHub Pages, build with
VITE_BASE=/<repo>/ VITE_SANDBOX_ORIGIN=self (see .github/workflows/deploy.yml).
DONE
