---
packages:
  "group:sdk": patch
---

### The consent UI fits a 320px screen and long labels

- A Banner narrower than 360px puts Reject and Accept on one row and Customize on the next. At 320px the third button used to run past the card's edge and get cut off.
- A button label in the prompt or the dialog wraps before it is cut off, so a long translation stays readable. On a wide Banner the actions take at most 65% of the row, so a long label wraps and does not push past the card.
- A vendor's name always wraps. On a phone, its purpose sits under the name and wraps too, where a narrow column used to cut both off.
