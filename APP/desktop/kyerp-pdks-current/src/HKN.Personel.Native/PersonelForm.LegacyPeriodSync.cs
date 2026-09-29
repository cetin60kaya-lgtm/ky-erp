using System.Data;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    bool legacyPeriodSelectorsWired;

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        WireLegacyPeriodSelectors();
        SyncPeriodsToPerson();
        RefreshFullTabs();
    }

    void WireLegacyPeriodSelectors()
    {
        if (legacyPeriodSelectorsWired) return;
        legacyPeriodSelectorsWired = true;
        WirePeriod(periodG, gFrom, gTo);
        WirePeriod(periodI, iFrom, iTo);
        WirePeriod(periodE, eFrom, eTo);
    }

    void WirePeriod(ComboBox combo, DateTimePicker from, DateTimePicker to)
    {
        combo.SelectedIndexChanged += (_,_) =>
        {
            if (combo.SelectedItem is not DataRowView view) return;
            SetDateRange(view.Row, from, to);
        };
    }
}
