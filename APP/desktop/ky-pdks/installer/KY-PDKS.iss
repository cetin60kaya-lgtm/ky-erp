#define MyAppName "KY ERP Masaüstü"
#define MyAppVersion "1.5.0"
#define MyPublisher "KY ERP"
#define Dist GetEnv("KY_PDKS_DIST")
#define SetupOut GetEnv("KY_PDKS_SETUP_OUT")

[Setup]
AppId={{7B558935-8DD5-4D1F-9A62-A1D79EE27C10}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
VersionInfoVersion=1.5.0.0
VersionInfoCompany={#MyPublisher}
VersionInfoDescription=KY ERP Masaüstü • ERP + PDKS + offline senkron merkezi
AppPublisher={#MyPublisher}
AppPublisherURL=https://kyerp.net
AppSupportURL=https://kyerp.net
DefaultDirName={autopf}\KY ERP\Masaüstü
DefaultGroupName=KY ERP
DisableProgramGroupPage=yes
OutputDir={#SetupOut}
OutputBaseFilename=KY-ERP-Masaustu-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=KY ERP Masaüstü
SetupLogging=yes

[Dirs]
Name: "{commonappdata}\KY ERP\Desktop"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\Desktop\Data"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\Desktop\Backup"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\Desktop\Logs"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Data"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Import"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Archive"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Reject"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Backup"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Logs"; Permissions: users-modify
Name: "{commonappdata}\KY ERP\PDKS\Reports"; Permissions: users-modify

[Files]
Source: "{#Dist}\desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Dist}\agent\*"; DestDir: "{app}\Agent"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\KY ERP\KY ERP Masaüstü"; Filename: "{app}\KY ERP Masaüstü.exe"
Name: "{autodesktop}\KY ERP Masaüstü"; Filename: "{app}\KY ERP Masaüstü.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Masaüstünde KY ERP Masaüstü kısayolu oluştur"; GroupDescription: "Kısayollar:"; Flags: checkedonce

[Run]
Filename: "{sys}\sc.exe"; Parameters: "stop KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated; StatusMsg: "Eski PDKS Agent durduruluyor..."
Filename: "{sys}\sc.exe"; Parameters: "delete KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated; StatusMsg: "Eski PDKS Agent kaydı temizleniyor..."
Filename: "{sys}\sc.exe"; Parameters: "create KYERP.PDKS.Agent binPath= &quot;{app}\Agent\KYERP.PDKS.Agent.exe&quot; start= delayed-auto DisplayName= &quot;KY ERP PDKS Agent&quot;"; Flags: runhidden waituntilterminated; StatusMsg: "KY ERP PDKS Agent kuruluyor..."
Filename: "{sys}\sc.exe"; Parameters: "description KYERP.PDKS.Agent &quot;KY ERP kart cihazı toplama ve D1 arka plan senkron servisi&quot;"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failure KYERP.PDKS.Agent reset= 86400 actions= restart/5000/restart/15000/restart/30000"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failureflag KYERP.PDKS.Agent 1"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "start KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated; StatusMsg: "KY ERP PDKS Agent başlatılıyor..."
Filename: "{app}\KY ERP Masaüstü.exe"; Description: "KY ERP Masaüstü uygulamasını aç"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "delete KYERP.PDKS.Agent"; Flags: runhidden waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
