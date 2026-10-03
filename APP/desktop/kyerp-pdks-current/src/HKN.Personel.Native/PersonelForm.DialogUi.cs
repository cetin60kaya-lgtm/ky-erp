namespace HKN.Personel.Native;

public partial class PersonelForm
{
    Form CreatePersonelDialog(string title, Size preferred, Size minimum)
    {
        var p=PdksAppearance.Current;
        return new Form
        {
            Text=title,
            StartPosition=FormStartPosition.CenterParent,
            Size=preferred,
            MinimumSize=minimum,
            FormBorderStyle=FormBorderStyle.Sizable,
            MaximizeBox=true,
            MinimizeBox=false,
            ShowInTaskbar=false,
            Font=new Font("Segoe UI",9f),
            BackColor=p.Canvas,
            ForeColor=p.Text,
            AutoScaleMode=AutoScaleMode.Dpi
        };
    }

    static FlowLayoutPanel DialogActionBar(bool rightAligned=true)
        => PdksUiKit.ActionBar(rightAligned,PdksAppearance.Current.Canvas);

    static Button DialogAction(string text,int width,PdksActionRole role,Action? action=null)
        => PdksUiKit.Button(text,width,role,action);

    static Button TransferAction(string text,Action action)
    {
        var b=PdksUiKit.Button(text,42,PdksActionRole.Secondary,action);
        b.Height=30;
        b.MinimumSize=new Size(42,30);
        b.MaximumSize=new Size(42,30);
        b.Font=new Font("Segoe UI",10f,FontStyle.Bold);
        return b;
    }
}
