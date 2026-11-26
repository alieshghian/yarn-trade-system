using System.Globalization;
using System.Security.Cryptography;
using Microsoft.Data.Sqlite;
using TextilePricingApp.Models;

namespace TextilePricingApp.Services;

public sealed class AuthRepository
{
    private const int Pbkdf2Iterations = 120_000;
    private readonly string _databasePath;
    private readonly object _gate = new();
    private bool _initialized;

    public AuthRepository(IWebHostEnvironment environment)
    {
        _databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "pricing.db");
    }

    public static IReadOnlyList<AppFormDefinition> Forms { get; } =
    [
        new() { Key = "Materials", Title = "کالاها و خدمات", PagePath = "/Materials" },
        new() { Key = "MaterialUsage", Title = "گزارش مصرف کالا و خدمات", PagePath = "/MaterialUsage" },
        new() { Key = "Customers", Title = "مشتریان", PagePath = "/Customers" },
        new() { Key = "CustomerProductAssignments", Title = "ارتباط کالا و مشتری", PagePath = "/CustomerProductAssignments" },
        new() { Key = "ProfitTiers", Title = "دسته‌های سود", PagePath = "/ProfitTiers" },
        new() { Key = "WasteTiers", Title = "کسری و ضایعات", PagePath = "/WasteTiers" },
        new() { Key = "ProductGroups", Title = "گروه‌های محصول", PagePath = "/ProductGroups" },
        new() { Key = "Settings", Title = "تنظیمات", PagePath = "/Settings" },
        new() { Key = "Analyses", Title = "آنالیز محصولات", PagePath = "/Analyses" },
        new() { Key = "PriceAnalysis", Title = "آنالیز قیمت", PagePath = "/Index" },
        new() { Key = "TemporaryPrice", Title = "قیمت موقت", PagePath = "/TemporaryPrice" },
        new() { Key = "FactoryPrices", Title = "قیمت فروش کارخانه", PagePath = "/FactoryPrices" },
        new() { Key = "CustomerPrices", Title = "قیمت مشتریان", PagePath = "/CustomerPrices" },
        new() { Key = "PriceSnapshots", Title = "آرشیو قیمت‌ها", PagePath = "/PriceSnapshots" },
        new() { Key = "AuditLogs", Title = "گزارش تغییرات", PagePath = "/AuditLogs" },
        new() { Key = "Security", Title = "مدیریت کاربران", PagePath = "/Users" }
    ];

    public AppUser? ValidateUser(string userName, string password)
    {
        var user = GetByUserName(userName);
        if (user is null || !user.IsActive)
        {
            return null;
        }

        var stored = GetPasswordHash(user.Id);
        return stored is not null && VerifyPassword(password, stored.Value.Hash, stored.Value.Salt)
            ? user
            : null;
    }

    public AppUser? GetById(int id)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, UserName, DisplayName, IsActive, IsAdmin
            FROM AppUsers
            WHERE Id = $id
            """;
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadUser(reader) : null;
    }

    public AppUser? GetByUserName(string userName)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, UserName, DisplayName, IsActive, IsAdmin
            FROM AppUsers
            WHERE lower(UserName) = lower($userName)
            """;
        command.Parameters.AddWithValue("$userName", userName.Trim());
        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadUser(reader) : null;
    }

    public IReadOnlyList<AppUser> GetUsers()
    {
        EnsureInitialized();
        var items = new List<AppUser>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT Id, UserName, DisplayName, IsActive, IsAdmin
            FROM AppUsers
            ORDER BY UserName
            """;
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            items.Add(ReadUser(reader));
        }

        return items;
    }

    public IReadOnlyList<AppRole> GetRoles()
    {
        EnsureInitialized();
        var items = new List<AppRole>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT Id, Name, IsSystem FROM AppRoles ORDER BY Name";
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            items.Add(new AppRole
            {
                Id = reader.GetInt32(0),
                Name = reader.GetString(1),
                IsSystem = reader.GetInt32(2) == 1
            });
        }

        return items;
    }

    public IReadOnlyList<int> GetUserRoleIds(int userId)
    {
        EnsureInitialized();
        var ids = new List<int>();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT RoleId FROM AppUserRoles WHERE UserId = $userId";
        command.Parameters.AddWithValue("$userId", userId);
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            ids.Add(reader.GetInt32(0));
        }

        return ids;
    }

    public int SaveUser(UserEditInput input)
    {
        if (input.Id <= 0 && string.IsNullOrWhiteSpace(input.Password))
        {
            throw new ArgumentException("A password is required for a new user.", nameof(input));
        }

        EnsureInitialized();
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        var id = input.Id;
        if (id > 0)
        {
            using var update = connection.CreateCommand();
            update.Transaction = transaction;
            update.CommandText = """
                UPDATE AppUsers
                SET UserName = $userName,
                    DisplayName = $displayName,
                    IsActive = $isActive,
                    IsAdmin = $isAdmin
                WHERE Id = $id
                """;
            AddUserParameters(update, input);
            update.Parameters.AddWithValue("$id", id);
            update.ExecuteNonQuery();
        }
        else
        {
            using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = """
                INSERT INTO AppUsers (UserName, DisplayName, PasswordHash, PasswordSalt, IsActive, IsAdmin)
                VALUES ($userName, $displayName, $passwordHash, $passwordSalt, $isActive, $isAdmin)
                """;
            var salt = RandomNumberGenerator.GetBytes(16);
            insert.Parameters.AddWithValue("$passwordHash", HashPassword(input.Password!, salt));
            insert.Parameters.AddWithValue("$passwordSalt", Convert.ToBase64String(salt));
            AddUserParameters(insert, input);
            insert.ExecuteNonQuery();
            using var idCommand = connection.CreateCommand();
            idCommand.Transaction = transaction;
            idCommand.CommandText = "SELECT last_insert_rowid()";
            id = Convert.ToInt32(idCommand.ExecuteScalar(), CultureInfo.InvariantCulture);
        }

        if (input.Id > 0 && !string.IsNullOrWhiteSpace(input.Password))
        {
            SetPassword(connection, transaction, id, input.Password!);
        }

        SaveUserRoles(connection, transaction, id, input.RoleIds);
        transaction.Commit();
        return id;
    }

    public void DeleteUser(int id)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM AppUsers WHERE Id = $id AND IsAdmin = 0";
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();
    }

    public void ChangePassword(int userId, string newPassword)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        SetPassword(connection, transaction, userId, newPassword);
        transaction.Commit();
    }

    public int SaveRole(RoleEditInput input)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        if (input.Id > 0)
        {
            using var update = connection.CreateCommand();
            update.CommandText = "UPDATE AppRoles SET Name = $name WHERE Id = $id AND IsSystem = 0";
            update.Parameters.AddWithValue("$id", input.Id);
            update.Parameters.AddWithValue("$name", input.Name.Trim());
            update.ExecuteNonQuery();
            return input.Id;
        }

        using var insert = connection.CreateCommand();
        insert.CommandText = "INSERT INTO AppRoles (Name, IsSystem) VALUES ($name, 0)";
        insert.Parameters.AddWithValue("$name", input.Name.Trim());
        insert.ExecuteNonQuery();
        using var idCommand = connection.CreateCommand();
        idCommand.CommandText = "SELECT last_insert_rowid()";
        return Convert.ToInt32(idCommand.ExecuteScalar(), CultureInfo.InvariantCulture);
    }

    public void DeleteRole(int id)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM AppRoles WHERE Id = $id AND IsSystem = 0";
        command.Parameters.AddWithValue("$id", id);
        command.ExecuteNonQuery();
    }

    public IReadOnlyDictionary<string, AppFormPermission> GetRolePermissions(int roleId)
    {
        EnsureInitialized();
        var items = new Dictionary<string, AppFormPermission>(StringComparer.OrdinalIgnoreCase);
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT RoleId, FormKey, CanView, CanEdit
            FROM AppRolePermissions
            WHERE RoleId = $roleId
            """;
        command.Parameters.AddWithValue("$roleId", roleId);
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var item = new AppFormPermission
            {
                RoleId = reader.GetInt32(0),
                FormKey = reader.GetString(1),
                CanView = reader.GetInt32(2) == 1,
                CanEdit = reader.GetInt32(3) == 1
            };
            items[item.FormKey] = item;
        }

        return items;
    }

    public void SaveRolePermissions(int roleId, IEnumerable<PermissionEditInput> permissions)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        using var delete = connection.CreateCommand();
        delete.Transaction = transaction;
        delete.CommandText = "DELETE FROM AppRolePermissions WHERE RoleId = $roleId";
        delete.Parameters.AddWithValue("$roleId", roleId);
        delete.ExecuteNonQuery();

        foreach (var permission in permissions)
        {
            using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = """
                INSERT INTO AppRolePermissions (RoleId, FormKey, CanView, CanEdit)
                VALUES ($roleId, $formKey, $canView, $canEdit)
                """;
            insert.Parameters.AddWithValue("$roleId", roleId);
            insert.Parameters.AddWithValue("$formKey", permission.FormKey);
            insert.Parameters.AddWithValue("$canView", permission.CanView || permission.CanEdit ? 1 : 0);
            insert.Parameters.AddWithValue("$canEdit", permission.CanEdit ? 1 : 0);
            insert.ExecuteNonQuery();
        }

        transaction.Commit();
    }

    public FormAccess GetAccess(int userId, string formKey)
    {
        EnsureInitialized();
        var user = GetById(userId);
        if (user?.IsAdmin == true)
        {
            return new FormAccess(true, true);
        }

        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT MAX(p.CanView), MAX(p.CanEdit)
            FROM AppRolePermissions p
            INNER JOIN AppUserRoles ur ON ur.RoleId = p.RoleId
            WHERE ur.UserId = $userId AND p.FormKey = $formKey
            """;
        command.Parameters.AddWithValue("$userId", userId);
        command.Parameters.AddWithValue("$formKey", formKey);
        using var reader = command.ExecuteReader();
        if (reader.Read())
        {
            var canEdit = !reader.IsDBNull(1) && reader.GetInt32(1) == 1;
            var canView = canEdit || (!reader.IsDBNull(0) && reader.GetInt32(0) == 1);
            return new FormAccess(canView, canEdit);
        }

        return new FormAccess(false, false);
    }

    private void EnsureInitialized()
    {
        if (_initialized)
        {
            return;
        }

        lock (_gate)
        {
            if (_initialized)
            {
                return;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(_databasePath)!);
            using var connection = OpenConnection();
            using var command = connection.CreateCommand();
            command.CommandText = """
                CREATE TABLE IF NOT EXISTS AppUsers (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    UserName TEXT NOT NULL UNIQUE,
                    DisplayName TEXT NOT NULL DEFAULT '',
                    PasswordHash TEXT NOT NULL,
                    PasswordSalt TEXT NOT NULL,
                    IsActive INTEGER NOT NULL DEFAULT 1,
                    IsAdmin INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS AppRoles (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL UNIQUE,
                    IsSystem INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS AppUserRoles (
                    UserId INTEGER NOT NULL,
                    RoleId INTEGER NOT NULL,
                    PRIMARY KEY (UserId, RoleId),
                    FOREIGN KEY(UserId) REFERENCES AppUsers(Id) ON DELETE CASCADE,
                    FOREIGN KEY(RoleId) REFERENCES AppRoles(Id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS AppRolePermissions (
                    RoleId INTEGER NOT NULL,
                    FormKey TEXT NOT NULL,
                    CanView INTEGER NOT NULL DEFAULT 0,
                    CanEdit INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (RoleId, FormKey),
                    FOREIGN KEY(RoleId) REFERENCES AppRoles(Id) ON DELETE CASCADE
                );
                """;
            command.ExecuteNonQuery();
            _initialized = true;
        }
    }

    public bool TryCreateInitialAdministrator(string password)
    {
        if (!IsInitialPasswordValid(password))
        {
            throw new ArgumentException("The initial password must contain between 12 and 256 characters.", nameof(password));
        }

        EnsureInitialized();
        using var connection = OpenConnection();
        using var insert = connection.CreateCommand();
        var salt = RandomNumberGenerator.GetBytes(16);
        insert.CommandText = """
            INSERT INTO AppUsers (UserName, DisplayName, PasswordHash, PasswordSalt, IsActive, IsAdmin)
            SELECT 'Admin', 'مدیر سیستم', $hash, $salt, 1, 1
            WHERE NOT EXISTS (SELECT 1 FROM AppUsers)
            """;
        insert.Parameters.AddWithValue("$hash", HashPassword(password, salt));
        insert.Parameters.AddWithValue("$salt", Convert.ToBase64String(salt));
        return insert.ExecuteNonQuery() == 1;
    }

    internal static bool IsInitialPasswordValid(string? password) =>
        password is { Length: >= 12 and <= 256 } && !string.IsNullOrWhiteSpace(password);

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_databasePath}");
        connection.Open();
        return connection;
    }

    private static AppUser ReadUser(SqliteDataReader reader)
    {
        return new AppUser
        {
            Id = reader.GetInt32(0),
            UserName = reader.GetString(1),
            DisplayName = reader.GetString(2),
            IsActive = reader.GetInt32(3) == 1,
            IsAdmin = reader.GetInt32(4) == 1
        };
    }

    private (string Hash, string Salt)? GetPasswordHash(int userId)
    {
        EnsureInitialized();
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT PasswordHash, PasswordSalt FROM AppUsers WHERE Id = $id";
        command.Parameters.AddWithValue("$id", userId);
        using var reader = command.ExecuteReader();
        return reader.Read() ? (reader.GetString(0), reader.GetString(1)) : null;
    }

    private static void AddUserParameters(SqliteCommand command, UserEditInput input)
    {
        command.Parameters.AddWithValue("$userName", input.UserName.Trim());
        command.Parameters.AddWithValue("$displayName", input.DisplayName.Trim());
        command.Parameters.AddWithValue("$isActive", input.IsActive ? 1 : 0);
        command.Parameters.AddWithValue("$isAdmin", input.IsAdmin ? 1 : 0);
    }

    private static void SaveUserRoles(SqliteConnection connection, SqliteTransaction transaction, int userId, IEnumerable<int> roleIds)
    {
        using var delete = connection.CreateCommand();
        delete.Transaction = transaction;
        delete.CommandText = "DELETE FROM AppUserRoles WHERE UserId = $userId";
        delete.Parameters.AddWithValue("$userId", userId);
        delete.ExecuteNonQuery();

        foreach (var roleId in roleIds.Distinct())
        {
            using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = "INSERT OR IGNORE INTO AppUserRoles (UserId, RoleId) VALUES ($userId, $roleId)";
            insert.Parameters.AddWithValue("$userId", userId);
            insert.Parameters.AddWithValue("$roleId", roleId);
            insert.ExecuteNonQuery();
        }
    }

    private static void SetPassword(SqliteConnection connection, SqliteTransaction transaction, int userId, string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "UPDATE AppUsers SET PasswordHash = $hash, PasswordSalt = $salt WHERE Id = $id";
        command.Parameters.AddWithValue("$id", userId);
        command.Parameters.AddWithValue("$hash", HashPassword(password, salt));
        command.Parameters.AddWithValue("$salt", Convert.ToBase64String(salt));
        command.ExecuteNonQuery();
    }

    private static string HashPassword(string password, byte[] salt)
    {
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Pbkdf2Iterations, HashAlgorithmName.SHA256, 32);
        return Convert.ToBase64String(hash);
    }

    private static bool VerifyPassword(string password, string hash, string salt)
    {
        var saltBytes = Convert.FromBase64String(salt);
        var candidate = HashPassword(password, saltBytes);
        return CryptographicOperations.FixedTimeEquals(Convert.FromBase64String(hash), Convert.FromBase64String(candidate));
    }
}

public sealed record FormAccess(bool CanView, bool CanEdit);
