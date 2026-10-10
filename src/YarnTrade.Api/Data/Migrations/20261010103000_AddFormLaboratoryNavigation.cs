using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261010103000_AddFormLaboratoryNavigation")]
public partial class AddFormLaboratoryNavigation : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        DECLARE @layout nvarchar(max) = (SELECT Value FROM SystemSettings WHERE [Key] = N'Navigation.Global.v1' AND ValidFrom = '20000101');
        IF ISJSON(@layout) = 1 AND LEFT(LTRIM(@layout), 1) = N'['
           AND NOT EXISTS (SELECT 1 FROM OPENJSON(@layout) WHERE JSON_VALUE(value, '$.routeId') = N'formLaboratory')
        BEGIN
            DECLARE @parent nvarchar(80) = N'definitions', @node nvarchar(80) = N'formLaboratory', @suffix int = 0;
            IF NOT EXISTS (SELECT 1 FROM OPENJSON(@layout) WHERE JSON_VALUE(value, '$.id') = @parent AND JSON_VALUE(value, '$.routeId') IS NULL)
            BEGIN
                WHILE EXISTS (SELECT 1 FROM OPENJSON(@layout) WHERE JSON_VALUE(value, '$.id') = @parent)
                BEGIN SET @suffix += 1; SET @parent = N'form-laboratory-definitions-' + CONVERT(nvarchar(10), @suffix); END;
                DECLARE @group nvarchar(max) = N'{"id":"definitions","parentId":null,"routeId":null,"label":"تعاریف و تنظیمات","icon":"settings","enabled":true}';
                SET @group = JSON_MODIFY(@group, '$.id', @parent); SET @layout = JSON_MODIFY(@layout, 'append $', JSON_QUERY(@group));
            END;
            WHILE EXISTS (SELECT 1 FROM OPENJSON(@layout) WHERE JSON_VALUE(value, '$.id') = @node)
            BEGIN SET @suffix += 1; SET @node = N'formLaboratory-' + CONVERT(nvarchar(10), @suffix); END;
            DECLARE @entry nvarchar(max) = N'{"id":"formLaboratory","parentId":"definitions","routeId":"formLaboratory","label":"","icon":"formLaboratory","enabled":true}';
            SET @entry = JSON_MODIFY(JSON_MODIFY(@entry, '$.id', @node), '$.parentId', @parent);
            SET @layout = JSON_MODIFY(@layout, 'append $', JSON_QUERY(@entry));
            UPDATE SystemSettings SET Value = @layout WHERE [Key] = N'Navigation.Global.v1' AND ValidFrom = '20000101';
        END;
        """);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        DECLARE @layout nvarchar(max) = (SELECT Value FROM SystemSettings WHERE [Key] = N'Navigation.Global.v1' AND ValidFrom = '20000101');
        IF ISJSON(@layout) = 1 AND LEFT(LTRIM(@layout), 1) = N'['
        BEGIN
            DECLARE @remaining nvarchar(max) = (SELECT N',' + value FROM OPENJSON(@layout) WHERE COALESCE(JSON_VALUE(value, '$.routeId'), N'') <> N'formLaboratory' ORDER BY CONVERT(int, [key]) FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)');
            SET @layout = N'[' + COALESCE(STUFF(@remaining, 1, 1, N''), N'') + N']';
            UPDATE SystemSettings SET Value = @layout WHERE [Key] = N'Navigation.Global.v1' AND ValidFrom = '20000101';
        END;
        """);
}
