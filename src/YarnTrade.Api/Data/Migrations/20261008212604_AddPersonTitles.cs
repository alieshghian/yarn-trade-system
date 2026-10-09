using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace YarnTrade.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonTitles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TitlePersonType",
                table: "ParameterValues",
                type: "int",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("51000000-0000-0000-0000-000000000001"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("51000000-0000-0000-0000-000000000002"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("51000000-0000-0000-0000-000000000003"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("51000000-0000-0000-0000-000000000004"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("51000000-0000-0000-0000-000000000005"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("51000000-0000-0000-0000-000000000006"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("51000000-0000-0000-0000-000000000007"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("51000000-0000-0000-0000-000000000008"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("51000000-0000-0000-0000-000000000009"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("51000000-0000-0000-0000-000000000010"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("52000000-0000-0000-0000-000000000001"),
                columns: new[] { "NameFa", "TitlePersonType" },
                values: new object[] { "آقای", 0 });

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("52000000-0000-0000-0000-000000000002"),
                column: "TitlePersonType",
                value: 0);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("52000000-0000-0000-0000-000000000003"),
                columns: new[] { "SortOrder", "TitlePersonType" },
                values: new object[] { 50, 1 });

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("52000000-0000-0000-0000-000000000004"),
                columns: new[] { "SortOrder", "TitlePersonType" },
                values: new object[] { 30, 1 });

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("53000000-0000-0000-0000-000000000001"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("53000000-0000-0000-0000-000000000002"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("53000000-0000-0000-0000-000000000003"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("53000000-0000-0000-0000-000000000004"),
                column: "TitlePersonType",
                value: null);

            migrationBuilder.InsertData(
                table: "ParameterValues",
                columns: new[] { "Id", "Code", "CreatedAtUtc", "IsActive", "NameEn", "NameFa", "ParameterType", "SortOrder", "TitlePersonType", "UpdatedAtUtc" },
                values: new object[,]
                {
                    { new Guid("52000000-0000-0000-0000-000000000005"), "INSTITUTE", new DateTime(2026, 7, 27, 0, 0, 0, 0, DateTimeKind.Utc), true, "Institute", "مؤسسه", 1, 40, 1, null },
                    { new Guid("52000000-0000-0000-0000-000000000006"), "ORGANIZATION", new DateTime(2026, 7, 27, 0, 0, 0, 0, DateTimeKind.Utc), true, "Organization", "سازمان", 1, 60, 1, null }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("52000000-0000-0000-0000-000000000005"));

            migrationBuilder.DeleteData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("52000000-0000-0000-0000-000000000006"));

            migrationBuilder.DropColumn(
                name: "TitlePersonType",
                table: "ParameterValues");

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("52000000-0000-0000-0000-000000000001"),
                column: "NameFa",
                value: "آقا");

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("52000000-0000-0000-0000-000000000003"),
                column: "SortOrder",
                value: 30);

            migrationBuilder.UpdateData(
                table: "ParameterValues",
                keyColumn: "Id",
                keyValue: new Guid("52000000-0000-0000-0000-000000000004"),
                column: "SortOrder",
                value: 40);
        }
    }
}
