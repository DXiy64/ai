export default defineNuxtConfig({
  compatibilityDate: '2026-10-15',
  devtools: { enabled: false },
  css: ['~/assets/main.css'],
  app: { head: {
    htmlAttrs: { lang: 'en' },
    title: 'ai · 3D Model Chart',
    meta: [
      { name: 'theme-color', content: '#ffffff' },
      { name: 'description', content: 'Explore AI models by Intelligence Index, Cost per Task, and Time per Task.' },
    ],
  } },
});
