<?php

namespace App\Http\Controllers\Pages;

use App\Exceptions\ApiException;
use App\Exceptions\Listings\ContactUnavailable;
use App\Exceptions\Sources\SourceNotFound;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Listings\CallLinkClaims;
use App\Services\Listings\CallLinkService;
use App\Services\Sources\SourceContext;
use App\Services\Sources\SourceManager;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * `GET /call/{token}` (WP-43, RES-005, KV-BE-037, SEC-REQ-026): HOMI's call page of variant A, opened in the external
 * browser from a link of `POST …/contact` (no Telegram launch data, no session, no cookie; the token is the only
 * credential). Opening it is not a second disclosure: its token was issued by one.
 *
 * | Case                                                        | Answer                                        |
 * | ----------------------------------------------------------- | --------------------------------------------- |
 * | valid token, the listing has a phone                        | `200` `call/show`: HOMI's name, the listing's title (masked), the number and one `tel:` link |
 * | expired (more than 60 s after `x`)                          | `410` `call/expired`, in the token's language |
 * | bad signature, unknown listing, no phone, erased user       | `404` `call/missing`                           |
 * | the listing source cannot answer                            | `503` `call/unavailable`                       |
 * | more than 30 pages a minute from one address (`call-page`)  | `429` `call/unavailable`                       |
 *
 * The title comes from `ListingSource::preview()` and the number from `ListingSource::contact()` on every visit (the
 * caches make this cheap), so a withdrawn listing is `404` at once and a token for one listing never shows another.
 * Both are read with a system context in the token's language; the drivers are chosen for the token's user, so the
 * page reads the source the link was issued from. Every answer carries `HEADERS`. The page is rendered to a string,
 * so no view data (the number) reaches Telescope's request entry, which `TelescopeServiceProvider` drops anyway.
 */
class CallPageController extends Controller
{
    /** The headers of every answer of the call page. */
    public const array HEADERS = [
        'X-Robots-Tag' => 'noindex',
        'Cache-Control' => 'no-store',
        'Referrer-Policy' => 'no-referrer',
        'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'",
        'X-Content-Type-Options' => 'nosniff',
    ];

    public function __invoke(Request $request, #[\SensitiveParameter] string $token, CallLinkService $links, SourceManager $sources): Response
    {
        $claims = $links->verify($token);

        if ($claims === null) {
            return self::page('call.missing', 404, SourceContext::localeOf($request));
        }

        if ($claims->expired()) {
            return self::page('call.expired', 410, $claims->locale);
        }

        return $this->callPage($claims, $sources);
    }

    /**
     * A page of the call link, with the headers of the call page.
     *
     * @param  view-string  $view  one of `call/*`
     * @param  array<string, mixed>  $data
     * @param  array<string, string|int>  $headers  added to `HEADERS` (a limiter's `Retry-After`)
     */
    public static function page(string $view, int $status, string $locale, #[\SensitiveParameter] array $data = [], array $headers = []): Response
    {
        $html = view($view, ['locale' => $locale] + $data)->render();

        return new Response($html, $status, ['Content-Type' => 'text/html; charset=UTF-8'] + self::HEADERS + $headers);
    }

    private function callPage(CallLinkClaims $claims, SourceManager $sources): Response
    {
        $user = User::query()->find($claims->userId);

        if (! $user instanceof User) {
            return self::page('call.missing', 404, $claims->locale);
        }

        $drivers = new SourceContext($claims->locale, 'USD', $user);
        $system = SourceContext::system($claims->locale);

        try {
            $listing = $sources->listings('source.listings.card', $drivers)->source->preview($claims->number, $system);
            $contact = $sources->listings('source.listings.contact', $drivers)->source->contact($claims->number, $system);
        } catch (SourceNotFound|ContactUnavailable) {
            return self::page('call.missing', 404, $claims->locale);
        } catch (ApiException) {
            return self::page('call.unavailable', 503, $claims->locale);
        }

        $phone = $contact->phone;

        if ($phone === null || preg_match('/^\+\d{8,15}$/', $phone) !== 1) {
            return self::page('call.missing', 404, $claims->locale);
        }

        return self::page('call.show', 200, $claims->locale, [
            'title' => $listing->title,
            'phone' => $phone,
            'display' => $contact->phoneDisplay ?? $phone,
        ]);
    }
}
