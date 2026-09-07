#define MyAppName "KY ERP Desktop"
#define MyAppVersion "1.9.0"
#define MyPublisher "KY ERP"
#define Dist GetEnv("KY_PDKS_DIST")
#define SetupOut GetEnv("KY_PDKS_SETUP_OUT")

[Setup]
AppId={{7B558935-8DD5-4D1F-9A62-A1D79EE27C10}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
VersionInfoVersion=1.9.0.0
VersionInfoCompany={#MyPublisher}
VersionInfoDescription=KY ERP Desktop • tam KY ERP + File Hub + AI + İK/PDKS Windows çalışma merkezi
AppPublisher={#MyPublisher}
AppPublisherURL=https://kyerp.net
AppSupportURL=https://kyerp.net
DefaultDirName={autopf}\KY ERP\Desktop
DefaultGroupName=KY ERP
DisableProgramGroupPage=yes
OutputDir={#SetupOut}
OutputBaseFilename=KY-ERP-Desktop-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=KY ERP Desktop
SetupLogging=yes
CloseApplications=yes
RestartApplications=no

[Dirs]
Name: "{commonappdata}\KY ERP\Desktop"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\Desktop\Data"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\Desktop\Backup"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\Desktop\Logs"; Permissions: users-modify

[Files]
Source: "{#Dist}\erp-desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Dist}\file-agent\*"; DestDir: "{app}\FileAgent"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\KY ERP\KY ERP Desktop"; Filename: "{app}\KY ERP Desktop.exe"
Name: "{autodesktop}\KY ERP Desktop"; Filename: "{app}\KY ERP Desktop.exe"; Tasks: desktopicon
Name: "{userstartup}\KY ERP Desktop"; Filename: "{app}\KY ERP Desktop.exe"; WorkingDir: "{app}"; Tasks: autostart

[Tasks]
Name: "desktopicon"; Description: "Masaüstünde KY ERP Desktop kısayolu oluştur"; GroupDescription: "Kısayollar:"; Flags: checkedonce
Name: "autostart"; Description: "Windows açıldığında KY ERP Desktop'ı başlat"; GroupDescription: "Başlangıç:"; Flags: unchecked

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File &quot;{app}\FileAgent\install-file-hub-agent.ps1&quot; -TaskName &quot;KY ERP File Hub Agent&quot;"; Flags: runhidden waituntilterminated
Filename: "{app}\KY ERP Desktop.exe"; Description: "KY ERP Desktop uygulamasını aç"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "delete KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN &quot;KY ERP File Hub Agent&quot;"; Flags: runhidden waituntilterminated
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN &quot;KY ERP File Hub Agent&quot; /F"; Flags: runhidden waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
