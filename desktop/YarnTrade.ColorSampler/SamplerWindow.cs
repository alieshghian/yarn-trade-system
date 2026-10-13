using System.Drawing;
using System.Windows.Forms;

namespace YarnTrade.ColorSampler;

internal sealed class SamplerWindow : Form
{
    private readonly SamplerController _controller;
    private readonly ColorField _oldField = new("رنگ فعلی");
    private readonly ColorField _newField = new("رنگ جدید");
    private readonly Label _status = new();
    private readonly FlowLayoutPanel _candidatePanel = new();
    private readonly List<Button> _candidateButtons = [];
    private readonly ToolTip _toolTip = new();
    private readonly Button _view = new() { Text = "نمایش برنامه" };
    private readonly Button _editCustom = new() { Text = "ویرایش در پالت", BackColor = Color.White };
    private readonly Button _confirm = new() { Text = "تأیید نهایی (F3)", BackColor = Color.FromArgb(33, 124, 115), ForeColor = Color.White };
    private readonly Button _back = new() { Text = "بازگشت", BackColor = Color.White };
    private string _candidateSnapshot = "";

    public SamplerWindow(SamplerController controller)
    {
        _controller = controller;
        Text = "Yarn Trade — قطره‌چکان رنگ";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(650, 410);
        MinimumSize = new Size(600, 390);
        FormBorderStyle = FormBorderStyle.Sizable;
        ShowInTaskbar = true;
        TopMost = true;
        RightToLeft = RightToLeft.Yes;
        RightToLeftLayout = true;
        KeyPreview = true;
        Font = new Font("Tahoma", 10F);
        BackColor = Color.FromArgb(247, 250, 248);

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 5, BackColor = BackColor };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 132));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 84));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var title = new Label { Text = "ذره‌بین رنگ Yarn Trade", Dock = DockStyle.Fill, Font = new Font("Tahoma", 15F, FontStyle.Bold), TextAlign = ContentAlignment.MiddleRight };
        var colors = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = new Padding(0, 6, 0, 6), BorderStyle = BorderStyle.FixedSingle };
        colors.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50)); colors.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        _oldField.Margin = new Padding(0); _newField.Margin = new Padding(0);
        colors.Controls.Add(_oldField, 0, 0); colors.Controls.Add(_newField, 1, 0);

        var candidates = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Margin = new Padding(0, 2, 0, 2) };
        candidates.RowStyles.Add(new RowStyle(SizeType.Absolute, 26));
        candidates.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var candidateCaption = new Label { Text = "رنگ‌های انتخاب‌شده (حداکثر ۸) — کلیک برای تأیید", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleRight, ForeColor = Color.FromArgb(82, 104, 98) };
        _candidatePanel.Dock = DockStyle.Fill;
        _candidatePanel.FlowDirection = FlowDirection.LeftToRight;
        _candidatePanel.WrapContents = false;
        _candidatePanel.RightToLeft = RightToLeft.No;
        _candidatePanel.Margin = new Padding(0);
        candidates.Controls.Add(candidateCaption, 0, 0);
        candidates.Controls.Add(_candidatePanel, 0, 1);

        _status.Dock = DockStyle.Fill; _status.TextAlign = ContentAlignment.MiddleRight; _status.ForeColor = Color.FromArgb(82, 104, 98);
        var actions = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, RowCount = 1, Margin = new Padding(0, 4, 0, 0), RightToLeft = RightToLeft.Yes };
        for (var column = 0; column < 4; column++) actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25F));
        foreach (var button in new[] { _view, _editCustom, _confirm, _back })
        {
            button.AutoSize = false; button.Dock = DockStyle.Fill; button.Height = 38; button.Margin = new Padding(4); button.FlatStyle = FlatStyle.Flat; button.FlatAppearance.BorderColor = Color.FromArgb(203, 213, 209); button.Padding = new Padding(4, 0, 4, 0); button.Cursor = Cursors.Hand;
            actions.Controls.Add(button, actions.Controls.Count, 0);
        }
        root.Controls.Add(title, 0, 0); root.Controls.Add(colors, 0, 1); root.Controls.Add(candidates, 0, 2); root.Controls.Add(_status, 0, 3); root.Controls.Add(actions, 0, 4);
        Controls.Add(root);
        _view.Click += (_, _) => _controller.ShowTarget();
        _editCustom.Click += (_, _) => _controller.EditCustom();
        _confirm.Click += (_, _) => _controller.Confirm();
        _back.Click += (_, _) => _controller.Back();
        KeyDown += (_, eventArgs) =>
        {
            if (eventArgs.KeyCode != Keys.F3) return;
            eventArgs.Handled = true;
            eventArgs.SuppressKeyPress = true;
            _controller.Confirm();
        };
        FormClosing += (_, eventArgs) =>
        {
            if (eventArgs.CloseReason != CloseReason.UserClosing) return;
            eventArgs.Cancel = true;
            _controller.Back();
        };
        SetState("#FFFFFF", "#FFFFFF", null, [], false);
    }

    public void SetState(string previous, string? hover, string? selected, IReadOnlyList<string> candidates, bool active, bool paused = false)
    {
        if (InvokeRequired) { try { BeginInvoke(() => SetState(previous, hover, selected, candidates, active, paused)); } catch (InvalidOperationException) { } return; }
        _oldField.SetColor(previous);
        _newField.SetColor(hover ?? selected ?? previous);
        UpdateCandidates(candidates, selected);
        _status.Text = !active
            ? "ذره‌بین خاموش است؛ برای شروع دوباره فعال‌سازی را بزنید."
            : paused
                ? "روی پنجرهٔ قطره‌چکان هستید؛ راست‌کلیک رنگ را موقتاً انتخاب می‌کند."
                : "حرکت برای پیش‌نمایش؛ راست‌کلیک رنگ موقت را انتخاب می‌کند؛ F3 ثبت نهایی است.";
        _confirm.Enabled = active || candidates.Count > 0 || selected is not null || hover is not null;
        _editCustom.Enabled = active && candidates.Count > 0;
    }

    private void UpdateCandidates(IReadOnlyList<string> candidates, string? selected)
    {
        var snapshot = string.Join("|", candidates);
        if (!StringComparer.Ordinal.Equals(snapshot, _candidateSnapshot))
        {
            _candidateSnapshot = snapshot;
            _candidatePanel.SuspendLayout();
            _candidatePanel.Controls.Clear();
            _candidateButtons.Clear();
            for (var index = 0; index < candidates.Count; index++)
            {
                var color = candidates[index];
                var button = new Button
                {
                    Text = (index + 1).ToString(),
                    Tag = color,
                    Size = new Size(68, 42),
                    Margin = new Padding(4, 2, 4, 2),
                    FlatStyle = FlatStyle.Flat,
                    BackColor = ColorTranslator.FromHtml(color),
                    ForeColor = ReadableText(ColorTranslator.FromHtml(color)),
                    Cursor = Cursors.Hand,
                    TabStop = true,
                };
                button.FlatAppearance.BorderSize = 1;
                button.FlatAppearance.BorderColor = Color.FromArgb(155, 169, 165);
                _toolTip.SetToolTip(button, color.ToUpperInvariant() + " — کلیک برای تأیید نهایی");
                button.MouseEnter += (_, _) => _controller.PreviewCandidate(color);
                button.Click += (_, _) => _controller.ConfirmCandidate(color);
                _candidateButtons.Add(button);
                _candidatePanel.Controls.Add(button);
            }
            _candidatePanel.ResumeLayout();
        }

        foreach (var button in _candidateButtons)
        {
            var isSelected = StringComparer.OrdinalIgnoreCase.Equals(button.Tag as string, selected);
            button.FlatAppearance.BorderSize = isSelected ? 3 : 1;
            button.FlatAppearance.BorderColor = isSelected ? Color.FromArgb(33, 124, 115) : Color.FromArgb(155, 169, 165);
        }
    }

    private static Color ReadableText(Color color) => (color.R * 299 + color.G * 587 + color.B * 114) / 1000 < 145 ? Color.White : Color.FromArgb(24, 48, 45);

    private sealed class ColorField : UserControl
    {
        private readonly Label _caption;
        private readonly Label _hex;
        private readonly Panel _swatch;
        public ColorField(string caption)
        {
            Dock = DockStyle.Fill;
            Margin = new Padding(0);
            BackColor = Color.Transparent;
            _caption = new Label { Text = caption, Dock = DockStyle.Top, Height = 27, TextAlign = ContentAlignment.MiddleRight, BackColor = Color.Transparent, Padding = new Padding(8, 0, 8, 0) };
            _swatch = new Panel { Dock = DockStyle.Fill, Margin = new Padding(0) };
            _hex = new Label { Dock = DockStyle.Bottom, Height = 34, TextAlign = ContentAlignment.MiddleLeft, Font = new Font("Consolas", 16F, FontStyle.Regular), BackColor = Color.Transparent, Padding = new Padding(10, 0, 0, 0) };
            _swatch.Controls.Add(_hex);
            Controls.Add(_swatch);
            Controls.Add(_caption);
            SetColor("#FFFFFF");
        }
        public void SetColor(string? color)
        {
            var parsed = ColorTranslator.FromHtml(string.IsNullOrEmpty(color) ? "#FFFFFF" : color);
            _swatch.BackColor = parsed;
            var brightness = (parsed.R * 299 + parsed.G * 587 + parsed.B * 114) / 1000;
            _caption.ForeColor = _hex.ForeColor = brightness < 145 ? Color.White : Color.FromArgb(24, 48, 45);
            _hex.Text = string.IsNullOrEmpty(color) ? "—" : color.ToUpperInvariant();
            Invalidate();
        }
    }
}
