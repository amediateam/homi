<?php

namespace App\Services\Listings;

/**
 * Legacy photo addresses as addresses of HOMI's media host (WP-42, `25` §4.5, RES-001, RES-002). Pure: the base and
 * the legacy hosts are constructor values (`legacy.media.public_url`, `legacy.media.hosts`).
 *
 * `/media/<listing>/<n>.jpg?<query>` — relative, or absolute on a legacy host over `https` — becomes
 * `<base>/<listing>/<n>.jpg?<query>` with the query untouched, so the client's small variant (`.s.jpg`, RES-002) still
 * works and the signature (`e`, `s`) still reaches legacy through HOMI's nginx proxy. Any other address — another host,
 * a user or a port in it, no query, a query with characters a signed legacy address does not have — is dropped and
 * counted in `dropped()`. Without a base every list is empty (`isConfigured()` is `false`; the caller warns).
 */
final class PhotoUrlRewriter
{
    private const string PATH = '~^/media/(\d{1,18})/(\d{1,4})\.jpg$~';

    private const string QUERY = '~^[A-Za-z0-9._\~%=&-]{1,512}$~';

    private readonly string $base;

    /** @var list<string> */
    private readonly array $hosts;

    private int $dropped = 0;

    /** @param  list<string>  $legacyHosts */
    public function __construct(string $publicUrl, array $legacyHosts = [])
    {
        $this->base = rtrim(trim($publicUrl), '/');
        $this->hosts = array_map(strtolower(...), $legacyHosts);
    }

    public function isConfigured(): bool
    {
        return $this->base !== '';
    }

    /** The address on HOMI's media host, or `null` (not configured, or a foreign address, counted). */
    public function rewrite(mixed $address): ?string
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $rewritten = is_string($address) ? $this->rewritten($address) : null;

        if ($rewritten === null) {
            $this->dropped++;
        }

        return $rewritten;
    }

    /**
     * Every address of a list that can be rewritten, in its order; `[]` without a base.
     *
     * @return list<string>
     */
    public function rewriteAll(mixed $addresses): array
    {
        if (! is_array($addresses) || ! $this->isConfigured()) {
            return [];
        }

        return array_values(array_filter(array_map($this->rewrite(...), array_values($addresses)), fn (?string $address): bool => $address !== null));
    }

    /** How many addresses were dropped as foreign since this rewriter was made. */
    public function dropped(): int
    {
        return $this->dropped;
    }

    private function rewritten(string $address): ?string
    {
        $parts = parse_url($address);

        if ($parts === false || isset($parts['user']) || isset($parts['pass']) || isset($parts['port']) || isset($parts['fragment'])) {
            return null;
        }

        $absolute = isset($parts['scheme']) || isset($parts['host']);

        if ($absolute && (strtolower($parts['scheme'] ?? '') !== 'https' || ! in_array(strtolower($parts['host'] ?? ''), $this->hosts, true))) {
            return null;
        }

        if (! $absolute && ! str_starts_with($address, '/media/')) {
            return null;
        }

        $path = $parts['path'] ?? '';
        $query = $parts['query'] ?? '';

        if (preg_match(self::PATH, $path, $match) !== 1 || preg_match(self::QUERY, $query) !== 1) {
            return null;
        }

        return "{$this->base}/{$match[1]}/{$match[2]}.jpg?{$query}";
    }
}
