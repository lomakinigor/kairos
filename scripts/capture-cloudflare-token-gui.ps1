$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Kairos - Cloudflare Token'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size(560, 190)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Paste the new Cloudflare API Token'
$title.Location = New-Object System.Drawing.Point(24, 20)
$title.Size = New-Object System.Drawing.Size(510, 24)
$title.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($title)

$note = New-Object System.Windows.Forms.Label
$note.Text = 'The token will be encrypted with Windows DPAPI.'
$note.Location = New-Object System.Drawing.Point(24, 48)
$note.Size = New-Object System.Drawing.Size(510, 20)
$note.ForeColor = [System.Drawing.Color]::DimGray
$form.Controls.Add($note)

$tokenBox = New-Object System.Windows.Forms.TextBox
$tokenBox.Location = New-Object System.Drawing.Point(24, 80)
$tokenBox.Size = New-Object System.Drawing.Size(510, 27)
$tokenBox.UseSystemPasswordChar = $true
$form.Controls.Add($tokenBox)

$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(24, 118)
$status.Size = New-Object System.Drawing.Size(350, 24)
$status.ForeColor = [System.Drawing.Color]::Firebrick
$form.Controls.Add($status)

$save = New-Object System.Windows.Forms.Button
$save.Text = 'Save securely'
$save.Location = New-Object System.Drawing.Point(414, 120)
$save.Size = New-Object System.Drawing.Size(120, 34)
$save.Add_Click({
  if ([string]::IsNullOrWhiteSpace($tokenBox.Text)) {
    $status.Text = 'Paste the token first.'
    return
  }
  $targetDir = Join-Path $env:APPDATA 'kairos'
  $targetFile = Join-Path $targetDir 'cloudflare-token.dpapi'
  New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  $secure = ConvertTo-SecureString $tokenBox.Text -AsPlainText -Force
  $secure | ConvertFrom-SecureString | Set-Content -Encoding UTF8 -LiteralPath $targetFile
  $tokenBox.Text = ''
  $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
  $form.Close()
})
$form.Controls.Add($save)
$form.AcceptButton = $save
$form.Add_Shown({ $tokenBox.Focus() })

[void]$form.ShowDialog()
