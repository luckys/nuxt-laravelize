# @nuxt-laravelize/nuxt

Convenience preset that activates the stable Nuxt Laravelize modules and, when usable locales are configured, `nuxt-i18n-micro`. Configure translations through the Nuxt `i18n` option and use `useI18n().$t()` or `$t()` in Vue, `await useServerLocalization(event)` in Nitro handlers, or `await createServerLocalization(locale)` from the server-only `@nuxt-laravelize/nuxt/runtime/server` export. Individual feature packages remain independently installable; false, missing, or empty i18n configuration leaves both client and server localization disabled.

See the complete [English](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.md#nuxt-preset) or [Spanish](https://github.com/luckys/nuxt-laravelize/blob/development/docs/modules.es.md#preset-nuxt) setup guide.
