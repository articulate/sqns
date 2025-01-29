# SQNS

An SQS queue creator and SNS subscriber

## Usage

```haskell
sqns :: { k: v } -> Promise String
```

Call `sqns` to create an SQS queue (and deadletter queue). You will be returned the queue URL of the newly created SQS queue. Optionally subscribe the queue to an SNS topic via the options below.

## Options

`sqns` accepts a JSON object with the following options:

| Option | Type | Default | Description |
| ------ |----- |-------- |------------ |
| `region` | `String` | | AWS region |
| `queueName` | `String` | | an identifier for the queue |
| `maxReceiveCount` | `Number` | 3 | `maxReceiveCount` for the queue redrive policy |
| `topic` | `object` | `{ rawMessageDelivery: true }` | SNS Topic Subscription options (see below) |

### SNS Topic Subscription Options

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `arn` | `string` | | SNS Topic ARN |
| `filterPolicy` | `Object` | | [SNS Topic Subscription Filter Policy](https://docs.aws.amazon.com/en_pv/sns/latest/dg/sns-subscription-filter-policies.html) |
| `filterPolicyScope` | `string` | [SNS Topic Subscription Filter Policy Scope](https://docs.aws.amazon.com/sns/latest/dg/sns-message-filtering-scope.html)
| `rawMessageDelivery` | `Boolean` | `true` | [SNS Topic Subscription Raw Message Delivery](https://docs.aws.amazon.com/sns/latest/dg/sns-large-payload-raw-message-delivery.html) |

## Example Usage

```javascript
const sqns = require('sqns')

const queueUrl = sqns({
  region: 'us-east-1',
  queueName: `{username}-events`,
  maxReceiveCount: 1,
  topic: {
    arn: topicArn,
  }
})
```

## Contributing
Changes are tracked & published using [changesets](https://github.com/changesets/changesets).

### Adding a Changeset

1. Create a git branch. Make your desired changes.
1. Run `yarn changeset`. Follow the prompts & specify if your change is a
   major, minor, or patch change.
1. Add all the changes to `.changesets` & commit.
1. Create a Pull Request. Merge into the master branch when ready.

### Publishing to NPM

Changesets will create a "Release" pull request whenever unpublished changesets
are merged into master. When ready to publish to NPM, merge this pull request,
and changes will be automatically published.
