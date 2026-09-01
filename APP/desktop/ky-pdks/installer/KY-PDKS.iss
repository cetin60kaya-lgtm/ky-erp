#define MyAppName "KY PDKS"
#define MyAppVersion "1.3.0"
#define MyPublisher "KY ERP"
#define Dist GetEnv("KY_PDKS_DIST")
#define SetupOut GetEnv("KY_PDKS_SETUP_OUT")

[Setup]
AppId={{7B558935-8DD5-4D1F-9A62-A1D79EE27C10}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
VersionInfoVersion=1.3.0.0
VersionInfoCompany={#MyPublisher}
VersionInfoDescription=KY ERP Personel Devam Kontrol Sistemi
AppPublisher={#MyPublisher}
AppPublisherURL=https://kyerp.net
AppSupportURL=https://kyerp.net
DefaultDirName={autopf}\KY ERP\KY PDKS
DefaultGroupName=KY ERP
DisableProgramGroupPage=yes
OutputDir={#SetupOut}
OutputBaseFilename=KY-PDKS-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=KY PDKS
SetupLogging=yes
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

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
Source: "{#Dist}\desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb"
Source: "{#Dist}\agent\*"; DestDir: "{app}\Agent"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb"

[Icons]
Name: "{group}\KY PDKS"; Filename: "{app}\KY PDKS.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\KY PDKS"; Filename: "{app}\KY PDKS.exe"; WorkingDir: "{app}"

[Run]
Filename: "{sys}\sc.exe"; Parameters: "create ""KYERP.PDKS.Agent"" binPath= ""{app}\Agent\KYERP.PDKS.Agent.exe"" start= delayed-auto DisplayName= ""KY ERP PDKS Agent"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "description ""KYERP.PDKS.Agent"" ""KY PDKS kart terminali yerel veri toplama servisi"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failure ""KYERP.PDKS.Agent"" reset= 86400 actions= restart/5000/restart/15000/restart/60000"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "start ""KYERP.PDKS.Agent"""; Flags: runhidden waituntilterminated
Filename: "{app}\KY PDKS.exe"; Description: "KY PDKS'yi başlat"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop ""KYERP.PDKS.Agent"""; Flags: runhidden waituntilterminated; RunOnceId: "StopPdksAgent"
Filename: "{sys}\sc.exe"; Parameters: "delete ""KYERP.PDKS.Agent"""; Flags: runhidden waituntilterminated; RunOnceId: "DeletePdksAgent"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\sc.exe'), 'stop "KYERP.PDKS.Agent"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(800);
  Exec(ExpandConstant('{sys}\sc.exe'), 'delete "KYERP.PDKS.Agent"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(800);
  Result := '';
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    MsgBox('KY PDKS kaldırıldı. Kart kayıt güvenliği için C:\ProgramData\KY ERP\PDKS içindeki yerel veritabanı ve yedekler silinmedi.', mbInformation, MB_OK);
  end;
end;