import {
  CreateQueueCommand,
  type CreateQueueCommandInput,
  GetQueueAttributesCommand,
  type GetQueueAttributesCommandInput,
  type GetQueueAttributesCommandOutput,
  SetQueueAttributesCommand,
  type SetQueueAttributesCommandInput,
  SQSClient,
  type CreateQueueCommandOutput,
  type SetQueueAttributesCommandOutput
} from '@aws-sdk/client-sqs'

import {
  SetSubscriptionAttributesCommand,
  type SetSubscriptionAttributesCommandInput,
  SNSClient,
  SubscribeCommand,
  type SubscribeCommandInput,
  type SubscribeCommandOutput,
  type SetSubscriptionAttributesCommandOutput
} from '@aws-sdk/client-sns'

interface SqnsOptions {
  maxReceiveCount?: number
  queueName?: string
  region?: string
  topic?: any
}

interface CreateSqsQueueParams {
  deadletterQueueArn?: string
  queueName: string
}

const sqns = async (options: SqnsOptions = {}): Promise<string> => {
  const {
    region,
    queueName,
    maxReceiveCount = 3,
    topic = {}
  } = options

  if (!region) throw Error('Missing region')
  if (!queueName) throw Error('Missing queueName')

  const topicOptions = {
    rawMessageDelivery: true,
    ...topic
  }

  const sqsClient = new SQSClient({ region })
  const snsClient = new SNSClient({ region })

  const createQueue = async (params: CreateQueueCommandInput): Promise<CreateQueueCommandOutput> =>
    await sqsClient.send(new CreateQueueCommand(params))

  const getQueueAttributes = async (params: GetQueueAttributesCommandInput): Promise<GetQueueAttributesCommandOutput> =>
    await sqsClient.send(new GetQueueAttributesCommand(params))

  const setQueueAttributes = async (params: SetQueueAttributesCommandInput): Promise<SetQueueAttributesCommandOutput> =>
    await sqsClient.send(new SetQueueAttributesCommand(params))

  const subscribe = async (params: SubscribeCommandInput): Promise<SubscribeCommandOutput> =>
    await snsClient.send(new SubscribeCommand(params))

  const setSubscriptionAttributes = async (params: SetSubscriptionAttributesCommandInput): Promise<SetSubscriptionAttributesCommandOutput> =>
    await snsClient.send(new SetSubscriptionAttributesCommand(params))

  const createDeadletterQueue = async (queueName: string): Promise<string | undefined> =>
    await createQueue({ QueueName: `${queueName}-DLQ` })
      .then(queue => queue.QueueUrl)

  const getQueueArn = async (QueueUrl: string): Promise<string | undefined> => {
    return await getQueueAttributes({
      QueueUrl,
      AttributeNames: ['QueueArn']
    }).then((attributes: GetQueueAttributesCommandOutput) => attributes.Attributes?.QueueArn)
  }

  const createSqsQueue = async ({ deadletterQueueArn, queueName }: CreateSqsQueueParams): Promise<string | undefined> =>
    await createQueue({
      Attributes: {
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: deadletterQueueArn,
          maxReceiveCount
        })
      },
      QueueName: queueName
    }).then(queue => queue.QueueUrl)

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

  const createTopicSubscription = async (queueArn, topicArn): Promise<string | undefined> =>
    await subscribe({
      Endpoint: queueArn,
      Protocol: 'sqs',
      TopicArn: topicArn
    }).then(sub => sub.SubscriptionArn)

  const deadletterQueueUrl = await createDeadletterQueue(queueName)
  const deadletterQueueArn = await getQueueArn(deadletterQueueUrl)
  const queueUrl = await createSqsQueue({ deadletterQueueArn, queueName })
  const queueArn = await getQueueArn(queueUrl)

  if (topicOptions.arn) {
    const subscriptionArn = await createTopicSubscription(queueArn, topicOptions.arn)
    await setSqsQueueAttributes(queueUrl, queueArn, topicOptions.arn)

    if (topicOptions.filterPolicy) {
      await setSubscriptionAttributes({
        SubscriptionArn: subscriptionArn,
        AttributeName: 'FilterPolicy',
        AttributeValue: JSON.stringify(topicOptions.filterPolicy)
      })
    }

    if (topicOptions.rawMessageDelivery) {
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
