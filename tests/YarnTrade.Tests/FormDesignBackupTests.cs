using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.FileProviders;
using YarnTrade.Api.Controllers;

namespace YarnTrade.Tests;

public sealed class FormDesignBackupTests
{
    [Fact]
    public async Task Versions_are_complete_immutable_and_isolated_by_authenticated_owner()
    {
        var root = Path.Combine(Path.GetTempPath(), "yarn-form-backup-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var env = new TestEnvironment { ContentRootPath = root };
            var owner = Guid.NewGuid();
            var first = Controller(env, owner);
            var document = JsonSerializer.SerializeToElement(new { format="yarn-trade.form-design-backup", formId="form.one", reason="save", snapshot=new { fields=new[] { "name", "code" }, geometry=new { x=123.4 }, history=new[] { "old", "new" } }, browserData=new { component="library" } });
            var response = Assert.IsType<OkObjectResult>(await first.Create(document, default));
            var id = JsonSerializer.SerializeToElement(response.Value).GetProperty("id").GetString()!;
            await first.Create(document, default);
            var listing = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(first.List("form.one")).Value);
            Assert.Equal(2, listing.GetArrayLength());
            var file = Assert.IsType<PhysicalFileResult>(first.Read(id));
            using var saved = JsonDocument.Parse(await File.ReadAllTextAsync(file.FileName));
            Assert.Equal(document.GetRawText(), saved.RootElement.GetRawText());
            var another = Controller(env, Guid.NewGuid());
            Assert.Empty(JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(another.List("form.one")).Value).EnumerateArray());
            Assert.IsType<NotFoundResult>(another.Read(id));
            Assert.IsType<BadRequestResult>(first.Read("../other"));
            Assert.IsType<BadRequestResult>(await first.Create(JsonSerializer.SerializeToElement(new { formId="form.one" }), default));
            Assert.IsType<NotFoundResult>(first.Read(id, true));
            var handoff = JsonSerializer.SerializeToElement(new { formId="form.one", reason="integration-handoff", snapshot=new { artifact="yarn-trade.single-form-design-export", form=new { id="form.one", customization=new { colors=false } } } });
            var handoffResponse=Assert.IsType<OkObjectResult>(await first.Create(handoff, default));
            var handoffId=JsonSerializer.SerializeToElement(handoffResponse.Value).GetProperty("id").GetString()!;
            var exported=Assert.IsType<ContentResult>(first.Read(handoffId,true));
            Assert.Equal(handoff.GetProperty("snapshot").GetRawText(),exported.Content);
            Assert.IsType<NotFoundResult>(another.Read(handoffId,true));
        }
        finally { Directory.Delete(root, true); }
    }

    private static FormDesignBackupsController Controller(IWebHostEnvironment env, Guid id) => new(env) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id.ToString())], "test")) } } };

    private sealed class TestEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "test";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = "";
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
