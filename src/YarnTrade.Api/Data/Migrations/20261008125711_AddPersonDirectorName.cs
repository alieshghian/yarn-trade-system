using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonDirectorName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DirectorName",
                table: "Persons",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DirectorName",
                table: "Persons");
        }
    }
}
