namespace TextilePricingApp.Models;

public sealed class AppUser
{
    public int Id { get; set; }
    public string UserName { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public bool IsAdmin { get; set; }
}

public sealed class AppRole
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public bool IsSystem { get; set; }
}

public sealed class AppFormDefinition
{
    public string Key { get; set; } = "";
    public string Title { get; set; } = "";
    public string PagePath { get; set; } = "";
}

public sealed class AppFormPermission
{
    public int RoleId { get; set; }
    public string FormKey { get; set; } = "";
    public bool CanView { get; set; }
    public bool CanEdit { get; set; }
}

public sealed class UserEditInput
{
    public int Id { get; set; }
    public string UserName { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? Password { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsAdmin { get; set; }
    public List<int> RoleIds { get; set; } = [];
}

public sealed class RoleEditInput
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}

public sealed class PermissionEditInput
{
    public string FormKey { get; set; } = "";
    public bool CanView { get; set; }
    public bool CanEdit { get; set; }
}
