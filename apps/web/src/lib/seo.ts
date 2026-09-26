/**
 * SEO helpers.
 */

/**
 * Serialise a value for embedding in a `<script type="application/ld+json">`.
 *
 * `JSON.stringify` alone is not safe here. A product name containing
 * `</script><img src=x onerror=alert(1)>` produces valid JSON that closes
 * the script element early, and everything after it is parsed as live HTML.
 * That is a stored XSS, reachable by anyone who can edit a product.
 *
 * Escaping `<`, `>` and `&` as `\uXXXX` inside JSON strings is valid JSON
 * and cannot terminate the element. U+2028/U+2029 are escaped too because
 * they are literal newlines to a JS parser.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
