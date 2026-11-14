using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace YarnTrade.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261109000000_UniqueBrandOwner")]
public sealed class UniqueBrandOwner : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Refuse conflicting legacy associations; never discard or reassign them.
        migrationBuilder.Sql("IF EXISTS (SELECT BrandId FROM PersonBrands GROUP BY BrandId HAVING COUNT(*)>1) THROW 51001, 'Existing brand ownership conflicts require review.', 1;");
        migrationBuilder.DropIndex("IX_PersonBrands_BrandId", "PersonBrands");
        migrationBuilder.CreateIndex("IX_PersonBrands_BrandId", "PersonBrands", "BrandId", unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder) { migrationBuilder.DropIndex("IX_PersonBrands_BrandId", "PersonBrands"); migrationBuilder.CreateIndex("IX_PersonBrands_BrandId", "PersonBrands", "BrandId"); }
}
