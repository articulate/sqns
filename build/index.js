"use strict";
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_sns_1 = require("@aws-sdk/client-sns");
const sqns = async (options = {}) => {
    const { region, queueName, maxReceiveCount = 3, topic = {} } = options;
    if (region === null || region === undefined || region === '')
        throw Error('Missing region');
    if (queueName === null || queueName === undefined || queueName === '')
        throw Error('Missing queueName');
    const topicOptions = {
        rawMessageDelivery: true,
        ...topic
    };
    const sqsClient = new client_sqs_1.SQSClient({ region });
    const snsClient = new client_sns_1.SNSClient({ region });
    const createQueue = async (params) => await sqsClient.send(new client_sqs_1.CreateQueueCommand(params));
    const getQueueAttributes = async (params) => await sqsClient.send(new client_sqs_1.GetQueueAttributesCommand(params));
    const setQueueAttributes = async (params) => await sqsClient.send(new client_sqs_1.SetQueueAttributesCommand(params));
    const subscribe = async (params) => await snsClient.send(new client_sns_1.SubscribeCommand(params));
    const setSubscriptionAttributes = async (params) => await snsClient.send(new client_sns_1.SetSubscriptionAttributesCommand(params));
    const createDeadletterQueue = async (queueName) => await createQueue({ QueueName: `${queueName}-DLQ` })
        .then(queue => queue.QueueUrl);
    const getQueueArn = async (QueueUrl) => {
        return await getQueueAttributes({
            QueueUrl,
            AttributeNames: ['QueueArn']
        }).then((attributes) => { var _a; return (_a = attributes.Attributes) === null || _a === void 0 ? void 0 : _a.QueueArn; });
    };
    const createSqsQueue = async ({ deadletterQueueArn, queueName }) => await createQueue({
        Attributes: {
            RedrivePolicy: JSON.stringify({
                deadLetterTargetArn: deadletterQueueArn,
                maxReceiveCount
            })
        },
        QueueName: queueName
    }).then(queue => queue.QueueUrl);
    const setSqsQueueAttributes = async (queueUrl, queueArn, snsTopic) => await setQueueAttributes({
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
    });
    const createTopicSubscription = async (queueArn, topicArn) => await subscribe({
        Endpoint: queueArn,
        Protocol: 'sqs',
        TopicArn: topicArn
    }).then(sub => sub.SubscriptionArn);
    const deadletterQueueUrl = await createDeadletterQueue(queueName);
    if (deadletterQueueUrl === undefined) {
        throw Error(`SQS: Failed to create DQL queue for: ${queueName}`);
    }
    const deadletterQueueArn = await getQueueArn(deadletterQueueUrl);
    if (deadletterQueueArn === undefined) {
        throw Error(`SQS: Failed to get arn for: ${deadletterQueueUrl}`);
    }
    const queueUrl = await createSqsQueue({ deadletterQueueArn, queueName });
    if (queueUrl === undefined) {
        throw Error(`SQS: Failed to create queue: ${queueName}`);
    }
    const queueArn = await getQueueArn(queueUrl);
    if (queueArn === undefined) {
        throw Error(`SQS: Failed to get arn for: ${queueUrl}`);
    }
    if (topicOptions.arn !== undefined && topicOptions.arn !== null && topicOptions.arn !== '') {
        const subscriptionArn = await createTopicSubscription(queueArn, topicOptions.arn);
        await setSqsQueueAttributes(queueUrl, queueArn, topicOptions.arn);
        if (topicOptions.filterPolicy !== null) {
            await setSubscriptionAttributes({
                SubscriptionArn: subscriptionArn,
                AttributeName: 'FilterPolicy',
                AttributeValue: JSON.stringify(topicOptions.filterPolicy)
            });
        }
        if (topicOptions.rawMessageDelivery === true) {
            await setSubscriptionAttributes({
                SubscriptionArn: subscriptionArn,
                AttributeName: 'RawMessageDelivery',
                AttributeValue: 'true'
            });
        }
    }
    return queueUrl;
};
module.exports = sqns;
//# sourceMappingURL=index.js.map