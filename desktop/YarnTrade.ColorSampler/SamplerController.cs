using System.Drawing;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;

namespace YarnTrade.ColorSampler;

internal sealed class SamplerController : IDisposable
{
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 40 };
    private readonly MouseHook _mouseHook;
    private readonly KeyboardHook _keyboardHook;
    private readonly SemaphoreSlim _sendGate = new(1, 1);
    private readonly object _socketGate = new();
    private WebSocket? _socket;
    private SamplerWindow? _window;
    private LoupeWindow? _loupe;
    private IntPtr _hostWindowHandle;
    private volatile bool _active;
    private bool _paused;
    private bool _customEditing;
    private string _previousColor = "#FFFFFF";
    private string? _hoverColor;
    private string? _selectedColor;
    private readonly List<string> _candidateColors = [];
    private string _lastHoverSent = "";

    public SamplerController()
    {
        _mouseHook = new MouseHook(() => _active, OnLeftClick, OnRightClick);
        _keyboardHook = new KeyboardHook(() => _active, () => RunOnUi(Confirm));
        _timer.Tick += (_, _) => UpdatePointer();
        _timer.Start();
    }

    public void SetWindow(SamplerWindow window)
    {
        _window = window;
        _loupe = new LoupeWindow();
    }

    public void AttachSocket(WebSocket socket)
    {
        lock (_socketGate) _socket = socket;
        _ = SendAsync(new { type = "ready" });
    }

    public void DetachSocket(WebSocket socket)
    {
        lock (_socketGate) if (ReferenceEquals(_socket, socket)) _socket = null;
        RunOnUi(() => Cancel(notifyClient: false));
    }

    public void HandleCommand(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var type = root.TryGetProperty("type", out var typeValue) ? typeValue.GetString() : "";
            switch (type)
            {
                case "open":
                    var previous = root.TryGetProperty("previousColor", out var previousValue) ? previousValue.GetString() : null;
                    RunOnUi(() => Open(previous));
                    break;
                case "activate": RunOnUi(Activate); break;
                case "confirm": RunOnUi(Confirm); break;
                case "finish": RunOnUi(FinishCustomEditing); break;
                case "back": RunOnUi(() => Back(notifyClient: true)); break;
                case "cancel": RunOnUi(() => Cancel(notifyClient: false)); break;
            }
        }
        catch (JsonException) { }
    }

    public void Activate()
    {
        if (_window is not { IsDisposed: false } window) return;
        _active = true;
        _selectedColor = _candidateColors.LastOrDefault();
        _hoverColor = _selectedColor ?? _previousColor;
        _lastHoverSent = "";
        if (!window.Visible) window.Show();
        if (window.WindowState == FormWindowState.Minimized) window.WindowState = FormWindowState.Normal;
        window.Activate();
        UpdateWindow();
        UpdatePointer();
    }

    public void Confirm()
    {
        if (!_active && _selectedColor is null && _candidateColors.Count == 0) return;
        FinalizeColor(_selectedColor ?? _hoverColor ?? _candidateColors.LastOrDefault() ?? _previousColor);
    }

    public void ConfirmCandidate(string color)
    {
        if (!IsHex(color)) return;
        _selectedColor = color;
        _hoverColor = color;
        FinalizeColor(color);
    }

    private void FinalizeColor(string selected)
    {
        _active = false;
        _paused = false;
        _customEditing = false;
        _candidateColors.Clear();
        _selectedColor = null;
        _loupe?.Hide();
        UpdateWindow();
        _ = SendAsync(new { type = "confirm", color = selected });
        HideAndReturnToHost(maximizeHost: true);
    }

    public void EditCustom()
    {
        var selected = _selectedColor ?? _candidateColors.LastOrDefault() ?? _hoverColor;
        if (!_active || _candidateColors.Count == 0 || !IsHex(selected)) return;
        _active = false;
        _paused = false;
        _customEditing = true;
        _loupe?.Hide();
        UpdateWindow();
        _ = SendAsync(new { type = "edit-custom", color = selected, colors = _candidateColors.ToArray() });
        HideAndReturnToHost(maximizeHost: true, clearHost: false);
    }

    public void FinishCustomEditing()
    {
        _active = false;
        _paused = false;
        _customEditing = false;
        _candidateColors.Clear();
        _selectedColor = null;
        _hoverColor = _previousColor;
        _loupe?.Hide();
        UpdateWindow();
        HideAndReturnToHost(maximizeHost: true);
    }

    public void Cancel() => Cancel(notifyClient: true);

    public void Back() => Back(notifyClient: true);

    public void PreviewCandidate(string color)
    {
        if (!IsHex(color)) return;
        _selectedColor = color;
        _hoverColor = color;
        UpdateWindow();
        _ = SendAsync(new { type = "hover", color });
    }

    private void AddCandidate(string color)
    {
        if (!IsHex(color)) return;
        _candidateColors.RemoveAll(candidate => StringComparer.OrdinalIgnoreCase.Equals(candidate, color));
        _candidateColors.Add(color);
        if (_candidateColors.Count > 8) _candidateColors.RemoveAt(0);
        _selectedColor = color;
        _hoverColor = color;
        UpdateWindow();
        _ = SendAsync(new { type = "sample", color });
    }

    private void Back(bool notifyClient)
    {
        _active = false;
        _paused = false;
        _loupe?.Hide();
        UpdateWindow();
        if (notifyClient) _ = SendAsync(new { type = "back", color = _hoverColor ?? _selectedColor });
        HideAndReturnToHost(maximizeHost: true, clearHost: !_customEditing);
    }

    private void Cancel(bool notifyClient)
    {
        _active = false;
        _paused = false;
        _customEditing = false;
        _candidateColors.Clear();
        _selectedColor = null;
        _hoverColor = _previousColor;
        _loupe?.Hide();
        UpdateWindow();
        if (notifyClient) _ = SendAsync(new { type = "cancel" });
        HideAndReturnToHost(maximizeHost: true);
    }

    private void Open(string? previous)
    {
        var foreground = Native.GetForegroundWindow();
        var foregroundRoot = foreground == IntPtr.Zero ? IntPtr.Zero : Native.GetAncestor(foreground, Native.GA_ROOT);
        var samplerHandle = _window is { IsHandleCreated: true } ? _window.Handle : IntPtr.Zero;
        var loupeHandle = _loupe is { IsHandleCreated: true } ? _loupe.Handle : IntPtr.Zero;
        if (foregroundRoot != IntPtr.Zero && foregroundRoot != samplerHandle && foregroundRoot != loupeHandle)
        {
            _hostWindowHandle = foregroundRoot;
            ArrangeWindowsForSampling();
        }
        _previousColor = IsHex(previous) ? previous! : "#FFFFFF";
        _selectedColor = _candidateColors.LastOrDefault();
        _hoverColor = _selectedColor ?? _previousColor;
        _active = true;
        _paused = false;
        _lastHoverSent = "";
        if (_window is { IsDisposed: false } window)
        {
            window.SetState(_previousColor, _hoverColor, _selectedColor, _candidateColors, true);
            if (!window.Visible) window.Show();
            if (window.WindowState == FormWindowState.Minimized) window.WindowState = FormWindowState.Normal;
            window.Activate();
        }
        UpdatePointer();
    }

    public void ShowTarget(bool maximize = false)
    {
        var host = _hostWindowHandle;
        if (host == IntPtr.Zero || !Native.IsWindow(host)) return;
        Native.ShowWindow(host, maximize ? Native.SW_MAXIMIZE : Native.SW_RESTORE);
        Native.SetForegroundWindow(host);
    }

    private void HideAndReturnToHost(bool maximizeHost = true, bool clearHost = true)
    {
        RunOnUi(() =>
        {
            _window?.Hide();
            ShowTarget(maximizeHost);
            if (clearHost) _hostWindowHandle = IntPtr.Zero;
        });
    }

    private void ArrangeWindowsForSampling()
    {
        var host = _hostWindowHandle;
        if (host == IntPtr.Zero || !Native.IsWindow(host)) return;

        Native.ShowWindow(host, Native.SW_RESTORE);
        var workArea = Screen.FromHandle(host).WorkingArea;
        var halfWidth = workArea.Width / 2;
        var appLeft = workArea.Left + halfWidth;
        var appWidth = workArea.Width - halfWidth;
        if (!Native.SetWindowPos(host, IntPtr.Zero, appLeft, workArea.Top, appWidth, workArea.Height,
            Native.SWP_NOZORDER | Native.SWP_SHOWWINDOW))
            Native.SetWindowPos(host, IntPtr.Zero, appLeft, workArea.Top, appWidth, workArea.Height, Native.SWP_NOZORDER);

        if (_window is { IsDisposed: false } window)
        {
            window.WindowState = FormWindowState.Normal;
            window.StartPosition = FormStartPosition.Manual;
            var width = Math.Max(window.MinimumSize.Width, Math.Min(window.Width, appWidth - 16));
            var height = Math.Min(window.Height, workArea.Height - 16);
            window.Bounds = new Rectangle(appLeft + appWidth - width - 8, workArea.Bottom - height - 8, width, height);
        }
    }

    private void UpdatePointer()
    {
        if (!_active || _window is null || _loupe is null) { _loupe?.Hide(); return; }
        if (!Native.GetCursorPos(out var point)) return;
        var paused = IsExcludedWindow(point);
        if (_paused != paused)
        {
            _paused = paused;
            _window.SetState(_previousColor, _hoverColor, _selectedColor, _candidateColors, _active, paused);
        }
        if (paused)
        {
            _loupe.Hide();
            return;
        }

        var color = ReadPixel(point.X, point.Y);
        if (color is null) return;
        _hoverColor = color;
        _loupe.UpdateAt(point.X, point.Y, color);
        _window.SetState(_previousColor, _hoverColor, _selectedColor, _candidateColors, _active, false);
        if (!StringComparer.OrdinalIgnoreCase.Equals(color, _lastHoverSent))
        {
            _lastHoverSent = color;
            _ = SendAsync(new { type = "hover", color });
        }
    }

    private void OnLeftClick(int x, int y)
    {
        if (!_active || IsExcludedWindow(new Native.Point(x, y))) return;
        var color = ReadPixel(x, y);
        if (color is null) return;
        _hoverColor = color;
        _window?.SetState(_previousColor, _hoverColor, _selectedColor, _candidateColors, true, false);
        _ = SendAsync(new { type = "sample", color });
    }

    private bool OnRightClick(int x, int y)
    {
        if (!_active || IsExcludedWindow(new Native.Point(x, y))) return false;
        var color = ReadPixel(x, y);
        if (color is not null)
        {
            _hoverColor = color;
            AddCandidate(color);
        }
        return true;
    }

    private bool IsExcludedWindow(Native.Point point)
    {
        var handle = Native.GetAncestor(Native.WindowFromPoint(point), Native.GA_ROOT);
        if (handle == IntPtr.Zero) return false;
        if (_window is { IsHandleCreated: true } && handle == _window.Handle) return true;
        if (_loupe is { IsHandleCreated: true } && handle == _loupe.Handle) return true;
        return false;
    }

    private static string? ReadPixel(int x, int y)
    {
        var desktop = Native.GetDC(IntPtr.Zero);
        if (desktop == IntPtr.Zero) return null;
        try
        {
            var pixel = Native.GetPixel(desktop, x, y);
            if (pixel == 0xFFFFFFFF) return null;
            return $"#{pixel & 0xFF:X2}{(pixel >> 8) & 0xFF:X2}{(pixel >> 16) & 0xFF:X2}";
        }
        finally { Native.ReleaseDC(IntPtr.Zero, desktop); }
    }

    private void UpdateWindow() => _window?.SetState(_previousColor, _hoverColor, _selectedColor, _candidateColors, _active, _paused);

    private void RunOnUi(Action action)
    {
        var window = _window;
        if (window is null || window.IsDisposed) return;
        if (window.InvokeRequired) { try { window.BeginInvoke(action); } catch (InvalidOperationException) { } }
        else action();
    }

    private async Task SendAsync(object value)
    {
        WebSocket? socket;
        lock (_socketGate) socket = _socket;
        if (socket?.State != WebSocketState.Open) return;
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value));
        await _sendGate.WaitAsync().ConfigureAwait(false);
        try { if (socket.State == WebSocketState.Open) await socket.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None).ConfigureAwait(false); }
        catch (WebSocketException) { }
        finally { _sendGate.Release(); }
    }

    private static bool IsHex(string? value) => value is not null && value.Length == 7 && value[0] == '#' && value.AsSpan(1).ToString().All(Uri.IsHexDigit);

    public void Dispose()
    {
        _timer.Stop();
        _timer.Dispose();
        _mouseHook.Dispose();
        _keyboardHook.Dispose();
        _loupe?.Close();
        _loupe?.Dispose();
        _sendGate.Dispose();
    }

    private sealed class MouseHook : IDisposable
    {
        private readonly Native.LowLevelMouseProc _callback;
        private readonly Func<bool> _isActive;
        private readonly Action<int, int> _onClick;
        private readonly Func<int, int, bool> _onRightClick;
        private readonly IntPtr _hook;
        private bool _rightClickCaptured;

        public MouseHook(Func<bool> isActive, Action<int, int> onClick, Func<int, int, bool> onRightClick)
        {
            _isActive = isActive;
            _onClick = onClick;
            _onRightClick = onRightClick;
            _callback = Callback;
            _hook = Native.SetWindowsHookEx(Native.WH_MOUSE_LL, _callback, Native.GetModuleHandle(null), 0);
        }
        private IntPtr Callback(int code, IntPtr message, IntPtr data)
        {
            if (code >= 0)
            {
                if (message == (IntPtr)Native.WM_RBUTTONUP && _rightClickCaptured)
                {
                    _rightClickCaptured = false;
                    return (IntPtr)1;
                }
                if (message == (IntPtr)Native.WM_RBUTTONDOWN && _isActive())
                {
                    var info = Marshal.PtrToStructure<Native.MouseInfo>(data);
                    _rightClickCaptured = _onRightClick(info.Point.X, info.Point.Y);
                    if (_rightClickCaptured) return (IntPtr)1;
                }
                if (message == (IntPtr)Native.WM_LBUTTONDOWN && _isActive())
                {
                    var info = Marshal.PtrToStructure<Native.MouseInfo>(data);
                    _onClick(info.Point.X, info.Point.Y);
                }
            }
            return Native.CallNextHookEx(_hook, code, message, data);
        }

        public void Dispose()
        {
            if (_hook != IntPtr.Zero) Native.UnhookWindowsHookEx(_hook);
        }
    }

    private sealed class KeyboardHook : IDisposable
    {
        private readonly Native.LowLevelKeyboardProc _callback;
        private readonly Func<bool> _isActive;
        private readonly Action _onF3;
        private readonly IntPtr _hook;
        private bool _f3IsCaptured;

        public KeyboardHook(Func<bool> isActive, Action onF3)
        {
            _isActive = isActive;
            _onF3 = onF3;
            _callback = Callback;
            _hook = Native.SetWindowsHookEx(Native.WH_KEYBOARD_LL, _callback, Native.GetModuleHandle(null), 0);
        }

        private IntPtr Callback(int code, IntPtr message, IntPtr data)
        {
            if (code >= 0)
            {
                var key = Marshal.PtrToStructure<Native.KeyboardInfo>(data);
                // Some keyboards map the physical F3/media key to a volume key. Capture those
                // only during sampling so Windows' volume overlay cannot steal confirmation.
                var isConfirmKey = key.VirtualKey is Native.VK_F3 or Native.VK_VOLUME_MUTE or Native.VK_VOLUME_DOWN or Native.VK_VOLUME_UP;
                var isDown = message == (IntPtr)Native.WM_KEYDOWN || message == (IntPtr)Native.WM_SYSKEYDOWN;
                var isUp = message == (IntPtr)Native.WM_KEYUP || message == (IntPtr)Native.WM_SYSKEYUP;
                if (isConfirmKey && isDown && _isActive())
                {
                    if (!_f3IsCaptured)
                    {
                        _f3IsCaptured = true;
                        _onF3();
                    }
                    return (IntPtr)1;
                }
                if (isConfirmKey && isUp && _f3IsCaptured)
                {
                    _f3IsCaptured = false;
                    return (IntPtr)1;
                }
            }
            return Native.CallNextHookEx(_hook, code, message, data);
        }

        public void Dispose()
        {
            if (_hook != IntPtr.Zero) Native.UnhookWindowsHookEx(_hook);
        }
    }

    private static class Native
    {
        public const int WH_KEYBOARD_LL = 13, WH_MOUSE_LL = 14;
        public const int WM_LBUTTONDOWN = 0x0201, WM_RBUTTONDOWN = 0x0204, WM_RBUTTONUP = 0x0205;
        public const int WM_KEYDOWN = 0x0100, WM_KEYUP = 0x0101, WM_SYSKEYDOWN = 0x0104, WM_SYSKEYUP = 0x0105;
        public const int VK_F3 = 0x72, VK_VOLUME_MUTE = 0xAD, VK_VOLUME_DOWN = 0xAE, VK_VOLUME_UP = 0xAF;
        public const uint GA_ROOT = 2, SW_RESTORE = 9, SW_MAXIMIZE = 3;
        public const uint SWP_NOZORDER = 0x0004, SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;
        [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; public Point(int x, int y) { X = x; Y = y; } }
        [StructLayout(LayoutKind.Sequential)] public struct MouseInfo { public Point Point; public uint MouseData, Flags, Time; public IntPtr ExtraInfo; }
        [StructLayout(LayoutKind.Sequential)] public struct KeyboardInfo { public uint VirtualKey, ScanCode, Flags, Time; public IntPtr ExtraInfo; }
        public delegate IntPtr LowLevelKeyboardProc(int code, IntPtr message, IntPtr data);
        public delegate IntPtr LowLevelMouseProc(int code, IntPtr message, IntPtr data);
        [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc callback, IntPtr module, uint threadId);
        [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc callback, IntPtr module, uint threadId);
        [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
        [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern IntPtr GetModuleHandle(string? name);
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool SetWindowPos(IntPtr handle, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
        [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindow(IntPtr handle);
        [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool SetForegroundWindow(IntPtr handle);
        [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool ShowWindow(IntPtr handle, uint command);
        [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool GetCursorPos(out Point point);
        [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
        [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr handle, uint flags);
        [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr handle);
        [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr handle, IntPtr dc);
        [DllImport("gdi32.dll")] public static extern uint GetPixel(IntPtr dc, int x, int y);
    }
}
