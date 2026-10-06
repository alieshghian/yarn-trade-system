using System.Net;
using System.Net.Mail;

namespace YarnTrade.Api.Security;

public sealed class AuthenticationEmailOptions
{
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public string UserName { get; set; } = "";
    public string Password { get; set; } = "";
    public string FromAddress { get; set; } = "";
    public bool EnableSsl { get; set; } = true;
    public bool IsConfigured => !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(UserName) &&
        !string.IsNullOrWhiteSpace(Password) && MailAddress.TryCreate(FromAddress, out _);
}

public interface IAuthenticationEmailSender
{
    bool IsAvailable { get; }
    Task SendAsync(string registeredEmail, string subject, string text, CancellationToken ct);
}

public sealed class AuthenticationEmailUnavailableException : Exception;

public sealed class SmtpAuthenticationEmailSender(AuthenticationEmailOptions options) : IAuthenticationEmailSender
{
    public bool IsAvailable => options.IsConfigured;
    public async Task SendAsync(string registeredEmail, string subject, string text, CancellationToken ct)
    {
        if (!IsAvailable) throw new AuthenticationEmailUnavailableException();
        using var client = new SmtpClient(options.Host, options.Port)
        {
            EnableSsl = options.EnableSsl, UseDefaultCredentials = false,
            Credentials = new NetworkCredential(options.UserName, options.Password)
        };
        using var message = new MailMessage(options.FromAddress, registeredEmail, subject, text);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        try { await client.SendMailAsync(message, timeout.Token); }
        catch (Exception ex) when (ex is SmtpException or OperationCanceledException)
        { throw new AuthenticationEmailUnavailableException(); }
    }
}
