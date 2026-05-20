declare module '#laravelize/server-providers' {
  import type { ServiceProviderClass } from '../core/providers/Kernel'

  const providers: ServiceProviderClass[]
  export default providers
}

declare module '#laravelize/client-providers' {
  import type { ServiceProviderClass } from '../core/providers/Kernel'

  const providers: ServiceProviderClass[]
  export default providers
}
