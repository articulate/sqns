const AWS = require('aws-sdk-mock')
const sinon = require('sinon')
const path = require('path')
AWS.setSDK(path.resolve('./node_modules/aws-sdk-mock'))
AWS.setSDKInstance(require('aws-sdk'))

const sqns = require('../')

describe('sqns', () => {
  context('when region option is not provided', () => {
    it('rejects with an error', () =>
      expect(sqns()).to.be.rejectedWith(Error, 'Missing region')
    )
  })

  context('when user option is not provided', () => {
    it('rejects with an error', () =>
      expect(sqns({ region: 'us-east-1' })).to.be.rejectedWith(Error, 'Missing user')
    )
  })

  context('when queueName option is not provided', () => {
    it('rejects with an error', () =>
      expect(sqns({ region: 'us-east-1', user: 'user' })).to.be.rejectedWith(Error, 'Missing queueName')
    )
  })

  context('when region, user and queueName options are provided', () => {
    let createQueueStub
    let getQueueAttributesStub

    beforeEach(() => {
      createQueueStub = sinon.stub()
      createQueueStub
        .onCall(0)
        .callsArgWith(1, null, { QueueUrl: 'mock-deadletter-queue-url' })
        .onCall(1)
        .callsArgWith(1, null, { QueueUrl: 'mock-queue-url' })
      getQueueAttributesStub = sinon.stub()
      getQueueAttributesStub
        .onCall(0)
        .callsArgWith(1, null, { Attributes: { QueueArn: 'mock-deadletter-queue-arn' } })
        .onCall(1)
        .callsArgWith(1, null, { Attributes: { QueueArn: 'mock-queue-arn' } })
      setQueueAttributesStub = sinon.stub()
      setQueueAttributesStub
        .callsArgWith(1, null, {  })
      AWS.mock('SQS', 'createQueue', createQueueStub)
      AWS.mock('SQS', 'getQueueAttributes', getQueueAttributesStub)
    })

    afterEach(() => {
      AWS.restore('SQS', 'createQueue')
      AWS.restore('SQS', 'getQueueAttributes')
    })

    it('creates a deadletter queue', async () => {
      const queueUrl = await sqns({
        region: 'us-east-1',
        user: 'user',
        queueName: 'queue',
      })
      expect(createQueueStub).to.have.been.calledWith({ QueueName: 'queue-user-DLQ' })
      expect(createQueueStub).to.have.been.calledWith({
        QueueName: 'queue-user',
        Attributes: {
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: 'mock-deadletter-queue-arn',
            maxReceiveCount: 3,
          })
        }
      })
      expect(queueUrl).to.equal('mock-queue-url')
    })

    context('when topic arn is provided', () => {
      let setQueueAttributes
      let subscribeStub

      beforeEach(() => {
        setQueueAttributesStub = sinon.stub()
        setQueueAttributesStub
          .callsArgWith(1, null, { QueueUrl: 'mock-queue-url' })
        subscribeStub = sinon.stub()
        subscribeStub
          .callsArgWith(1, null, { SubscriptionArn: 'mock-subscription-arn' })
        AWS.mock('SQS', 'setQueueAttributes', setQueueAttributesStub)
        AWS.mock('SNS', 'subscribe', subscribeStub)
      })

      afterEach(() => {
        AWS.restore('SQS', 'setQueueAttributes')
        AWS.restore('SNS', 'subscribe')
      })

      it('creates a topic subscription', async () => {
        const queueUrl = await sqns({
          region: 'us-east-1',
          user: 'user',
          queueName: 'queue',
          topic: {
            arn: 'mock-sns-topic-arn',
          }
        })
        expect(createQueueStub).to.have.been.calledWith({ QueueName: 'queue-user-DLQ' })
        expect(createQueueStub).to.have.been.calledWith({
          QueueName: 'queue-user',
          Attributes: {
            RedrivePolicy: JSON.stringify({
              deadLetterTargetArn: 'mock-deadletter-queue-arn',
              maxReceiveCount: 3,
            })
          }
        })
        expect(subscribeStub).to.have.been.calledWith({
          Endpoint: 'mock-queue-arn',
          Protocol: 'sqs',
          TopicArn: 'mock-sns-topic-arn',
        })
        expect(setQueueAttributesStub).to.have.been.calledWith({
          Attributes: {
            Policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: '*',
                  Action: 'SQS:SendMessage',
                  Resource: 'mock-queue-arn',
                  Condition: {
                    ArnEquals: {
                      'aws:SourceArn': 'mock-sns-topic-arn',
                    },
                  },
                },
              ],
            }),
          },
          QueueUrl: 'mock-queue-url',
        })
        expect(queueUrl).to.equal('mock-queue-url')
      })

      context('when topic filterPolicy is provided', () => {
        let setSubscriptionAttributes

        beforeEach(() => {
          setSubscriptionAttributesStub = sinon.stub()
          setSubscriptionAttributesStub
            .callsArgWith(1, null, { })
          AWS.mock('SNS', 'setSubscriptionAttributes', setSubscriptionAttributesStub)
        })

        afterEach(() => {
          AWS.restore('SNS', 'setSubscriptionAttributes')
        })

        it('creates a topic subscription', async () => {
          const queueUrl = await sqns({
            region: 'us-east-1',
            user: 'user',
            queueName: 'queue',
            topic: {
              arn: 'mock-sns-topic-arn',
              filterPolicy: { mock: 'filter-policy' },
            }
          })
          expect(createQueueStub).to.have.been.calledWith({ QueueName: 'queue-user-DLQ' })
          expect(createQueueStub).to.have.been.calledWith({
            QueueName: 'queue-user',
            Attributes: {
              RedrivePolicy: JSON.stringify({
                deadLetterTargetArn: 'mock-deadletter-queue-arn',
                maxReceiveCount: 3,
              })
            }
          })
          expect(subscribeStub).to.have.been.calledWith({
            Endpoint: 'mock-queue-arn',
            Protocol: 'sqs',
            TopicArn: 'mock-sns-topic-arn',
          })
          expect(setQueueAttributesStub).to.have.been.calledWith({
            Attributes: {
              Policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Principal: '*',
                    Action: 'SQS:SendMessage',
                    Resource: 'mock-queue-arn',
                    Condition: {
                      ArnEquals: {
                        'aws:SourceArn': 'mock-sns-topic-arn',
                      },
                    },
                  },
                ],
              }),
            },
            QueueUrl: 'mock-queue-url',
          })
          expect(setSubscriptionAttributesStub).to.have.been.calledWith({
            SubscriptionArn: 'mock-subscription-arn',
            AttributeName: 'FilterPolicy',
            AttributeValue: JSON.stringify({ mock: 'filter-policy' })
          })
          expect(queueUrl).to.equal('mock-queue-url')
        })
      })

      context('when topic rawMessageDelivery is provided', () => {
        let setSubscriptionAttributes

        beforeEach(() => {
          setSubscriptionAttributesStub = sinon.stub()
          setSubscriptionAttributesStub
            .callsArgWith(1, null, { })
          AWS.mock('SNS', 'setSubscriptionAttributes', setSubscriptionAttributesStub)
        })

        afterEach(() => {
          AWS.restore('SNS', 'setSubscriptionAttributes')
        })

        it('creates a topic subscription', async () => {
          const queueUrl = await sqns({
            region: 'us-east-1',
            user: 'user',
            queueName: 'queue',
            topic: {
              arn: 'mock-sns-topic-arn',
              rawMessageDelivery: true,
            }
          })
          expect(createQueueStub).to.have.been.calledWith({ QueueName: 'queue-user-DLQ' })
          expect(getQueueAttributesStub).to.have.been.calledWith({
            QueueUrl: 'mock-deadletter-queue-url',
            AttributeNames: ['QueueArn'],
          })
          expect(createQueueStub).to.have.been.calledWith({
            QueueName: 'queue-user',
            Attributes: {
              RedrivePolicy: JSON.stringify({
                deadLetterTargetArn: 'mock-deadletter-queue-arn',
                maxReceiveCount: 3,
              })
            }
          })
          expect(subscribeStub).to.have.been.calledWith({
            Endpoint: 'mock-queue-arn',
            Protocol: 'sqs',
            TopicArn: 'mock-sns-topic-arn',
          })
          expect(setQueueAttributesStub).to.have.been.calledWith({
            Attributes: {
              Policy: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Principal: '*',
                    Action: 'SQS:SendMessage',
                    Resource: 'mock-queue-arn',
                    Condition: {
                      ArnEquals: {
                        'aws:SourceArn': 'mock-sns-topic-arn',
                      },
                    },
                  },
                ],
              }),
            },
            QueueUrl: 'mock-queue-url',
          })
          expect(setSubscriptionAttributesStub).to.have.been.calledWith({
            SubscriptionArn: 'mock-subscription-arn',
            AttributeName: 'RawMessageDelivery',
            AttributeValue: 'true',
          })
          expect(queueUrl).to.equal('mock-queue-url')
        })
      })
    })
  })
})
