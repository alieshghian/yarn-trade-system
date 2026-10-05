using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260801120000_AddRoleTaskInbox")]
public sealed class AddRoleTaskInbox : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "RoleTaskSettings",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                RoleName = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                TaskCategory = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                SlaHours = table.Column<int>(type: "int", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_RoleTaskSettings", x => x.Id));

        migrationBuilder.CreateTable(
            name: "UserTaskStates",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                WorkItemKey = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                ViewedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                ActionStartedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_UserTaskStates", x => x.Id);
                table.ForeignKey("FK_UserTaskStates_AspNetUsers_UserId", x => x.UserId, "AspNetUsers", "Id", onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex("IX_RoleTaskSettings_RoleName_TaskCategory", "RoleTaskSettings", ["RoleName", "TaskCategory"], unique: true);
        migrationBuilder.CreateIndex("IX_UserTaskStates_UserId_WorkItemKey", "UserTaskStates", ["UserId", "WorkItemKey"], unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "RoleTaskSettings");
        migrationBuilder.DropTable(name: "UserTaskStates");
    }
}
