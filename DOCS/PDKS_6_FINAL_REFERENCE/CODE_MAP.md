# CODE MAP

## Desktop ana dosyalar
- `src/HKN.Personel.Native/CompanyDataPaths.cs` — Hakan Emprime veri kökü, FDB/TNF/live.dat yolları.
- `src/HKN.Personel.Native/CompanyDatabaseBootstrap.cs` — şirket DB başlangıç/bootstrap.
- `src/HKN.Personel.Native/TerminalDeviceClient.cs` — fiziksel cihaz komut istemcisi.
- `src/HKN.Personel.Native/TerminalSyncService.cs` — manuel/otomatik Eşitle motoru.
- `src/HKN.Personel.Native/TerminalCenterForm.cs` — Terminal & Cihaz merkezi UI.
- `src/HKN.Personel.Native/MainShellForm.TerminalSync.cs` — arka plan scheduler ve ana shell entegrasyonu.
- `src/HKN.Personel.Native/LiveAttendanceForm.cs` + parçaları — Canlı İzleme.
- `src/HKN.Personel.Native/PersonelForm.TerminalProfiles.cs` — terminal dosya/profil seçimi.
- `src/HKN.Personel.Native/LegacyGirisCikisForm.cs` — manuel E giriş/çıkış ve audit.
- `src/HKN.Personel.Native/ManualEditAudit.cs` — manuel değişiklik izi.
- `src/HKN.Personel.Native/BackupRestoreForm.cs` + `DatabaseMaintenance.cs` — yedek/geri yükleme.
- `src/HKN.Personel.Native/ReportCenterForm.cs` — rapor/çıktı merkezi.
- `src/HKN.Personel.Native/UserManagementFormV2.cs` — kullanıcı/yetki ekranı; repo için zorunlu kaynak.

## Testler
- `tools/SmokeTest`
- `tools/ContractTests`
- `tools/ShellSmokeTest`
- `tools/UiAudit`
- `tools/V4ShellSmoke` — yalnız Program.cs + csproj kaynak olarak tutulur; bin/obj commit edilmez.

## Web tarafı
Web PDKS kodunu repo içinde PDKS route/component/API isimleriyle bul; mevcut web ekranını 6.0 veri/sync sözleşmesine uyarla. Terminale web doğrudan bağlanmayacak; komutlar Desktop Agent'e job olarak gidecek.