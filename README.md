# request-util

This module is used to make https requests with arguments supported by the `request` library
(or `request-promise-native`) but without actually using the `request` library as it is deprecated.

Instead, the **expected** arguments are converted and used with `axios`, e.g.:

- `baseUrl` --> `baseURL`
- `uri` --> `url`
- `qs` --> `params`
- etc (see `src/request.js` for full details)

Similarly, the response is modified to include attributes expected on a `request` response, e.g.:

- `data` --> `body`
- `status` --> `statusCode`
- etc (see `src/request.js` for full details)

The behavior can be compared directly to `request` behavior by uncommenting the lines prefixed
with `//COMPARE` and creating a `USE_LEGACY_REQUEST_LIBRARY` file in the base directory.
The `fs-extra`, `request`, and `request-promise-native` libraries will also need to be installed
as they are not included in `package.json`.
If this is done, `request` will be used instead of `axios`, allowing comparison.
