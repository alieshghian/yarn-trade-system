using System.Net.WebSockets;
using System.Net;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace YarnTrade.ColorSampler;

internal sealed class LocalSamplerServer(SamplerController controller) : IDisposable
{
    private readonly WebApplication _app = CreateApp(controller);

    public Task StartAsync() => _app.StartAsync();
    public Task StopAsync() => _app.StopAsync();
    public void Dispose() => _app.DisposeAsync().AsTask().GetAwaiter().GetResult();

    private static WebApplication CreateApp(SamplerController controller)
    {
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.1.0.1:5174");
        var app = builder.Build();
        app.MapGet("/health", () => Results.Ok(new { service = "yarn-trade-color-sampler" }));
        app.UseWebSockets();
        app.Map("/color-sampler", async context =>
        {
            var origin = context.Request.Headers.Origin.ToString();
            if (!IsLoopbackOrigin(origin)) { context.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
            if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = StatusCodes.Status400BadRequest; return; }
            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            controller.AttachSocket(socket);
            var buffer = new byte[4096];
            try
            {
                while (socket.State == WebSocketState.Open)
                {
                    using var message = new MemoryStream();
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await socket.ReceiveAsync(buffer, CancellationToken.None);
                        if (result.MessageType == WebSocketMessageType.Close) break;
                        message.Write(buffer, 0, result.Count);
                    } while (!result.EndOfMessage);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    if (result.MessageType == WebSocketMessageType.Text) controller.HandleCommand(Encoding.UTF8.GetString(message.ToArray()));
                }
            }
            catch (WebSocketException) { }
            finally { controller.DetachSocket(socket); }
        });
        return app;
    }

    private static bool IsLoopbackOrigin(string origin)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https")) return false;
        return uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || (IPAddress.TryParse(uri.Host, out var address) && IPAddress.IsLoopback(address));
    }
}
