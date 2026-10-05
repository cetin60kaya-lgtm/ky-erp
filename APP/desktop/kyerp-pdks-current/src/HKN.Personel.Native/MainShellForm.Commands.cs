namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    readonly Stack<PdksCommandId> navigationHistory = [];
    PdksCommandId? currentWorkspaceCommand;
    bool navigatingBack;

    static bool IsWorkspaceCommand(PdksCommandId id) => id is
        PdksCommandId.Home or
        PdksCommandId.Operations or
        PdksCommandId.LiveAttendance or
        PdksCommandId.MonthlyAttendanceAdmin or
        PdksCommandId.AttendanceExceptions or
        PdksCommandId.AttendanceHistory or
        PdksCommandId.DepartmentAttendanceAnalytics or
        PdksCommandId.EntryExit or
        PdksCommandId.Personnel or
        PdksCommandId.Leave or
        PdksCommandId.EarningsDeductions or
        PdksCommandId.TimesheetDaily or
        PdksCommandId.TimesheetMonthly or
        PdksCommandId.TimesheetResults or
        PdksCommandId.PayrollGeneral or
        PdksCommandId.PayrollPayments or
        PdksCommandId.PeriodControlCenter or
        PdksCommandId.PayrollAdjustment or
        PdksCommandId.PayrollPayslip or
        PdksCommandId.PayrollOvertime or
        PdksCommandId.Reports or
        PdksCommandId.Groups or
        PdksCommandId.ServiceRoutes or
        PdksCommandId.Periods or
        PdksCommandId.WorkingDate or
        PdksCommandId.Holidays or
        PdksCommandId.DailyWorkHours or
        PdksCommandId.AnnualWorkPlan or
        PdksCommandId.PayrollFields or
        PdksCommandId.EarningsTypes or
        PdksCommandId.Definitions or
        PdksCommandId.TerminalCenter or
        PdksCommandId.DataSources or
        PdksCommandId.BackupRestore or
        PdksCommandId.Integrations or
        PdksCommandId.AuditHistory;

    bool CanExecute(PdksCommandDescriptor command)
    {
        if (command.AdminOnly && !currentUser.IsAdmin) return false;
        if (command.SuperAdminOnly && !currentUser.IsSuperAdmin) return false;
        if (command.ResponsibleOnly && !(currentUser.IsCompanyResponsible || currentUser.IsSuperAdmin)) return false;
        if (command.Module == PdksModule.Home) return true;
        return currentUser.Can(command.Module);
    }

    void ExecuteCommand(PdksCommandId id)
    {
        var command = PdksCommandCatalog.Get(id);
        if (!CanExecute(command))
        {
            MessageBox.Show("Bu işlem için yetkiniz yok.", "KYERP PDKS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (IsWorkspaceCommand(id))
        {
            if (!navigatingBack && currentWorkspaceCommand is PdksCommandId previous && previous != id)
                navigationHistory.Push(previous);
            currentWorkspaceCommand=id;
            RefreshBackButton();
        }

        SelectNavForCommand(id);

        switch (id)
        {
            case PdksCommandId.Home:
                ShowHome();
                break;
            case PdksCommandId.Operations:
                OpenLegacyGirisCikis();
                break;
            case PdksCommandId.LiveAttendance:
                OpenLiveAttendance();
                break;
            case PdksCommandId.MonthlyAttendanceAdmin:
                ShowModule(new MonthlyAttendanceAdminForm(currentUser), PdksModule.GirisCikis);
                break;
            case PdksCommandId.AttendanceExceptions:
                ShowModule(new AttendanceExceptionCenterForm(NavigateToCommand), PdksModule.GunlukOperasyon);
                break;
            case PdksCommandId.AttendanceHistory:
                ShowModule(new AttendanceHistoryForm(false), PdksModule.GunlukOperasyon);
                break;
            case PdksCommandId.DepartmentAttendanceAnalytics:
                ShowModule(new DepartmentAttendanceAnalyticsForm(), PdksModule.GunlukOperasyon);
                break;
            case PdksCommandId.EntryExit:
                ShowOperationsCenter();
                break;
            case PdksCommandId.Personnel:
                OpenPersonel();
                break;
            case PdksCommandId.Leave:
                OpenLegacyIzin();
                break;
            case PdksCommandId.EarningsDeductions:
                OpenLegacyKazancKesinti();
                break;
            case PdksCommandId.QuickOperations:
                using (var quick = new ResponsibleQuickOperationsForm(this)) quick.ShowDialog(this);
                break;
            case PdksCommandId.TimesheetDaily:
                OpenPuantaj(0);
                break;
            case PdksCommandId.TimesheetMonthly:
                OpenPuantaj(1);
                break;
            case PdksCommandId.TimesheetResults:
                OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj);
                break;
            case PdksCommandId.PayrollGeneral:
                OpenBordro(0);
                break;
            case PdksCommandId.PayrollPayments:
                OpenPersonelTab(PdksModule.Bordro);
                break;
            case PdksCommandId.PeriodControlCenter:
                ShowModule(new PeriodControlCenterForm(NavigateToCommand), PdksModule.Bordro);
                break;
            case PdksCommandId.PayrollAdjustment:
                ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro);
                break;
            case PdksCommandId.PayrollPayslip:
                OpenBordro(2);
                break;
            case PdksCommandId.PayrollOvertime:
                OpenBordro(1);
                break;
            case PdksCommandId.Reports:
                OpenReportCenter(null);
                break;
            case PdksCommandId.Groups:
                OpenGroups();
                break;
            case PdksCommandId.ServiceRoutes:
                ShowModule(new ServiceRouteForm(), PdksModule.Tanimlar);
                break;
            case PdksCommandId.Periods:
                OpenDialogModule(PdksModule.Donemler);
                break;
            case PdksCommandId.WorkingDate:
                OpenWorkingDate();
                break;
            case PdksCommandId.Holidays:
                OpenLegacyTable("Genel Tatiller", "TATIL", true, new Size(1040, 680));
                break;
            case PdksCommandId.DailyWorkHours:
                OpenLegacyTable("Günlük Çalışma Saatleri", "PUANBILGI", true, new Size(1120, 700));
                break;
            case PdksCommandId.AnnualWorkPlan:
                ShowModule(new AnnualWorkPlanForm(), PdksModule.Tanimlar);
                break;
            case PdksCommandId.PayrollFields:
                OpenDefinitions("Bordro");
                break;
            case PdksCommandId.EarningsTypes:
                OpenLegacyTable("Kazanç / Kesinti Türleri", "AVTUR", true, new Size(1040, 680));
                break;
            case PdksCommandId.Definitions:
                ShowModule(new DefinitionsCenterForm(OpenDefinitions, NavigateToCommand), PdksModule.Tanimlar);
                break;
            case PdksCommandId.TerminalCenter:
                OpenTerminalCenter();
                break;
            case PdksCommandId.TerminalSettings:
                OpenTerminalSettingsDirect();
                break;
            case PdksCommandId.TerminalProfiles:
                OpenTerminalProfilesAdvanced();
                break;
            case PdksCommandId.DataSources:
                ShowModule(new QuickDataSourceForm(), PdksModule.Terminal);
                break;
            case PdksCommandId.BackupRestore:
                ShowModule(new BackupRestoreForm(), PdksModule.Tanimlar);
                break;
            case PdksCommandId.Integrations:
                ShowModule(new IntegrationCenterForm(this, currentUser), PdksModule.Tanimlar);
                break;
            case PdksCommandId.AuditHistory:
                ShowModule(new AuditHistoryForm(), PdksModule.Raporlar);
                break;
            case PdksCommandId.UserManagement:
                OpenUserManagement();
                break;
            case PdksCommandId.License:
                using (var license = new CompanyLicenseCenterForm()) license.ShowDialog(this);
                break;
            case PdksCommandId.Theme:
                using (var theme = new ThemeSettingsForm()) theme.ShowDialog(this);
                break;
            case PdksCommandId.QuickGuide:
                using (var guide = new PdksQuickGuideForm()) guide.ShowDialog(this);
                break;
            case PdksCommandId.About:
                using (var about = new AboutKy6Form()) about.ShowDialog(this);
                break;
        }

        if (id is PdksCommandId.Home or
            PdksCommandId.Operations or
            PdksCommandId.LiveAttendance or
            PdksCommandId.AttendanceExceptions or
            PdksCommandId.AttendanceHistory or
            PdksCommandId.DepartmentAttendanceAnalytics or
            PdksCommandId.EntryExit or
            PdksCommandId.Personnel or
            PdksCommandId.Leave or
            PdksCommandId.EarningsDeductions or
            PdksCommandId.TimesheetDaily or
            PdksCommandId.TimesheetMonthly or
            PdksCommandId.TimesheetResults or
            PdksCommandId.PayrollGeneral or
            PdksCommandId.PayrollPayments or
            PdksCommandId.PeriodControlCenter or
            PdksCommandId.PayrollAdjustment or
            PdksCommandId.PayrollPayslip or
            PdksCommandId.PayrollOvertime or
            PdksCommandId.Reports or
            PdksCommandId.Groups or
            PdksCommandId.Periods or
            PdksCommandId.WorkingDate or
            PdksCommandId.Holidays or
            PdksCommandId.DailyWorkHours or
            PdksCommandId.AnnualWorkPlan or
            PdksCommandId.PayrollFields or
            PdksCommandId.EarningsTypes or
            PdksCommandId.Definitions or
            PdksCommandId.TerminalCenter or
            PdksCommandId.DataSources or
            PdksCommandId.BackupRestore or
            PdksCommandId.Integrations or
            PdksCommandId.AuditHistory)
        {
            SetModernPage(command.Title, command.Hint);
        }
    }

    IEnumerable<PdksCommandDescriptor> VisiblePrimaryCommands() =>
        PdksCommandCatalog.Primary.Where(CanExecute);

    IEnumerable<IGrouping<string,PdksCommandDescriptor>> VisibleManagementGroups() =>
        PdksCommandCatalog.Management
            .Where(CanExecute)
            .GroupBy(x=>x.Group)
            .OrderBy(x=>x.Min(c=>c.Order));

    public void NavigateToCommand(PdksCommandId id) => ExecuteCommand(id);

    void OpenThemeSettings() => ExecuteCommand(PdksCommandId.Theme);

    void OpenCommandPalette()
    {
        using var palette = new CommandPaletteForm(PdksCommandCatalog.All.Where(CanExecute));
        if (palette.ShowDialog(this) == DialogResult.OK && palette.SelectedCommand is PdksCommandId id)
            ExecuteCommand(id);
    }

    void NavigateBack()
    {
        if (navigationHistory.Count==0) return;
        var target=navigationHistory.Pop();
        navigatingBack=true;
        try { ExecuteCommand(target); }
        finally
        {
            navigatingBack=false;
            RefreshBackButton();
        }
    }
}
