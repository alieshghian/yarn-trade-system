using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260727090000_ReplacePersonJobRoles")]
public sealed class ReplacePersonJobRoles : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Update all old values in one statement so the unique (type, code)
        // index never sees a temporary duplicate SUPPLIER code.
        migrationBuilder.Sql("""
            UPDATE [ParameterValues]
            SET [Code] = CASE [Id]
                    WHEN '51000000-0000-0000-0000-000000000001' THEN 'CUSTOMER'
                    WHEN '51000000-0000-0000-0000-000000000002' THEN 'SELLER'
                    WHEN '51000000-0000-0000-0000-000000000003' THEN 'SUPPLIER'
                    WHEN '51000000-0000-0000-0000-000000000004' THEN 'PARTNER' END,
                [NameFa] = CASE [Id]
                    WHEN '51000000-0000-0000-0000-000000000001' THEN N'مشتری'
                    WHEN '51000000-0000-0000-0000-000000000002' THEN N'فروشنده'
                    WHEN '51000000-0000-0000-0000-000000000003' THEN N'تأمین‌کننده'
                    WHEN '51000000-0000-0000-0000-000000000004' THEN N'شریک' END,
                [NameEn] = CASE [Id]
                    WHEN '51000000-0000-0000-0000-000000000001' THEN 'Customer'
                    WHEN '51000000-0000-0000-0000-000000000002' THEN 'Seller'
                    WHEN '51000000-0000-0000-0000-000000000003' THEN 'Supplier'
                    WHEN '51000000-0000-0000-0000-000000000004' THEN 'Partner' END,
                [SortOrder] = CASE [Id]
                    WHEN '51000000-0000-0000-0000-000000000001' THEN 10
                    WHEN '51000000-0000-0000-0000-000000000002' THEN 20
                    WHEN '51000000-0000-0000-0000-000000000003' THEN 30
                    WHEN '51000000-0000-0000-0000-000000000004' THEN 40 END
            WHERE [ParameterType] = 0
              AND [Id] IN ('51000000-0000-0000-0000-000000000001',
                           '51000000-0000-0000-0000-000000000002',
                           '51000000-0000-0000-0000-000000000003',
                           '51000000-0000-0000-0000-000000000004');
            """);

        migrationBuilder.Sql("""
            INSERT INTO [ParameterValues]
                ([Id], [ParameterType], [Code], [NameFa], [NameEn], [SortOrder],
                 [IsActive], [CreatedAtUtc], [UpdatedAtUtc], [RowVersion])
            VALUES
                ('51000000-0000-0000-0000-000000000005', 0, 'MANAGEMENT', N'مدیریت', 'Management', 50, 1, '2026-07-27T00:00:00', NULL, 0x),
                ('51000000-0000-0000-0000-000000000006', 0, 'ORDERS', N'سفارشات', 'Orders', 60, 1, '2026-07-27T00:00:00', NULL, 0x),
                ('51000000-0000-0000-0000-000000000007', 0, 'COMMERCE', N'بازرگانی', 'Commerce', 70, 1, '2026-07-27T00:00:00', NULL, 0x),
                ('51000000-0000-0000-0000-000000000008', 0, 'WAREHOUSE', N'انباردار', 'Warehouse keeper', 80, 1, '2026-07-27T00:00:00', NULL, 0x),
                ('51000000-0000-0000-0000-000000000009', 0, 'FINANCE', N'مالی', 'Finance', 90, 1, '2026-07-27T00:00:00', NULL, 0x),
                ('51000000-0000-0000-0000-000000000010', 0, 'OTHER', N'سایر', 'Other', 100, 1, '2026-07-27T00:00:00', NULL, 0x);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DELETE FROM [ParameterValues]
            WHERE [Id] IN ('51000000-0000-0000-0000-000000000005',
                           '51000000-0000-0000-0000-000000000006',
                           '51000000-0000-0000-0000-000000000007',
                           '51000000-0000-0000-0000-000000000008',
                           '51000000-0000-0000-0000-000000000009',
                           '51000000-0000-0000-0000-000000000010');
            UPDATE [ParameterValues]
            SET [Code] = 'MANUFACTURER', [NameFa] = N'تولیدکننده',
                [NameEn] = 'Manufacturer', [SortOrder] = 30
            WHERE [Id] = '51000000-0000-0000-0000-000000000003';
            UPDATE [ParameterValues]
            SET [Code] = 'TRADER', [NameFa] = N'بازرگان',
                [NameEn] = 'Trader', [SortOrder] = 20
            WHERE [Id] = '51000000-0000-0000-0000-000000000002';
            UPDATE [ParameterValues]
            SET [Code] = 'SUPPLIER', [NameFa] = N'تأمین‌کننده',
                [NameEn] = 'Supplier', [SortOrder] = 40
            WHERE [Id] = '51000000-0000-0000-0000-000000000004';
            """);
    }
}
