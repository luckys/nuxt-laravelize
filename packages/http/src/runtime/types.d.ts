declare module 'nuxt/schema' {
  interface RuntimeConfig {
    laravelizeHttp: {
      signingKey: string
      signingOrigin: string
    }
  }

  interface PublicRuntimeConfig {
    laravelizeHttp: {
      baseURL: string
    }
  }
}

export {}
