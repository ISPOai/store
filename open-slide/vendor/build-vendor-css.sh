#!/bin/sh
# Regenerates src/app/vendor.css from the CSS layers upstream imports from
# node_modules (the host installs no app packages, so they ship in-repo).
set -eu
app="$(cd "$(dirname "$0")/.." && pwd)"
{
  echo "/* Vendored from tw-animate-css and shadcn/tailwind.css at the versions in"
  echo "   pnpm-lock.yaml. Regenerate with vendor/build-vendor-css.sh. */"
  cat "$app/node_modules/tw-animate-css/dist/tw-animate.css"
  echo
  cat "$app/node_modules/shadcn/dist/tailwind.css"
} > "$app/src/app/vendor.css"
echo "wrote $app/src/app/vendor.css"
cat "$app/node_modules/react-image-crop/dist/ReactCrop.css" >> "$app/src/app/vendor.css"
