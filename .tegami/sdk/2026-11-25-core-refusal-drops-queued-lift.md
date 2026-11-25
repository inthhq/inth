---
packages:
  "group:sdk": patch
---

### Core: a refusal cancels an account opt-out lift that is still queued

When a visitor with an account-held opt-out opts back in and the lift request fails, the lift waits in the queue. If the visitor then refuses `marketing` again (a `save()` under an opt-out rule, or `optOut()`), the kernel now drops that queued lift. Before, the lift replayed later, lifted the opt-out on the backend and cleared it in the browser, undoing the newer refusal. Only lifts queued by the same account for the same subject are dropped. A device-held opt-out was not affected: its refusal already queues a new opt-out after the lift.
