"""One request over stdin/stdout. No tokens, OTPs or message bodies in command arguments/logs.
Session/challenge live only in memory; the .NET caller encrypts persisted state.
"""
import json
import sys
import base64
import tempfile
from pathlib import Path


def failure(error):
    """Allow-listed metadata only: never include exception text or raw response."""
    kinds = {"authentication", "rate_limited", "permission_denied", "blocked", "account_restricted",
             "invalid_request", "not_found", "conflict", "temporary", "server", "network", "dns_error",
             "tls_error", "connection_error", "timeout", "protocol_error", "encryption_error", "decryption_error", "unknown"}
    layers = {"client", "request", "network", "http", "json", "encryption", "application", "upload"}
    codes = {"local_auth_required", "network_timeout", "request_encryption_failed", "not_contact_flood",
             "invalid_auth", "code_is_invalid", "code_expired", "sendpasskey", "send_pass_key"}
    kind = "dependencies" if isinstance(error, ImportError) else str(getattr(error, "kind", "unknown"))
    kind = kind if kind in kinds or kind == "dependencies" else "unknown"
    layer = str(getattr(error, "layer", "client"))
    code = getattr(error, "code", None)
    status = getattr(error, "http_status", None)
    return {"ok": False, "kind": kind, "diagnostic": {
        "exceptionType": type(error).__name__,
        "causeType": getattr(error, "cause_type", None),
        "layer": layer if layer in layers else "client",
        "code": code if code in codes else None,
        "httpStatus": status if isinstance(status, int) and 100 <= status <= 599 else None}}


def run(request):
    if request['operation'] == 'pdf':
        from price_pdf import render
        return {'ok': True, 'pdf': base64.b64encode(render(request['document'])).decode('ascii')}
    raise RuntimeError('Personal account operations are disabled; use the official Bot API.')
    from rubika_client.models import RubikaSession, LoginChallenge
    from rubika_client.settings import RubikaSettings, DEFAULT_API_URLS
    from rubika_client.transport.http import RubikaHttpTransport
    from rubika_client.services.auth import AuthService
    from rubika_client.services.contacts import ContactsService
    from rubika_client.services.messages import MessagesService

    class MemoryStore:
        def __init__(self):
            self.saved = RubikaSession.model_validate(request["session"]) if request.get("session") else None
            self.challenge = LoginChallenge.model_validate(request["challenge"]) if request.get("challenge") else None
        def load(self): return self.saved
        def save(self, session): self.saved = session
        def load_challenge(self): return self.challenge
        def save_challenge(self, challenge): self.challenge = challenge
        def clear_challenge(self): self.challenge = None

    store = MemoryStore()
    # Use a single host for sends: an ambiguous network failure must not trigger failover/resend.
    settings = RubikaSettings(_env_file=None, http_timeout=25,
        api_url=(store.saved.api_url or DEFAULT_API_URLS[0]) if store.saved else None)
    with_transport = RubikaHttpTransport(settings)
    try:
        auth = AuthService(with_transport, store)
        operation = request["operation"]
        result = {"ok": True}
        if operation == "code":
            auth.send_code(request["phone"], pass_key=request.get("passKey") or None)
        elif operation == "verify":
            auth.sign_in(request["phone"], request["code"])
        elif operation == "send":
            contacts = ContactsService(with_transport, auth.session)
            try:
                target = contacts.resolve(request["phone"]).object_guid
            except ValueError:
                target = contacts.add(request["phone"], first_name=request["name"]).object_guid
            if not target or not target.startswith("u"):
                return {"ok": False, "kind": "not_found"}
            if request.get('pdf'):
                from rubika_client.services.uploads import UploadsService
                with tempfile.TemporaryDirectory(prefix='textile-price-') as folder:
                    path = Path(folder) / 'price-list.pdf'
                    path.write_bytes(base64.b64decode(request['pdf'], validate=True))
                    uploads = UploadsService(with_transport, auth.session)
                    message = MessagesService(with_transport, uploads, auth.session).send_media(target, path, caption=request['text'])
            else:
                # Compatibility with already-prepared text runs from earlier versions.
                message = MessagesService(with_transport, None, auth.session).send_text(target, request["text"])
            message_id = message.message_id
            if not message_id and isinstance(message.raw.get("message_update"), dict):
                message_id = message.raw["message_update"].get("message", {}).get("message_id")
            if not message_id:
                return {"ok": False, "kind": "unknown"}
            result["messageId"] = str(message_id)
        else:
            return {"ok": False, "kind": "invalid_request"}
        if operation in ("code", "verify"):
            result["session"] = store.saved.model_dump(mode="json") if store.saved else None
            result["challenge"] = store.challenge.model_dump(mode="json") if store.challenge else None
        return result
    finally:
        with_transport.close()


if __name__ == "__main__":
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        result = run(json.load(sys.stdin))
    except Exception as error:
        result = failure(error)
    print(json.dumps(result, ensure_ascii=False))
