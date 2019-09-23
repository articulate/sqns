const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.AWS_REGION })
const sqs = new AWS.SQS()
const sns = new AWS.SNS({ apiVersion: '2010-03-31' })
const { promisify } = require('@articulate/funky')
const { path, prop } = require('ramda')

const createQueue = promisify(sqs.createQueue, sqs)
const getQueueAttributes = promisify(sqs.getQueueAttributes, sqs)
const setQueueAttributes = promisify(sqs.setQueueAttributes, sqs)
const subscribe = promisify(sns.subscribe, sns)
const setSubscriptionAttributes = promisify(sns.setSubscriptionAttributes, sns)

const createDeadletterQueue = (user, queueName) =>
  createQueue({ QueueName: `${queueName}-${user}-DLQ` })
    .then(prop('QueueUrl'))

const getQueueArn = QueueUrl =>
  getQueueAttributes({
    QueueUrl,
    AttributeNames: ['QueueArn'],
  }).then(path(['Attributes', 'QueueArn']))

const createEventsQueue = ({ deadletterQueueArn, user, queueName }) =>
  createQueue({
    Attributes: {
      RedrivePolicy: JSON.stringify({
        deadLetterTargetArn: deadletterQueueArn,
        maxReceiveCount: 3,
      }),
    },
    QueueName: `${queueName}-${user}`,
  }).then(prop('QueueUrl'))

const setEventsQueueAttributes = (queueUrl, queueArn, snsTopic) =>
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

const sqns = async (options) => {
  const {
    user,
    queueName,
    topic = {},
  } = options

  const deadletterQueueUrl = await createDeadletterQueue(user, queueName)
  const deadletterQueueArn = await getQueueArn(deadletterQueueUrl)
  const queueUrl = await createEventsQueue({ deadletterQueueArn, user, queueName })
  const queueArn = await getQueueArn(queueUrl)

  if (topic.arn) {
    const subscriptionArn = await createTopicSubscription(queueArn, topic.arn)
    await setEventsQueueAttributes(queueUrl, queueArn, topic.arn)

    if (topic.filterPolicy) {
      await setSubscriptionAttributes({
        SubscriptionArn: subscriptionArn,
        AttributeName: 'FilterPolicy',
        AttributeValue: JSON.stringify(topic.filterPolicy),
      })
    }

    if (topic.rawMessageDelivery) {
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
