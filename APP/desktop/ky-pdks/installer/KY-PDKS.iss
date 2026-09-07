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

[Icons]
Name: "{autoprograms}\KY ERP\KY PDKS Pro"; Filename: "{app}\KY PDKS Desktop.exe"
Name: "{autodesktop}\KY PDKS Pro"; Filename: "{app}\KY PDKS Pro.exe"; Tasks: desktopicon
Name: "{userstartup}\KY PDKS Pro"; Filename: "{app}\KY PDKS Pro.exe"; WorkingDir: "{app}"; Tasks: autostart

[Tasks]
Name: "desktopicon"; Description: "Masaüstünde KY PDKS Pro kısayolu oluştur"; GroupDescription: "Kısayollar:"; Flags: checkedonce
Name: "autostart"; Description: "Windows açıldığında KY PDKS Pro'ı başlat"; GroupDescription: "Başlangıç:"; Flags: unchecked

[Run]
Filename: "{sys}\sc.exe"; Parameters: "stop KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "delete KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "create KYERP.PDKS.Agent binPath= &quot;{app}\Agent\KYERP.PDKS.Agent.exe&quot; start= delayed-auto DisplayName= &quot;KY ERP PDKS Agent&quot;"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "description KYERP.PDKS.Agent &quot;KY ERP kart cihazı toplama ve D1 arka plan senkron servisi&quot;"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failure KYERP.PDKS.Agent reset= 86400 actions= restart/5000/restart/15000/restart/30000"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failureflag KYERP.PDKS.Agent 1"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "start KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated
Filename: "{app}\KY PDKS Pro.exe"; Description: "KY PDKS Pro uygulamasını aç"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "delete KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
