using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using YarnTrade.Api.Security;
using YarnTrade.Api.Services;

namespace YarnTrade.Api.Controllers;

[ApiController, Route("api/presence"), Authorize]
public sealed class PresenceController(UserPresenceService presence, AppSignInManager signIn) : ControllerBase
{
    [AuthenticatedOnly("Own account/session; record identity comes from the authenticated user.")]
    [HttpPost("heartbeat")]
    public async Task<IActionResult> Heartbeat(CancellationToken ct) { await presence.RecordActivity(User, ct); return NoContent(); }

    [AuthenticatedOnly("Own account/session; record identity comes from the authenticated user.")]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        await signIn.RevokeSessionsAsync(User);
        await presence.MarkOffline(User, ct);
        return NoContent();
    }

    [AuthenticatedOnly("Own account/session; record identity comes from the authenticated user.")]
    [HttpGet("notice")]
    public async Task<IActionResult> Notice(CancellationToken ct) => Ok(await presence.CurrentNotice(User, ct));
}
