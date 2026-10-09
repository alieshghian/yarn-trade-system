using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using YarnTrade.Api.Data;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261008170000_AddPersonAddresses")]
public partial class AddPersonAddresses : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<string>(
        name: "AddressesJson", table: "Persons", type: "nvarchar(max)", nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn(
        name: "AddressesJson", table: "Persons");
}
