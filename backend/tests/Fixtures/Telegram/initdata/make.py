"""Writes valid.txt: a Mini App launch value (initData) signed as Telegram signs it (WP-40, KV-BE-006, KV-QA-003).

An independent check of the PHP verifier: this script shares no code with it or with tests/Support/InitDataSigner.php.
It uses the Python standard library only and signs with the synthetic TELEGRAM_BOT_TOKEN of phpunit.xml, which is no
bot's token. Regenerate with `python3 -I make.py` from this directory; the output is deterministic.

The value carries what a real launch carries: a Unicode first name, a photo address with the escaped slashes of
Telegram's JSON, a start parameter and a `signature` field (Bot API 8.0). As in Telegram's documentation and the
reference libraries, the data-check-string holds every field except `hash`, so `signature` is part of it.
"""

import hashlib
import hmac
import json
import pathlib
import urllib.parse

TOKEN = "123456789:TEST-homi-synthetic-token"
AUTH_DATE = 1795683600  # 2026-11-26 09:00:00 UTC

user = {
    "id": 279058397,
    "first_name": "Ойбек Ўткир",
    "last_name": "Тошматов",
    "username": "oybek_t",
    "language_code": "uz",
    "is_premium": True,
    "allows_write_to_pm": True,
    "photo_url": "https://t.me/i/userpic/320/oybek.svg",
}

fields = [
    ("query_id", "AAHdF6IQAAAAAN0XohDhrOrc"),
    ("user", json.dumps(user, ensure_ascii=False, separators=(",", ":")).replace("/", "\\/")),
    ("chat_instance", "-3788475317572404878"),
    ("chat_type", "private"),
    ("start_param", "flat_100012"),
    ("auth_date", str(AUTH_DATE)),
    ("signature", "6fbdaab833d39f54518bd5c3eb3f511d035e68cb2bd2c7e61f5d3c27aa5fdc2b2e6ab6d1e7f9a0c3b4d5e6f708192a3b4c5d6e7f8091a2b3"),
]

data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(fields))
secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
digest = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()

# urlencode writes a space as "+", as a browser's URLSearchParams does; the PHP signer writes "%20".
value = urllib.parse.urlencode(fields + [("hash", digest)])
pathlib.Path(__file__).with_name("valid.txt").write_text(value + "\n", encoding="utf-8")
