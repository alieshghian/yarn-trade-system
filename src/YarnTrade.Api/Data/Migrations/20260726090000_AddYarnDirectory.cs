using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260726090000_AddYarnDirectory")]
public sealed class AddYarnDirectory : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("ComprehensiveName", "YarnItems", "nvarchar(600)", maxLength: 600, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>("YarnGroup", "YarnItems", "nvarchar(30)", maxLength: 30, nullable: true);
        migrationBuilder.AddColumn<string>("Luster", "YarnItems", "nvarchar(30)", maxLength: 30, nullable: true);
        migrationBuilder.AddColumn<string>("UnitOfMeasure", "YarnItems", "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "KG");
        migrationBuilder.AddColumn<string>("FixStatus", "YarnItems", "nvarchar(30)", maxLength: 30, nullable: true);
        migrationBuilder.AddColumn<string>("Material", "YarnItems", "nvarchar(30)", maxLength: 30, nullable: true);
        migrationBuilder.AddColumn<string>("SpinType", "YarnItems", "nvarchar(30)", maxLength: 30, nullable: true);
        migrationBuilder.AddColumn<decimal>("FilamentNumber", "YarnItems", "decimal(20,6)", nullable: true);
        migrationBuilder.AddColumn<string>("SpinningMethod", "YarnItems", "nvarchar(30)", maxLength: 30, nullable: true);
        migrationBuilder.AddColumn<string>("ContinuityType", "YarnItems", "nvarchar(30)", maxLength: 30, nullable: true);
        migrationBuilder.AddColumn<decimal>("CountValue", "YarnItems", "decimal(20,6)", nullable: true);
        migrationBuilder.AddColumn<string>("CountType", "YarnItems", "nvarchar(20)", maxLength: 20, nullable: true);
        migrationBuilder.AddColumn<decimal>("TwistAmount", "YarnItems", "decimal(20,6)", nullable: true);
        migrationBuilder.AddColumn<string>("TwistType", "YarnItems", "nvarchar(10)", maxLength: 10, nullable: true);
        migrationBuilder.AddColumn<byte>("PlyCount", "YarnItems", "tinyint", nullable: false, defaultValue: (byte)0);
        migrationBuilder.AddColumn<string>("Notes", "YarnItems", "nvarchar(max)", nullable: true);
        migrationBuilder.Sql("UPDATE [YarnItems] SET [ComprehensiveName] = [NameFa] WHERE [ComprehensiveName] = '';");
        migrationBuilder.CreateIndex("IX_YarnItems_ComprehensiveName", "YarnItems", "ComprehensiveName");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex("IX_YarnItems_ComprehensiveName", "YarnItems");
        foreach (var column in new[] { "ComprehensiveName", "YarnGroup", "Luster", "UnitOfMeasure", "FixStatus", "Material",
            "SpinType", "FilamentNumber", "SpinningMethod", "ContinuityType", "CountValue", "CountType", "TwistAmount",
            "TwistType", "PlyCount", "Notes" }) migrationBuilder.DropColumn(column, "YarnItems");
    }
}
