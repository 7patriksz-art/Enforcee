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
MCowBQYDK2VwAyEAK1WUAQxZe6E+Z4yTe4jqoSc3skssi5OH+kEHa2LZ2vA=
-----END PUBLIC KEY-----
`;
