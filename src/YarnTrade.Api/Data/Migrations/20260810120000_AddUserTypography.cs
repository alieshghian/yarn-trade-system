using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260810120000_AddUserTypography")]
public sealed class AddUserTypography : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "FontFamily", table: "AspNetUsers", type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "vazirmatn");
        migrationBuilder.AddColumn<string>(name: "FontSize", table: "AspNetUsers", type: "nvarchar(10)", maxLength: 10, nullable: false, defaultValue: "normal");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "FontFamily", table: "AspNetUsers");
        migrationBuilder.DropColumn(name: "FontSize", table: "AspNetUsers");
    }
}
