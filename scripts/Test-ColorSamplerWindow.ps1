$ErrorActionPreference = 'Stop'
# Exercises the existing development companion; never writes application/browser records.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SamplerWindowTest {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 public delegate bool EnumProc(IntPtr h,IntPtr param);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc,IntPtr param);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,System.Text.StringBuilder b,int count);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls,string title);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int cmd);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr h,int index);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
}
'@
$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$socket.Options.SetRequestHeader('Origin','http://127.1.0.1:5173')
$token = [System.Threading.CancellationToken]::None
function Send-SamplerCommand([string]$json) {
 $bytes = [Text.Encoding]::UTF8.GetBytes($json)
 [void]$socket.SendAsync([ArraySegment[byte]]::new($bytes),[System.Net.WebSockets.WebSocketMessageType]::Text,$true,$token).GetAwaiter().GetResult()
}
function Check([bool]$ok,[string]$message) { if(!$ok){throw $message} }
try {
 [void]$socket.ConnectAsync([Uri]'ws://127.1.0.1:5174/color-sampler',$token).GetAwaiter().GetResult()
 $hostHandle = [SamplerWindowTest]::GetForegroundWindow()
 $before = [SamplerWindowTest+Rect]::new()
 [void][SamplerWindowTest]::GetWindowRect($hostHandle,[ref]$before)
 $buffer=[byte[]]::new(4096)
 $deadline=[Threading.CancellationTokenSource]::new(2000)
 $result=$socket.ReceiveAsync([ArraySegment[byte]]::new($buffer),$deadline.Token).GetAwaiter().GetResult()
 Write-Host ('WS: '+[Text.Encoding]::UTF8.GetString($buffer,0,$result.Count))
 Send-SamplerCommand '{"type":"open","previousColor":"#123456"}'
 $handle = [IntPtr]::Zero
 for($i=0;$i -lt 30;$i++) {
  $script:samplerHandle=[IntPtr]::Zero
  [void][SamplerWindowTest]::EnumWindows({param($h,$p)
   $owner=0;[void][SamplerWindowTest]::GetWindowThreadProcessId($h,[ref]$owner)
   if((Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName -like '*ColorSampler*'){
    $title=[Text.StringBuilder]::new(256);[void][SamplerWindowTest]::GetWindowText($h,$title,256)
    if($title.ToString().StartsWith('Yarn Trade')){$script:samplerHandle=$h}
   }
   return $true
  },[IntPtr]::Zero)
  $handle=$script:samplerHandle
  if($handle -ne [IntPtr]::Zero -and [SamplerWindowTest]::IsWindowVisible($handle)){break}
  Start-Sleep -Milliseconds 100
 }
 Check ([SamplerWindowTest]::IsWindowVisible($handle)) 'Sampler did not become visible on first open'
 Check (([SamplerWindowTest]::GetWindowLongPtr($handle,-20).ToInt64() -band 8) -ne 0) 'Sampler must be topmost'
 $after = [SamplerWindowTest+Rect]::new()
 [void][SamplerWindowTest]::GetWindowRect($hostHandle,[ref]$after)
 Check (($before.Left -eq $after.Left) -and ($before.Top -eq $after.Top) -and ($before.Right -eq $after.Right) -and ($before.Bottom -eq $after.Bottom)) 'Opening sampler resized the host'
 $rect=[SamplerWindowTest+Rect]::new();[void][SamplerWindowTest]::GetWindowRect($handle,[ref]$rect)
 [void][SamplerWindowTest]::SetWindowPos($handle,[IntPtr]::Zero,($rect.Left-25),($rect.Top+25),0,0,5)
 $moved=[SamplerWindowTest+Rect]::new();[void][SamplerWindowTest]::GetWindowRect($handle,[ref]$moved)
 Check ($moved.Left -eq $rect.Left-25) 'Sampler is not movable'
 [void][SamplerWindowTest]::ShowWindow($handle,6)
 Send-SamplerCommand '{"type":"open","previousColor":"#123456"}'
 Start-Sleep -Milliseconds 300
 Check (![SamplerWindowTest]::IsIconic($handle)) 'Sampler did not restore from minimized'
 Check ([SamplerWindowTest]::IsWindowVisible($handle)) 'Sampler disappeared after reopen'
 Send-SamplerCommand '{"type":"cancel"}'
 Start-Sleep -Milliseconds 200
 Check (![SamplerWindowTest]::IsWindowVisible($handle)) 'Cancel did not hide sampler'
 'PASS native first open, visible topmost, draggable, minimized restore, unchanged host geometry, cancel'
} finally { $socket.Dispose() }
