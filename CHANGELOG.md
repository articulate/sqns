# @articulate/sqns

## 1.1.1

### Patch Changes

- 6f8adb9: This fixes a bug where you could not create a `MessageBody` policy with nesting on initial creation of the topic filter policy.

## 1.1.0

### Minor Changes

- d89bf5d: Adds the new option filterPolicyScope to support being able to specify either MessageAttributes or MessageBody. This allows the user to choose to filter messages on message body key/values.
