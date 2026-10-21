using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using YarnTrade.Api.Controllers;
namespace YarnTrade.Tests;
public sealed partial class SecurityBaselineTests
{
 private static DesignTheme SampleDesignTheme()=>new("approved-blue","Approved blue",ThemeDesignRules.Tokens.ToDictionary(key=>key,_=>"#123456"),["accent"]);
 [Fact]
 public void Theme_design_rules_restrict_tokens_and_personalization()
 {
  var theme=SampleDesignTheme();Assert.Null(ThemeDesignRules.Validate(new([theme])));
  Assert.NotNull(ThemeDesignRules.Validate(new([theme,theme])));
  Assert.NotNull(ThemeDesignRules.Validate(new([theme with {Colors=new(theme.Colors){["accent"]="url(javascript:alert(1))"}}])));
  Assert.Null(ThemeDesignRules.ValidatePersonal(new(theme.Id,new(){["accent"]="#abcdef"}),[theme]));
  Assert.NotNull(ThemeDesignRules.ValidatePersonal(new(theme.Id,new(){["background"]="#abcdef"}),[theme]));
  Assert.NotNull(UserSettingsRules.Validate(new("fa",30,"design:unknown",false,"vazirmatn","normal")));
  Assert.Null(UserSettingsRules.Validate(new("fa",30,"design:approved-blue",false,"vazirmatn","normal"),new HashSet<string>{theme.Id}));
  Assert.Throws<InvalidOperationException>(()=>ThemeDesignController.Parse("{\"version\":1,\"themes\":[],\"previous\":[]}"));
  Assert.Throws<InvalidOperationException>(()=>ThemeDesignController.Parse("{\"version\":1,\"themes\":null,\"previous\":[]}"));
 }
 [Fact]
 public async Task Theme_design_library_versions_and_personal_overrides_are_isolated()
 {
  await using var host=await CreateApp();
  await CreateUser(host.App,"theme-owner@example.test","Administrator");await SignIn(host,"theme-owner@example.test");
  var initial=await host.Client.GetFromJsonAsync<JsonElement>("/api/design-system/themes");
  Assert.Equal(0,initial.GetProperty("library").GetProperty("version").GetInt32());
  var theme=SampleDesignTheme();
  Assert.Equal(HttpStatusCode.OK,(await host.Client.PutAsJsonAsync("/api/design-system/themes?rowVersion=",new ThemeLibraryInput([theme]))).StatusCode);
  Assert.Equal(HttpStatusCode.Conflict,(await host.Client.PutAsJsonAsync("/api/design-system/themes?rowVersion=",new ThemeLibraryInput([theme]))).StatusCode);
  var first=await host.Client.GetFromJsonAsync<JsonElement>("/api/design-system/themes");
  var revision=first.GetProperty("rowVersion").GetString();
  Assert.Equal(HttpStatusCode.BadRequest,(await host.Client.PutAsJsonAsync("/api/design-system/themes/preferences",new ThemePersonalInput(theme.Id,new(){["background"]="#abcdef"}))).StatusCode);
  Assert.Equal(HttpStatusCode.OK,(await host.Client.PutAsJsonAsync("/api/design-system/themes/preferences",new ThemePersonalInput(theme.Id,new(){["accent"]="#abcdef"}))).StatusCode);
  Assert.Equal(HttpStatusCode.OK,(await host.Client.PutAsJsonAsync("/api/user-settings",new UserSettingsInput("fa",30,"design:approved-blue",false,"vazirmatn","normal"))).StatusCode);
  Assert.Equal(HttpStatusCode.OK,(await host.Client.PutAsJsonAsync("/api/design-system/themes?rowVersion="+revision,new ThemeLibraryInput([theme with{Name="Version two"}]))).StatusCode);
  var second=await host.Client.GetFromJsonAsync<JsonElement>("/api/design-system/themes");
  Assert.Equal(2,second.GetProperty("library").GetProperty("version").GetInt32());
  Assert.Equal("#abcdef",second.GetProperty("preferences").GetProperty("colors").GetProperty("accent").GetString());
  Assert.Equal(2,second.GetProperty("library").GetProperty("previous").GetArrayLength());
  await CreateUser(host.App,"theme-reader@example.test","Orders");await SignIn(host,"theme-reader@example.test");
  var reader=await host.Client.GetFromJsonAsync<JsonElement>("/api/design-system/themes");
  Assert.Equal(JsonValueKind.Null,reader.GetProperty("preferences").ValueKind);
  Assert.Equal(HttpStatusCode.Forbidden,(await host.Client.PutAsJsonAsync("/api/design-system/themes?rowVersion="+revision,new ThemeLibraryInput([theme]))).StatusCode);
 }
}
