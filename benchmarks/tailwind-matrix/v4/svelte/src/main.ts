import { mount } from 'svelte';

import './app.css';
import App from './app.svelte';

const target = document.querySelector('#app');
if (!target) {
	throw new Error('Missing #app');
}

mount(App, { target });
