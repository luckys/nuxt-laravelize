export abstract class Policy<TUser = unknown, TModel = unknown> {
  before?(user: TUser): boolean | null | Promise<boolean | null>;

  [action: string]: unknown
}

export type PolicyAction<TUser = unknown, TModel = unknown> = (
  user: TUser,
  model: TModel,
  ...rest: readonly unknown[]
) => boolean | Promise<boolean>
