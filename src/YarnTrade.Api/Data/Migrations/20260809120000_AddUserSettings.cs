using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260809120000_AddUserSettings")]
public sealed class AddUserSettings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(name: "CompactMode", table: "AspNetUsers", type: "bit", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<int>(name: "SessionTimeoutMinutes", table: "AspNetUsers", type: "int", nullable: false, defaultValue: 30);
        migrationBuilder.AddColumn<string>(name: "Theme", table: "AspNetUsers", type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "system");
        migrationBuilder.AlterColumn<string>(name: "PreferredLanguage", table: "AspNetUsers", type: "nvarchar(2)", maxLength: 2, nullable: false, oldClrType: typeof(string), oldType: "nvarchar(max)");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "CompactMode", table: "AspNetUsers");
        migrationBuilder.DropColumn(name: "SessionTimeoutMinutes", table: "AspNetUsers");
        migrationBuilder.DropColumn(name: "Theme", table: "AspNetUsers");
        migrationBuilder.AlterColumn<string>(name: "PreferredLanguage", table: "AspNetUsers", type: "nvarchar(max)", nullable: false, oldClrType: typeof(string), oldType: "nvarchar(2)", oldMaxLength: 2);
    }
}
