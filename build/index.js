"use strict";
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_sns_1 = require("@aws-sdk/client-sns");
const sqns = async (options = {}) => {
    const { region, queueName, maxReceiveCount = 3, topic = {}, } = options;
    if (!region)
        throw Error('Missing region');
    if (!queueName)
        throw Error('Missing queueName');
    const topicOptions = {
        rawMessageDelivery: true,
        ...topic
    };
    const sqsClient = new client_sqs_1.SQSClient({ region });
    const snsClient = new client_sns_1.SNSClient({ region });
    const createQueue = (params) => sqsClient.send(new client_sqs_1.CreateQueueCommand(params));
    const getQueueAttributes = (params) => sqsClient.send(new client_sqs_1.GetQueueAttributesCommand(params));
    const setQueueAttributes = (params) => sqsClient.send(new client_sqs_1.SetQueueAttributesCommand(params));
    const subscribe = (params) => snsClient.send(new client_sns_1.SubscribeCommand(params));
    const setSubscriptionAttributes = (params) => snsClient.send(new client_sns_1.SetSubscriptionAttributesCommand(params));
    const createDeadletterQueue = (queueName) => createQueue({ QueueName: `${queueName}-DLQ` })
        .then(queue => queue.QueueUrl);
    const getQueueArn = (QueueUrl) => {
        return getQueueAttributes({
            QueueUrl,
            AttributeNames: ['QueueArn'],
        }).then((attributes) => { var _a; return (_a = attributes.Attributes) === null || _a === void 0 ? void 0 : _a.QueueArn; });
    };
    const createSqsQueue = ({ deadletterQueueArn, queueName }) => createQueue({
        Attributes: {
            RedrivePolicy: JSON.stringify({
                deadLetterTargetArn: deadletterQueueArn,
                maxReceiveCount,
            }),
        },
        QueueName: queueName,
    }).then(queue => queue.QueueUrl);
    const setSqsQueueAttributes = (queueUrl, queueArn, snsTopic) => setQueueAttributes({
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
    });
    const createTopicSubscription = (queueArn, topicArn) => subscribe({
        Endpoint: queueArn,
        Protocol: 'sqs',
        TopicArn: topicArn,
    }).then(sub => sub.SubscriptionArn);
    const deadletterQueueUrl = await createDeadletterQueue(queueName);
    const deadletterQueueArn = await getQueueArn(deadletterQueueUrl);
    const queueUrl = await createSqsQueue({ deadletterQueueArn, queueName });
    const queueArn = await getQueueArn(queueUrl);
    if (topicOptions.arn) {
        const subscriptionArn = await createTopicSubscription(queueArn, topicOptions.arn);
        await setSqsQueueAttributes(queueUrl, queueArn, topicOptions.arn);
        if (topicOptions.filterPolicy) {
            await setSubscriptionAttributes({
                SubscriptionArn: subscriptionArn,
                AttributeName: 'FilterPolicy',
                AttributeValue: JSON.stringify(topicOptions.filterPolicy),
            });
        }
        if (topicOptions.rawMessageDelivery) {
            await setSubscriptionAttributes({
                SubscriptionArn: subscriptionArn,
                AttributeName: 'RawMessageDelivery',
                AttributeValue: 'true',
            });
        }
    }
    return queueUrl;
};
module.exports = sqns;
//# sourceMappingURL=index.js.map