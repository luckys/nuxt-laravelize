export class UserRegistered {
  constructor(public readonly userId: string) {}

  toPayload(): readonly unknown[] {
    return [this.userId]
  }
}
