import sinon from 'sinon'
import { expect } from 'chai'
import { mockClient } from 'aws-sdk-client-mock'
import { SQSClient, CreateQueueCommand, GetQueueAttributesCommand, SetQueueAttributesCommand } from '@aws-sdk/client-sqs'
import { SNSClient, SubscribeCommand, SetSubscriptionAttributesCommand } from '@aws-sdk/client-sns'

import sqns from '../src'

const sqsMock = mockClient(SQSClient)
const snsMock = mockClient(SNSClient)

describe('sqns', () => {
  beforeEach(() => {
    sqsMock.reset()
    snsMock.reset()
  })

  context('when region option is not provided', () => {
    it('rejects with an error', () =>
      expect(sqns()).to.be.rejectedWith(Error, 'Missing region')
    )
  })

  context('when queueName option is not provided', () => {
    it('rejects with an error', () =>
      expect(sqns({ region: 'us-east-1' })).to.be.rejectedWith(Error, 'Missing queueName')
    )
  })

  context('when region, queueName options are provided', () => {
    let createQueueStub
    let getQueueAttributesStub
    let setQueueAttributesStub

    beforeEach(() => {
      createQueueStub = sinon.stub()
      createQueueStub
        .onCall(0)
        .resolves({ QueueUrl: 'mock-deadletter-queue-url' })
        .onCall(1)
        .resolves({ QueueUrl: 'mock-queue-url' })

      getQueueAttributesStub = sinon.stub()
      getQueueAttributesStub
        .onCall(0)
        .resolves({ Attributes: { QueueArn: 'mock-deadletter-queue-arn' } })
        .onCall(1)
        .resolves({ Attributes: { QueueArn: 'mock-queue-arn' } })

      setQueueAttributesStub = sinon.stub()
      setQueueAttributesStub
        .callsArgWith(1, null, {  })

      sqsMock.on(CreateQueueCommand).callsFake(createQueueStub)
      sqsMock.on(GetQueueAttributesCommand).callsFake(getQueueAttributesStub)
      sqsMock.on(SetQueueAttributesCommand).callsFake(setQueueAttributesStub)
    })

    it('creates a deadletter queue', async () => {
      const queueUrl = await sqns({
        region: 'us-east-1',
        queueName: 'queue',
      })

      expect(createQueueStub).to.have.been.calledWith({ QueueName: 'queue-DLQ' })
      expect(createQueueStub).to.have.been.calledWith({
        Attributes: {
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: 'mock-deadletter-queue-arn',
            maxReceiveCount: 3,
          })
        },
        QueueName: 'queue'
      })
      expect(queueUrl).to.equal('mock-queue-url')
    })

    it('creates a deadletter queue with customMaxReceiveCount', async () => {
      const queueUrl = await sqns({
        region: 'us-east-1',
        queueName: 'queue',
        maxReceiveCount: 1,
      })
      expect(createQueueStub).to.have.been.calledWith({ QueueName: 'queue-DLQ' })
      expect(createQueueStub).to.have.been.calledWith({
        QueueName: 'queue',
        Attributes: {
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: 'mock-deadletter-queue-arn',
            maxReceiveCount: 1,
          })
        }
      })
      expect(queueUrl).to.equal('mock-queue-url')
    })

    context('when topic arn is provided', () => {
      let setQueueAttributes
      let subscribeStub
      let setSubscriptionAttributesStub

      beforeEach(() => {
        setQueueAttributesStub = sinon.stub()
        setQueueAttributesStub
          .resolves({ QueueUrl: 'mock-queue-url' })
        subscribeStub = sinon.stub()
        subscribeStub
          .resolves({ SubscriptionArn: 'mock-subscription-arn' })
        setSubscriptionAttributesStub = sinon.stub()
        setSubscriptionAttributesStub
          .onCall(0)
          .resolves({})
        
        sqsMock.on(SetQueueAttributesCommand).callsFake(setQueueAttributesStub)
        snsMock.on(SubscribeCommand).callsFake(subscribeStub)
        snsMock.on(SetSubscriptionAttributesCommand).callsFake(setSubscriptionAttributesStub)
      })

      afterEach(() => {
        sqsMock.reset()
        snsMock.reset()
      })

      it('creates a topic subscription', async () => {
        const queueUrl = await sqns({
          region: 'us-east-1',
          queueName: 'queue',
          topic: {
            arn: 'mock-sns-topic-arn',
          }
        })
        expect(createQueueStub).to.have.been.calledWith({ QueueName: 'queue-DLQ' })
        expect(createQueueStub).to.have.been.calledWith({
          QueueName: 'queue',
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

      context('when topic filterPolicy is provided', () => {
        beforeEach(() => {
          setSubscriptionAttributesStub
            .onCall(1)
            .resolves({ })
        })

        it('creates a topic subscription', async () => {
          const queueUrl = await sqns({
            region: 'us-east-1',
            queueName: 'queue',
            topic: {
              arn: 'mock-sns-topic-arn',
              filterPolicy: { mock: 'filter-policy' },
            }
          })
          expect(createQueueStub).to.have.been.calledWith({ QueueName: 'queue-DLQ' })
          expect(createQueueStub).to.have.been.calledWith({
            QueueName: 'queue',
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
          expect(setSubscriptionAttributesStub).to.have.been.calledWith({
            SubscriptionArn: 'mock-subscription-arn',
            AttributeName: 'RawMessageDelivery',
            AttributeValue: 'true',
          })
          expect(queueUrl).to.equal('mock-queue-url')
        })
      })

      context('when topic rawMessageDelivery is false', () => {
        it('creates a topic subscription', async () => {
          const queueUrl = await sqns({
            region: 'us-east-1',
            queueName: 'queue',
            topic: {
              arn: 'mock-sns-topic-arn',
              rawMessageDelivery: false,
            }
          })
          expect(createQueueStub).to.have.been.calledWith({ QueueName: 'queue-DLQ' })
          expect(createQueueStub).to.have.been.calledWith({
            QueueName: 'queue',
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
      })
    })
  })
})
