import { defineEventHandler } from 'h3'
import { handleDeadLetterOperation } from '../handler'

export default defineEventHandler(event => handleDeadLetterOperation(event, 'payload'))
