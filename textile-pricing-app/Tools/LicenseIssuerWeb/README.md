# LicenseIssuerWeb

وب‌اپ جدا برای صدور لایسنس و دانلود مستقیم فایل `license.lic`.

## اجرا

```powershell
dotnet run --project .\Tools\LicenseIssuerWeb\LicenseIssuerWeb.csproj --urls http://localhost:5097
```

بعد مرورگر را باز کنید:

```text
http://localhost:5097
```

کد درخواست لایسنس را از صفحه `/License` نرم‌افزار مشتری بگیرید، در فرم وارد کنید و دکمه `دانلود license.lic` را بزنید.

## نکته امنیتی

این ابزار فقط روی سیستم خودتان اجرا شود. فایل `license-private.pem` را به مشتری ندهید.
