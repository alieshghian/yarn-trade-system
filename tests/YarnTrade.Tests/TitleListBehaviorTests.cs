using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using YarnTrade.Api.Data;
using YarnTrade.Api.Domain;
namespace YarnTrade.Tests;
public sealed partial class SecurityBaselineTests
{
 [Fact]
 public async Task Shared_title_list_batches_add_edit_remove_and_reject_stale_or_used_values()
 {
  await using var host=await CreateApp();
  await CreateUser(host.App,"title-editor@example.test","Administrator");await SignIn(host,"title-editor@example.test");
  object Change(object[] items,object[]? removed=null,string selected="الف")=>new {items,removed=removed??[],defaultName=selected,personType=PersonType.Individual};
  object New(string name)=>new {id=(Guid?)null,name,expectedName=(string?)null};
  var created=await host.Client.PostAsJsonAsync("/api/master-data/parameters/titles/changes",Change([New("الف"),New("ب")],selected:"ب"));
  Assert.True(created.StatusCode==HttpStatusCode.OK,await created.Content.ReadAsStringAsync());
  var result=await created.Content.ReadFromJsonAsync<JsonElement>();var options=result.GetProperty("options").EnumerateArray().ToArray();
  var first=options[0].GetProperty("id").GetGuid();var second=options[1].GetProperty("id").GetGuid();Assert.Equal(second,result.GetProperty("defaultId").GetGuid());
  object Existing(Guid id,string name,string expected)=>new {id,name,expectedName=expected};
  var edited=await host.Client.PostAsJsonAsync("/api/master-data/parameters/titles/changes",Change([Existing(first,"الف جدید","الف"),Existing(second,"ب","ب")],selected:"الف جدید"));
  Assert.True(edited.StatusCode==HttpStatusCode.OK,await edited.Content.ReadAsStringAsync());
  Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PostAsJsonAsync("/api/master-data/parameters/titles/changes",Change([Existing(first,"نسخه کهنه","الف")],selected:"نسخه کهنه"))).StatusCode);
  using(var scope=host.App.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<AppDbContext>();db.Persons.Add(new Person{PersonCode="title-dependent",DisplayName="وابسته",TitleId=first});await db.SaveChangesAsync();}
  Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PostAsJsonAsync("/api/master-data/parameters/titles/changes",Change([Existing(second,"ب","ب")],[Existing(first,"الف جدید","الف جدید")],"ب"))).StatusCode);
  Assert.Equal(HttpStatusCode.OK,(await host.Client.PostAsJsonAsync("/api/master-data/parameters/titles/changes",Change([Existing(first,"الف جدید","الف جدید")],[Existing(second,"ب","ب")],"الف جدید"))).StatusCode);
  using(var scope=host.App.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<AppDbContext>();Assert.False(db.ParameterValues.Single(item=>item.Id==second).IsActive);Assert.Equal("الف جدید",db.ParameterValues.Single(item=>item.Id==first).NameFa);}
 }
 [Fact]
 public async Task Shared_title_list_invalid_batch_is_atomic_and_unprivileged_users_cannot_write()
 {
  await using var host=await CreateApp();
  await CreateUser(host.App,"title-owner@example.test","Administrator");await SignIn(host,"title-owner@example.test");
  var invalid=new {items=new[]{new {id=(Guid?)null,name="تکرار",expectedName=(string?)null},new {id=(Guid?)null,name="تکرار",expectedName=(string?)null}},removed=Array.Empty<object>(),defaultName="تکرار",personType=PersonType.Individual};
  Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PostAsJsonAsync("/api/master-data/parameters/titles/changes",invalid)).StatusCode);
  using(var scope=host.App.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<AppDbContext>();Assert.DoesNotContain(db.ParameterValues,item=>item.NameFa=="تکرار");}
  await CreateUser(host.App,"title-limited@example.test");
  var userId=await UserId(host,"title-limited@example.test");
  using(var scope=host.App.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<AppDbContext>();db.UserPermissions.Add(new UserPermission{UserId=userId,PermissionKey="persons.view",IsGranted=true});await db.SaveChangesAsync();}
  await SignIn(host,"title-limited@example.test");
  var valid=new {items=new[]{new {id=(Guid?)null,name="بدون مجوز",expectedName=(string?)null}},removed=Array.Empty<object>(),defaultName="بدون مجوز",personType=PersonType.Individual};
  Assert.Equal(HttpStatusCode.Forbidden,(await host.Client.PostAsJsonAsync("/api/master-data/parameters/titles/changes",valid)).StatusCode);
 }
}
