export interface CreateSqsQueueParams {
  deadletterQueueArn?: string
  queueName?: string
}

export interface SqnsOptions {
  maxReceiveCount?: number
  queueName: string
  region: string
  topic?: TopicOptions
}

export interface TopicOptions {
  arn?: string
  filterPolicy?: Record<string, string>
  filterPolicyScope?: 'MessageAttributes' | 'MessageBody'
  rawMessageDelivery?: boolean
}
