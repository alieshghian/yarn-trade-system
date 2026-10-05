using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260810160000_AddUserPresenceAndMaintenanceNotices")]
public sealed class AddUserPresenceAndMaintenanceNotices : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "MaintenanceNotices",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false), RequestedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                RequesterName = table.Column<string>(type: "nvarchar(250)", maxLength: 250, nullable: false), RequesterRoles = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                Operation = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false), Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                EstimatedMinutes = table.Column<int>(type: "int", nullable: false), CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false), ExpiresAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
            }, constraints: table => table.PrimaryKey("PK_MaintenanceNotices", x => x.Id));
        migrationBuilder.CreateIndex(name: "IX_MaintenanceNotices_ExpiresAtUtc", table: "MaintenanceNotices", column: "ExpiresAtUtc");

        migrationBuilder.CreateTable(
            name: "UserSessions",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false), UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                LastSeenAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false), IsOnline = table.Column<bool>(type: "bit", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_UserSessions", x => x.Id);
                table.ForeignKey(name: "FK_UserSessions_AspNetUsers_UserId", column: x => x.UserId, principalTable: "AspNetUsers", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
            });
        migrationBuilder.CreateIndex(name: "IX_UserSessions_UserId", table: "UserSessions", column: "UserId", unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "MaintenanceNotices");
        migrationBuilder.DropTable(name: "UserSessions");
    }
}
