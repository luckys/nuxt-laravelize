import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'

import { Validator } from '../Validator'
import { validatorToken } from '../tokens'

export default class ValidationServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(validatorToken)) container.singleton(validatorToken, () => new Validator())
  }
}
