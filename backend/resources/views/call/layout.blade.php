{{-- HOMI's call page (WP-43): no script, no external asset, inline CSS only; `$locale` is the token's language. --}}
<!DOCTYPE html>
<html lang="{{ $locale }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>{{ __('call.brand', [], $locale) }}</title>
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f6f8;color:#1c1d21}
main{max-width:28rem;margin:0 auto;padding:2.5rem 1.25rem;text-align:center}
.brand{font-weight:700;letter-spacing:.08em;color:#4f46e5;margin:0 0 1.5rem}
h1{font-size:1.125rem;font-weight:600;margin:0 0 .75rem}
.title{color:#5b5f6b;margin:0 0 1.5rem}
.number{font-size:1.5rem;font-weight:600;margin:0 0 1.5rem}
.call{display:block;padding:1rem;border-radius:.75rem;background:#4f46e5;color:#fff;font-weight:600;text-decoration:none}
.note{color:#5b5f6b}
</style>
</head>
<body>
<main>
<p class="brand">{{ __('call.brand', [], $locale) }}</p>
@yield('content')
</main>
</body>
</html>
