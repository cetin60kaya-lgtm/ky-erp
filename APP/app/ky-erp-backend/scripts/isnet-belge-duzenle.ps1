param(
  [ValidateSet("scan", "report", "verify", "apply", "quarantine-duplicates", "purge-quarantine")]
  [string]$Command = "scan",
  [string]$ReportId = "",
  [switch]$ConfirmApply
)

$arguments = @("run", "isnet:$Command", "--")
if ($ReportId) { $arguments += "--report=$ReportId" }
if ($ConfirmApply) { $arguments += "--confirm-apply" }

& npm @arguments
exit $LASTEXITCODE