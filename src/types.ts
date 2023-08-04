export interface CreateSqsQueueParams {
  deadletterQueueArn?: string
  queueName?: string
  fifo?: boolean
}

export interface SqnsOptions {
  maxReceiveCount?: number
  queueName: string
  region: string
  topic?: TopicOptions
  fifo?: boolean
}

export interface TopicOptions {
  arn?: string
  filterPolicy?: Record<string, string>
  rawMessageDelivery?: boolean
}
