using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260730120000_AddUserAccessControl")]
public sealed class AddUserAccessControl : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "IsActive",
            table: "AspNetUsers",
            type: "bit",
            nullable: false,
            defaultValue: true);

        migrationBuilder.AddColumn<Guid>(
            name: "PersonId",
            table: "AspNetUsers",
            type: "uniqueidentifier",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "UserPermissions",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PermissionKey = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                IsGranted = table.Column<bool>(type: "bit", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_UserPermissions", x => x.Id);
                table.ForeignKey(
                    name: "FK_UserPermissions_AspNetUsers_UserId",
                    column: x => x.UserId,
                    principalTable: "AspNetUsers",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_AspNetUsers_PersonId",
            table: "AspNetUsers",
            column: "PersonId",
            unique: true,
            filter: "[PersonId] IS NOT NULL");

        migrationBuilder.CreateIndex(
            name: "IX_UserPermissions_UserId_PermissionKey",
            table: "UserPermissions",
            columns: ["UserId", "PermissionKey"],
            unique: true);

        migrationBuilder.AddForeignKey(
            name: "FK_AspNetUsers_Persons_PersonId",
            table: "AspNetUsers",
            column: "PersonId",
            principalTable: "Persons",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "UserPermissions");
        migrationBuilder.DropForeignKey(name: "FK_AspNetUsers_Persons_PersonId", table: "AspNetUsers");
        migrationBuilder.DropIndex(name: "IX_AspNetUsers_PersonId", table: "AspNetUsers");
        migrationBuilder.DropColumn(name: "IsActive", table: "AspNetUsers");
        migrationBuilder.DropColumn(name: "PersonId", table: "AspNetUsers");
    }
}
