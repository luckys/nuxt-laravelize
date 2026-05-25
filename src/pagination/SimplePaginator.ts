import type { H3Event } from 'h3'

import type { Paginator, ParsePageParamsOptions } from './Paginator'
import { parsePageParams } from './extractParams'
import { buildPageUrl, getRequestPath } from './urls'

export class SimplePaginator<T> implements Paginator<T> {
  readonly items: readonly T[]
  readonly perPage: number
  readonly currentPage: number
  readonly hasMore: boolean

  constructor(items: readonly T[], perPage: number, currentPage: number, hasMore: boolean) {
    this.items = items
    this.perPage = Math.max(perPage, 1)
    this.currentPage = Math.max(currentPage, 1)
    this.hasMore = hasMore
  }

  static fromRequest<T>(
    event: H3Event,
    items: readonly T[],
    hasMore: boolean,
    options?: ParsePageParamsOptions,
  ): SimplePaginator<T> {
    const { page, perPage } = parsePageParams(event, options)
    return new SimplePaginator(items, perPage, page, hasMore)
  }

  toMeta(event: H3Event): Record<string, unknown> {
    const base = (this.currentPage - 1) * this.perPage
    return {
      current_page: this.currentPage,
      from: this.items.length > 0 ? base + 1 : null,
      path: getRequestPath(event),
      per_page: this.perPage,
      to: this.items.length > 0 ? base + this.items.length : null,
    }
  }

  toLinks(event: H3Event): Record<string, string | null> {
    return {
      prev: this.currentPage > 1 ? buildPageUrl(event, this.currentPage - 1, this.perPage) : null,
      next: this.hasMore ? buildPageUrl(event, this.currentPage + 1, this.perPage) : null,
    }
  }
}
