import { mount } from 'svelte';

import App from './app.svelte';

import './style.css';

const target = document.getElementById('app');
if (!target) {
	throw new Error('Missing #app');
}
mount(App, { target });
