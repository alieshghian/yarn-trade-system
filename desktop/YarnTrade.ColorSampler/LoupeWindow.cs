using System.Drawing;
using System.Windows.Forms;

namespace YarnTrade.ColorSampler;

internal sealed class LoupeWindow : Form
{
    private const int WsExTransparent = 0x00000020;
    private const int WsExToolWindow = 0x00000080;
    private const int WsExNoActivate = 0x08000000;
    private Bitmap? _magnified;
    private string _color = "#FFFFFF";

    public LoupeWindow()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        Size = new Size(142, 160);
        BackColor = Color.Magenta;
        TransparencyKey = Color.Magenta;
        StartPosition = FormStartPosition.Manual;
        DoubleBuffered = true;
    }

    protected override bool ShowWithoutActivation => true;
    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            parameters.ExStyle |= WsExTransparent | WsExToolWindow | WsExNoActivate;
            return parameters;
        }
    }

    public void UpdateAt(int cursorX, int cursorY, string color)
    {
        _color = color;
        const int sourceSize = 21;
        var screen = SystemInformation.VirtualScreen;
        var sourceLeft = Math.Clamp(cursorX - sourceSize / 2, screen.Left, screen.Right - sourceSize);
        var sourceTop = Math.Clamp(cursorY - sourceSize / 2, screen.Top, screen.Bottom - sourceSize);
        var bitmap = new Bitmap(sourceSize, sourceSize);
        using (var graphics = Graphics.FromImage(bitmap)) graphics.CopyFromScreen(sourceLeft, sourceTop, 0, 0, bitmap.Size, CopyPixelOperation.SourceCopy);
        _magnified?.Dispose();
        _magnified = bitmap;

        var x = cursorX + 28;
        var y = cursorY + 28;
        if (x + Width > screen.Right) x = cursorX - Width - 28;
        if (y + Height > screen.Bottom) y = cursorY - Height - 28;
        Location = new Point(Math.Clamp(x, screen.Left, screen.Right - Width), Math.Clamp(y, screen.Top, screen.Bottom - Height));
        if (!Visible) Show();
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        e.Graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
        const int margin = 7, imageSize = 128;
        e.Graphics.FillEllipse(Brushes.White, margin - 2, margin - 2, imageSize + 4, imageSize + 4);
        if (_magnified is not null) e.Graphics.DrawImage(_magnified, new Rectangle(margin, margin, imageSize, imageSize));
        using var grid = new Pen(Color.FromArgb(70, Color.Black), 1);
        for (var i = 1; i < 21; i++)
        {
            var position = margin + i * imageSize / 21f;
            e.Graphics.DrawLine(grid, position, margin, position, margin + imageSize);
            e.Graphics.DrawLine(grid, margin, position, margin + imageSize, position);
        }
        var cell = imageSize / 21f;
        using var centerBorder = new Pen(Color.White, 3);
        e.Graphics.DrawRectangle(centerBorder, margin + 10 * cell, margin + 10 * cell, cell, cell);
        using var darkBorder = new Pen(Color.Black, 1);
        e.Graphics.DrawRectangle(darkBorder, margin + 10 * cell, margin + 10 * cell, cell, cell);
        e.Graphics.FillRectangle(Brushes.White, 31, 137, 80, 19);
        using var textBrush = new SolidBrush(Color.FromArgb(24, 48, 45));
        e.Graphics.DrawString(_color, new Font("Consolas", 9), textBrush, 34, 139);
    }

    public new void Hide() => base.Hide();

    protected override void Dispose(bool disposing)
    {
        if (disposing) _magnified?.Dispose();
        base.Dispose(disposing);
    }
}
