import { defineRoutes, route, type RouteResult } from '../src/public-runtime'

const routes = defineRoutes({ posts: { show: route('GET', '/posts/{post}/{tab?}') } })
const catchAll = defineRoutes({ files: route('GET', '/files/{path+}') })
const result: RouteResult<'GET'> = routes.posts.show({ post: 1 })
routes.posts.show({ post: { toRoute: () => 'slug' }, tab: 'comments' })
// @ts-expect-error required path parameter
routes.posts.show({})
// @ts-expect-error unknown path parameter
routes.posts.show({ post: 1, unknown: 2 })
void result
catchAll.files({ path: ['one'] })
// @ts-expect-error a required catch-all array cannot be empty
catchAll.files({ path: [] })
