namespace HKN.Personel.Native;

public partial class PersonelForm
{
    void ShowDailyOperations()
    {
        using var dialog = new LiveAttendanceForm();
        dialog.ShowDialog(this);
    }
}
