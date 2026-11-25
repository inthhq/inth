---
packages:
  "group:sdk": patch
---

### A subject move changes the stored queue and the subject together

- When an answer moves the visitor to a new subject ID (an `identify()` link answer, a lift or opt-out answer that names a canonical ID, or a `409 subject_conflict`), the SDK records the move and moves the saves and opt-out requests queued under the old ID. Before, if another account was identified or the user signed out after that storage step and before the subject changed, the subject stayed on the old ID but the stored move and the queued requests still went to the new ID. The SDK now checks the account, moves the queued requests and changes the subject in one step. Either all of them move, for the account that was checked, or none of them move.
- When the account changes after the move, the new account keeps the moved subject. This is the same result as when the answer arrives before the account changes. The previous account's opt-out answer is still not applied to the new account.
