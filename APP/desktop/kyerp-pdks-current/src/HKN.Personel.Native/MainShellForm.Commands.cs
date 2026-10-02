namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
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

        SelectNavForCommand(id);

        switch (id)
        {
            case PdksCommandId.Home:
                ShowHome();
                break;
            case PdksCommandId.LiveAttendance:
                OpenLiveAttendance();
                break;
            case PdksCommandId.EntryExit:
                OpenLegacyGirisCikis();
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
            case PdksCommandId.Periods:
                OpenDialogModule(PdksModule.Donemler);
                break;
            case PdksCommandId.Definitions:
                OpenDefinitions("Bölümler");
                break;
            case PdksCommandId.TerminalCenter:
                OpenTerminalCenter();
                break;
            case PdksCommandId.TerminalSettings:
                OpenTerminalSettingsDirect();
                break;
            case PdksCommandId.DataSources:
                using (var data = new QuickDataSourceForm()) data.ShowDialog(this);
                break;
            case PdksCommandId.BackupRestore:
                using (var backup = new BackupRestoreForm()) backup.ShowDialog(this);
                break;
            case PdksCommandId.Integrations:
                using (var integrations = new IntegrationCenterForm(this, currentUser)) integrations.ShowDialog(this);
                break;
            case PdksCommandId.AuditHistory:
                using (var audit = new AuditHistoryForm()) audit.ShowDialog(this);
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
            PdksCommandId.LiveAttendance or
            PdksCommandId.EntryExit or
            PdksCommandId.Personnel or
            PdksCommandId.Leave or
            PdksCommandId.EarningsDeductions or
            PdksCommandId.TimesheetDaily or
            PdksCommandId.TimesheetMonthly or
            PdksCommandId.TimesheetResults or
            PdksCommandId.PayrollGeneral or
            PdksCommandId.PayrollPayments or
            PdksCommandId.PayrollAdjustment or
            PdksCommandId.PayrollPayslip or
            PdksCommandId.PayrollOvertime or
            PdksCommandId.Reports or
            PdksCommandId.Groups or
            PdksCommandId.Periods or
            PdksCommandId.Definitions or
            PdksCommandId.TerminalCenter)
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

    void OpenThemeSettings() => ExecuteCommand(PdksCommandId.Theme);
}
