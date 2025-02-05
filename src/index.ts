import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
  SQSClient
} from '@aws-sdk/client-sqs'

import {
  SetSubscriptionAttributesCommand,
  SNSClient,
  SubscribeCommand
} from '@aws-sdk/client-sns'

import type {
  CreateQueueCommandInput,
  GetQueueAttributesCommandInput,
  GetQueueAttributesCommandOutput,
  SetQueueAttributesCommandInput,
  CreateQueueCommandOutput,
  SetQueueAttributesCommandOutput
} from '@aws-sdk/client-sqs'

import type {
  SetSubscriptionAttributesCommandInput,
  SubscribeCommandInput,
  SubscribeCommandOutput,
  SetSubscriptionAttributesCommandOutput
} from '@aws-sdk/client-sns'

import {
  CreateSqsQueueParams,
  SqnsOptions,
  TopicOptions
} from './types'

const sqns = async (options: SqnsOptions): Promise<string> => {
  const {
    region,
    queueName,
    maxReceiveCount = 3,
    topic = {}
  } = options

  if (region === null || region === undefined || region === '') throw Error('Missing region')
  if (queueName === null || queueName === undefined || queueName === '') throw Error('Missing queueName')

  const topicOptions: TopicOptions = {
    rawMessageDelivery: true,
    ...topic
  }

  const sqsClient = new SQSClient({ region })
  const snsClient = new SNSClient({ region })

  const createQueue = (params: CreateQueueCommandInput): Promise<CreateQueueCommandOutput> =>
    sqsClient.send(new CreateQueueCommand(params))

  const getQueueAttributes = (params: GetQueueAttributesCommandInput): Promise<GetQueueAttributesCommandOutput> =>
    sqsClient.send(new GetQueueAttributesCommand(params))

  const setQueueAttributes = (params: SetQueueAttributesCommandInput): Promise<SetQueueAttributesCommandOutput> =>
    sqsClient.send(new SetQueueAttributesCommand(params))

  const subscribe = (params: SubscribeCommandInput): Promise<SubscribeCommandOutput> =>
    snsClient.send(new SubscribeCommand(params))

  const setSubscriptionAttributes = (params: SetSubscriptionAttributesCommandInput): Promise<SetSubscriptionAttributesCommandOutput> =>
    snsClient.send(new SetSubscriptionAttributesCommand(params))

  const createDeadletterQueue = async (queueName: string): Promise<string | undefined> =>
    await createQueue({ QueueName: `${queueName}-DLQ` })
      .then(queue => queue.QueueUrl)
      .catch(() => undefined)

  const getQueueArn = async (QueueUrl: string): Promise<string | undefined> =>
    await getQueueAttributes({
      QueueUrl,
      AttributeNames: ['QueueArn']
    })
      .then((attributes: GetQueueAttributesCommandOutput) => attributes.Attributes?.QueueArn)
      .catch(() => undefined)

  const createSqsQueue = async ({ deadletterQueueArn, queueName }: CreateSqsQueueParams): Promise<string | undefined> =>
    await createQueue({
      Attributes: {
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: deadletterQueueArn,
          maxReceiveCount
        })
      },
      QueueName: queueName
    })
      .then(queue => queue.QueueUrl)
      .catch(() => undefined)


  const setSqsQueueAttributes = async (queueUrl: string, queueArn: string, snsTopic: string): Promise<SetQueueAttributesCommandOutput> =>
    await setQueueAttributes({
      Attributes: {
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: 'SQS:SendMessage',
              Resource: queueArn,
              Condition: {
                ArnEquals: {
                  'aws:SourceArn': snsTopic
                }
              }
            }
          ]
        })
      },
      QueueUrl: queueUrl
    })

  const createTopicSubscription = async (queueArn: string, topicArn: string): Promise<string | undefined> =>
    await subscribe({
      Endpoint: queueArn,
      Protocol: 'sqs',
      TopicArn: topicArn
    }).then(sub => sub.SubscriptionArn)

  const deadletterQueueUrl = await createDeadletterQueue(queueName)

  if (deadletterQueueUrl === undefined) {
    throw Error(`SQS: Failed to create DQL queue for: ${queueName}`)
  }

  const deadletterQueueArn = await getQueueArn(deadletterQueueUrl)
  if (deadletterQueueArn === undefined) {
    throw Error(`SQS: Failed to get arn for: ${deadletterQueueUrl}`)
  }

  const queueUrl = await createSqsQueue({ deadletterQueueArn, queueName })
  if (queueUrl === undefined) {
    throw Error(`SQS: Failed to create queue: ${queueName}`)
  }

  const queueArn = await getQueueArn(queueUrl)
  if (queueArn === undefined) {
    throw Error(`SQS: Failed to get arn for: ${queueUrl}`)
  }

  if (topicOptions.arn !== undefined && topicOptions.arn !== null && topicOptions.arn !== '') {
    const subscriptionArn = await createTopicSubscription(queueArn, topicOptions.arn)
    await setSqsQueueAttributes(queueUrl, queueArn, topicOptions.arn)

    if (topicOptions.filterPolicy && topicOptions.filterPolicyScope) {
      await setSubscriptionAttributes({
        SubscriptionArn: subscriptionArn,
        AttributeName: 'FilterPolicyScope',
        AttributeValue: topicOptions.filterPolicyScope
      })
    }

    if (topicOptions.filterPolicy) {
      await setSubscriptionAttributes({
        SubscriptionArn: subscriptionArn,
        AttributeName: 'FilterPolicy',
        AttributeValue: JSON.stringify(topicOptions.filterPolicy)
      })
    }

    if (topicOptions.rawMessageDelivery === true) {
      await setSubscriptionAttributes({
        SubscriptionArn: subscriptionArn,
        AttributeName: 'RawMessageDelivery',
        AttributeValue: 'true'
      })
    }
  }

  return queueUrl
}

export = sqns
