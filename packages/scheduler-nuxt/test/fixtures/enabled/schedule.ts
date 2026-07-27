import { defineSchedule } from '@nuxt-laravelize/scheduler'

export default defineSchedule(schedule => schedule.task('fixture:tick').everyMinute().timezone('America/New_York'))
