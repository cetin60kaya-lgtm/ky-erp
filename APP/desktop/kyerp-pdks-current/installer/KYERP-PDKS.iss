#define MyAppName "KYERP PDKS"
#define MyAppVersion "2.0.0"
#define MyPublisher "KY ERP"
#define Artifacts GetEnv("KY_PDKS_ARTIFACTS")
#define SetupOut GetEnv("KY_PDKS_SETUP_OUT")

[Setup]
AppId={{B9EA8127-51A2-4D9D-89FB-2B7E28421602}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
VersionInfoVersion=2.0.0.0
VersionInfoCompany={#MyPublisher}
VersionInfoDescription=KYERP PDKS masaustu personel ve PDKS uygulamasi
AppPublisher={#MyPublisher}
AppPublisherURL=https://kyerp.net
AppSupportURL=https://kyerp.net
DefaultDirName={autopf}\KY ERP\KYERP PDKS
DefaultGroupName=KY ERP
DisableProgramGroupPage=yes
OutputDir={#SetupOut}
OutputBaseFilename=KYERP-PDKS-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog commandline
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=KYERP PDKS
SetupLogging=yes
CloseApplications=yes
RestartApplications=no

[Dirs]
Name: "{app}\Report"
Name: "{app}\Logs"
Name: "{app}\Import"
Name: "{app}\Archive"
Name: "{app}\Bridge"

[Files]
Source: "{#Artifacts}\Personel\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Artifacts}\Bridge\*"; DestDir: "{app}\Bridge"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\KY ERP\KYERP PDKS"; Filename: "{app}\HKN.Personel.Native.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\KYERP PDKS"; Filename: "{app}\HKN.Personel.Native.exe"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{autoprograms}\KY ERP\KYERP PDKS Legacy Bridge"; Filename: "{app}\Bridge\HKN.Personel.Bridge.exe"; WorkingDir: "{app}"; Tasks: legacybridge

[Tasks]
Name: "desktopicon"; Description: "Masaustunde KYERP PDKS kisayolu olustur"; GroupDescription: "Kisayollar:"; Flags: checkedonce
Name: "legacybridge"; Description: "Legacy Hedef entegrasyon kisayolunu da olustur"; GroupDescription: "Uyumluluk:"; Flags: unchecked

[Run]
Filename: "{app}\HKN.Personel.Native.exe"; Description: "KYERP PDKS uygulamasini ac"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\Logs"
