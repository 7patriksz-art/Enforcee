/**
 * The licence verification key.
 *
 * This is a *public* key and belongs in source control. It is compiled into the CLI so a
 * licence can be checked on a laptop with no network, which is the whole point.
 *
 * Its private half lives only in ENFORCEE_LICENCE_PRIVATE_KEY on the server and is never
 * committed, never logged, and never sent to a browser. If it ever leaks, generate a new
 * pair, ship a CLI release with the new public key, and re-issue outstanding licences.
 */
export const LICENCE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAzUClif/dMJGgcLWGoGv5/v56q7Xk0yGuoRY0r/B7cWU=
-----END PUBLIC KEY-----
`;
