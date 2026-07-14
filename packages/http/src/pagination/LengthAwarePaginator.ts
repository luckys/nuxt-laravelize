import type { H3Event } from 'h3'

import type { Paginator, ParsePageParamsOptions } from './Paginator'
import { parsePageParams } from './extractParams'
import { buildPageUrl, getRequestPath } from './urls'

export class LengthAwarePaginator<T> implements Paginator<T> {
  readonly items: readonly T[]
  readonly total: number
  readonly perPage: number
  readonly currentPage: number

  constructor(items: readonly T[], total: number, perPage: number, currentPage: number) {
    this.items = items
    this.total = Math.max(total, 0)
    this.perPage = Math.max(perPage, 1)
    this.currentPage = Math.max(currentPage, 1)
  }

  static fromRequest<T>(
    event: H3Event,
    items: readonly T[],
    total: number,
    options?: ParsePageParamsOptions,
  ): LengthAwarePaginator<T> {
    const { page, perPage } = parsePageParams(event, options)
    return new LengthAwarePaginator(items, total, perPage, page)
  }

  get lastPage(): number {
    return Math.max(Math.ceil(this.total / this.perPage), 1)
  }

  get from(): number | null {
    if (this.items.length === 0) return null
    return (this.currentPage - 1) * this.perPage + 1
  }

  get to(): number | null {
    if (this.items.length === 0) return null
    return ((this.currentPage - 1) * this.perPage) + this.items.length
  }

  toMeta(event: H3Event): Record<string, unknown> {
    return {
      current_page: this.currentPage,
      from: this.from,
      last_page: this.lastPage,
      path: getRequestPath(event),
      per_page: this.perPage,
      to: this.to,
      total: this.total,
    }
  }

  toLinks(event: H3Event): Record<string, string | null> {
    return {
      first: buildPageUrl(event, 1, this.perPage),
      last: buildPageUrl(event, this.lastPage, this.perPage),
      prev: this.currentPage > 1 ? buildPageUrl(event, this.currentPage - 1, this.perPage) : null,
      next: this.currentPage < this.lastPage ? buildPageUrl(event, this.currentPage + 1, this.perPage) : null,
    }
  }
}
