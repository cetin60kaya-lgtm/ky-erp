#define MyAppName "KY PDKS Pro"
#define MyAppVersion "1.9.0"
#define MyPublisher "KY ERP"
#define Dist GetEnv("KY_PDKS_DIST")
#define SetupOut GetEnv("KY_PDKS_SETUP_OUT")

[Setup]
AppId={{66C7B6AA-FF3F-4F46-9D53-1F6EFD95C82A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
VersionInfoVersion=1.9.0.0
VersionInfoCompany={#MyPublisher}
VersionInfoDescription=KY PDKS Pro • canlı devam kontrolü, AI, puantaj, vardiya, izin, terminal ve denetim
AppPublisher={#MyPublisher}
AppPublisherURL=https://kyerp.net
AppSupportURL=https://kyerp.net
DefaultDirName={autopf}\KY ERP\PDKS Pro
DefaultGroupName=KY ERP
DisableProgramGroupPage=yes
OutputDir={#SetupOut}
OutputBaseFilename=KY-PDKS-Pro-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=KY PDKS Pro
SetupLogging=yes
CloseApplications=yes
RestartApplications=no

[Dirs]
Name: "{commonappdata}\KY ERP\PDKS"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Data"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Import"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Archive"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Reject"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Backup"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Logs"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Reports"; Permissions: users-modify

[Files]
Source: "{#Dist}\pdks-desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Dist}\agent\*"; DestDir: "{app}\Agent"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "install-pdks-agent.ps1"; DestDir: "{app}\Installer"; Flags: ignoreversion
Source: "{#Dist}\webview2\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{autoprograms}\KY ERP\KY PDKS Pro"; Filename: "{app}\KY PDKS Pro.exe"
Name: "{autodesktop}\KY PDKS Pro"; Filename: "{app}\KY PDKS Pro.exe"; Tasks: desktopicon
Name: "{userstartup}\KY PDKS Pro"; Filename: "{app}\KY PDKS Pro.exe"; WorkingDir: "{app}"; Tasks: autostart

[Tasks]
Name: "desktopicon"; Description: "Masaüstünde KY PDKS Pro kısayolu oluştur"; GroupDescription: "Kısayollar:"; Flags: checkedonce
Name: "autostart"; Description: "Windows açıldığında KY PDKS Pro'ı başlat"; GroupDescription: "Başlangıç:"; Flags: unchecked

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; Flags: runhidden waituntilterminated; StatusMsg: "Microsoft WebView2 hazırlanıyor..."
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Installer\install-pdks-agent.ps1"" -ExePath ""{app}\Agent\KYERP.PDKS.Agent.exe"""; Flags: runhidden waituntilterminated logoutput; StatusMsg: "KY PDKS Agent servis olarak kuruluyor ve doğrulanıyor..."
Filename: "{app}\KY PDKS Pro.exe"; Description: "KY PDKS Pro uygulamasını aç"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\Installer\install-pdks-agent.ps1"" -ExePath ""{app}\Agent\KYERP.PDKS.Agent.exe"" -Uninstall"; Flags: runhidden waituntilterminated

[InstallDelete]
Type: files; Name: "{app}\KY PDKS Desktop.exe"
Type: files; Name: "{autodesktop}\KY PDKS Desktop.lnk"
Type: files; Name: "{autoprograms}\KY ERP\KY PDKS Desktop.lnk"
Type: files; Name: "{userstartup}\KY PDKS Desktop.lnk"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
