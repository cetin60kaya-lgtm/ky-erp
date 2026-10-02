namespace HKN.Personel.Native;

internal sealed class CommandPaletteForm : Form
{
    readonly IReadOnlyList<PdksCommandDescriptor> all;
    readonly TextBox search = new(){Dock=DockStyle.Top,Height=36,PlaceholderText="İşlem, menü veya ekran ara..."};
    readonly ListBox list = new(){Dock=DockStyle.Fill,IntegralHeight=false};
    readonly Label hint = new(){Dock=DockStyle.Bottom,Height=28,TextAlign=ContentAlignment.MiddleLeft,Padding=new Padding(8,4,0,0)};
    List<PdksCommandDescriptor> current = [];

    public PdksCommandId? SelectedCommand { get; private set; }

    public CommandPaletteForm(IEnumerable<PdksCommandDescriptor> commands)
    {
        all=commands.OrderBy(x=>x.Order).ToArray();
        Text="Hızlı İşlem";
        StartPosition=FormStartPosition.CenterParent;
        FormBorderStyle=FormBorderStyle.FixedDialog;
        MaximizeBox=false;
        MinimizeBox=false;
        ShowInTaskbar=false;
        Size=new Size(660,520);
        Font=new Font("Segoe UI",9f);
        Build();
        search.TextChanged+=(_,_)=>RefreshList();
        search.KeyDown+=SearchKeyDown;
        list.DoubleClick+=(_,_)=>AcceptSelection();
        list.KeyDown+=ListKeyDown;
        Shown+=(_,_)=>{search.Focus();RefreshList();};
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;
        var card=PdksUiKit.Card(14);
        card.Dock=DockStyle.Fill;
        card.Margin=new Padding(14);

        search.BackColor=p.Input;
        search.ForeColor=p.Text;
        search.BorderStyle=BorderStyle.FixedSingle;
        search.Font=new Font("Segoe UI",10f);

        list.BackColor=p.Surface;
        list.ForeColor=p.Text;
        list.BorderStyle=BorderStyle.None;
        list.Font=new Font("Segoe UI",9.5f);
        list.ItemHeight=28;

        hint.Text="↑ ↓ seç • Enter aç • Esc kapat";
        hint.ForeColor=p.Muted;

        card.Controls.Add(list);
        card.Controls.Add(hint);
        card.Controls.Add(search);
        Controls.Add(card);
        CancelButton=new Button{DialogResult=DialogResult.Cancel};
    }

    void RefreshList()
    {
        var q=search.Text.Trim();
        current=all.Where(x=>q.Length==0 ||
            x.Title.Contains(q,StringComparison.CurrentCultureIgnoreCase) ||
            x.Hint.Contains(q,StringComparison.CurrentCultureIgnoreCase) ||
            x.Group.Contains(q,StringComparison.CurrentCultureIgnoreCase))
            .OrderBy(x=>x.Order)
            .ToList();

        list.BeginUpdate();
        list.Items.Clear();
        foreach(var item in current)
            list.Items.Add($"{item.Title}   ·   {item.Group}");
        list.EndUpdate();
        if(list.Items.Count>0)list.SelectedIndex=0;
        hint.Text=list.Items.Count==0
            ?"Sonuç bulunamadı"
            :$"{list.Items.Count} işlem   •   ↑ ↓ seç • Enter aç • Esc kapat";
    }

    void SearchKeyDown(object? sender,KeyEventArgs e)
    {
        if(e.KeyCode==Keys.Down && list.Items.Count>0)
        {
            list.Focus();
            if(list.SelectedIndex<0)list.SelectedIndex=0;
            e.Handled=true;
        }
        else if(e.KeyCode==Keys.Enter)
        {
            AcceptSelection();
            e.Handled=true;
        }
        else if(e.KeyCode==Keys.Escape)
        {
            DialogResult=DialogResult.Cancel;
            Close();
        }
    }

    void ListKeyDown(object? sender,KeyEventArgs e)
    {
        if(e.KeyCode==Keys.Enter){AcceptSelection();e.Handled=true;}
        else if(e.KeyCode==Keys.Escape){DialogResult=DialogResult.Cancel;Close();}
        else if(e.KeyCode==Keys.Back)
        {
            search.Focus();
            if(search.Text.Length>0)search.Text=search.Text[..^1];
            search.SelectionStart=search.Text.Length;
        }
    }

    void AcceptSelection()
    {
        if(list.SelectedIndex<0 || list.SelectedIndex>=current.Count)return;
        SelectedCommand=current[list.SelectedIndex].Id;
        DialogResult=DialogResult.OK;
        Close();
    }
}
