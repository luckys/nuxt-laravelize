# @nuxt-laravelize/broadcasting-pusher

Inject `PusherBroadcaster` as core's `broadcasterToken`. Credentials are server secrets and must remain in private runtime config. `fetch` is injectable for testing/runtimes.

For authenticated channels, create an application-owned, authenticated POST endpoint accepting `socket_id` and `channel_name`; authorize the current user through core's `ChannelRegistry` using the canonical `private-*` or `presence-*` name, deny a null result, then call `authorizeChannel`. Presence channels require `{ user_id, user_info? }`; private channels reject member data. Encrypted channels are currently unsupported and rejected. Validate request fields and never trust user identity supplied by the client. This package intentionally provides no route or websocket client infrastructure.
