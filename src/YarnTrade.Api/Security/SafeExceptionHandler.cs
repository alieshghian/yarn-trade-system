using Microsoft.AspNetCore.Diagnostics;

namespace YarnTrade.Api.Security;

public sealed class SafeExceptionHandler(ILogger<SafeExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        logger.LogError("Request failed. FailureType={FailureType} TraceId={TraceId}", exception.GetType().Name, context.TraceIdentifier);
        await Results.Problem(statusCode: exception is AuthenticationEmailUnavailableException ? 503 : 500,
            title: exception is AuthenticationEmailUnavailableException ? "Authentication email is unavailable." : "An unexpected error occurred.",
            extensions: new Dictionary<string, object?> { ["traceId"] = context.TraceIdentifier }).ExecuteAsync(context);
        return true;
    }
}
