import { defineSchedule } from '@luckys_luis/nuxt-laravelize-scheduler'

export default defineSchedule(schedule => schedule.task('fixture:tick').everyMinute().timezone('America/New_York'))
