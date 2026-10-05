using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace YarnTrade.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonDirectory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "LastName",
                table: "Persons",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "FirstName",
                table: "Persons",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "DisplayName",
                table: "Persons",
                type: "nvarchar(250)",
                maxLength: 250,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)");

            migrationBuilder.AlterColumn<string>(
                name: "CompanyName",
                table: "Persons",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CreditLimitIRR",
                table: "Persons",
                type: "decimal(20,2)",
                precision: 20,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<Guid>(
                name: "JobId",
                table: "Persons",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "NationalityId",
                table: "Persons",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PersonCode",
                table: "Persons",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PreferredLanguage",
                table: "Persons",
                type: "nvarchar(2)",
                maxLength: 2,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "TitleId",
                table: "Persons",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ParameterValues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ParameterType = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    NameFa = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    NameEn = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "varbinary(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ParameterValues", x => x.Id);
                });

            migrationBuilder.UpdateData(
                table: "CreditRateRules",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000001"),
                column: "CreatedAtUtc",
                value: new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(4425));

            migrationBuilder.UpdateData(
                table: "CreditRateRules",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000002"),
                column: "CreatedAtUtc",
                value: new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(4438));

            migrationBuilder.UpdateData(
                table: "CreditRateRules",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000003"),
                column: "CreatedAtUtc",
                value: new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(4443));

            migrationBuilder.UpdateData(
                table: "CreditRateRules",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000004"),
                column: "CreatedAtUtc",
                value: new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(4447));

            migrationBuilder.InsertData(
                table: "ParameterValues",
                columns: new[] { "Id", "Code", "CreatedAtUtc", "IsActive", "NameEn", "NameFa", "ParameterType", "RowVersion", "SortOrder", "UpdatedAtUtc" },
                values: new object[,]
                {
                    { new Guid("51000000-0000-0000-0000-000000000001"), "CUSTOMER", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3766), true, "Customer", "مشتری", 0, new byte[0], 10, null },
                    { new Guid("51000000-0000-0000-0000-000000000002"), "TRADER", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3774), true, "Trader", "بازرگان", 0, new byte[0], 20, null },
                    { new Guid("51000000-0000-0000-0000-000000000003"), "MANUFACTURER", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3777), true, "Manufacturer", "تولیدکننده", 0, new byte[0], 30, null },
                    { new Guid("51000000-0000-0000-0000-000000000004"), "SUPPLIER", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3793), true, "Supplier", "تأمین‌کننده", 0, new byte[0], 40, null },
                    { new Guid("52000000-0000-0000-0000-000000000001"), "MR", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3796), true, "Mr.", "آقا", 1, new byte[0], 10, null },
                    { new Guid("52000000-0000-0000-0000-000000000002"), "MRS", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3799), true, "Ms.", "خانم", 1, new byte[0], 20, null },
                    { new Guid("52000000-0000-0000-0000-000000000003"), "OFFICE", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3802), true, "Office", "اداره", 1, new byte[0], 30, null },
                    { new Guid("52000000-0000-0000-0000-000000000004"), "COMPANY", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3804), true, "Company", "شرکت", 1, new byte[0], 40, null },
                    { new Guid("53000000-0000-0000-0000-000000000001"), "IR", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3807), true, "Iranian", "ایرانی", 2, new byte[0], 10, null },
                    { new Guid("53000000-0000-0000-0000-000000000002"), "CN", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3810), true, "Chinese", "چینی", 2, new byte[0], 20, null },
                    { new Guid("53000000-0000-0000-0000-000000000003"), "TR", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3812), true, "Turkish", "ترک", 2, new byte[0], 30, null },
                    { new Guid("53000000-0000-0000-0000-000000000004"), "OTHER", new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3819), true, "Other", "سایر", 2, new byte[0], 99, null }
                });

            migrationBuilder.UpdateData(
                table: "Persons",
                keyColumn: "Id",
                keyValue: new Guid("11111111-1111-1111-1111-111111111111"),
                columns: new[] { "CreatedAtUtc", "CreditLimitIRR", "JobId", "NationalityId", "PersonCode", "PreferredLanguage", "TitleId" },
                values: new object[] { new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3396), 0m, null, null, "PARTNER-IR", "fa", null });

            migrationBuilder.UpdateData(
                table: "Persons",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"),
                columns: new[] { "CreatedAtUtc", "CreditLimitIRR", "JobId", "NationalityId", "PersonCode", "PreferredLanguage", "TitleId" },
                values: new object[] { new DateTime(2026, 7, 22, 6, 47, 29, 271, DateTimeKind.Utc).AddTicks(3448), 0m, null, null, "PARTNER-CN", "fa", null });

            // Backfill pre-existing runtime-seeded people before enforcing the unique person code.
            migrationBuilder.Sql("""
                UPDATE [Persons]
                SET [PersonCode] = COALESCE(NULLIF([AccountingCode], ''), CONCAT('P-', LEFT(REPLACE(CONVERT(nvarchar(36), [Id]), '-', ''), 20)))
                WHERE [PersonCode] = '';
                UPDATE [Persons] SET [PreferredLanguage] = 'fa' WHERE [PreferredLanguage] = '';
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Persons_JobId",
                table: "Persons",
                column: "JobId");

            migrationBuilder.CreateIndex(
                name: "IX_Persons_NationalityId",
                table: "Persons",
                column: "NationalityId");

            migrationBuilder.CreateIndex(
                name: "IX_Persons_PersonCode",
                table: "Persons",
                column: "PersonCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Persons_TitleId",
                table: "Persons",
                column: "TitleId");

            migrationBuilder.CreateIndex(
                name: "IX_ParameterValues_ParameterType_Code",
                table: "ParameterValues",
                columns: new[] { "ParameterType", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ParameterValues_ParameterType_SortOrder",
                table: "ParameterValues",
                columns: new[] { "ParameterType", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_Persons_ParameterValues_JobId",
                table: "Persons",
                column: "JobId",
                principalTable: "ParameterValues",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Persons_ParameterValues_NationalityId",
                table: "Persons",
                column: "NationalityId",
                principalTable: "ParameterValues",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Persons_ParameterValues_TitleId",
                table: "Persons",
                column: "TitleId",
                principalTable: "ParameterValues",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Persons_ParameterValues_JobId",
                table: "Persons");

            migrationBuilder.DropForeignKey(
                name: "FK_Persons_ParameterValues_NationalityId",
                table: "Persons");

            migrationBuilder.DropForeignKey(
                name: "FK_Persons_ParameterValues_TitleId",
                table: "Persons");

            migrationBuilder.DropTable(
                name: "ParameterValues");

            migrationBuilder.DropIndex(
                name: "IX_Persons_JobId",
                table: "Persons");

            migrationBuilder.DropIndex(
                name: "IX_Persons_NationalityId",
                table: "Persons");

            migrationBuilder.DropIndex(
                name: "IX_Persons_PersonCode",
                table: "Persons");

            migrationBuilder.DropIndex(
                name: "IX_Persons_TitleId",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "CreditLimitIRR",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "JobId",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "NationalityId",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "PersonCode",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "PreferredLanguage",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "TitleId",
                table: "Persons");

            migrationBuilder.AlterColumn<string>(
                name: "LastName",
                table: "Persons",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(100)",
                oldMaxLength: 100,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "FirstName",
                table: "Persons",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(100)",
                oldMaxLength: 100,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "DisplayName",
                table: "Persons",
                type: "nvarchar(450)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(250)",
                oldMaxLength: 250);

            migrationBuilder.AlterColumn<string>(
                name: "CompanyName",
                table: "Persons",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(200)",
                oldMaxLength: 200,
                oldNullable: true);

            migrationBuilder.UpdateData(
                table: "CreditRateRules",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000001"),
                column: "CreatedAtUtc",
                value: new DateTime(2026, 7, 14, 11, 18, 1, 611, DateTimeKind.Utc).AddTicks(8334));

            migrationBuilder.UpdateData(
                table: "CreditRateRules",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000002"),
                column: "CreatedAtUtc",
                value: new DateTime(2026, 7, 14, 11, 18, 1, 611, DateTimeKind.Utc).AddTicks(8347));

            migrationBuilder.UpdateData(
                table: "CreditRateRules",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000003"),
                column: "CreatedAtUtc",
                value: new DateTime(2026, 7, 14, 11, 18, 1, 611, DateTimeKind.Utc).AddTicks(8351));

            migrationBuilder.UpdateData(
                table: "CreditRateRules",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000004"),
                column: "CreatedAtUtc",
                value: new DateTime(2026, 7, 14, 11, 18, 1, 611, DateTimeKind.Utc).AddTicks(8355));

            migrationBuilder.UpdateData(
                table: "Persons",
                keyColumn: "Id",
                keyValue: new Guid("11111111-1111-1111-1111-111111111111"),
                column: "CreatedAtUtc",
                value: new DateTime(2026, 7, 14, 11, 18, 1, 611, DateTimeKind.Utc).AddTicks(7369));

            migrationBuilder.UpdateData(
                table: "Persons",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"),
                column: "CreatedAtUtc",
                value: new DateTime(2026, 7, 14, 11, 18, 1, 611, DateTimeKind.Utc).AddTicks(7421));
        }
    }
}
