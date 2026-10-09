using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBrandDefinition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BrandId",
                table: "PurchaseInvoices",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DefaultBrandId",
                table: "Persons",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Brands",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BrandCode = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    BrandName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Address = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Brands", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PersonBrands",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BrandId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PersonBrands", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PersonBrands_Brands_BrandId",
                        column: x => x.BrandId,
                        principalTable: "Brands",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PersonBrands_Persons_PersonId",
                        column: x => x.PersonId,
                        principalTable: "Persons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseInvoices_BrandId",
                table: "PurchaseInvoices",
                column: "BrandId");

            migrationBuilder.CreateIndex(
                name: "IX_Persons_DefaultBrandId",
                table: "Persons",
                column: "DefaultBrandId");

            migrationBuilder.CreateIndex(
                name: "IX_Brands_BrandCode",
                table: "Brands",
                column: "BrandCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PersonBrands_BrandId",
                table: "PersonBrands",
                column: "BrandId");

            migrationBuilder.CreateIndex(
                name: "IX_PersonBrands_PersonId_BrandId",
                table: "PersonBrands",
                columns: new[] { "PersonId", "BrandId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Persons_Brands_DefaultBrandId",
                table: "Persons",
                column: "DefaultBrandId",
                principalTable: "Brands",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
            // Extend an existing global layout once; keep every existing node and all personal preferences.
            migrationBuilder.Sql("""
                DECLARE @layout nvarchar(max) = (SELECT Value FROM SystemSettings WHERE [Key] = N'Navigation.Global.v1' AND ValidFrom = '20000101');
                IF ISJSON(@layout) = 1 AND LEFT(LTRIM(@layout), 1) = N'['
                   AND NOT EXISTS (SELECT 1 FROM OPENJSON(@layout) WHERE JSON_VALUE(value, '$.routeId') = N'brands')
                BEGIN
                    DECLARE @parent nvarchar(80) = N'definitions', @node nvarchar(80) = N'brands', @suffix int = 0;
                    IF NOT EXISTS (SELECT 1 FROM OPENJSON(@layout) WHERE JSON_VALUE(value, '$.id') = @parent AND JSON_VALUE(value, '$.routeId') IS NULL)
                    BEGIN
                        WHILE EXISTS (SELECT 1 FROM OPENJSON(@layout) WHERE JSON_VALUE(value, '$.id') = @parent)
                        BEGIN SET @suffix += 1; SET @parent = N'brand-definitions-' + CONVERT(nvarchar(10), @suffix); END;
                        DECLARE @group nvarchar(max) = N'{"id":"definitions","parentId":null,"routeId":null,"label":"تعاریف و تنظیمات","icon":"settings","enabled":true}';
                        SET @group = JSON_MODIFY(@group, '$.id', @parent);
                        SET @layout = JSON_MODIFY(@layout, 'append $', JSON_QUERY(@group));
                    END;
                    SET @suffix = 0;
                    WHILE EXISTS (SELECT 1 FROM OPENJSON(@layout) WHERE JSON_VALUE(value, '$.id') = @node)
                    BEGIN SET @suffix += 1; SET @node = N'brands-' + CONVERT(nvarchar(10), @suffix); END;
                    DECLARE @brandNode nvarchar(max) = N'{"id":"brands","parentId":"definitions","routeId":"brands","label":"","icon":"persons","enabled":true}';
                    SET @brandNode = JSON_MODIFY(JSON_MODIFY(@brandNode, '$.id', @node), '$.parentId', @parent);
                    SET @layout = JSON_MODIFY(@layout, 'append $', JSON_QUERY(@brandNode));
                    UPDATE SystemSettings SET Value = @layout WHERE [Key] = N'Navigation.Global.v1' AND ValidFrom = '20000101';
                END;
                """);

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseInvoices_Brands_BrandId",
                table: "PurchaseInvoices",
                column: "BrandId",
                principalTable: "Brands",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DECLARE @layout nvarchar(max) = (SELECT Value FROM SystemSettings WHERE [Key] = N'Navigation.Global.v1' AND ValidFrom = '20000101');
                IF ISJSON(@layout) = 1 AND LEFT(LTRIM(@layout), 1) = N'['
                BEGIN
                    DECLARE @remaining nvarchar(max) = (SELECT N',' + value FROM OPENJSON(@layout)
                        WHERE COALESCE(JSON_VALUE(value, '$.routeId'), N'') <> N'brands'
                        ORDER BY CONVERT(int, [key]) FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)');
                    SET @layout = N'[' + COALESCE(STUFF(@remaining, 1, 1, N''), N'') + N']';
                    UPDATE SystemSettings SET Value = @layout WHERE [Key] = N'Navigation.Global.v1' AND ValidFrom = '20000101';
                END;
                """);
            migrationBuilder.DropForeignKey(
                name: "FK_Persons_Brands_DefaultBrandId",
                table: "Persons");

            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseInvoices_Brands_BrandId",
                table: "PurchaseInvoices");

            migrationBuilder.DropTable(
                name: "PersonBrands");

            migrationBuilder.DropTable(
                name: "Brands");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseInvoices_BrandId",
                table: "PurchaseInvoices");

            migrationBuilder.DropIndex(
                name: "IX_Persons_DefaultBrandId",
                table: "Persons");

            migrationBuilder.DropColumn(
                name: "BrandId",
                table: "PurchaseInvoices");

            migrationBuilder.DropColumn(
                name: "DefaultBrandId",
                table: "Persons");
        }
    }
}
