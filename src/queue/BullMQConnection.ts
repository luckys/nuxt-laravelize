export class BullMQConnection {
  readonly client: unknown

  constructor(client: unknown) {
    this.client = client
  }
}
