using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260722090000_UseLastNameForCompanies")]
public sealed class UseLastNameForCompanies : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE [Persons]
            SET [LastName] = [CompanyName]
            WHERE [PersonType] = 1
              AND ([LastName] IS NULL OR LTRIM(RTRIM([LastName])) = '')
              AND [CompanyName] IS NOT NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // نگهداری داده در LastName برگشت‌پذیر و بدون حذف اطلاعات است.
    }
}
