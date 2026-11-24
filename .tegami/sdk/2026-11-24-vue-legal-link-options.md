---
packages:
  "group:sdk": patch
---

### Vue and Nuxt: `bannerLegalLinks` and `dialogLegalLinks` work again

- The banner and the dialog read `bannerLegalLinks` and `dialogLegalLinks`. They had stopped reading them, so the Card and the expanded prompt always linked both the privacy and cookie policies, and the dialog's footer link could not be removed.
- A list shows only the links it names, and an empty list shows none.
- **Changed default:** with the option unset, each surface shows its stock links, as the React components do. Before the consent UI was replaced, unset showed none.
- Astro with `ui: 'vue'`: `<ConsentDialog legalLinks={null}>` hides the footer link.
