namespace QuickDataTool;

public sealed partial class MainForm
{
    bool loadingEPeople;
    int ePeopleVersion;
    internal async Task LoadEPeopleAsync()
    {
        var database = db;
        var version = ++ePeopleVersion;
        if (database is null) return;
        var checkedCards = ePeopleList.CheckedItems.Cast<string>().Select(item => item.Split(' ')[0]).ToHashSet();
        var selected = ePerson.SelectedItem?.ToString();
        try
        {
            var people = await Task.Run(() => DbRecordService.ReadPeople(database, CancellationToken.None));
            if (IsDisposed || version != ePeopleVersion || !ReferenceEquals(database, db)) return;
            loadingEPeople = true;
            ePeopleList.BeginUpdate(); ePeopleList.Items.Clear(); ePerson.Items.Clear(); ePerson.Items.Add("Tümü");
            foreach (var person in people) { ePeopleList.Items.Add(person.ToString(), checkedCards.Contains(person.Card)); ePerson.Items.Add(person.ToString()); }
            ePerson.SelectedItem = selected is not null && ePerson.Items.Contains(selected) ? selected : "Tümü";
            var card = SelectedCard(ePerson);
            if (card is not null) for (var index = 0; index < ePeopleList.Items.Count; index++) ePeopleList.SetItemChecked(index, ePeopleList.Items[index].ToString()!.StartsWith(card + " ", StringComparison.Ordinal));
            ePeopleList.EndUpdate();
        }
        catch (Exception exception) { if (!IsDisposed && version == ePeopleVersion) MessageBox.Show(this, "E personelleri yüklenemedi: " + exception.Message, "E İşlemleri", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        finally { loadingEPeople = false; }
    }
}
