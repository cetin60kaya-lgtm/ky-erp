using System.Text.Json;

namespace KyPdks.Unified;

internal sealed record UnifiedLocalActionPlan(
    string Action,
    string LocalDomain,
    bool TouchesFirebird,
    bool TouchesAnnualTnf,
    bool TouchesTerminalRaw,
    bool UsesLegacyKeyMapping,
    bool ApplySupported,
    string[] RequiredProof,
    string Summary)
{
    internal object ToJournal() => new
    {
        action = Action,
        localDomain = LocalDomain,
        touchesFirebird = TouchesFirebird,
        touchesAnnualTnf = TouchesAnnualTnf,
        touchesTerminalRaw = TouchesTerminalRaw,
        usesLegacyKeyMapping = UsesLegacyKeyMapping,
        applySupported = ApplySupported,
        requiredProof = RequiredProof,
        summary = Summary,
    };
}

internal static class UnifiedLocalActionPlanner
{
    private static readonly HashSet<string> SupportedActions = new(StringComparer.Ordinal)
    {
        "work-group",
        "personnel-group",
        "assign-work-group",
        "assign-personnel-group",
        "service",
        "assign-service",
        "holiday",
        "leave",
        "advance",
        "overtime",
        "deduction",
    };

    internal static UnifiedLocalActionPlan Build(string action, JsonElement commandData)
    {
        if (!SupportedActions.Contains(action))
            throw new InvalidOperationException("LOCAL_ACTION_NOT_SUPPORTED:" + action);
        if (commandData.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("LOCAL_COMMAND_DATA_REQUIRED:" + action);

        // These 11 commands are administrative records. They never become physical
        // terminal evidence and never mutate annual TNF directly. Normal punch/TNF
        // changes belong to the separate approved attendance-correction workflow.
        return action switch
        {
            "work-group" => Plan(action, "LEGACY_WORK_GROUP", true, true,
                "GRUP/DONEM local key mapping + shift-time schema proof + copy-FDB transaction proof"),
            "personnel-group" => Plan(action, "LOCAL_PUNCH_POLICY", false, true,
                "sidecar policy schema + requirePunch compatibility proof"),
            "assign-work-group" => Plan(action, "PERSON_WORK_GROUP", true, true,
                "employee card mapping + cloud group→GRUP.KOD mapping + copy-FDB rollback proof"),
            "assign-personnel-group" => Plan(action, "PERSON_PUNCH_POLICY", false, false,
                "verified five-digit card + original signed personnel-group command mapping"),
            "service" => Plan(action, "LEGACY_SERVICE", true, true,
                "cloud service→SERVIS.KOD mapping + copy-FDB definition proof"),
            "assign-service" => Plan(action, "PERSON_SERVICE", true, true,
                "employee card mapping + cloud service→SERVIS.KOD mapping + copy-FDB rollback proof"),
            "holiday" => Plan(action, "LOCAL_CALENDAR_POLICY", false, false,
                "local calendar sidecar schema + half-day decision proof"),
            "leave" => Plan(action, "LEGACY_LEAVE", true, false,
                "employee card mapping + inclusive/exclusive date policy + OZELIZIN copy-FDB proof"),
            "advance" => Plan(action, "LEGACY_FINANCIAL_ADJUSTMENT", true, false,
                "employee card mapping + AVTUR/TURKOD meaning proof + AVANS copy-FDB proof"),
            "deduction" => Plan(action, "LEGACY_FINANCIAL_ADJUSTMENT", true, false,
                "employee card mapping + AVTUR/TURKOD meaning proof + AVANS copy-FDB proof"),
            "overtime" => Plan(action, "LOCAL_OVERTIME_APPROVAL", true, false,
                "employee card mapping + PUANTAJ/UCRETLER ownership proof + copy-FDB payroll proof"),
            _ => throw new InvalidOperationException("LOCAL_ACTION_NOT_SUPPORTED:" + action),
        };
    }

    private static UnifiedLocalActionPlan Plan(
        string action,
        string domain,
        bool touchesFirebird,
        bool usesLegacyMapping,
        string proof) =>
        new(
            action,
            domain,
            touchesFirebird,
            TouchesAnnualTnf: false,
            TouchesTerminalRaw: false,
            UsesLegacyKeyMapping: usesLegacyMapping,
            // Two non-FDB policy mirrors are eligible only with explicit Agent
            // opt-in and durable journal replay. All Firebird mappings stay locked.
            ApplySupported: action is "personnel-group" or "assign-personnel-group" or "holiday",
            RequiredProof: proof.Split(" + ", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            Summary: "Frozen administrative plan only; no physical punch, RAW or annual TNF mutation.");

    internal static void AssertContract()
    {
        if (SupportedActions.Count != 11)
            throw new InvalidOperationException("LOCAL_PLAN_ACTION_COUNT");
        using var empty = JsonDocument.Parse("{}");
        foreach (var action in SupportedActions)
        {
            var plan = Build(action, empty.RootElement);
            if (plan.TouchesAnnualTnf)
                throw new InvalidOperationException("ADMIN_COMMAND_MUST_NOT_TOUCH_TNF:" + action);
            if (plan.TouchesTerminalRaw)
                throw new InvalidOperationException("ADMIN_COMMAND_MUST_NOT_TOUCH_RAW:" + action);
            if (plan.ApplySupported && (!UnifiedLocalPolicyStore.Supports(action) ||
                plan.TouchesFirebird || plan.TouchesAnnualTnf || plan.TouchesTerminalRaw))
                throw new InvalidOperationException("UNPROVEN_LOCAL_HANDLER_ENABLED:" + action);
        }
    }
}
