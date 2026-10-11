#define Name "KY PDKS Unified"
#define Version "1.0.0"
#define PublishDir GetEnv("KY_PDKS_UNIFIED_PUBLISH")
#define OutDir GetEnv("KY_PDKS_UNIFIED_SETUP_OUT")
[Setup]
AppId={{A4D9FCBD-6E34-4C2C-9413-76428F0EB515}
AppName={#Name}
AppVersion={#Version}
AppPublisher=KY ERP
DefaultDirName={autopf}\KY ERP\KY PDKS Unified
DefaultGroupName=KY ERP
OutputDir={#OutDir}
OutputBaseFilename=KY-PDKS-Unified-Setup-{#Version}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes
[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\KY ERP\KY PDKS Unified"; Filename: "{app}\KY.PDKS.Unified.exe"
[Run]
Filename: "{app}\KY.PDKS.Unified.exe"; Description: "KY PDKS Unified başlat"; Flags: postinstall nowait skipifsilent
; Never install, stop or uninstall old WPF Agent or Unified scheduled task.
; Existing ProgramData, FDB, TNF, SQLite and backups are not removed.
