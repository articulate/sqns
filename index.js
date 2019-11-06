const AWS = require('aws-sdk')
const { promisify } = require('util')
const { merge, path, prop } = require('ramda')

const sqns = async (options = {}) => {
  const {
    region,
    queueName,
    maxReceiveCount = 3,
    topic = {},
  } = options

  AWS.config.update({ region })

  if (!region) throw Error('Missing region')
  if (!queueName) throw Error('Missing queueName')

  const topicOptions = merge({ rawMessageDelivery: true }, topic)

  const sqs = new AWS.SQS()
  const sns = new AWS.SNS({ apiVersion: '2010-03-31' })
  const createQueue = promisify(sqs.createQueue.bind(sqs))
  const getQueueAttributes = promisify(sqs.getQueueAttributes.bind(sqs))
  const setQueueAttributes = promisify(sqs.setQueueAttributes.bind(sqs))
  const subscribe = promisify(sns.subscribe.bind(sns))
  const setSubscriptionAttributes = promisify(sns.setSubscriptionAttributes.bind(sns))

  const createDeadletterQueue = queueName =>
    createQueue({ QueueName: `${queueName}-DLQ` })
      .then(prop('QueueUrl'))

  const getQueueArn = QueueUrl =>
    getQueueAttributes({
      QueueUrl,
      AttributeNames: ['QueueArn'],
    }).then(path(['Attributes', 'QueueArn']))

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
