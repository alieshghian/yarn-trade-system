using Microsoft.EntityFrameworkCore;
using YarnTrade.Api.Domain;

namespace YarnTrade.Tests;
public sealed partial class SecurityBaselineTests
{
    [Fact]
    public async Task Brand_SQL_owner_claim_is_atomic_and_blank_releases_assignment()
    {
        await using var sql = await A4SqlDatabase.CreateLatest(false);
        Guid brandId, firstId, secondId;
        await using(var db=sql.Context())
        {
            var brand=new Brand {BrandCode="OWNER",BrandName="Unassigned"};
            var first=new Person {PersonCode="OWNER1",DisplayName="First"};
            var second=new Person {PersonCode="OWNER2",DisplayName="Second"};
            db.AddRange(brand,first,second);await db.SaveChangesAsync();
            brandId=brand.Id;firstId=first.Id;secondId=second.Id;
        }
        async Task<bool> Claim(Guid person)
        {
            await using var db=sql.Context();
            db.PersonBrands.Add(new PersonBrand {BrandId=brandId,PersonId=person});
            try {await db.SaveChangesAsync();return true;} catch(DbUpdateException) {return false;}
        }
        var results=await Task.WhenAll(Claim(firstId),Claim(secondId));
        Assert.Single(results.Where(x=>x));
        await using(var db=sql.Context())
        {
            var link=await db.PersonBrands.SingleAsync(x=>x.BrandId==brandId);
            db.Remove(link);await db.SaveChangesAsync();
            Assert.True(await db.Brands.AnyAsync(x=>x.Id==brandId));
        }
        Assert.True(await Claim(secondId));
    }
}
