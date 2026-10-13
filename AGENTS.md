# Yarn Trade local startup

- Keep the frontend at `http://127.1.0.1:5173/`; start it with `runapp2.bat`.
- Start the API with `runapp1.bat` on `localhost:5223`. The script already carries the runtime compatibility setting; use it instead of explaining the runtime mismatch again.
- Vite starts the color-sampler companion on `127.1.0.1:5174` automatically. Do not launch it manually.
- If the page or data fails, check both frontend and API on these exact addresses, then restart the needed service with its script. Keep the user-facing browser on `127.1.0.1:5173`.
