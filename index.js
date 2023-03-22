const { promisify } = require('util')
const { path, prop } = require('ramda')
const { SQSClient, CreateQueueCommand, GetQueueAttributesCommand, SetQueueAttributesCommand } = require('@aws-sdk/client-sqs')
const { SNSClient, SubscribeCommand, SetSubscriptionAttributesCommand } = require('@aws-sdk/client-sns')

const sqns = async (options = {}) => {
  const {
    region,
    queueName,
    maxReceiveCount = 3,
    topic = {},
  } = options

  if (!region) throw Error('Missing region')
  if (!queueName) throw Error('Missing queueName')

  const topicOptions = {
    rawMessageDelivery: true,
    ...topic
  }

  const sqsClient = new SQSClient({ region })
  const snsClient = new SNSClient({ region })

  const createQueue = (params) =>
    sqsClient.send(new CreateQueueCommand(params))

  const getQueueAttributes = (params) =>
    sqsClient.send(new GetQueueAttributesCommand(params))

  const setQueueAttributes = (params) =>
    sqsClient.send(new SetQueueAttributesCommand(params))

  const subscribe = (params) =>
    snsClient.send(new SubscribeCommand(params))

  const setSubscriptionAttributes = (params) =>
    snsClient.send(new SetSubscriptionAttributesCommand(params))

  const createDeadletterQueue = queueName =>
    createQueue({ QueueName: `${queueName}-DLQ` })
      .then(prop('QueueUrl'))

  const getQueueArn = QueueUrl =>
    getQueueAttributes({
      QueueUrl,
      AttributeNames: ['QueueArn'],
    }).then(attributes => attributes.Attributes?.queueArn)

  const createSqsQueue = ({ deadletterQueueArn, queueName }) =>
    createQueue({
      Attributes: {
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: deadletterQueueArn,
          maxReceiveCount,
        }),
      },
      QueueName: queueName,
    }).then(prop('QueueUrl'))

  const setSqsQueueAttributes = (queueUrl, queueArn, snsTopic) =>
    setQueueAttributes({
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
                  'aws:SourceArn': snsTopic,
                },
              },
            },
          ],
        }),
      },
      QueueUrl: queueUrl,
    })

  const createTopicSubscription = (queueArn, topicArn) =>
    subscribe({
      Endpoint: queueArn,
      Protocol: 'sqs',
      TopicArn: topicArn,
    }).then(prop('SubscriptionArn'))

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
        AttributeValue: JSON.stringify(topicOptions.filterPolicy),
      })
    }

    if (topicOptions.rawMessageDelivery) {
      await setSubscriptionAttributes({
        SubscriptionArn: subscriptionArn,
        AttributeName: 'RawMessageDelivery',
        AttributeValue: 'true',
      })
    }
  }

  return queueUrl
}

module.exports = sqns
