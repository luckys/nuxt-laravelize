import { route } from '../../../packages/routes/src/public-runtime'

export default {
  users: {
    show: route('GET', '/users/{user}/{section?}'),
    files: route('GET', '/users/{user}/files/{path+}'),
  },
} as const
