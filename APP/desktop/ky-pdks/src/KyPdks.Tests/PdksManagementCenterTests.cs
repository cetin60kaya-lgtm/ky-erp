using KyPdks.Shared;
using Microsoft.Data.Sqlite;
using Xunit;

namespace KyPdks.Tests;

public class PdksManagementCenterTests
{
    [Theory]
    [InlineData("SUPER_ADMIN", true)]
    [InlineData("ADMIN", true)]
    [InlineData("COMPANY_ADMIN", true)]
    [InlineData("IK", false)]
    [InlineData("DENETIM", false)]
    [InlineData("", false)]
    public void Backup_Button_Uses_Management_Role(string role, bool permitted) =>
        Assert.Equal(permitted, PdksManagementCenter.CanCreateBackup(role));

    [Fact]
    public async Task Two_Online_Backups_Are_Unique_Verified_And_NonDestructive()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-backup-" + Guid.NewGuid().ToString("N"));
        try
        {
            var paths = new PdksPaths(root);
            var store = new LocalPdksStore(paths);
            await store.InitializeAsync();
            Assert.True(await store.AddAsync(new RawPunch("00004",
                new DateTime(2026, 8, 30, 8, 28), "TEST", "source", "raw")));
            var first = await store.BackupAsync();
            var second = await store.BackupAsync();
            Assert.NotEqual(first, second);
            Assert.True(File.Exists(first));
            Assert.True(File.Exists(second));
            Assert.Empty(Directory.EnumerateFiles(paths.Backup, "*.partial"));
            var connectionString = new SqliteConnectionStringBuilder {
                DataSource = first, Mode = SqliteOpenMode.ReadOnly, Pooling = false,
            }.ToString();
            await using (var connection = new SqliteConnection(connectionString))
            {
                await connection.OpenAsync();
                await using var check = connection.CreateCommand();
                check.CommandText = "PRAGMA quick_check";
                Assert.Equal("ok", await check.ExecuteScalarAsync());
                check.CommandText = "SELECT COUNT(*) FROM raw_punches";
                Assert.Equal(1L, (long)(await check.ExecuteScalarAsync())!);
            }
            Assert.Equal(1, (await store.SnapshotAsync()).PendingCount);
        }
        finally { try { Directory.Delete(root, true); } catch { } }
    }

    [Fact]
    public async Task Diagnostics_Never_Copy_Raw_Data_Or_Tokens()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-diagnostics-" + Guid.NewGuid().ToString("N"));
        try
        {
            var paths = new PdksPaths(root);
            var store = new LocalPdksStore(paths);
            await store.InitializeAsync();
            await store.AddAsync(new RawPunch("00999", new DateTime(2026, 8, 30, 8, 28),
                "TEST", "source", "SECRET RAW"));
            await using (var connection = new SqliteConnection(
                new SqliteConnectionStringBuilder { DataSource = paths.Database }.ToString()))
            {
                await connection.OpenAsync();
                await using var command = connection.CreateCommand();
                command.CommandText =
                    "UPDATE raw_punches SET sync_state='ERROR',sync_error='Bearer SECRET_TOKEN private@example.com'";
                await command.ExecuteNonQueryAsync();
            }
            var diagnostics = await new PdksManagementCenter(paths).ReadAsync();
            Assert.Equal(1, diagnostics.ErrorCount);
            Assert.Single(diagnostics.Incidents);
            var text = PdksManagementCenter.ToSafeText(diagnostics, "DENETIM");
            Assert.DoesNotContain("00999", text);
            Assert.DoesNotContain("SECRET", text);
            Assert.DoesNotContain("example.com", text);
        }
        finally { try { Directory.Delete(root, true); } catch { } }
    }
}
