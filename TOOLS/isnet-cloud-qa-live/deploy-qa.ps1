# Archived X-only QA deployment entrypoint.
# The Cloudflare QA Worker and isolated D1 already exist.
# The user has moved the acceptance session to DESEN.
# Fail closed: never rotate the DESEN IP allowance or QA AES key from X.
Write-Output "LEGACY_X_QA_ENTRYPOINT_DISABLED=True"
Write-Output "No Cloudflare operation has been performed."
Write-Output "Use: TOOLS/isnet-cloud-qa-live/DESEN-KABUL-HAZIRLIK.ps1"
Write-Output "Stage 1: Kontrol (read-only). Stage 2: Aktiflestir (only after the user explicitly starts it on DESEN)."
exit 2
