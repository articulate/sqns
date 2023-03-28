export interface TopicOptions {
  arn?: string
  filterPolicy?: Record<string, string>
  rawMessageDelivery?: boolean
}
export interface SqnsOptions {
  maxReceiveCount?: number
  queueName?: string
  region?: string
  topic?: TopicOptions
}
