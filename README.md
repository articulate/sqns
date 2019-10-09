# SQNS

An SQS queue creator and SNS subscriber

## Usage

```haskell
sqns :: { k: v } -> Promise String
```

Call `sqns` to create an SQS queue (and deadletter queue). You will be returned the queue URL of the newly created SQS queue. Optionally subscribe the queue to an SNS topic via the options below.

## Options

`sqns` accepts a JSON object with the following options:

| option | type | default | required | description |
| ------ |----- |-------- |--------- |------------ |
| `region` | `string` | none | true | AWS region |
| `queueName` | `string` | none | true | an identifier for the queue |
| topic | `object` | `{}` | false | sns topic subscription options (see below) |

### SNS Topic Options

| option | type | default | required | description |
| ------ | ---- | ------- | -------- | ----------- |
| `arn` | `string` | none | false | SNS topic arn |
| `filterPolicy` | `object` | none | false | [SNS Topic Subscription Filter Policy](https://docs.aws.amazon.com/en_pv/sns/latest/dg/sns-subscription-filter-policies.html) |
| `rawMessageDelivery` | `boolean` | `false` | false | [SNS Topic Subscription Raw Message Delivery](https://docs.aws.amazon.com/sns/latest/dg/sns-large-payload-raw-message-delivery.html) |
