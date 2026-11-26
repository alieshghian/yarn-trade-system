# LicenseIssuerApp

Standalone tool for issuing `license.lic` files.

## Issue a license

```powershell
.\LicenseIssuerApp.exe issue `
  --customer "Customer Name" `
  --request "REQUEST_CODE_FROM_CUSTOMER_LICENSE_PAGE" `
  --private-key "C:\SecureKeys\license-private.pem" `
  --out "C:\IssuedLicenses\Customer-license.lic"
```

Optional expiration date:

```powershell
.\LicenseIssuerApp.exe issue --customer "Customer Name" --request "REQUEST_CODE" --expires 2027-12-31 --private-key "C:\SecureKeys\license-private.pem" --out license.lic
```

## Private key

Keep `license-private.pem` only on your own computer. Do not copy it to customer machines.

## Key generation

```powershell
.\LicenseIssuerApp.exe keygen --out-dir "C:\SecureKeys"
```

If you generate a new key pair, embed the new public key in the main app and rebuild the customer application.
