$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "KY ERP - Resend API Key"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(620, 220)
$form.MinimumSize = $form.Size
$form.MaximumSize = $form.Size
$form.TopMost = $true
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ShowInTaskbar = $true

$title = New-Object System.Windows.Forms.Label
$title.Location = New-Object System.Drawing.Point(22, 18)
$title.Size = New-Object System.Drawing.Size(560, 24)
$title.Text = "Resend API key (re_...)"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($title)

$info = New-Object System.Windows.Forms.Label
$info.Location = New-Object System.Drawing.Point(22, 48)
$info.Size = New-Object System.Drawing.Size(560, 36)
$info.Text = "Key'i asagidaki kutuya yapistirin. Karakterler gizli gorunur. Key diske veya loga yazilmaz."
$form.Controls.Add($info)

$textBox = New-Object System.Windows.Forms.TextBox
$textBox.Location = New-Object System.Drawing.Point(22, 88)
$textBox.Size = New-Object System.Drawing.Size(560, 28)
$textBox.UseSystemPasswordChar = $true
$textBox.Font = New-Object System.Drawing.Font("Consolas", 10)
$form.Controls.Add($textBox)

$okButton = New-Object System.Windows.Forms.Button
$okButton.Location = New-Object System.Drawing.Point(390, 132)
$okButton.Size = New-Object System.Drawing.Size(90, 32)
$okButton.Text = "OK"
$form.Controls.Add($okButton)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Location = New-Object System.Drawing.Point(492, 132)
$cancelButton.Size = New-Object System.Drawing.Size(90, 32)
$cancelButton.Text = "Cancel"
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelButton)

$form.AcceptButton = $okButton
$form.CancelButton = $cancelButton

$okButton.Add_Click({
    $value = [string]$textBox.Text
    if ([string]::IsNullOrWhiteSpace($value) -or -not $value.StartsWith("re_") -or $value.Length -lt 10) {
        [System.Windows.Forms.MessageBox]::Show(
            "Gecerli bir Resend API key girin. Key re_ ile baslamalidir.",
            "KY ERP",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        $textBox.Focus()
        $textBox.SelectAll()
        return
    }
    $form.Tag = $value
    $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Close()
})

$form.Add_Shown({ $textBox.Focus() })
$result = $form.ShowDialog()

if ($result -ne [System.Windows.Forms.DialogResult]::OK -or [string]::IsNullOrWhiteSpace([string]$form.Tag)) {
    $textBox.Text = ""
    $form.Tag = $null
    exit 2
}

$key = [string]$form.Tag
$textBox.Text = ""
$form.Tag = $null
$form.Dispose()

[Console]::Out.Write($key)
$key = $null
exit 0
