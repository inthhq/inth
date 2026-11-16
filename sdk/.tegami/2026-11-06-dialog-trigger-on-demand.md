---
packages:
  '@c15t/react': patch
---

### ConsentDialog loads its floating trigger on its own

`ConsentDialog` loads the floating trigger (`showTrigger`) in a chunk of its
own, so opening the dialog no longer waits for the trigger's drag handling,
icons and DevTools launcher. The trigger appears once its chunk arrives.
