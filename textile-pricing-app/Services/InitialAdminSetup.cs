using System.Text;

namespace TextilePricingApp.Services;

internal static class InitialAdminSetup
{
    public static int Run(IWebHostEnvironment environment)
    {
        Console.Error.Write("Initial administrator password (12–256 characters): ");
        var password = ReadPassword();
        if (!AuthRepository.IsInitialPasswordValid(password))
        {
            Console.Error.WriteLine("A non-blank password of 12–256 characters is required.");
            return 1;
        }

        Console.Error.Write("Confirm administrator password: ");
        if (!string.Equals(password, ReadPassword(), StringComparison.Ordinal))
        {
            Console.Error.WriteLine("The passwords do not match.");
            return 1;
        }

        if (!new AuthRepository(environment).TryCreateInitialAdministrator(password!))
        {
            Console.Error.WriteLine("Administrator setup is available only when the database has no users.");
            return 1;
        }

        Console.WriteLine("Initial administrator created. Sign in as Admin.");
        return 0;
    }

    private static string? ReadPassword()
    {
        if (Console.IsInputRedirected)
        {
            return Console.ReadLine();
        }

        var password = new StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter)
            {
                Console.Error.WriteLine();
                return password.ToString();
            }

            if (key.Key == ConsoleKey.Backspace && password.Length > 0)
            {
                password.Length--;
            }
            else if (!char.IsControl(key.KeyChar))
            {
                password.Append(key.KeyChar);
            }
        }
    }
}
